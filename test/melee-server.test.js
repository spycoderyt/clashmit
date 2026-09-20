import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {resolveMelee,MELEE} from '../server/melee.js';
import {createScoreStore} from '../server/scores.js';
import {scoreContinuousHit} from '../server/continuous-scores.js';
import {createGameServer} from '../server/index.js';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';
import {COINS_PER_KILL,ASSIST_COINS,killReward} from '../dist/economy.js';

const player=id=>({id,connected:true,faceReady:true,health:70,life:1,persona:'mage',mana:0,shieldUntil:0});
function arena(){return{phase:'playing',players:[player('actor'),player('target')]};}
const hit=(room,sequence,at=1000,extra={})=>resolveMelee(room,room.players[0],{targetId:'target',actorLife:1,targetLife:1,hitId:`1:${sequence}`,...extra},at);

test('sword is fixed five damage, free for every class, and ignores client damage/actor claims',()=>{
 for(const persona of ['mage','witch','archer']){
  const room=arena();room.players[0].persona=persona;
  const event=hit(room,1,1000,{damage:9999,actorId:'target',manaCost:-100});
  assert.equal(event.type,'melee');assert.equal(event.actorId,'actor');assert.equal(event.spell,'melee');assert.equal(event.attackName,'Sword');assert.equal(event.damage,5);assert.equal(event.blocked,false);assert.equal(room.players[1].health,65);assert.equal(room.players[0].mana,0);
 }
});

test('the server rejects 999ms sword cooldown and allows exactly 1000ms; rejected attempts cannot be retried',()=>{
 const room=arena();assert.equal(hit(room,1,1000).damage,5);
 assert.equal(hit(room,2,1999).cooldownRemaining,1);assert.ok(hit(room,2,2000).error,'cooldown-rejected gesture is already processed');
 assert.equal(hit(room,3,2000).damage,5);assert.equal(room.players[1].health,60);
 assert.equal(MELEE.cooldownMs,1000);
});

test('shield blocks the sword and consumes cooldown, without a parry or mana cost',()=>{
 const room=arena();room.players[1].shieldUntil=1500;room.players[1].shieldStartedAt=950;
 const blocked=hit(room,1,1000);assert.equal(blocked.blocked,true);assert.equal(blocked.damage,0);assert.equal(room.players[1].health,70);assert.equal(blocked.reflection,undefined);
 assert.ok(hit(room,2,1500).error);assert.equal(hit(room,3,2000).damage,5);assert.equal(room.players[0].mana,0);
});

test('round, identities and life states must all be active before a sword can hit',()=>{
 const changes=[r=>r.phase='finished',r=>r.players[0].health=0,r=>r.players[1].health=0,r=>r.players[0].connected=false,r=>r.players[1].connected=false,r=>r.players[0].faceReady=false,r=>r.players[1].faceReady=false,r=>r.players[0].eliminated=true,r=>r.players[1].eliminated=true,r=>r.players[0].waitingForRound=true,r=>r.players[1].waitingForRound=true];
 for(const change of changes){const room=arena();change(room);const health=room.players.map(p=>p.health);assert.ok(hit(room,1).error);assert.deepEqual(room.players.map(p=>p.health),health);}
 for(const targetId of ['actor','unknown',null])assert.ok(hit(arena(),1,1000,{targetId}).error);
});

test('stun, flash and action lock each prevent melee until their server deadline',()=>{
 for(const status of ['stunUntil','flashUntil','actionLockUntil']){
  const room=arena();room.players[0][status]=2000;
  assert.ok(hit(room,1,1999).error,status);assert.equal(room.players[1].health,70);
  assert.equal(hit(room,2,2000).damage,5,status+' ends inclusively');
 }
});

test('both life IDs are mandatory, old-life hits cannot cross respawns, and malformed IDs cannot hit',()=>{
 for(const extra of [{actorLife:undefined},{targetLife:undefined},{actorLife:'1'},{targetLife:'1'},{actorLife:0},{targetLife:0},{actorLife:2},{targetLife:2},{hitId:'1:0'},{hitId:'1:-1'},{hitId:'2:1'},{hitId:'not-a-sequence'},{hitId:'1:'+('9'.repeat(100))}]){const room=arena();assert.ok(hit(room,1,1000,extra).error);assert.equal(room.players[1].health,70);}
 const room=arena();hit(room,1);room.players[0].life=2;room.players[1].life=2;
 assert.ok(hit(room,2,2000).error);
 const next=resolveMelee(room,room.players[0],{targetId:'target',actorLife:2,targetLife:2,hitId:'2:1'},2000);assert.equal(next.damage,5,'new life resets the sequence window');
});

test('old or duplicate sequence numbers never hit again, and overkill reports only actual HP',()=>{
 const room=arena();assert.equal(hit(room,5,1000).damage,5);
 assert.ok(hit(room,5,2000).error);assert.ok(hit(room,4,3000).error);
 room.players[1].health=3;const final=hit(room,6,3000);assert.equal(final.damage,3);assert.equal(room.players[1].health,0);
});

