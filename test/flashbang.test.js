import test from 'node:test';
import assert from 'node:assert/strict';
import {castSpell,launchProjectile} from '../dist/rules.js';
import {freshLoadout} from '../dist/economy.js';
const at=100000;
function player(id,metres=0){return{id,name:id,connected:true,faceReady:true,health:70,economy:true,persona:'mage',loadout:freshLoadout(),mana:10,manaUpdatedAt:at,cooldowns:{},location:{latitude:42+metres/111195,longitude:-71,accuracy:3,at}};}
function setup(){const a=player('caster'),near=player('near',5),edge=player('inside',14.9),far=player('outside',15.1),shield=player('shield',2),dead=player('dead',2),offline=player('offline',2),stale=player('stale',2);shield.shieldUntil=at+10000;dead.health=0;offline.connected=false;stale.location.at=at-10001;a.loadout.consumables.flashbang=2;return{phase:'playing',continuous:true,economy:true,players:[a,near,edge,far,shield,dead,offline,stale]};}
test('flashbang affects every eligible player inside 15m, excludes caster and respects shields',()=>{
 const r=setup(),event=castSpell(r,'caster','flashbang',null,at);
 assert.equal(event.error,undefined);assert.deepEqual(event.affectedIds,['near','inside']);assert.deepEqual(event.blockedIds,['shield']);assert.equal(event.duration,3000);assert.equal(event.radius,15);
 for(const p of r.players){assert.equal(p.flashUntil||0,event.affectedIds.includes(p.id)?at+3000:0);assert.equal(p.health,p.id==='dead'?0:70);}
 assert.equal(r.players[0].loadout.consumables.flashbang,1);
 assert.equal(r.players[0].cooldowns.flashbang,at+8000);
 assert.ok(launchProjectile(r,'caster','flashbang','near','old-projectile',at).error);
});
test('blinded players can act again at exactly three seconds; repeat cast cannot bypass cooldown',()=>{
 const r=setup();castSpell(r,'caster','flashbang',null,at);
 assert.ok(launchProjectile(r,'near','lightning','caster','early',at+2999).error);
 assert.equal(launchProjectile(r,'near','lightning','caster','ready',at+3000).error,undefined);
 assert.ok(castSpell(r,'caster','flashbang',null,at+3000).error);
 assert.equal(r.players[0].loadout.consumables.flashbang,1);
});
test('missing, invalid, old or future caster location cannot spend a flashbang',()=>{
 for(const loc of [null,{latitude:NaN,longitude:-71,accuracy:3,at},{latitude:42,longitude:-71,accuracy:3,at:at-10001},{latitude:42,longitude:-71,accuracy:3,at:at+2000}]){
  const r=setup(),a=r.players[0];a.location=loc;assert.ok(castSpell(r,a.id,'flashbang',null,at).error);assert.equal(a.loadout.consumables.flashbang,2);assert.equal(a.cooldowns.flashbang,undefined);
 }
});
test('valid area cast with no nearby opponents spends one item without flashing anyone',()=>{
 const r=setup();r.players=r.players.filter(p=>['caster','outside'].includes(p.id));const event=castSpell(r,'caster','flashbang',null,at);assert.deepEqual(event.affectedIds,[]);assert.equal(r.players[0].loadout.consumables.flashbang,1);
});
test('a bought shield expires after seven seconds and stops blocking area flashes immediately',()=>{
 const r=setup(),a=r.players[0],b=r.players[1];b.loadout.consumables.shield=1;
 assert.equal(castSpell(r,b.id,'shield',null,at).error,undefined);assert.equal(b.shieldUntil,at+7000);
 assert.ok(castSpell(r,a.id,'flashbang',null,at+6999).blockedIds.includes(b.id));
 a.cooldowns.flashbang=0;const hit=castSpell(r,a.id,'flashbang',null,at+7000);assert.ok(hit.affectedIds.includes(b.id));assert.equal(b.flashUntil,at+10000);
});

test('flashbang ignores the selected target and hits players in every direction around its caster',()=>{
 for(const targetId of [null,'outside','unknown']){
  const r=setup();r.players.push(player('behind',-12));
  const event=castSpell(r,'caster','flashbang',targetId,at);
  assert.equal(event.error,undefined);assert.deepEqual(event.affectedIds,['near','inside','behind']);
  assert.equal(r.players.find(p=>p.id==='outside').flashUntil,undefined);
 }
});
