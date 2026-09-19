import test from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/index.js';

async function start(t,options){
 const game=createGameServer(options);await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());
 const base=`http://127.0.0.1:${game.server.address().port}`;return {game,base,url:base.replace('http','ws')+'/ws'};
}
function client(url,name){
 const ws=new WebSocket(url),messages=[];
 const welcome=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Join timed out')),4000);ws.on('error',reject);ws.on('open',()=>ws.send(JSON.stringify({type:'join',name})));ws.on('message',raw=>{const m=JSON.parse(raw);messages.push(m);if(m.type==='welcome'){clearTimeout(timer);resolve(m);}});});
 return {ws,messages,welcome};
}
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(predicate){for(let i=0;i<200;i++){if(predicate())return;await pause(10);}throw Error('Timed out');}

test('30 synthetic clients receive snapshots and all 600 ping replies under concurrent traffic',async t=>{
 const{url,game}=await start(t);const clients=Array.from({length:30},(_,i)=>client(url,'Load '+i));
 await Promise.all(clients.map(c=>c.welcome));await until(()=>clients.every(c=>c.messages.some(m=>m.type==='state'&&m.room.players.length===30)));
 const rtts=[];for(const c of clients)c.ws.on('message',raw=>{const m=JSON.parse(raw);if(m.type==='pong')rtts.push(performance.now()-m.at);});
 for(let round=0;round<20;round++){for(const c of clients)c.ws.send(JSON.stringify({type:'ping',at:performance.now()}));await pause(60);}
 await until(()=>rtts.length===600);assert.equal(game.rooms.get('ARENA').players.length,30);assert.ok(clients.every(c=>c.ws.readyState===WebSocket.OPEN));
 assert.ok(clients.every(c=>c.messages.filter(m=>m.type==='state').length>=3));
 assert.ok(clients.every(c=>c.messages.filter(m=>m.type==='state').every(m=>m.room.players.every(p=>!('token'in p)&&!('socket'in p)))));
 rtts.sort((a,b)=>a-b);t.diagnostic(`Loopback only: 30 clients, 600/600 replies, p50 ${rtts[300].toFixed(1)}ms, p95 ${rtts[570].toFixed(1)}ms. Not a mobile or tunnel benchmark.`);
});

test('oversized frames cannot crash the server and new clients can still join',async t=>{
 const{url,base}=await start(t);const bad=new WebSocket(url);await once(bad,'open');const closed=once(bad,'close');bad.send('x'.repeat(9000));assert.equal((await closed)[0],1009);
 assert.deepEqual(await(await fetch(base+'/health')).json(),{ok:true});const good=client(url,'Healthy');assert.ok((await good.welcome).id);
});

test('a slow client is disconnected without blocking other players',async t=>{
 const{game,url}=await start(t);const slow=client(url,'Slow'),healthy=client(url,'Healthy');const [identity]=await Promise.all([slow.welcome,healthy.welcome]);
 const serverSocket=game.rooms.get('ARENA').players.find(p=>p.id===identity.id).socket;
 Object.defineProperty(serverSocket,'bufferedAmount',{get:()=>1024*1024});
 const closed=once(slow.ws,'close');slow.ws.send(JSON.stringify({type:'ping',at:1}));await closed;
 healthy.ws.send(JSON.stringify({type:'ping',at:2}));await until(()=>healthy.messages.some(m=>m.type==='pong'&&m.at===2));assert.equal(healthy.ws.readyState,WebSocket.OPEN);
});

test('planned shutdown sends a restart close code and app files revalidate',async t=>{
 const{game,url,base}=await start(t);const c=client(url,'Mage');await c.welcome;
 assert.equal((await fetch(base+'/app.js')).headers.get('cache-control'),'no-cache');
 const closed=once(c.ws,'close');const shutdown=game.close({graceMs:500});assert.equal((await closed)[0],1012);await shutdown;
});
