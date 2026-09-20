import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STEPS,shouldOpen,shouldClose,frame,union,createOnboarding} from '../dist/onboarding.js';
const fresh={seen:false,practice:false,faceReady:true,phase:'lobby',scanOpen:false,open:false};
test('four short steps explain targeting, voice, sword and the shop',()=>{
 assert.deepEqual(STEPS.map(s=>s.anchor),['target','attack','melee','shop']);
 for(const step of STEPS){assert.ok(step.text.length<120);assert.ok(step.title.length<30);assert.equal(step.gate,undefined);}
 assert.match(STEPS[0].text,/name/);assert.match(STEPS[1].title,/\{spell\}/);
 assert.match(STEPS[2].text,/Do not touch/);assert.match(STEPS[3].text,/end this life and open the shop/);
 assert.doesNotMatch(STEPS.map(s=>s.text).join(' '),/enable voice|start recording/i);
});
test('the lit control stays tappable: only the dark panels and the card take taps',()=>{
 const css=readFileSync(new URL('../dist/onboarding.js',import.meta.url),'utf8');
 const rule=name=>css.match(new RegExp(`\\.${name}\\{([^']*?)\\}`))?.[1]??'';
 // The root spans the whole arena. If it takes taps, the hole is decoration and a gated step can never
 // be satisfied, because the control the step tells you to press is unreachable.
 assert.match(rule('coach'),/pointer-events:none/,'the full-arena root must let taps through');
 assert.match(rule('coach-hole'),/pointer-events:none/,'the glow around the control must not sit on top of it');
 for(const part of ['coach-block','coach-card'])
  assert.match(rule(part),/pointer-events:auto/,`${part} still takes its own taps`);
});
test('the coach marks open once for a scanned newcomer and never over a round or the face scan',()=>{
 assert.equal(shouldOpen(fresh),true);
 assert.equal(shouldOpen({...fresh,phase:'finished'}),true,'someone who joined after a round still gets taught');
 for(const [field,value] of [['seen',true],['practice',true],['faceReady',false],['scanOpen',true],['open',true]])
  assert.equal(shouldOpen({...fresh,[field]:value}),false,`${field} suppresses the coach marks`);
 for(const phase of ['countdown','playing'])assert.equal(shouldOpen({...fresh,phase}),false,`no coach marks during ${phase}`);
 assert.equal(shouldOpen({...fresh,faceReady:undefined}),false,'a player with no state yet is not a newcomer to teach');
 for(const phase of ['countdown','playing'])assert.equal(shouldClose(phase),true);
 for(const phase of ['lobby','finished',undefined])assert.equal(shouldClose(phase),false);
});
test('a step lights up every control it names, and skips the ones swapped out of the HUD',()=>{
 const fireball={x:12,y:700,width:80,height:60},lightning={x:100,y:700,width:80,height:60};
 assert.deepEqual(union([fireball,lightning]),{x:12,y:700,width:168,height:60},'both primary spells in one box');
 // Enable voice is replaced by the live transcript, so the hidden one must not stretch the highlight.
 assert.deepEqual(union([{x:0,y:0,width:0,height:0},lightning]),lightning);
 for(const empty of [[],null,[null],[{x:0,y:0,width:0,height:40}]])assert.equal(union(empty),null);
});
test('the dark panels tile the arena exactly around the lit controls, leaving them tappable',()=>{
 const box={width:390,height:844},hole={x:20,y:700,width:100,height:44};
 const {blocks,top}=frame(hole,box,{height:150});
 const covered=blocks.reduce((n,b)=>n+b.width*b.height,0);
 assert.equal(covered,box.width*box.height-hole.width*hole.height,'nothing is dimmed twice and nothing is missed');
 for(const b of blocks){
  const overlap=Math.max(0,Math.min(b.x+b.width,hole.x+hole.width)-Math.max(b.x,hole.x))*Math.max(0,Math.min(b.y+b.height,hole.y+hole.height)-Math.max(b.y,hole.y));
  assert.equal(overlap,0,'no panel covers a control the step is pointing at');
 }
 assert.equal(top,hole.y-14-150,'the card sits above controls near the bottom of the screen');
});
test('the card drops below a control with no room above it, and nothing visible just dims everything',()=>{
 const box={width:390,height:844};
 assert.equal(frame({x:20,y:20,width:100,height:44},box,{height:150}).top,78,'below the control');
 // Nothing fits below a control at the top of a short screen, so the card is pinned on rather than hung off it.
 assert.equal(frame({x:0,y:20,width:100,height:44},box,{height:820}).top,12);
 for(const missing of [null,undefined,{x:0,y:0,width:0,height:44}]){
  const plan=frame(missing,box,{height:150});
  assert.deepEqual(plan.blocks,[{x:0,y:0,width:390,height:844}]);
  assert.equal(plan.top,347,'centred when there is nothing to point at');
 }
});
test('continuous games allow first-time tips after scanning, but never repeat seen tips',()=>{
 assert.equal(shouldOpen({...fresh,phase:'playing',continuous:true}),true);
 assert.equal(shouldOpen({...fresh,phase:'playing',continuous:true,seen:true}),false);
 assert.equal(shouldClose('playing',true),false);
});

