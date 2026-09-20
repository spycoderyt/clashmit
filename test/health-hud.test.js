import test from 'node:test';import assert from 'node:assert/strict';
import {healthRanking,heartFills,healthColor} from '../dist/health-hud.js';
test('health standings reorder after damage and healing, with shared ranks for ties',()=>{
 const players=[{id:'a',health:100},{id:'b',health:50},{id:'c',health:100},{id:'d',health:0}];
 assert.deepEqual(healthRanking(players).map(p=>[p.id,p.rank]),[['a',1],['c',1],['b',3],['d',4]]);
 players[0].health=20;players[1].health=80;
 assert.deepEqual(healthRanking(players).map(p=>p.id),['c','b','a','d']);assert.equal(players[0].id,'a','server player order is untouched');
});
test('ten hearts preserve partial HP and clamp over-heal or damage',()=>{
 assert.deepEqual(heartFills(75),[1,1,1,1,1,1,1,.5,0,0]);assert.equal(heartFills(1)[0],.1);
 assert.ok(heartFills(-10).every(x=>x===0));assert.ok(heartFills(110).every(x=>x===1));
});
test('health bars move green through yellow to red',()=>{
 assert.equal(healthColor(100),'hsl(120 80% 58%)');assert.equal(healthColor(50),'hsl(60 80% 58%)');assert.equal(healthColor(0),'hsl(0 80% 58%)');
});
