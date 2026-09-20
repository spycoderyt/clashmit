import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/index.js';

async function arena(t,options){
 const game=createGameServer(options);await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());
 const url=`ws://127.0.0.1:${game.server.address().port}/ws`;
 async function join(name){
  const ws=new WebSocket(url);
  const response=new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Join timed out')),2000);ws.on('error',e=>{clearTimeout(timer);reject(e);});ws.on('message',b=>{const m=JSON.parse(b);if(m.type==='welcome'||m.type==='error'){clearTimeout(timer);resolve(m);}});});
  await new Promise(r=>ws.on('open',r));ws.send(JSON.stringify({type:'join',name}));return response;
 }
 return {game,join};
}

test('default arena admits more than 30 players without a fixed player cap',async t=>{
 const{game,join}=await arena(t);
 for(let i=0;i<31;i++)assert.equal((await join('Mage '+i)).type,'welcome');
 assert.equal(game.rooms.get('ARENA').players.length,31);
});

test('an explicitly configured capacity is still enforced',async t=>{
 const{join}=await arena(t,{maxPlayers:2});
 assert.equal((await join('One')).type,'welcome');assert.equal((await join('Two')).type,'welcome');
 assert.match((await join('Three')).message,/full.*2/);
});