function fakeGuide(t,options={}){
 const before={document:globalThis.document,addEventListener:globalThis.addEventListener,requestAnimationFrame:globalThis.requestAnimationFrame};
 const node=tag=>({tag,children:[],style:{},attrs:{},hidden:false,textContent:'',setAttribute(k,v){this.attrs[k]=v;},append(...items){this.children.push(...items);},replaceChildren(...items){this.children=items;},getBoundingClientRect(){return{x:0,y:0,left:0,top:0,width:390,height:this.tag==='main'?844:180};}});
 globalThis.document={head:node('head'),createElement:node};globalThis.addEventListener=()=>{};globalThis.requestAnimationFrame=fn=>{fn();return 1;};
 t.after(()=>Object.assign(globalThis,before));t.mock.timers.enable({apis:['setInterval']});
 const container=node('main');let finishes=0;const guide=createOnboarding({container,...options,onFinish(){finishes++;}});
 const root=container.children[0],card=root.children.at(-1),row=card.children.at(-1),[skip,next]=row.children;
 return{guide,root,card,skip,next,get finishes(){return finishes;}};
}
test('Skip ends first-visit tips once and the stored seen flag suppresses future visits',t=>{
 const state=fakeGuide(t);state.guide.open();assert.equal(state.guide.isOpen,true);state.skip.onclick();state.skip.onclick();
 assert.equal(state.finishes,1);assert.equal(state.root.hidden,true);assert.equal(shouldOpen({...fresh,seen:true}),false);
 t.mock.timers.tick(1000);assert.equal(state.finishes,1);
});
test('Next visits four steps, uses the current starter spell, and completes once',t=>{
 const state=fakeGuide(t,{getStarterSpell:()=> 'Poison'});state.guide.open();
 assert.equal(state.card.children[0].textContent,'1 of 4');state.next.onclick();
 assert.equal(state.card.children[1].textContent,'Say “Poison”');state.next.onclick();state.next.onclick();
 assert.equal(state.next.textContent,'Play');state.next.onclick();state.guide.hide();
 assert.equal(state.finishes,1);assert.equal(state.guide.isOpen,false);
});
test('missing, hidden and replaced anchors never block a step',t=>{
 const state=fakeGuide(t,{anchors:{target:()=>null,attack:()=>[{getBoundingClientRect(){return{x:0,y:0,width:0,height:0};}}],melee:()=>{throw Error('replaced');}}});
 state.guide.open();for(let i=0;i<4;i++){assert.equal(state.next.disabled,false);assert.ok(Number.parseFloat(state.card.style.top)>=12);state.next.onclick();}
 assert.equal(state.finishes,1);
});
