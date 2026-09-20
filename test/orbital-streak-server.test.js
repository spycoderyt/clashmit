import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/index.js';
import {spawnPlayer} from '../dist/respawn.js';
import {ORBITAL} from '../dist/orbital-rules.js';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';
const samples=[encodeDescriptor(Array.from({length:DESCRIPTOR_LENGTH},()=>1/Math.sqrt(DESCRIPTOR_LENGTH)))];
test('orbital charges arrive once at 3, 6 and 9 consecutive kills',async t=>{
 assert.equal(ORBITAL.streakStep,3);const game=createGameServer({continuous:true});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());
 async function client(name){const ws=new WebSocket(`ws://127.0.0.1:${game.server.address().port}/ws`),messages=[];t.after(()=>ws.terminate());ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.once('open',r));const send=m=>ws.send(JSON.stringify(m));const next=async(type,predicate=()=>true)=>{const end=Date.now()+3500;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error('Missing '+type);};send({type:'join',name});return{send,next,messages,...await next('welcome')};}
 const a=await client('Orbital Ace'),b=await client('Orbital Target');for(const c of [a,b])c.send({type:'face',samples});await a.next('state',m=>m.room.players.every(p=>p.faceReady));
 const room=game.rooms.get('ARENA'),actor=room.players.find(p=>p.id===a.id),victim=room.players.find(p=>p.id===b.id);
 for(let count=1;count<=9;count++){
  if(count>1)spawnPlayer(victim);victim.health=1;actor.cooldowns={};actor.mana=10;
  a.send({type:'cast',spell:'lightning',targetId:b.id});const shot=await a.next('spell',m=>m.actorId===a.id);a.send({type:'impact',shotId:shot.shotId,tracked:true});await a.next('arena-event',m=>m.kind==='kill');
  assert.equal(actor.airstrikeCharges,Math.floor(count/3),`charges at streak ${count}`);
  a.send({type:'impact',shotId:shot.shotId,tracked:true});a.send({type:'ping',at:count});await a.next('pong',m=>m.at===count);assert.equal(actor.airstrikeCharges,Math.floor(count/3),'duplicate impact does not grant a charge');
 }
 assert.equal(a.messages.filter(m=>m.type==='arena-event'&&m.kind==='airstrike-ready').length,3);
 a.send({type:'retire'});await a.next('state',m=>m.room.players.find(p=>p.id===a.id)?.score?.deaths===1);assert.equal(actor.airstrikeCharges,0,'death clears unused charges');
});
