import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/index.js';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const face=[encodeDescriptor(Array.from({length:DESCRIPTOR_LENGTH},()=>1/Math.sqrt(DESCRIPTOR_LENGTH)))];

test('caster, victim and observer receive kill and bounty notices, with the real 150-coin reward',async t=>{
 const game=createGameServer({continuous:true,respawnDelayMs:20});await new Promise(resolve=>game.server.listen(0,'127.0.0.1',resolve));t.after(()=>game.close());
 const base=`http://127.0.0.1:${game.server.address().port}`;
 async function client(name){
  const ws=new WebSocket(base.replace('http:','ws:')+'/ws'),messages=[];t.after(()=>ws.terminate());ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise(resolve=>ws.once('open',resolve));
  const send=data=>ws.send(JSON.stringify(data));
  const next=async(type,predicate=()=>true)=>{const end=Date.now()+4000;while(Date.now()<end){const index=messages.findIndex(m=>m.type===type&&predicate(m));if(index>=0)return messages.splice(index,1)[0];await wait(5);}throw Error(`Missing ${type} for ${name}`);};
  send({type:'join',name});const identity=await next('welcome');return{...identity,ws,send,next};
 }
 const a=await client('Streak Ace'),b=await client('Bounty Hunter'),observer=await client('Observer'),clients=[a,b,observer];
 for(const p of clients)p.send({type:'face',samples:face});await a.next('state',m=>m.room.players.length===3&&m.room.players.every(p=>p.faceReady));
 const room=game.rooms.get('ARENA'),ace=room.players.find(p=>p.id===a.id),hunter=room.players.find(p=>p.id===b.id);
 async function kill(actor,target){
  const attacker=room.players.find(p=>p.id===actor.id),victim=room.players.find(p=>p.id===target.id);victim.health=10;victim.healthRegenAt=Date.now();attacker.cooldowns={};attacker.mana=10;
  actor.send({type:'cast',spell:'lightning',targetId:target.id});const shot=await actor.next('spell',m=>m.actorId===actor.id);actor.send({type:'impact',shotId:shot.shotId,tracked:true});
  const events=await Promise.all(clients.map(client=>client.next('arena-event',m=>m.kind==='kill'&&m.actorId===actor.id&&m.targetId===target.id)));
  assert.equal(new Set(events.map(event=>event.id)).size,1,'all three phones receive the same global kill event');return{events,shot};
 }
 for(let streak=1;streak<=6;streak++){
  const {events}=await kill(a,b);assert.ok(events.every(event=>event.coins===50));
  if(streak>=3){const notices=await Promise.all(clients.map(client=>client.next('arena-event',m=>m.kind==='streak'&&m.actorId===a.id&&m.text.includes(`${streak}x killstreak`))));assert.equal(new Set(notices.map(event=>event.id)).size,1);assert.ok(notices.every(event=>event.text===`Streak Ace is on a ${streak}x killstreak. Bounty: ${streak>=5?3:2}x coins (${streak>=5?150:100})!`));}
  await b.next('state',m=>m.room.players.find(p=>p.id===b.id)?.respawnAt>0);await wait(25);b.send({type:'respawn'});await b.next('state',m=>m.room.players.find(p=>p.id===b.id)?.life===streak+1&&m.room.players.find(p=>p.id===b.id)?.health===70);
 }
 assert.equal(ace.airstrikeCharges,2);
 const {events,shot}=await kill(b,a);assert.ok(events.every(event=>event.coins===150&&event.balance===150));
 const dead=await a.next('state',m=>m.room.players.find(p=>p.id===a.id)?.health===0&&m.room.players.find(p=>p.id===a.id)?.score.deaths===1);const score=dead.room.players.find(p=>p.id===a.id).score;
 assert.equal(score.currentStreak,0);assert.equal(score.bestStreak,6);assert.equal(score.deaths,1);
 b.send({type:'impact',shotId:shot.shotId,tracked:true});await wait(30);
 const live=await(await fetch(base+'/api/live')).json();assert.equal(live.players.find(p=>p.id===hunter.id).coins,150);assert.equal(live.kills.filter(k=>k.victim==='Streak Ace').length,1);assert.equal(live.kills[0].coins,150);
});
