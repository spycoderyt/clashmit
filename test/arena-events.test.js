import test from 'node:test';
import assert from 'node:assert/strict';
import {createArenaEvents} from '../dist/arena-events.js';

function setup(t){
 const old=globalThis.document;
 const node=()=>({children:[],textContent:'',className:'',classList:{items:new Set(),add(x){this.items.add(x);},remove(x){this.items.delete(x);}},setAttribute(){},append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}});
 globalThis.document={createElement:node};t.after(()=>globalThis.document=old);
 t.mock.timers.enable({apis:['setTimeout']});
 const container=node(),sounds=[],events=createArenaEvents(container,{audio:{play:(...args)=>sounds.push(args)},getMyId:()=>'me',now:()=>10000});
 const send=(id,kind='kill')=>events.receive({id,kind,text:id,at:10000});
 return{events,send,banner:container.children[1],sounds};
}

test('round end survives a full kill queue and appears before the queued kills',t=>{
 const {send,banner,sounds}=setup(t);send('active');
 for(let i=1;i<=5;i++)send(`kill-${i}`);
 send('round-ended','round-end');
 assert.equal(banner.textContent,'active');t.mock.timers.tick(2600);
 assert.equal(banner.textContent,'round-ended');assert.deepEqual(sounds,[['heal','announcement']]);
 t.mock.timers.tick(4500);assert.equal(banner.textContent,'kill-2','oldest kill was discarded, not the round change');
});

test('new round start survives overflow when every pending notice is a round change',t=>{
 const {send,banner}=setup(t);send('active');
 for(let i=1;i<=5;i++)send(`round-${i}`,'round-end');
 send('new-round','round-start');send('late-kill');
 t.mock.timers.tick(2600);assert.equal(banner.textContent,'new-round');
 for(let i=5;i>=2;i--){t.mock.timers.tick(4500);assert.equal(banner.textContent,`round-${i}`);}
 t.mock.timers.tick(4500);assert.equal(banner.classList.items.has('show'),false,'queue remains bounded; oldest round and lower-priority kill were removed');
});

test('ordinary kill overflow keeps the newest five notices and clear cancels the queue',t=>{
 const {events,send,banner}=setup(t);send('active');
 for(let i=1;i<=7;i++)send(`kill-${i}`);
 t.mock.timers.tick(2600);assert.equal(banner.textContent,'kill-3');
 events.clear();assert.equal(banner.classList.items.has('show'),false);
 t.mock.timers.tick(20000);assert.equal(banner.classList.items.has('show'),false);
 send('fresh');assert.equal(banner.textContent,'fresh');
});
