import test from 'node:test';import assert from 'node:assert/strict';
import {healthRanking,heartFills,healthColor} from '../dist/health-hud.js';
test('health standings reorder after damage and healing, with shared ranks for ties',()=>{
 const players=[{id:'a',health:70},{id:'b',health:50},{id:'c',health:70},{id:'d',health:0}];
 assert.deepEqual(healthRanking(players).map(p=>[p.id,p.rank]),[['a',1],['c',1],['b',3],['d',4]]);
 players[0].health=20;players[1].health=60;
 assert.deepEqual(healthRanking(players).map(p=>p.id),['c','b','a','d']);assert.equal(players[0].id,'a','server player order is untouched');
});
test('seven hearts preserve partial HP and clamp over-heal or damage',()=>{
 assert.deepEqual(heartFills(55),[1,1,1,1,1,.5,0]);assert.equal(heartFills(1)[0],.1);
 assert.ok(heartFills(-10).every(x=>x===0));assert.ok(heartFills(110).every(x=>x===1));
});
test('health bars move green through yellow to red',()=>{
 assert.equal(healthColor(100),'hsl(120 80% 58%)');assert.equal(healthColor(35),'hsl(60 80% 58%)');assert.equal(healthColor(0),'hsl(0 80% 58%)');
});

test('reference sprites show seven full, half, and empty hearts without fractional pixel cuts',async()=>{
 const {heartStates}=await import('../dist/health-hud.js');
 assert.deepEqual(heartStates(70),Array(7).fill('full'));
 assert.deepEqual(heartStates(65),['full','full','full','full','full','full','half']);
 assert.deepEqual(heartStates(55),['full','full','full','full','full','half','empty']);
 assert.deepEqual(heartStates(0),Array(7).fill('empty'));
 assert.deepEqual(heartStates(1),['half','empty','empty','empty','empty','empty','empty']);
 assert.deepEqual(heartStates(9),['full','empty','empty','empty','empty','empty','empty']);
});
test('health HUD reuses seven crisp sprite nodes and updates only changed heart states',async()=>{
 const {createHealthHud}=await import('../dist/health-hud.js');const prior=Object.getOwnPropertyDescriptor(globalThis,'document');
 function element(){return {children:[],dataset:{},attributes:{},writes:0,setAttribute(key,value){this.attributes[key]=value;},append(...nodes){this.children.push(...nodes);},set src(value){this.source=value;this.writes++;},get src(){return this.source;}};}
 globalThis.document={createElement:element};
 try{const hearts=element(),hud=createHealthHud({hearts,roster:null});hud.update([],null,70);assert.equal(hearts.children.length,7);const original=[...hearts.children];assert.ok(original.every(e=>e.src==='/media/heart-full.svg'));
  hud.update([],null,65);assert.equal(hearts.children[6].src,'/media/heart-half.svg');assert.equal(hearts.attributes['aria-label'],'Your health: 65 of 70');
  const writes=original.reduce((n,e)=>n+e.writes,0);hud.update([],null,65);assert.equal(original.reduce((n,e)=>n+e.writes,0),writes);
  hud.update([],null,0);assert.ok(original.every(e=>e.src==='/media/heart-empty.svg'));assert.deepEqual(hearts.children,original);
 }finally{if(prior)Object.defineProperty(globalThis,'document',prior);else delete globalThis.document;}
});
