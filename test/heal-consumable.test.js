import test from 'node:test';
import assert from 'node:assert/strict';
import {freshLoadout,MAX_HEALTH,CONSUMABLES} from '../dist/economy.js';
import {spawnPlayer} from '../dist/respawn.js';
import {castSpell} from '../dist/rules.js';

test('Heal at full health keeps stock and cooldown, then works as soon as health is missing',()=>{
 const player={id:'healer',persona:'mage',economy:true,connected:true,faceReady:true,loadout:freshLoadout()};
 spawnPlayer(player,1000);player.loadout.consumables.heal=2;player.cooldowns.heal=999;
 const room={economy:true,continuous:true,phase:'playing',players:[player]};
 const result=castSpell(room,player.id,'heal',null,1000);
 assert.equal(result.error,'You are at full health.');
 assert.ok(!Object.hasOwn(result,'healedAmount'));
 assert.equal(player.health,MAX_HEALTH);assert.equal(player.loadout.consumables.heal,2);
 assert.equal(player.cooldowns.heal,999);assert.equal(player.mana,10);
 player.health=MAX_HEALTH-1;
 const smallHeal=castSpell(room,player.id,'heal',null,1000);
 assert.equal(smallHeal.error,undefined);assert.equal(smallHeal.healedAmount,1);
 assert.equal(player.health,MAX_HEALTH);assert.equal(player.loadout.consumables.heal,1);
 assert.equal(player.cooldowns.heal,1000+CONSUMABLES.heal.cooldown);
 player.health=10;
 assert.ok(castSpell(room,player.id,'heal',null,1001).error);
 assert.equal(player.health,10);assert.equal(player.loadout.consumables.heal,1);
 const fullHeal=castSpell(room,player.id,'heal',null,1000+CONSUMABLES.heal.cooldown);
 assert.equal(fullHeal.error,undefined);assert.equal(fullHeal.healedAmount,50);
 assert.equal(player.health,60);assert.equal(player.loadout.consumables.heal,0);
});

test('legacy Heal reports the immediate health restored after the maximum-health limit',()=>{
 for(const [health,expected] of [[99,1],[50,20],[100,0]]){
  const player={id:'legacy',persona:'mage',connected:true,health,mana:10,cooldowns:{}};
  const room={phase:'playing',players:[player]};
  const result=castSpell(room,player.id,'heal',null,1000);
  assert.equal(result.error,undefined);assert.equal(result.healedAmount,expected);
  assert.equal(player.health,health+expected);
 }
});

test('other consumable events do not report a healing amount',()=>{
 const player={id:'shielded',persona:'mage',economy:true,connected:true,faceReady:true,loadout:freshLoadout()};
 spawnPlayer(player,1000);player.loadout.consumables.shield=1;
 const result=castSpell({economy:true,continuous:true,phase:'playing',players:[player]},player.id,'shield',null,1000);
 assert.equal(result.error,undefined);assert.ok(!Object.hasOwn(result,'healedAmount'));
});
