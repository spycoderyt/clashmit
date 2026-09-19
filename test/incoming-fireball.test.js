import test from 'node:test';
import assert from 'node:assert/strict';
import {shotTiming,createIncomingFireballs} from '../dist/incoming-fireball.js';

test('late delivery preserves the shared impact deadline on a monotonic clock',()=>{
 assert.deepEqual(shotTiming({at:1000,flightMs:1400,impactAt:2400,expiresAt:4500},1300,50),{duration:1400,deadline:1150,expires:3250});
 assert.equal(shotTiming({at:1000,spell:'lightning'},1100,10).deadline,160);
});

test('incoming warning survives tracking loss, deduplicates shots, and waits for an authoritative outcome',()=>{
 const oldDocument=globalThis.document;
 const element=()=>({style:{},dataset:{},children:[],setAttribute(){},append(...items){this.children.push(...items);},remove(){}});
 globalThis.document={hidden:false,createElement:element,addEventListener(){},removeEventListener(){}};
 try{
  const container=element();container.getBoundingClientRect=()=>({width:400,height:800});
  let local=100,server=1400,source={x:.2,y:.3},next=0;const frames=new Map(),starts=[],cancels=[];
  const manager=createIncomingFireballs({container,renderer:{incoming:shot=>(starts.push(shot),true),cancelIncoming:id=>cancels.push(id)},getAttacker:()=>source,now:()=>server,clock:()=>local,schedule:cb=>{frames.set(++next,cb);return next;},unschedule:id=>frames.delete(id)});
  const step=()=>{const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback();};
  const shot={shotId:'a',actorId:'other',at:1000,impactAt:2400,flightMs:1400,expiresAt:4000};
  assert.equal(manager.launch(shot),true);assert.equal(manager.launch(shot),false);step();
  assert.equal(starts.length,1);assert.ok(Math.abs(starts[0].elapsedMs-400)<.001);
  const layer=container.children[0];assert.equal(layer.dataset.phase,'incoming');
  source=null;local=700;server=2000;step();assert.equal(layer.dataset.phase,'incoming');assert.equal(starts[0].getSource(),null);
  local=1150;server=2450;step();assert.equal(layer.dataset.phase,'awaiting-impact');
  assert.equal(manager.resolve({shotId:'a',blocked:true}),true);assert.equal(layer.dataset.phase,'blocked');
  assert.equal(manager.resolve({shotId:'a',blocked:true}),false);assert.equal(manager.launch(shot),false);
  local=1800;step();assert.equal(layer.dataset.phase,'idle');assert.ok(cancels.includes('a'));
  manager.dispose();assert.equal(frames.size,0);
 }finally{globalThis.document=oldDocument;}
});

test('offscreen lightning uses a border warning and expired/replayed shots are not restarted',()=>{
 const oldDocument=globalThis.document;const element=()=>({style:{},dataset:{},children:[],setAttribute(){},append(...items){this.children.push(...items);},remove(){}});
 globalThis.document={hidden:false,createElement:element,addEventListener(){},removeEventListener(){}};
 try{
  const container=element();let scheduled;const manager=createIncomingFireballs({container,getAttacker:()=>null,now:()=>2000,clock:()=>0,schedule:cb=>(scheduled=cb,1),unschedule(){}});
  assert.equal(manager.launch({shotId:'old',at:0,flightMs:250,expiresAt:1500}),false);
  manager.sync([{shotId:'bolt',actorId:'other',at:1950,impactAt:2200,flightMs:250,spell:'lightning'}]);scheduled();
  assert.equal(container.children[0].children[0].textContent,'Incoming lightning');assert.equal(container.children[0].children[1].style.display,'none');
  manager.sync([]);scheduled();assert.equal(container.children[0].dataset.phase,'idle');manager.dispose();
 }finally{globalThis.document=oldDocument;}
});
