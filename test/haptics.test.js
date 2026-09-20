import test from 'node:test';
import assert from 'node:assert/strict';
import {PATTERNS,tickOffsets,patternDuration,createHaptics} from '../dist/haptics.js';
function harness(overrides={}){
 const state={time:0,ticks:0,vibrations:[],timers:[]};
 const haptics=createHaptics({vibrate:undefined,tick:()=>{state.ticks++;},now:()=>state.time,setTimer:(fn,delay)=>{const timer={fn,at:state.time+delay,cancelled:false};state.timers.push(timer);return timer;},clearTimer:timer=>{if(timer)timer.cancelled=true;},isHidden:()=>false,...overrides});
 const advance=ms=>{state.time+=ms;for(const timer of state.timers.filter(t=>!t.cancelled&&!t.done&&t.at<=state.time)){timer.done=true;timer.fn();}};
 return {state,haptics,advance};
}
test('every pattern has both an iPhone tick rhythm and an Android vibration',()=>{
 for(const [name,p] of Object.entries(PATTERNS)){assert.equal(p.ticks[0],0,name);assert.ok(p.ticks.slice(1).every(gap=>gap>=12),`${name} ticks are spaced for the Taptic Engine`);assert.ok(p.vibrate.length%2===1&&p.vibrate.every(ms=>ms>0),`${name} vibration starts and ends on`);assert.ok(Number.isInteger(p.priority));}
 assert.deepEqual(tickOffsets([0,70,30]),[0,70,100]);
});
test('being hurt is far heavier than anything the player does themselves',()=>{
 const own=['tap','fireball','lightning','shield','heal','hit','deflected'];
 for(const name of own){assert.ok(PATTERNS[name].ticks.length<=3,`${name} stays subtle`);assert.ok(patternDuration(PATTERNS[name])<=350);assert.ok(PATTERNS[name].priority<PATTERNS.hurt.priority);}
 for(const name of ['hurt','hurtLightning']){assert.ok(PATTERNS[name].ticks.length>=30);assert.ok(patternDuration(PATTERNS[name])>=600);}
 assert.notDeepEqual(PATTERNS.hurt.ticks,PATTERNS.hurtLightning.ticks);assert.ok(PATTERNS.death.priority>PATTERNS.hurt.priority&&patternDuration(PATTERNS.death)>patternDuration(PATTERNS.hurt));
});
test('iPhone path plays every tick once and damage cannot be interrupted by lighter feedback',()=>{
 const {state,haptics,advance}=harness();
 assert.equal(haptics.play('hurt'),true);assert.equal(state.ticks,1);advance(100);const midway=state.ticks;assert.ok(midway>1);
 assert.equal(haptics.play('tap'),false);assert.equal(haptics.play('fireball'),false);assert.equal(state.ticks,midway);
 advance(5000);assert.equal(state.ticks,PATTERNS.hurt.ticks.length);
 assert.equal(haptics.play('tap'),true);assert.equal(state.ticks,PATTERNS.hurt.ticks.length+1);
});
test('damage cuts off a lighter pattern that is still playing',()=>{
 const {state,haptics,advance}=harness();
 haptics.play('heal');advance(50);assert.equal(state.ticks,1);assert.equal(haptics.play('hurtLightning'),true);advance(5000);
 assert.equal(state.ticks,1+PATTERNS.hurtLightning.ticks.length);
});
test('Android path uses the vibration API, and hidden or unsupported pages stay silent',()=>{
 const calls=[],{haptics}=harness({vibrate:p=>{calls.push(p);return true;}});
 assert.equal(haptics.play('hurt'),true);assert.deepEqual(calls.at(-1),PATTERNS.hurt.vibrate);assert.equal(haptics.play('nonsense'),false);
 assert.equal(harness({isHidden:()=>true}).haptics.play('hurt'),false);
 const none=createHaptics({vibrate:undefined,tick:null});assert.equal(none.supported,false);assert.equal(none.play('hurt'),false);
});
test('iPhone tap feedback is an invisible native switch the finger toggles directly',()=>{
 // Minimal DOM: iOS 26.5+ ignores switches toggled by code, so the switch must sit over the button itself.
 const made=[],node=tag=>{const n={tag,attrs:{},style:{setProperty(k,v){this[k]=v;}},children:[],setAttribute(k,v){this.attrs[k]=v;},append(c){this.children.push(c);},querySelector(){return this.children.find(c=>c.attrs&&'data-haptic-trigger' in c.attrs)||null;},addEventListener(type){this.listened=type;}};made.push(n);return n;};
 const doc={head:node('head'),createElement:node,querySelector:()=>null};globalThis.getComputedStyle=()=>({position:'static'});
 const button=node('button'),iphone=createHaptics({vibrate:undefined,ios:true,tick:()=>{}});
 iphone.attachTap(button,doc);iphone.attachTap(button,doc);
 const overlays=button.children.filter(c=>c.tag==='input');assert.equal(overlays.length,1);const [overlay]=overlays;
 assert.equal(overlay.type,'checkbox');assert.ok('switch' in overlay.attrs);assert.equal(overlay.style.opacity,'0');assert.equal(overlay.style.inset,'0');assert.equal(button.style.position,'relative');assert.equal(button.listened,undefined);
 assert.match(doc.head.children[0].textContent,/:disabled>input\[data-haptic-trigger\]\{display:none\}/);
 // Android keeps a click listener and a real vibration instead; desktop browsers get nothing.
 const android=node('button'),calls=[];createHaptics({vibrate:p=>calls.push(p),ios:false}).attachTap(android,doc);assert.equal(android.listened,'click');assert.equal(android.children.length,0);
 const desktop=node('button');createHaptics({vibrate:undefined,ios:false,tick:()=>{}}).attachTap(desktop,doc);assert.equal(desktop.children.length,0);assert.equal(desktop.listened,undefined);
 delete globalThis.getComputedStyle;
});
test('damage is long, loud and distinct while the player\'s own actions stay short',()=>{
 const length=name=>PATTERNS[name].vibrate.reduce((a,b)=>a+b,0);
 for(const name of ['tap','fireball','lightning','shield','heal','hit','deflected']){assert.ok(length(name)<=400,`${name} is brief`);assert.ok((PATTERNS[name].rumble?.gain??0)<=.5,`${name} is quiet`);assert.equal(PATTERNS[name].shake,undefined);}
 assert.ok(length('hurt')>=1200);assert.ok(length('hurtLightning')>=900);assert.ok(length('death')>=2500);
 for(const name of ['hurt','hurtLightning','death']){assert.equal(PATTERNS[name].rumble.gain,1);assert.ok(PATTERNS[name].shake.pixels>=6&&PATTERNS[name].shake.pixels<=12,'camera shake stays moderate');}
 const voices=['hurt','hurtLightning','death'].map(name=>`${PATTERNS[name].rumble.type}:${PATTERNS[name].rumble.frequency}>${PATTERNS[name].rumble.end}`);assert.equal(new Set(voices).size,3);
});
test('phones without vibration get the speaker rumble, and damage shakes the screen everywhere',()=>{
 const rumbled=[],shaken=[],stopped=[];
 const iphone=harness({rumble:{play:p=>{rumbled.push(p);return true;},stop:()=>stopped.push(1)},shake:s=>shaken.push(s)});
 iphone.haptics.play('fireball');assert.deepEqual(rumbled,[PATTERNS.fireball]);assert.deepEqual(shaken,[]);
 iphone.haptics.play('hurt');assert.equal(rumbled.at(-1),PATTERNS.hurt);assert.deepEqual(shaken,[PATTERNS.hurt.shake]);assert.ok(stopped.length>=2);
 const vibrated=[],androidRumble=[],androidShake=[];
 const android=harness({vibrate:p=>{vibrated.push(p);return true;},rumble:{play:p=>androidRumble.push(p),stop(){}},shake:s=>androidShake.push(s)});
 android.haptics.play('death');assert.deepEqual(vibrated.at(-1),PATTERNS.death.vibrate);assert.deepEqual(androidRumble,[]);assert.deepEqual(androidShake,[PATTERNS.death.shake]);
});
