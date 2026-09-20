import test from 'node:test';
import assert from 'node:assert/strict';
import {createRespawnShop} from '../dist/respawn-shop.js';
import {freshLoadout} from '../dist/economy.js';

// Small DOM adapter lets the actual shop component run with real callbacks and state.
function setup(t, overrides={}) {
 const oldDocument=globalThis.document;
 const node=tag=>({tag,children:[],attrs:{},textContent:'',setAttribute(k,v){this.attrs[k]=v;},append(...values){this.children.push(...values);},replaceChildren(...values){this.children=values;}});
 globalThis.document={createElement:node};
 t.mock.timers.enable({apis:['setInterval']});
 let time=1000;const actions=[];
 const shop=createRespawnShop({now:()=>time,onPurchase:(...args)=>actions.push(args),onPersonaChange:id=>actions.push(['persona',id]),onRespawn:()=>actions.push(['respawn'])});
 const player={persona:'mage',respawnAt:11000,score:{coins:750},loadout:freshLoadout(),...overrides};
 t.after(()=>{shop.stop();globalThis.document=oldDocument;});
 const all=(root=shop.root)=>[root,...(root.children||[]).filter(c=>typeof c==='object').flatMap(all)];
 const find=predicate=>all().find(predicate);
 shop.update(player);
 return{shop,player,actions,find,setTime:value=>{time=value;t.mock.timers.tick(100);}};
}

test('death shop enforces the countdown then allows manual respawn without losing purchase actions',t=>{
 const {find,actions,setTime}=setup(t);
 const respawn=find(n=>n.className==='respawn-go');
 assert.equal(respawn.disabled,true);assert.equal(respawn.textContent,'Respawn in 10s');
 setTime(10999);assert.equal(respawn.disabled,true);
 setTime(11000);assert.equal(respawn.disabled,false);assert.equal(respawn.textContent,'Respawn');
 find(n=>n.attrs?.['aria-label']==='Buy Shield for 30 coins').onclick();
 respawn.onclick();assert.deepEqual(actions,[['consumable','shield'],['respawn']]);
 assert.equal(respawn.disabled,true,'prevent duplicate clicks until authoritative state arrives');
});

test('shop follows consecutive unlocks, affordability and upgrade stats without shortening delay',t=>{
 const {shop,player,find}=setup(t,{score:{coins:60}});
 assert.ok(find(n=>n.textContent==='Unlock the previous skill').disabled);
 assert.equal(find(n=>n.textContent==='Unlock · 60 coins').disabled,false);
 assert.equal(find(n=>n.attrs?.['aria-label']?.startsWith('Upgrade Lightning')),undefined);
 player.loadout.skills.fireball=1;player.loadout.skills.lightning=2;player.score.coins=140;shop.update(player);
 assert.equal(find(n=>n.textContent==='Unlock · 140 coins').disabled,false);
 assert.ok(find(n=>n.textContent==='ϟ Chain Lightning'));
 assert.ok(find(n=>n.attrs?.['aria-label']==='1.4 hearts damage, 2 mana, 1 second delay'));
});

test('changing the planned class exposes its starter and capped stock cannot be bought',t=>{
 const {shop,player,find,actions}=setup(t);
 player.nextPersona='witch';shop.update(player);assert.ok(find(n=>n.textContent==='☣ Poison'));
 player.nextPersona='archer';player.loadout.consumables.flashbang=99;shop.update(player);
 assert.ok(find(n=>n.textContent==='➶ Arrows'));
 assert.ok(find(n=>n.attrs?.['aria-label']==='0.8 hearts damage, 1 mana, 0.65 second delay'));
 assert.equal(find(n=>n.attrs?.['aria-label']==='Flashbang inventory full').disabled,true);
 find(n=>n.textContent.includes('Mage')&&n.tag==='button').onclick();assert.deepEqual(actions,[['persona','mage']]);
});
