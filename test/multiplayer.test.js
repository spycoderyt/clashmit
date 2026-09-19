import test from 'node:test';
import assert from 'node:assert/strict';
import{WebSocket}from'ws';
import{createGameServer,MAX_PLAYERS}from'../server/index.js';
test('one arena accepts twelve distinct players and rejects a thirteenth',async t=>{
 const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const url=`ws://127.0.0.1:${game.server.address().port}/ws`,connections=[];
 async function join(name){const ws=new WebSocket(url);connections.push(ws);const response=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Join timed out')),2000);ws.on('error',reject);ws.on('message',b=>{const m=JSON.parse(b);if(m.type==='welcome'||m.type==='error'){clearTimeout(timer);resolve(m);}});});await new Promise(r=>ws.on('open',r));ws.send(JSON.stringify({type:'join',name}));return response;}
 for(let i=0;i<MAX_PLAYERS;i++){const result=await join('Mage '+i);assert.equal(result.type,'welcome');}
 assert.equal(game.rooms.get('ARENA').players.length,12);assert.match((await join('Overflow')).message,/full.*12/);for(const ws of connections)ws.close();
});
