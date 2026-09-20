import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {freshLoadout} from '../dist/economy.js';
import {spawnPlayer} from '../dist/respawn.js';
import {launchProjectile,impactProjectile,settleRoom} from '../dist/rules.js';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';
import {createGameServer} from '../server/index.js';
import {createEventRounds} from '../server/event-rounds.js';

function poisonRoom(){
 const players=['caster','primary','secondary','original'].map(id=>{
  const p={id,name:id,persona:'witch',economy:true,connected:true,faceReady:true,loadout:freshLoadout()};
  spawnPlayer(p,1000);p.location={latitude:42,longitude:-71,accuracy:2,at:1000};return p;
 });
 players[0].loadout.skills.poison=2;
 // Keep the previous poison caster out of the area-hit selection.
 players[3].location.latitude=43;
 return {economy:true,continuous:true,enhanced:true,phase:'playing',players,shots:[]};
}
function extraPoison(room,at,id){
 const shot=launchProjectile(room,'caster','poison','primary',id,at);
 assert.equal(shot.error,undefined);settleRoom(room,shot.impactAt);
 return impactProjectile(room,'caster',id,true,shot.impactAt);
}

test('secondary Plague damage preserves stronger poison, its expiry and its original kill credit',()=>{
 const room=poisonRoom(),victim=room.players[2];
 victim.poison={by:'original',life:1,spell:'poison',attackName:'Plague',perSecond:2,startedAt:1000,until:5000,applied:0};
 for(const at of [1000,2000,3000]){
  const hit=extraPoison(room,at,String(at));
  assert.equal(hit.secondaryHits.find(p=>p.targetId===victim.id).attackRule.damage,4);
  assert.equal(victim.poison.perSecond,2);
  assert.equal(victim.poison.until,5000,'weak hits do not extend the strong effect');
  assert.equal(victim.poison.startedAt,1000);
  assert.equal(victim.poison.by,'original');assert.equal(victim.poison.life,1);
 }
 victim.health=1;
 const lethal=settleRoom(room,4000).find(hit=>hit.targetId===victim.id&&hit.lethal);
 assert.equal(lethal.actorId,'original');assert.equal(lethal.actorLife,1);
});

test('secondary Plague replaces expired or weaker poison with a bounded new effect',()=>{
 for(const previous of [{perSecond:2,until:1400},{perSecond:.5,until:6000}]){
  const room=poisonRoom(),victim=room.players[2];
  victim.poison={by:'original',life:1,spell:'poison',perSecond:previous.perSecond,startedAt:1000,until:previous.until,applied:0};
  extraPoison(room,1000,'replace');
  assert.equal(victim.poison.perSecond,1);assert.equal(victim.poison.by,'caster');
  assert.equal(victim.poison.startedAt,1500);assert.equal(victim.poison.until,4500);
 }
});

test('primary poison also preserves a stronger active effect without taking its credit',()=>{
 const room=poisonRoom(),victim=room.players[1];
 victim.poison={by:'original',life:1,spell:'poison',perSecond:3,startedAt:1000,until:5000,applied:0};
 extraPoison(room,1000,'primary');
 assert.equal(victim.poison.perSecond,3);assert.equal(victim.poison.by,'original');assert.equal(victim.poison.until,5000);
});

test('scanned-player round leaders and crown use cached portraits; public live snapshots retain images',async t=>{
 const game=createGameServer({continuous:true});
 await new Promise(resolve=>game.server.listen(0,'127.0.0.1',resolve));t.after(()=>game.close());
 const base=`http://127.0.0.1:${game.server.address().port}`;
 const face=[encodeDescriptor(Array.from({length:DESCRIPTOR_LENGTH},()=>1/Math.sqrt(DESCRIPTOR_LENGTH)))];
 async function join(name){
  const ws=new WebSocket(base.replace('http:','ws:')+'/ws'),messages=[];t.after(()=>ws.terminate());
  ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise(resolve=>ws.on('open',resolve));
  const next=async(type,predicate=()=>true)=>{
   for(let i=0;i<300;i++){const at=messages.findIndex(m=>m.type===type&&predicate(m));if(at>=0)return messages.splice(at,1)[0];await new Promise(resolve=>setTimeout(resolve,10));}
   throw Error(`Missing ${type} for ${name}`);
  };
  const send=message=>ws.send(JSON.stringify(message));send({type:'join',name});
  const {id}=await next('welcome');send({type:'face',samples:face});
  await next('state',m=>m.room.players.find(p=>p.id===id)?.faceReady);
  return{id,send,next,messages};
 }
 const clients=[];for(const name of ['Round Ada','Round Bob','Round Cy'])clients.push(await join(name));
 const portraits=new Map();
 for(const [index,client] of clients.entries()){
  const image='data:image/jpeg;base64,'+Buffer.from(String(index).repeat(4500)).toString('base64');portraits.set(client.id,image);
  client.send({type:'avatar',image});await clients[0].next('avatars',m=>m.avatars[client.id]===image);
 }
 const observer=clients[0];observer.messages.length=0;
 let state=await observer.next('state',m=>m.room.eventRound.leaders.length===3);
 assert.ok(state.room.eventRound.leaders.every(p=>!Object.hasOwn(p,'avatar')));
 assert.ok(!JSON.stringify(state).includes('data:image/'));
 const room=game.rooms.get('ARENA');createEventRounds({random:()=>0}).start(room,'koth');
 state=await observer.next('state',m=>m.room.eventRound.mode==='koth'&&m.room.eventRound.king);
 assert.equal(state.room.eventRound.king.id,clients[0].id);
 assert.ok(!Object.hasOwn(state.room.eventRound.king,'avatar'));
 assert.ok(!JSON.stringify(state).includes('data:image/'));
 assert.ok(Buffer.byteLength(JSON.stringify(state.room.eventRound))<1500);
 const live=await(await fetch(base+'/api/live')).json();
 assert.equal(live.round.king.avatar,portraits.get(live.round.king.id));
 for(const p of live.round.leaders)assert.equal(p.avatar,portraits.get(p.id));
 assert.equal(room.avatars[clients[0].id],portraits.get(clients[0].id),'serialization does not mutate the avatar cache');
});
