import test from 'node:test';import assert from 'node:assert/strict';
import {settle,settleRoom,HEALTH_REGEN} from '../dist/rules.js';
const player=(extra={})=>({id:'p',health:50,connected:true,healthRegenAt:1000,mana:10,manaUpdatedAt:1000,...extra});
test('regenerates five HP every eight seconds, once per boundary',()=>{
 const p=player({healthRegenAt:0});assert.deepEqual(HEALTH_REGEN,{amount:5,intervalMs:8000,max:100});
 settle(p,7999);assert.equal(p.health,50);settle(p,8000);assert.equal(p.health,55);settle(p,8000);assert.equal(p.health,55);settle(p,16000);assert.equal(p.health,60);
});
test('caps at full health and does not bank ticks or revive dead players',()=>{
 const p=player({health:98});settle(p,17000);assert.equal(p.health,100);p.health=50;settle(p,17001);assert.equal(p.health,50);
 const dead=player({health:0});settle(dead,30000);assert.equal(dead.health,0);
 const away=player({connected:false});settle(away,30000);assert.equal(away.health,50);away.connected=true;settle(away,30001);assert.equal(away.health,50);
});
test('lingering damage and healing agree for delayed and frequent updates',()=>{
 const initial=player({health:30,poison:{by:'enemy',startedAt:1000,until:10000,perSecond:3,applied:0}}),coarse=structuredClone(initial),frequent=structuredClone(initial);
 const coarseDamage=[],frequentDamage=[];settle(coarse,13000,coarseDamage);for(let at=1500;at<=13000;at+=500)settle(frequent,at,frequentDamage);
 assert.equal(coarse.health,frequent.health);assert.equal(coarse.health,8);assert.equal(coarseDamage.reduce((n,d)=>n+d.amount,0),frequentDamage.reduce((n,d)=>n+d.amount,0));
 const lethal=player({health:10,poison:{by:'enemy',startedAt:1000,until:9000,perSecond:3,applied:0}});settle(lethal,9000);assert.equal(lethal.health,0);
});
test('only live rounds heal; new rounds reset time and late ticks stop at round end',()=>{
 const p=player(),room={phase:'lobby',players:[p]};settleRoom(room,20000);assert.equal(p.health,50);
 room.phase='countdown';settleRoom(room,25000);assert.equal(p.health,50);
 room.phase='playing';room.endsAt=34000;settleRoom(room,33000);assert.equal(p.health,55);settleRoom(room,90000);assert.equal(p.health,55);
 room.phase='finished';settleRoom(room,100000);assert.equal(p.health,55);
 room.phase='playing';room.endsAt=200000;settleRoom(room,107999);assert.equal(p.health,55);settleRoom(room,108000);assert.equal(p.health,60);
});
