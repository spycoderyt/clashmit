import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STEPS,shouldOpen,shouldClose,frame,union} from '../dist/onboarding.js';
const fresh={seen:false,practice:false,faceReady:true,phase:'lobby',scanOpen:false,open:false};
test('five one-line coach marks run voice, health, mana, attack, defence in that order',()=>{
 assert.deepEqual(STEPS.map(s=>s.anchor),['voice','health','mana','attack','defence']);
 for(const step of STEPS){
  assert.ok(step.text.length>10&&step.text.length<70,`${step.key} stays a one-liner`);
  assert.equal(step.text.split(/(?<=[.!?])\s+/).filter(Boolean).length,1,`${step.key} is a single sentence`);
  assert.ok(!('title' in step)&&!('fine' in step),`${step.key} carries nothing but its line`);
 }
 // Nobody may skim past enabling voice, and no other step blocks on anything.
 assert.equal(STEPS[0].gate,'voice');
 assert.deepEqual(STEPS.slice(1).map(s=>s.gate),[undefined,undefined,undefined,undefined]);
 assert.match(STEPS[0].text,/Enable voice/);
 assert.match(STEPS[4].text,/Shield/);assert.match(STEPS[4].text,/Heal/);
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
test('every coach mark points at controls that are really in the HUD',()=>{
 const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 const map=app.match(/anchors:\{(.*?)\},gates:/)[1];
 const anchors=[...map.matchAll(/(\w+):(\[[^\]]*\]|\$\('[\w-]+'\))/g)].map(m=>[m[1],[...m[2].matchAll(/'([\w-]+)'/g)].map(i=>i[1])]);
 assert.deepEqual(anchors.map(([key])=>key),STEPS.map(s=>s.anchor));
 for(const [key,ids] of anchors)for(const id of ids)assert.ok(html.includes(`id="${id}"`),`#${id} for the ${key} step is in the HUD`);
 assert.deepEqual(anchors.find(([k])=>k==='attack')[1],['fireball','lightning'],'the left two spell cards');
 assert.deepEqual(anchors.find(([k])=>k==='defence')[1],['shield','heal'],'the right two spell cards');
 assert.ok(html.includes('id="how-to-play"'),'a skipped player can bring the coach marks back');
 // The things this HUD pass removed must stay gone.
 for(const gone of ['tracking-retry','YOUR HEALTH'])assert.ok(!html.includes(gone),`${gone} is gone from the HUD`);
});
