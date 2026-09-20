import test from 'node:test';
import assert from 'node:assert/strict';
import {createScoreStore} from '../server/scores.js';
import {creditContinuous,scoreContinuousHit} from '../server/continuous-scores.js';
import {spawnPlayer} from '../dist/respawn.js';
import {freshLoadout} from '../dist/economy.js';
import {launchProjectile,impactProjectile,settleRoom} from '../dist/rules.js';
import {launchOrbital,resolveOrbitals} from '../server/orbital.js';

function fixture(streak){
 const store=createScoreStore(null,{ranking:'coins'});
 const players=['Hunter','Bounty'].map(name=>({...store.register(name),economy:true,persona:'mage',connected:true,faceReady:true,loadout:freshLoadout()}));
 for(const p of players)spawnPlayer(p,1000);
 const [a,b]=players;store.award(b.id,0,streak);
 return{store,a,b,room:{economy:true,continuous:true,phase:'playing',players,shots:[]}};
}
for(const route of ['projectile','poison','orbital'])test(`${route} pays the five-kill victim bounty once, then resets to a normal reward after death`,()=>{
 const {room,store,a,b}=fixture(5),events=[];const report=event=>events.push(event);let hit;
 if(route==='projectile'){
  b.health=10;const shot=launchProjectile(room,a.id,'lightning',b.id,'shot',1000);hit=impactProjectile(room,a.id,shot.shotId,true,shot.impactAt);
  scoreContinuousHit(room,store,hit,10,report);
 }else if(route==='poison'){
  b.health=1;b.poison={by:a.id,life:a.life,spell:'poison',attackName:'Poison',startedAt:1000,until:4000,perSecond:2,applied:0};
  [hit]=settleRoom(room,2000);creditContinuous(room,store,hit,report);
 }else{
  a.airstrikeCharges=1;for(const p of room.players)p.location={latitude:42.36,longitude:-71.09,accuracy:2,at:1000};
  const launched=launchOrbital(room,a,a.location,1000);assert.equal(launched.error,undefined);
  [hit]=resolveOrbitals(room,launched.strike.endsAt,event=>creditContinuous(room,store,event,report));
 }
 assert.equal(b.health,0);assert.equal(events.length,1);assert.equal(events[0].coins,150);assert.equal(events[0].balance,150);
 // finish() uses this same death award after combat scoring.
 store.award(b.id,0,0,1);assert.equal(store.standings().find(p=>p.id===b.id).currentStreak,0);
 creditContinuous(room,store,{actorId:a.id,targetId:b.id,amount:10,lethal:true},report);
 assert.equal(events.length,1);assert.equal(store.standings().find(p=>p.id===a.id).coins,150);
 spawnPlayer(b,10000);b.health=0;creditContinuous(room,store,{actorId:a.id,targetId:b.id,amount:10,lethal:true},report);
 assert.equal(events[1].coins,50);assert.equal(store.standings().find(p=>p.id===a.id).coins,200);
 assert.equal(store.standings().find(p=>p.id===b.id).bestStreak,5);
});

test('bounty uses the victim current streak, not the killer streak or victim best streak',()=>{
 for(const [victimStreak,reward] of [[0,50],[2,50],[3,100],[4,100],[5,150],[6,150],[7,200],[8,200],[9,250],[10,250],[11,300]]){
  const {room,store,a,b}=fixture(victimStreak);store.award(a.id,0,10);
  b.health=0;let event;creditContinuous(room,store,{actorId:a.id,targetId:b.id,amount:10,lethal:true},value=>event=value);
  assert.equal(event.coins,reward);
 }
});
