import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {COINS_PER_KILL,ATTACKS,CLASS_ATTACKS,UNLOCK_COST,UPGRADE_COST,freshLoadout,ruleFor,totalDamage} from '../dist/economy.js';
import {castSpell,launchProjectile,impactProjectile,settleRoom} from '../dist/rules.js';
import {spawnPlayer,advanceRespawns,requestRespawn,selectRespawnPersona} from '../dist/respawn.js';
import {createScoreStore} from '../server/scores.js';
import {creditContinuous} from '../server/continuous-scores.js';

function player(id,persona='mage') {
 const p={id,name:id,persona,economy:true,connected:true,faceReady:true,loadout:freshLoadout()};
 spawnPlayer(p,1000);return p;
}
function room(persona='mage') {return {economy:true,continuous:true,enhanced:true,phase:'playing',eventRound:{mode:'ffa'},players:[player('a',persona),player('b')],shots:[]};}

test('every owned heavy and ultimate upgrades damage without changing mana, cooldown or flight time',()=>{
 assert.ok(UNLOCK_COST[1]<UPGRADE_COST[0]&&UPGRADE_COST[0]<UNLOCK_COST[2]);
 for(const [persona,deck] of Object.entries(CLASS_ATTACKS)) {
  const r=room(persona),[a]=r.players;
  assert.ok(totalDamage(ruleFor(a,deck[0]))<totalDamage(ruleFor(a,deck[1])),persona+' quick damage');
  assert.ok(ruleFor(a,deck[0]).cooldown<ruleFor(a,deck[1]).cooldown,persona+' quick delay');
  for(const id of deck) {
   a.loadout.skills[id]=1;const base=ruleFor(a,id);a.loadout.skills[id]=2;const upgraded=ruleFor(a,id);
   assert.ok(totalDamage(upgraded)>totalDamage(base),id+' damage upgrade');
   for(const key of ['manaCost','cooldown','flightMs'])assert.equal(upgraded[key],base[key],id+' '+key);
   a.mana=10;a.cooldowns={};const shot=launchProjectile(r,a.id,id,'b',id,1000);
   assert.equal(shot.error,undefined,id);assert.equal(shot.attackRule.damage,upgraded.damage);
   assert.equal(shot.super,undefined);assert.equal(shot.upgraded,true);
  }
 }
});

test('upgraded ultimates use the entire mana bar and leave an unshielded seven-heart opponent alive',()=>{
 for(const [persona,deck] of Object.entries(CLASS_ATTACKS)) {
  const r=room(persona),[a,b]=r.players,id=deck[2];a.loadout.skills[id]=2;
  const shot=launchProjectile(r,'a',id,'b',id,1000);assert.equal(a.mana,0);
  const hit=impactProjectile(r,'a',id,true,shot.impactAt);assert.equal(hit.missed,false);assert.equal(b.health,3);
 }
});

test('every rejected consumable cast preserves stock, including stun, cooldown, death and paused rounds',()=>{
 for(const id of ['shield','heal','flashbang']) for(const reason of ['stun','cooldown','dead','paused','disconnected']) {
  const r=room(),[a]=r.players;a.loadout.consumables[id]=2;
  if(reason==='stun')a.stunUntil=2000;
  if(reason==='cooldown')a.cooldowns[id]=2000;
  if(reason==='dead')a.health=0;
  if(reason==='paused')r.phase='finished';
  if(reason==='disconnected')a.connected=false;
  const result=castSpell(r,'a',id,null,1000);
  assert.ok(result.error,id+' '+reason);assert.equal(a.loadout.consumables[id],2);assert.equal(a.mana,10);
 }
});

test('a purchased shield clears both lingering effects and blocks upgraded attacks without automatic supers',()=>{
 for(const [persona,deck] of Object.entries(CLASS_ATTACKS)) for(const id of deck) {
  const r=room(persona),[a,b]=r.players;a.loadout.skills[id]=2;b.loadout.consumables.shield=1;
  const effect={by:'a',startedAt:1000,until:8000,perSecond:3,applied:0};b.poison={...effect};b.swarm={...effect};
  const shield=castSpell(r,'b','shield',null,1000);assert.equal(shield.super,undefined);assert.equal(b.poison,null);assert.equal(b.swarm,null);
  const shot=launchProjectile(r,'a',id,'b',id,1500);const hit=impactProjectile(r,'a',id,true,shot.impactAt);
  assert.equal(hit.blocked,id!=='lightning',id);assert.equal(b.health,id==='lightning'?56:70,id);assert.equal(b.poison,null);assert.equal(b.swarm,null);
 }
});

