import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/index.js';
test('opt-in locations reach other players and are cleared on stop and disconnect',async t=>{
 const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const url=`ws://127.0.0.1:${game.server.address().port}/ws`;
 async function join(name){const ws=new WebSocket(url),client={ws,id:null,room:null,errors:[]};ws.on('message',b=>{const m=JSON.parse(b);if(m.type==='welcome')client.id=m.id;if(m.type==='state')client.room=m.room;if(m.type==='error')client.errors.push(m.message);});await new Promise((resolve,reject)=>{ws.on('open',resolve);ws.on('error',reject);});ws.send(JSON.stringify({type:'join',name}));await until(()=>client.id&&client.room);return client;}
 async function until(check){const started=Date.now();while(!check()){if(Date.now()-started>3000)throw Error('Timed out waiting for server state');await new Promise(r=>setTimeout(r,20));}}
 const ada=await join('Ada'),bo=await join('Bo'),seenByBo=()=>bo.room.players.find(p=>p.id===ada.id);
 assert.equal(seenByBo().location,undefined);
 ada.ws.send(JSON.stringify({type:'location',location:{latitude:42.3591,longitude:-71.0921,accuracy:6.4,extra:'ignored'}}));
 await until(()=>seenByBo().location);
 const shared=seenByBo().location;assert.deepEqual(Object.keys(shared).sort(),['accuracy','at','latitude','longitude']);assert.equal(shared.latitude,42.3591);assert.equal(shared.accuracy,6);assert.ok(Math.abs(shared.at-bo.room.serverTime)<2000);
 // Malformed fixes never replace a good one, and updates faster than 2/s are ignored.
 ada.ws.send(JSON.stringify({type:'location',location:{latitude:999,longitude:0,accuracy:5}}));ada.ws.send(JSON.stringify({type:'location',location:{latitude:10,longitude:10,accuracy:5}}));
 await new Promise(r=>setTimeout(r,600));assert.equal(seenByBo().location.latitude,42.3591);
 ada.ws.send(JSON.stringify({type:'location',location:{latitude:42.36,longitude:-71.09,accuracy:5}}));await until(()=>seenByBo().location.latitude===42.36);
 ada.ws.send(JSON.stringify({type:'location',location:null}));await until(()=>!seenByBo().location);
 ada.ws.send(JSON.stringify({type:'location',location:{latitude:42.36,longitude:-71.09,accuracy:5}}));await until(()=>seenByBo().location);
 ada.ws.close();await until(()=>!seenByBo().connected);assert.equal(seenByBo().location,null);assert.deepEqual(ada.errors,[]);bo.ws.close();
});
