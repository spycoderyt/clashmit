import test from 'node:test';
import assert from 'node:assert/strict';
import {createReaperEffect} from '../dist/reaper-effect.js';

function setup(t,{reduced=false}={}){
 const saved={document:globalThis.document,window:globalThis.window,matchMedia:globalThis.matchMedia,requestAnimationFrame:globalThis.requestAnimationFrame,cancelAnimationFrame:globalThis.cancelAnimationFrame};
 let now=0,sequence=0;const frames=new Map(),events=new Map();
 function node(tag){return{tag,dataset:{},style:{},children:[],attrs:{},className:'',setAttribute(k,v){this.attrs[k]=v;},append(...children){for(const child of children){child.parent=this;this.children.push(child);}},remove(){if(this.parent)this.parent.children=this.parent.children.filter(child=>child!==this);this.parent=null;},getBoundingClientRect(){return{width:400,height:800};}};}
 const head=node('head');globalThis.document={hidden:false,head,createElement:node,querySelector:()=>head.children.find(child=>Object.hasOwn(child.dataset,'reaperEffect')),addEventListener:(name,fn)=>events.set(name,fn)};
 globalThis.window={addEventListener:()=>{}};globalThis.matchMedia=()=>({matches:reduced});
 globalThis.requestAnimationFrame=fn=>{const id=++sequence;frames.set(id,fn);return id;};globalThis.cancelAnimationFrame=id=>frames.delete(id);
 t.mock.method(performance,'now',()=>now);t.mock.timers.enable({apis:['setTimeout']});
 t.after(()=>{Object.assign(globalThis,saved);});
 const container=node('div'),effect=createReaperEffect(container);
 const step=at=>{const delta=at-now;now=at;t.mock.timers.tick(delta);const pending=[...frames.values()];frames.clear();for(const fn of pending)fn(now);};
 return{container,effect,frames,events,step};
}
const parts=(root,className)=>root.children.filter(node=>node.className.split(' ').includes(className));

test('the base Reaper keeps three PNG sprites and its original impact time',t=>{
 const {container,effect,step}=setup(t);assert.equal(effect.fire({flightMs:1800}),true);
 const root=container.children[0];assert.equal(parts(root,'reaper-sprite').length,3);assert.equal(parts(root,'reaper-echo').length,0);assert.equal(parts(root,'reaper-burst').length,0);
 assert.ok(parts(root,'reaper-sprite').every(image=>image.src==='/media/soul-reaper.png'));
 const cut=parts(root,'reaper-cut')[0];step(1799);assert.equal(Number(cut.style.opacity||0),0);
 step(1800);assert.equal(Number(cut.style.opacity),1);step(2120);assert.equal(container.children.length,0);
});

test('Soul Reaper converges distinct spectral paths, then adds the scythe and burst at impact',t=>{
 const {container,effect,step}=setup(t);effect.fire({flightMs:1800,upgraded:true});
 const root=container.children[0],echoes=parts(root,'reaper-echo'),arc=parts(root,'reaper-scythe-cut')[0],burst=parts(root,'reaper-burst')[0];
 assert.equal(echoes.length,3);assert.equal(parts(root,'reaper-sprite').length,4);assert.equal(parts(root,'reaper-spark').length,6);
 step(540);assert.equal(new Set(echoes.map(image=>image.style.transform)).size,3);assert.ok(echoes.every(image=>Number(image.style.opacity)>0));
 assert.equal(Number(arc.style.opacity||0),0);assert.equal(Number(burst.style.opacity||0),0);
 step(1799);assert.ok(echoes.every(image=>Number(image.style.opacity)<.001));assert.equal(Number(arc.style.opacity||0),0);
 step(1800);assert.equal(Number(arc.style.opacity),1);assert.ok(Number(burst.style.opacity)>0);
 const transform=burst.style.transform;step(1960);assert.notEqual(burst.style.transform,transform);assert.ok(Number(arc.style.opacity)<1);
 step(2120);assert.equal(container.children.length,0);
});

test('at most two casts remain and clear cancels frames and removes every effect',t=>{
 const {container,effect,frames,step}=setup(t);
 effect.fire({upgraded:true});const first=container.children[0];effect.fire({upgraded:true});effect.fire({upgraded:true});
 assert.equal(container.children.length,2);assert.ok(!container.children.includes(first));assert.ok(container.children.every(root=>root.children.length<=13));
 effect.clear();assert.equal(container.children.length,0);assert.equal(frames.size,0);step(3000);assert.equal(container.children.length,0);
});

test('reduced motion waits for impact and shows a static upgraded mark without echoes or animation frames',t=>{
 const {container,effect,frames,step}=setup(t,{reduced:true});effect.fire({flightMs:1800,upgraded:true});
 const root=container.children[0],image=parts(root,'reaper-sprite')[0];assert.equal(parts(root,'reaper-sprite').length,1);assert.equal(parts(root,'reaper-echo').length,0);assert.equal(parts(root,'reaper-spark').length,0);assert.equal(frames.size,0);
 step(1799);assert.equal(image.style.opacity,'0');step(1800);assert.equal(image.style.opacity,'1');assert.equal(parts(root,'reaper-scythe-cut')[0].style.opacity,'.8');
 step(2000);assert.equal(container.children.length,0);
});

test('late casts use elapsed flight time and hidden pages cancel reduced-motion timers',t=>{
 const {container,effect,step,events}=setup(t,{reduced:true});
 assert.equal(effect.fire({upgraded:true,flightMs:1800,elapsedMs:2120}),false);
 effect.fire({upgraded:true,flightMs:1800,elapsedMs:2100});step(0);assert.equal(parts(container.children[0],'reaper-sprite')[0].style.opacity,'1');step(20);assert.equal(container.children.length,0);
 effect.fire({upgraded:true});document.hidden=true;events.get('visibilitychange')();assert.equal(container.children.length,0);step(3000);assert.equal(container.children.length,0);assert.equal(effect.fire(),false);
});