test('coins and all three character purchases survive store reload, and spending changes the ranking',t=>{
 const dir=mkdtempSync(join(tmpdir(),'clash-economy-audit-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const file=join(dir,'scores.json');
 let store=createScoreStore(file,{ranking:'coins'});const a=store.register('Alice'),b=store.register('Bob');
 store.award(a.id,0,0,0,true,600);store.award(b.id,0,0,0,true,590);
 assert.equal(store.standings()[0].id,a.id);
 for(const [persona,deck] of Object.entries(CLASS_ATTACKS))assert.equal(store.purchase(a.id,persona,'unlock',deck[1]).error,undefined);
 assert.equal(store.purchase(a.id,'mage','upgrade','lightning').error,undefined);
 assert.equal(store.purchase(a.id,'mage','consumable','heal').error,undefined);
 assert.equal(store.standings()[0].id,b.id);
 const expected=store.loadout(a.id);expected.consumables.heal=0;store.saveLoadout(a.id,expected);
 store=createScoreStore(file,{ranking:'coins'});assert.equal(store.find(a.token).id,a.id);assert.equal(store.standings().find(p=>p.id===a.id).coins,310);assert.deepEqual(store.loadout(a.id),expected);
 const before=store.standings();assert.ok(store.purchase(a.id,'mage','upgrade','meteor').error);assert.deepEqual(store.standings(),before);
 const detached=store.loadout(a.id);detached.skills.lightning=999;assert.equal(store.loadout(a.id).skills.lightning,2);
});

test('one victim life gives exactly one 50-coin reward; the victim retains shop funds',()=>{
 const r=room(),store=createScoreStore(null,{ranking:'coins'}),a=store.register('Alice'),b=store.register('Bob');
 r.players[0].id=a.id;r.players[1].id=b.id;store.award(b.id,0,0,0,true,60);
 const hit={actorId:a.id,targetId:b.id,amount:70,lethal:true,actorLife:1};
 creditContinuous(r,store,hit);creditContinuous(r,store,hit);
 assert.equal(store.standings().find(p=>p.id===a.id).coins,COINS_PER_KILL);assert.equal(store.standings().find(p=>p.id===a.id).knockouts,1);assert.equal(store.standings().find(p=>p.id===b.id).coins,60);
 spawnPlayer(r.players[1],5000);creditContinuous(r,store,hit);assert.equal(store.standings().find(p=>p.id===a.id).coins,2*COINS_PER_KILL);
});

test('poison and skeleton kills pay coins once when their damage settles',()=>{
 for(const id of ['poison','skeletonArmy']) {
  const r=room('witch'),store=createScoreStore(null,{ranking:'coins'}),a=store.register('Alice'),b=store.register('Bob');r.players[0].id=a.id;r.players[1].id=b.id;r.players[0].loadout.skills[id]=1;r.players[1].health=id==='poison'?7:2;
  const shot=launchProjectile(r,a.id,id,b.id,id,1000);impactProjectile(r,a.id,id,true,shot.impactAt);
  for(const damage of settleRoom(r,shot.impactAt+1000))creditContinuous(r,store,damage);
  assert.equal(r.players[1].health,0,id);assert.equal(store.standings().find(p=>p.id===a.id).coins,COINS_PER_KILL,id);
  for(const damage of settleRoom(r,shot.impactAt+10000))creditContinuous(r,store,damage);
  assert.equal(store.standings().find(p=>p.id===a.id).coins,COINS_PER_KILL,id);
 }
});

test('FFA character selection remains available after cooldown and respawn preserves purchases and stock',()=>{
 const r=room(),[a]=r.players;a.health=0;a.loadout.skills.bombArrow=2;a.loadout.consumables.shield=3;advanceRespawns(r,2000);
 assert.deepEqual(selectRespawnPersona(r,a,'archer',15000),{});assert.equal(a.health,0);
 assert.deepEqual(requestRespawn(r,a,15000),{});assert.equal(a.persona,'archer');assert.equal(a.health,70);assert.equal(a.loadout.skills.bombArrow,2);assert.equal(a.loadout.consumables.shield,3);
 for(const mode of ['koth','ffa']) {const next=room(),p=next.players[0];next.eventRound.mode=mode;p.health=0;advanceRespawns(next,2000);if(mode==='koth')assert.ok(selectRespawnPersona(next,p,'witch',15000).error);else{p.connected=false;assert.ok(requestRespawn(next,p,15000).error);}}
});

test('consumable cooldowns leave counterplay windows instead of permanent shields, heal spam or flash chains',()=>{
 const r=room(),[a]=r.players;a.loadout.consumables={shield:3,heal:3,flashbang:3};
 assert.equal(castSpell(r,'a','shield',null,1000).error,undefined);
 assert.equal(a.shieldUntil,8000);assert.ok(castSpell(r,'a','shield',null,11000).error);
 assert.equal(a.loadout.consumables.shield,2);assert.equal(castSpell(r,'a','shield',null,15000).error,undefined);
 a.health=10;assert.equal(castSpell(r,'a','heal',null,16000).error,undefined);assert.equal(a.health,60);
 a.health=10;assert.ok(castSpell(r,'a','heal',null,18000).error);assert.equal(a.health,10);assert.equal(a.loadout.consumables.heal,2);
 assert.equal(castSpell(r,'a','heal',null,24000).error,undefined);assert.equal(a.health,60);
 for(const p of r.players)p.location={latitude:42,longitude:-71,accuracy:3,at:25000};
 assert.equal(castSpell(r,'a','flashbang',null,25000).error,undefined);
 assert.ok(r.players[1].stunUntil<33000);assert.ok(castSpell(r,'a','flashbang',null,29000).error);
 assert.equal(a.loadout.consumables.flashbang,2);assert.equal(castSpell(r,'a','flashbang',null,33000).error,undefined);
});

test('coin combat does not write scores for nonlethal damage or repeated lethal reports',()=>{
 const r=room(),store=createScoreStore(null,{ranking:'coins'}),a=store.register('Alice'),b=store.register('Bob');r.players[0].id=a.id;r.players[1].id=b.id;
 const award=store.award;let writes=0;store.award=(...args)=>{writes++;return award(...args);};
 const hit={actorId:a.id,targetId:b.id,amount:1,actorLife:1};
 for(let n=0;n<50;n++)creditContinuous(r,store,hit);
 assert.equal(writes,0,'nonlethal direct hits and DOT ticks skip persistence entirely');
 creditContinuous(r,store,{...hit,lethal:true});assert.equal(writes,1);
 creditContinuous(r,store,{...hit,lethal:true});assert.equal(writes,1,'one persisted award per life');
 const score=store.standings().find(p=>p.id===a.id);assert.equal(score.points,0);assert.equal(score.coins,COINS_PER_KILL);assert.equal(score.knockouts,1);assert.equal(score.currentStreak,1);
});
