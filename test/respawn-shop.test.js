import test from 'node:test';
import assert from 'node:assert/strict';
import {createRespawnShop} from '../dist/respawn-shop.js';
import {freshLoadout} from '../dist/economy.js';

// Run the real shop with a small DOM adapter and a controlled countdown clock.
const walk=root=>[root,...(root.children||[]).filter(c=>typeof c==='object').flatMap(walk)];
const text=root=>[root.textContent||'',...(root.children||[]).map(c=>typeof c==='object'?text(c):c)].join(' ');
function setup(t,overrides={}){
 const oldDocument=globalThis.document;
 const node=tag=>({tag,children:[],attrs:{},textContent:'',setAttribute(k,v){this.attrs[k]=v;},append(...values){this.children.push(...values);},replaceChildren(...values){this.children=values;}});
 globalThis.document={createElement:node};t.mock.timers.enable({apis:['setInterval']});let time=1000;const actions=[];
 const shop=createRespawnShop({now:()=>time,onPurchase:(...args)=>actions.push(args),onPersonaChange:id=>actions.push(['persona',id]),onRespawn:()=>actions.push(['respawn'])});
 const player={persona:'mage',respawnAt:11000,score:{coins:750},loadout:freshLoadout(),...overrides};
 t.after(()=>{shop.stop();globalThis.document=oldDocument;});const find=predicate=>walk(shop.root).find(predicate);shop.update(player);
 return{shop,player,actions,find,setTime:value=>{time=value;t.mock.timers.tick(100);}};
}

test('countdown reaches zero before manual respawn and keeps purchase callbacks',t=>{
 const {find,actions,setTime}=setup(t),respawn=find(n=>n.className==='respawn-go');
 assert.equal(respawn.disabled,true);assert.equal(respawn.textContent,'Respawn in 10s');setTime(10999);assert.equal(respawn.disabled,true);setTime(11000);assert.equal(respawn.disabled,false);assert.equal(respawn.textContent,'Respawn');
 find(n=>n.attrs?.['aria-label']==='Buy Shield for 30 coins').onclick();respawn.onclick();assert.deepEqual(actions,[['consumable','shield'],['respawn']]);assert.equal(respawn.disabled,true);
});

test('locked skills show only prices and generic unlock labels until purchased',t=>{
 const {shop,player,find,actions}=setup(t,{score:{coins:60}}),cards=find(n=>n.className==='shop-skills').children;
 assert.equal(cards.length,3);
 for(const [index,cost] of [[1,60],[2,140]]){
  const card=cards[index],nodes=walk(card),button=nodes.find(n=>n.tag==='button');
  assert.equal(button.attrs['aria-label'],`Unlock skill ${index+1} for ${cost} coins`);
  assert.equal(text(card).trim(),String(cost));assert.ok(!nodes.some(n=>n.tag==='h3'||n.className==='shop-stats'||n.className==='shop-skill-icon'));
  assert.doesNotMatch(JSON.stringify(nodes),/Fireball|Meteor|Wildfire|Extinction|hearts damage/);
 }
 assert.equal(cards[1].children.find(n=>n.tag==='button').disabled,false);assert.equal(cards[2].children.find(n=>n.tag==='button').disabled,true);
 cards[1].children.find(n=>n.tag==='button').onclick();assert.deepEqual(actions,[['unlock','fireball']]);
 const upgrade=find(n=>n.attrs?.['aria-label']==='Upgrade Lightning to Chain Lightning for 80 coins');assert.ok(upgrade);assert.equal(upgrade.disabled,true,'unaffordable upgrades remain visible');
 player.loadout.skills.fireball=1;player.score.coins=140;shop.update(player);assert.ok(find(n=>n.tag==='h3'&&n.textContent==='Fireball'));assert.ok(find(n=>n.attrs?.['aria-label']==='2.5 hearts damage, 4 mana, 2.4 second delay'));assert.equal(find(n=>n.attrs?.['aria-label']==='Unlock skill 3 for 140 coins').disabled,false);
});

test('owned skills expose upgrade cost and updated stats, without shortening delay',t=>{
 const {shop,player,find,actions}=setup(t,{score:{coins:80}}),upgrade=find(n=>n.attrs?.['aria-label']==='Upgrade Lightning to Chain Lightning for 80 coins');
 assert.equal(upgrade.disabled,false);upgrade.onclick();assert.deepEqual(actions,[['upgrade','lightning']]);player.loadout.skills.lightning=2;player.score.coins=0;shop.update(player);
 assert.ok(find(n=>n.tag==='h3'&&n.textContent==='Chain Lightning'));assert.ok(find(n=>n.attrs?.['aria-label']==='1.4 hearts damage, 2 mana, 1 second delay'));assert.equal(find(n=>n.textContent==='Maxed').disabled,true);assert.equal(find(n=>n.attrs?.['aria-label']?.startsWith('Upgrade Lightning')),undefined);
});

test('class changes reveal the starter; consumable stock, price and cap control purchases',t=>{
 const {shop,player,find,actions}=setup(t,{score:{coins:30}});player.nextPersona='witch';shop.update(player);assert.ok(find(n=>n.textContent==='Poison'&&n.tag==='h3'));
 player.nextPersona='archer';player.loadout.consumables.shield=3;player.loadout.consumables.heal=4;player.loadout.consumables.flashbang=99;shop.update(player);
 assert.ok(find(n=>n.textContent==='Arrows'&&n.tag==='h3'));assert.ok(find(n=>n.attrs?.['aria-label']==='0.8 hearts damage, 1 mana, 0.65 second delay'));
 const shield=find(n=>n.attrs?.['aria-label']==='Buy Shield for 30 coins'),heal=find(n=>n.attrs?.['aria-label']==='Buy Heal for 30 coins'),flash=find(n=>n.attrs?.['aria-label']==='Flashbang inventory full');
 assert.equal(shield.disabled,false);assert.equal(heal.disabled,false);assert.equal(flash.disabled,true);assert.equal(walk(shield).find(n=>n.className==='shop-item-count').textContent,'3×');assert.equal(walk(heal).find(n=>n.className==='shop-item-count').textContent,'4×');assert.equal(walk(flash).find(n=>n.className==='shop-item-count').textContent,'99×');
 heal.onclick();find(n=>n.textContent==='Mage'&&n.tag==='button').onclick();assert.deepEqual(actions,[['consumable','heal'],['persona','mage']]);
 player.score.coins=29;shop.update(player);assert.equal(find(n=>n.attrs?.['aria-label']==='Buy Shield for 30 coins').disabled,true);
});
