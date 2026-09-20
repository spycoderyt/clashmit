import test from 'node:test';
import assert from 'node:assert/strict';
import {createHealFeedback,healMessage} from '../dist/heal-effect.js';
import {castSpell} from '../dist/rules.js';
import {freshLoadout} from '../dist/economy.js';
import {spawnPlayer} from '../dist/respawn.js';

function setup(t){
 const previous=globalThis.document;
 const node=tag=>({tag,children:[],attrs:{},className:'',textContent:'',classList:{items:new Set(),removals:0,add(name){this.items.add(name);},remove(name){this.removals++;this.items.delete(name);}},setAttribute(name,value){this.attrs[name]=value;},append(...children){this.children.push(...children);}});
 globalThis.document={createElement:node};t.after(()=>globalThis.document=previous);
 t.mock.timers.enable({apis:['setTimeout']});
 const container=node('div'),feedback=createHealFeedback(container),[glow,message]=container.children;
 return{container,feedback,glow,message};
}
const active=node=>node.classList.items.has('active');

test('Heal text uses actual HP restored and correct singular or plural heart units',()=>{
 for(const [amount,text] of [[1,'0.1 hearts'],[5,'0.5 hearts'],[10,'1 heart'],[15,'1.5 hearts'],[50,'5 hearts']])assert.equal(healMessage(amount),`Heal gave you ${text}!`);
});

test('Heal feedback displays the server-capped gain rather than the item maximum',t=>{
 const {feedback,glow,message}=setup(t);
 const player={id:'healer',persona:'mage',economy:true,connected:true,faceReady:true,loadout:freshLoadout()};
 spawnPlayer(player,1000);player.health=67;player.loadout.consumables.heal=1;
 const event=castSpell({economy:true,continuous:true,phase:'playing',players:[player]},player.id,'heal',null,1000);
 assert.equal(event.healedAmount,3);feedback.show(event.healedAmount);
 assert.equal(message.textContent,'Heal gave you 0.3 hearts!');
 assert.equal(message.attrs.role,'status');assert.equal(glow.attrs['aria-hidden'],'true');
 assert.ok(active(glow));assert.ok(active(message));
});

test('a repeated Heal replaces the message and starts fresh effect timers without extra nodes',t=>{
 const {container,feedback,glow,message}=setup(t);
 feedback.show(50);t.mock.timers.tick(500);feedback.show(10);
 assert.equal(container.children.length,2);assert.equal(message.textContent,'Heal gave you 1 heart!');
 t.mock.timers.tick(350);assert.ok(active(glow),'the old glow deadline must not hide the new glow');
 t.mock.timers.tick(499);assert.ok(active(glow));
 t.mock.timers.tick(1);assert.equal(active(glow),false);assert.ok(active(message));
 t.mock.timers.tick(850);assert.ok(active(message),'the old message deadline must not hide the new message');
 t.mock.timers.tick(500);assert.equal(active(message),false);
});

test('clear removes the feedback and cancels both scheduled callbacks',t=>{
 const {feedback,glow,message}=setup(t);
 feedback.show(50);t.mock.timers.tick(100);feedback.clear();
 assert.equal(active(glow),false);assert.equal(active(message),false);assert.equal(message.textContent,'');
 const removals=[glow.classList.removals,message.classList.removals];
 t.mock.timers.tick(3000);
 assert.deepEqual([glow.classList.removals,message.classList.removals],removals);
 feedback.show(5);assert.ok(active(glow));assert.equal(message.textContent,'Heal gave you 0.5 hearts!');
});

test('zero or invalid gain does not display a Heal message or leave an old effect active',t=>{
 const {feedback,glow,message}=setup(t);
 for(const amount of [0,-1,undefined,NaN]){
  feedback.show(10);feedback.show(amount);
  assert.equal(active(glow),false);assert.equal(active(message),false);assert.equal(message.textContent,'');
  const removals=[glow.classList.removals,message.classList.removals];t.mock.timers.tick(3000);
  assert.deepEqual([glow.classList.removals,message.classList.removals],removals);
 }
});
