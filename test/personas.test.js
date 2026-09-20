import test from 'node:test';import assert from 'node:assert/strict';
import {SPELLS,PERSONAS,piercerOf,deckOf,settle,settleRoom,castSpell,launchProjectile,impactProjectile} from '../dist/rules.js';

const make=(id,persona)=>({id,name:id,persona,health:100,mana:10,manaUpdatedAt:0,shieldUntil:0,cooldowns:{},connected:true});
const arena=(a='mage',b='mage')=>({phase:'playing',endsAt:1e9,players:[make('a',a),make('b',b)],shots:[]});
function land(room,actor,spell,target,at,id=spell+at){const shot=launchProjectile(room,actor,spell,target,id,at);assert.equal(shot.error,undefined,shot.error);return impactProjectile(room,actor,id,true,shot.impactAt);}

test('every persona has four spells and shares heal and shield',()=>{
 assert.deepEqual(Object.keys(PERSONAS).sort(),['archer','mage','witch']);
 for(const deck of Object.values(PERSONAS)){assert.equal(deck.length,4);assert.ok(deck.includes('heal')&&deck.includes('shield'));for(const s of deck)assert.ok(SPELLS[s],s);}
 assert.deepEqual(deckOf({}),PERSONAS.mage,'a player with no persona plays the original deck');
});
test('a spell outside the deck is rejected and costs nothing',()=>{
 const room=arena('mage','witch'),r=launchProjectile(room,'a','poison','b','x',1000);
 assert.equal(r.error,'Not in your deck.');assert.equal(room.players[0].mana,10);
 assert.equal(launchProjectile(room,'b','fireball','a','y',1000).error,'Not in your deck.');
 assert.equal(launchProjectile(room,'b','poison','a','z',1000).error,undefined);
});
test('poison totals 20: 5 on impact, then exactly 15 more across staggered settles',()=>{
 const room=arena('witch','mage'),[,b]=room.players,hit=land(room,'a','poison','b',1000);
 assert.equal(hit.blocked,false);assert.equal(b.health,95);const t=hit.resolvedAt;
 settle(b,t+500);assert.equal(b.health,94);settle(b,t+1300);assert.equal(b.health,92);settle(b,t+1300);assert.equal(b.health,92,'settling twice at one instant is idempotent');
 settle(b,t+5000);assert.equal(b.health,80);settle(b,t+60000);assert.equal(b.health,80,'20 in total, never more');assert.equal(b.poison,null);
});
test('poison cannot take health below zero',()=>{
 const room=arena('witch','mage'),[,b]=room.players;b.health=9;const hit=land(room,'a','poison','b',1000);
 settle(b,hit.resolvedAt+5000);assert.equal(b.health,0);
});
test('every persona has exactly one attack a shield blocks and one it cannot',()=>{
 for(const [persona,deck] of Object.entries(PERSONAS)){
  const attacks=deck.filter(s=>SPELLS[s].flightMs),piercing=attacks.filter(s=>SPELLS[s].bypassShield);
  assert.equal(attacks.length,2,persona);assert.equal(piercing.length,1,`${persona} needs exactly one unblockable attack, has: ${piercing.join(', ')||'none'}`);
  assert.equal(piercerOf(deck),piercing[0]);
  // Slot order is part of the design: the blockable attack is leftmost, the unblockable one beside it, then shield and heal.
  assert.ok(!SPELLS[deck[0]].bypassShield&&SPELLS[deck[0]].flightMs,`${persona}: slot 1 must be the blockable attack`);assert.ok(SPELLS[deck[1]].bypassShield,`${persona}: slot 2 must be the unblockable attack`);assert.deepEqual(deck.slice(2),['shield','heal']);
 }
 assert.deepEqual(Object.values(PERSONAS).map(piercerOf),['lightning','skeletonArmy','zap']);
});
test('a shield stops poison before it starts',()=>{
 const room=arena('witch','mage'),[,b]=room.players;b.shieldUntil=1e8;
 assert.equal(land(room,'a','poison','b',1000).blocked,true);assert.equal(b.poison??null,null);assert.equal(b.health,100);
});
test('the skeleton army walks through a shield, and a splash spell is still the answer to it',()=>{
 const room=arena('witch','mage'),[,b]=room.players;b.shieldUntil=1e8;const hit=land(room,'a','skeletonArmy','b',1000);
 assert.equal(hit.blocked,false);assert.ok(b.swarm);settle(b,hit.resolvedAt+2000);assert.equal(b.health,90);
 assert.equal(launchProjectile(room,'b','fireball','a','clear',hit.resolvedAt+2100).clearedSwarm,true);assert.equal(b.swarm,null);
});
test('zap goes through a shield and still stuns; arrows do not',()=>{
 const room=arena('archer','mage'),[,b]=room.players;b.shieldUntil=1e8;
 assert.equal(land(room,'a','arrows','b',1000).blocked,true);assert.equal(b.health,100);
 const hit=land(room,'a','zap','b',2000);assert.equal(hit.blocked,false);assert.equal(b.health,92);
 assert.equal(castSpell(room,'b','heal',null,hit.resolvedAt+100).error,"You're stunned.");
});
test('a landed skeleton army deals 30 over six seconds without further tracking',()=>{
 const room=arena('witch','mage'),[,b]=room.players,hit=land(room,'a','skeletonArmy','b',1000);
 assert.equal(b.health,100,'the march itself deals no damage');assert.ok(b.swarm);
 settle(b,hit.resolvedAt+3000);assert.equal(b.health,85);settle(b,hit.resolvedAt+9000);assert.equal(b.health,70);assert.equal(b.swarm,null);
});
test('a launched skeleton army keeps its target after tracking is lost',()=>{
 const room=arena('witch','mage'),shot=launchProjectile(room,'a','skeletonArmy','b','s',1000),hit=impactProjectile(room,'a','s',false,shot.impactAt);
 assert.equal(hit.missed,false);assert.ok(room.players[1].swarm);settle(room.players[1],shot.impactAt+6000);assert.equal(room.players[1].health,70);
});
test('a splash cast clears the caster’s swarm; a single-target cast does not',()=>{
 const room=arena('witch','mage'),[,b]=room.players,hit=land(room,'a','skeletonArmy','b',1000),t=hit.resolvedAt;
 assert.equal(launchProjectile(room,'b','lightning','a','l',t+100).clearedSwarm,undefined);assert.ok(b.swarm,'lightning is single-target');
 const clear=launchProjectile(room,'b','fireball','a','f',t+1000);assert.equal(clear.clearedSwarm,true);assert.equal(b.swarm,null);
 const after=b.health;settle(b,t+6000);assert.equal(b.health,after,'no damage after the swarm is cleared');
});
test('a swarmed player may clear with a splash spell without a locked target',()=>{
 const room=arena('witch','archer'),[,b]=room.players,hit=land(room,'a','skeletonArmy','b',1000),t=hit.resolvedAt;
 const clear=launchProjectile(room,'b','arrows',null,'c',t+200);
 assert.equal(clear.error,undefined);assert.equal(clear.clearedSwarm,true);assert.equal(clear.shotId,undefined,'no projectile without a target');
 assert.equal(b.swarm,null);assert.equal(b.mana,10-SPELLS.arrows.manaCost);assert.equal(room.shots.length,0);
 assert.equal(launchProjectile(room,'b','arrows',null,'d',t+5000).error,'Aim at an active opponent.','no free untargeted casts without a swarm');
});
test('zap stuns: casts are rejected for half a second, then allowed',()=>{
 const room=arena('archer','mage'),hit=land(room,'a','zap','b',1000),t=hit.resolvedAt;assert.equal(room.players[1].health,92);
 assert.equal(castSpell(room,'b','heal',null,t+100).error,"You're stunned.");assert.equal(launchProjectile(room,'b','fireball','a','q',t+499).error,"You're stunned.");
 assert.equal(castSpell(room,'b','heal',null,t+500).error,undefined);
});
test('damage over time stops when the round is not live',()=>{
 const room=arena('witch','mage'),[,b]=room.players,hit=land(room,'a','poison','b',1000);room.phase='finished';
 settleRoom(room,hit.resolvedAt+5000);assert.equal(b.health,95);assert.equal(b.poison,null);
});
test('settleRoom applies poison deaths so the round can end',()=>{
 const room=arena('witch','mage'),[,b]=room.players;b.health=12;const hit=land(room,'a','poison','b',1000);
 settleRoom(room,hit.resolvedAt+5000);assert.equal(b.health,0);
});
test('a hit settles the target first, so re-applied poison never swallows damage already owed',()=>{
 const room=arena('witch','mage'),[,b]=room.players,first=land(room,'a','poison','b',1000),t=first.resolvedAt;
 settle(b,t+2200);assert.equal(b.health,89,'5 on impact, then 6 over 2.2s');
 // The second poison lands 2.5s in. By then 7 is owed, but only 6 has been applied.
 const second=land(room,'a','poison','b',t+1300);assert.equal(second.resolvedAt,t+2500);
 assert.equal(b.health,83,'the 1 still owed by the first poison, then 5 on impact');
 settle(b,second.resolvedAt+5000);assert.equal(b.health,68,'the refreshed poison runs its full 15');
});
test('a target already dead from lingering damage cannot be hit again',()=>{
 const room=arena('witch','mage'),[,b]=room.players;b.health=7;const first=land(room,'a','poison','b',1000);
 assert.equal(b.health,2);const shot=launchProjectile(room,'a','skeletonArmy','b','late',first.resolvedAt+100);
 // Nothing settles b until the army arrives 1.5s later, by which time the poison has killed them.
 const hit=impactProjectile(room,'a','late',true,shot.impactAt);assert.equal(b.health,0);assert.equal(hit.missed,true);assert.equal(b.swarm??null,null);
});
test('a thrown spell cannot be resolved instantly',()=>{
 const room=arena('witch','mage');assert.equal(castSpell(room,'a','poison','b',1000).error,'That spell must be thrown.');
 assert.equal(room.players[1].health,100);assert.equal(room.players[0].mana,10);
});