test('sword kills use the shared bounty reward and advance the killer streak exactly once',()=>{
 const store=createScoreStore(null,{ranking:'coins'}),a=store.register('Swordsman'),b=store.register('Bounty');
 const room={phase:'playing',economy:true,players:[player(a.id),player(b.id)]};store.award(a.id,0,4);store.award(b.id,0,5);room.players[1].health=2;
 const event=resolveMelee(room,room.players[0],{targetId:b.id,actorLife:1,targetLife:1,hitId:'1:1'},1000),kills=[];
 scoreContinuousHit(room,store,event,2,k=>kills.push(k));scoreContinuousHit(room,store,event,2,k=>kills.push(k));
 assert.equal(kills.length,1);assert.equal(kills[0].streak,5);assert.equal(kills[0].coins,killReward(5));assert.equal(kills[0].attackName,'Sword');
 const score=store.standings().find(p=>p.id===a.id);assert.equal(score.coins,150);assert.equal(score.knockouts,5);assert.equal(score.currentStreak,5);
});

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const face=[encodeDescriptor(Array.from({length:DESCRIPTOR_LENGTH},()=>1/Math.sqrt(DESCRIPTOR_LENGTH)))];
async function setupSockets(t){
 const game=createGameServer({continuous:true});await new Promise(resolve=>game.server.listen(0,'127.0.0.1',resolve));t.after(()=>game.close());
 const base=`http://127.0.0.1:${game.server.address().port}`;
 async function client(name){
  const ws=new WebSocket(base.replace('http:','ws:')+'/ws'),messages=[];t.after(()=>ws.terminate());ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise(resolve=>ws.once('open',resolve));
  const send=data=>ws.send(JSON.stringify(data));
  const next=async(type,predicate=()=>true)=>{const end=Date.now()+4000;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await wait(5);}throw Error(`Missing ${type} for ${name}`);};
  send({type:'join',name});const identity=await next('welcome');return{...identity,send,next,messages};
 }
 const clients=[];for(const name of ['Sword Helper','Sword Killer','Sword Victim','Sword Observer'])clients.push(await client(name));
 for(const c of clients)c.send({type:'face',samples:face});await clients[0].next('state',m=>m.room.players.length===4&&m.room.players.every(p=>p.faceReady));
 return{game,room:game.rooms.get('ARENA'),base,clients};
}

test('real sockets broadcast melee, credit actual damage/assist/kill once, and record the live map without fake projectiles',async t=>{
 const {room,base,clients}=await setupSockets(t),[helper,killer,victim]=clients;
 const target=room.players.find(p=>p.id===victim.id),at=Date.now();target.health=8;target.healthRegenAt=at;
 for(const [i,p]of room.players.entries()){p.mana=0;p.manaUpdatedAt=at;p.location={latitude:42+i*.000001,longitude:-71,accuracy:2,at};}
 const request={type:'melee',targetId:victim.id,actorLife:1,targetLife:1,hitId:'1:1',damage:1000};
 helper.send(request);
 const initial=await helper.next('melee',e=>e.actorId===helper.id);assert.equal(initial.damage,5);assert.equal(initial.blocked,false);
 assert.equal((await helper.next('damage',e=>e.targetId===victim.id)).amount,5);assert.equal(target.health,3);
 killer.send({...request,actorId:helper.id});
 const killEvents=await Promise.all(clients.map(c=>c.next('arena-event',e=>e.kind==='kill'&&e.targetId===victim.id)));
 assert.equal(new Set(killEvents.map(e=>e.id)).size,1);assert.ok(killEvents.every(e=>e.actorId===killer.id&&e.spell==='melee'&&e.attackName==='Sword'&&e.coins===COINS_PER_KILL));
 for(const c of clients){const event=await c.next('melee',e=>e.actorId===killer.id);assert.equal(event.damage,3);assert.equal(event.targetLife,1);assert.equal(event.hitId,'1:1');}
 assert.equal((await helper.next('assist')).coins,ASSIST_COINS);assert.equal((await killer.next('damage')).amount,3);
 const board=async()=>(await(await fetch(base+'/api/leaderboard')).json()).players;
 const scores=await board();assert.equal(scores.find(p=>p.id===killer.id).coins,COINS_PER_KILL);assert.equal(scores.find(p=>p.id===killer.id).knockouts,1);assert.equal(scores.find(p=>p.id===helper.id).coins,ASSIST_COINS);assert.equal(scores.find(p=>p.id===helper.id).knockouts,0);
 killer.send(request);await killer.next('error');killer.send({type:'ping',at:876});await killer.next('pong',e=>e.at===876);
 assert.equal((await board()).find(p=>p.id===killer.id).coins,COINS_PER_KILL);
 const live=await(await fetch(base+'/api/live')).json();assert.equal(live.kills.filter(k=>k.victim==='Sword Victim').length,1);assert.equal(live.map.casts.filter(c=>c.spell==='melee'&&c.kind==='impact').length,2);
 assert.ok(clients.every(c=>!c.messages.some(e=>e.type==='impact'||e.type==='spell')),'melee stays distinct from projectile protocol');
});

test('damage due before a melee message is settled first, so a dead target cannot award a second kill',async t=>{
 const {room,base,clients}=await setupSockets(t),[helper,killer,victim]=clients,target=room.players.find(p=>p.id===victim.id),at=Date.now();
 target.health=1;target.healthRegenAt=at;target.poison={by:helper.id,life:1,spell:'poison',attackName:'Plague',startedAt:at-1500,until:at+5000,perSecond:2,applied:0};
 killer.send({type:'melee',targetId:victim.id,actorLife:1,targetLife:1,hitId:'1:1'});
 const kill=await killer.next('arena-event',e=>e.kind==='kill');assert.equal(kill.actorId,helper.id);assert.equal(kill.attackName,'Plague');await killer.next('error');
 const scores=(await(await fetch(base+'/api/leaderboard')).json()).players;assert.equal(scores.find(p=>p.id===helper.id).coins,COINS_PER_KILL);assert.equal(scores.find(p=>p.id===killer.id).coins,0);
});
