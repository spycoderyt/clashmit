import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/index.js';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';
import {COINS_PER_KILL,UNLOCK_COST,UPGRADE_COST} from '../dist/economy.js';
import {spawnPlayer} from '../dist/respawn.js';
const samples=[encodeDescriptor(Array.from({length:DESCRIPTOR_LENGTH},()=>1/Math.sqrt(DESCRIPTOR_LENGTH)))];
async function setup(t){
 const game=createGameServer({continuous:true,respawnDelayMs:10000});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const base=`http://127.0.0.1:${game.server.address().port}`;
 async function client(name){
  const ws=new WebSocket(base.replace('http:','ws:')+'/ws'),messages=[];t.after(()=>ws.terminate());ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise(r=>ws.once('open',r));
  const send=m=>ws.send(JSON.stringify(m));const next=async(type,predicate=()=>true)=>{const until=Date.now()+3500;while(Date.now()<until){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error('Missing '+type+' for '+name);};
  send({type:'join',name});return{ws,send,next,messages,...await next('welcome')};
 }
 const a=await client('Retire Alice'),b=await client('Retire Bob');for(const c of [a,b])c.send({type:'face',samples});await a.next('state',m=>m.room.players.every(p=>p.faceReady));const room=game.rooms.get('ARENA');
 return{a,b,room,alice:room.players.find(p=>p.id===a.id),bob:room.players.find(p=>p.id===b.id),board:async()=>(await(await fetch(base+'/api/leaderboard')).json()).players};
}
test('Exit keeps the same socket and scan, counts one death without a bounty, and allows the normal shop and respawn',async t=>{
 const {a,b,room,alice,bob,board}=await setup(t);bob.health=1;
 a.send({type:'cast',spell:'lightning',targetId:b.id});const shot=await a.next('spell');a.send({type:'impact',shotId:shot.shotId,tracked:true});await a.next('arena-event',m=>m.kind==='kill');
 const previous=(await board()).find(p=>p.id===a.id);assert.equal(previous.currentStreak,1);const face=room.faces[a.id];room.avatars??={};room.avatars[a.id]='saved portrait';
 a.messages.length=0;a.send({type:'retire'});const dead=await a.next('state',m=>m.room.players.find(p=>p.id===a.id)?.health===0);const own=dead.room.players.find(p=>p.id===a.id),deadline=own.respawnAt;
 assert.equal(own.score.deaths,1);assert.equal(own.score.currentStreak,0);assert.equal(own.score.coins,COINS_PER_KILL);assert.equal(deadline-own.diedAt,10000);assert.equal(own.faceReady,true);assert.equal(own.connected,true);assert.equal(alice.token,a.token);assert.equal(room.faces[a.id],face);assert.equal(room.avatars[a.id],'saved portrait');assert.equal(a.ws.readyState,WebSocket.OPEN);
 a.messages.length=0;a.send({type:'retire'});await a.next('state',m=>m.room.players.find(p=>p.id===a.id)?.health===0);assert.equal(alice.respawnAt,deadline);assert.equal((await board()).find(p=>p.id===a.id).deaths,1);assert.equal((await board()).find(p=>p.id===b.id).coins,0);assert.equal(a.messages.filter(m=>m.type==='arena-event'&&m.kind==='kill').length,0);
 a.send({type:'cast',spell:'lightning',targetId:b.id});assert.match((await a.next('error')).message,/live round/);a.send({type:'respawn'});assert.match((await a.next('error')).message,/countdown/);
 a.send({type:'persona',persona:'witch'});await a.next('state',m=>m.room.players.find(p=>p.id===a.id)?.nextPersona==='witch');
 a.send({type:'purchase',kind:'unlock',item:'skeletonArmy'});const purchaseError=await a.next('error');assert.doesNotMatch(purchaseError.message,/Shop while/,'shop accepts dead players and checks their balance');
 alice.respawnAt=Date.now()-1;a.send({type:'respawn'});const alive=await a.next('state',m=>m.room.players.find(p=>p.id===a.id)?.life===2);const returned=alive.room.players.find(p=>p.id===a.id);assert.equal(returned.health,70);assert.equal(returned.persona,'witch');assert.equal(returned.name,'Retire Alice');assert.equal(returned.faceReady,true);assert.equal(room.faces[a.id],face);assert.equal(room.avatars[a.id],'saved portrait');assert.equal(returned.score.deaths,1);
});
test('Exit settles already-due lethal damage before it handles voluntary retirement',async t=>{
 const {a,b,alice,board}=await setup(t),now=Date.now();alice.health=1;alice.healthRegenAt=now;alice.poison={by:b.id,life:1,spell:'poison',attackName:'Poison',perSecond:10,startedAt:now-1000,until:now+3000,applied:0};
 a.send({type:'retire'});await b.next('arena-event',m=>m.kind==='kill'&&m.targetId===a.id);const dead=await a.next('state',m=>m.room.players.find(p=>p.id===a.id)?.score?.deaths===1);assert.equal(dead.room.players.find(p=>p.id===a.id).score.deaths,1);assert.equal((await board()).find(p=>p.id===b.id).coins,COINS_PER_KILL);
 a.messages.length=0;a.send({type:'retire'});await a.next('state',m=>m.room.players.find(p=>p.id===a.id)?.health===0);assert.equal((await board()).find(p=>p.id===b.id).coins,COINS_PER_KILL);assert.equal((await board()).find(p=>p.id===a.id).deaths,1);
});
test('living players can unlock and upgrade once, but consumables stay in the death shop',async t=>{
 const {a,b,alice,bob,board}=await setup(t);
 a.send({type:'purchase',kind:'unlock',item:'meteor'});assert.match((await a.next('error')).message,/previous/);
 a.send({type:'purchase',kind:'unlock',item:'fireball'});assert.match((await a.next('error')).message,/coins/);
 for(let i=0;i<3;i++){if(i)spawnPlayer(bob);bob.health=1;alice.cooldowns={};alice.mana=10;a.send({type:'cast',spell:'lightning',targetId:b.id});const shot=await a.next('spell',m=>m.actorId===a.id);a.send({type:'impact',shotId:shot.shotId,tracked:true});await a.next('arena-event',m=>m.kind==='kill');}
 a.send({type:'purchase',kind:'unlock',item:'fireball'});const unlocked=await a.next('state',m=>m.room.players.find(p=>p.id===a.id)?.loadout?.skills?.fireball===1);const own=unlocked.room.players.find(p=>p.id===a.id);assert.equal(own.health,70);assert.equal(own.score.deaths,0);assert.equal(own.score.coins,3*COINS_PER_KILL-UNLOCK_COST[1]);
 a.send({type:'purchase',kind:'unlock',item:'fireball'});assert.match((await a.next('error')).message,/Already/);assert.equal((await board()).find(p=>p.id===a.id).coins,own.score.coins);
 a.send({type:'purchase',kind:'upgrade',item:'meteor'});assert.match((await a.next('error')).message,/Unlock/);
 a.send({type:'purchase',kind:'upgrade',item:'fireball'});assert.match((await a.next('error')).message,/coins/);
 alice.mana=3;alice.manaUpdatedAt=Date.now();const health=alice.health,cooldowns={...alice.cooldowns};
 a.send({type:'purchase',kind:'upgrade',item:'lightning'});const upgraded=await a.next('state',m=>m.room.players.find(p=>p.id===a.id)?.loadout?.skills?.lightning===2);const result=upgraded.room.players.find(p=>p.id===a.id);assert.equal(result.score.coins,own.score.coins-UPGRADE_COST[0]);assert.equal(result.health,health);assert.ok(result.mana>=3&&result.mana<4,'buying an upgrade does not spend mana');assert.deepEqual(result.cooldowns,cooldowns);
 a.send({type:'purchase',kind:'upgrade',item:'lightning'});assert.match((await a.next('error')).message,/Already/);assert.equal((await board()).find(p=>p.id===a.id).coins,result.score.coins);
 a.send({type:'purchase',kind:'consumable',item:'heal'});assert.match((await a.next('error')).message,/Shop/);
});
