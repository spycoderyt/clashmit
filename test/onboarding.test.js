import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {STEPS,shouldOpen,shouldClose,frame,union} from '../dist/onboarding.js';
import {PERSONAS,SPELLS} from '../dist/rules.js';
const fresh={seen:false,practice:false,faceReady:true,phase:'lobby',scanOpen:false,open:false};
test('two skippable tips teach voice casting with no activation step',()=>{
 assert.deepEqual(STEPS.map(s=>s.anchor),['attack','defence']);
 for(const step of STEPS){
  assert.ok(step.text.length>10&&step.text.length<70,`${step.key} stays a one-liner`);
  assert.equal(step.text.split(/(?<=[.!?])\s+/).filter(Boolean).length,1,`${step.key} is a single sentence`);
  assert.ok(!('title' in step)&&!('fine' in step),`${step.key} carries nothing but its line`);
 }
 for(const step of STEPS){assert.equal(step.gate,undefined);assert.match(step.text,/say/i);assert.doesNotMatch(step.text,/enable|tap|click/i);}
 assert.match(STEPS[1].text,/Shield/);assert.match(STEPS[1].text,/Heal/);
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
test('the attack and defence steps light the right cards for every persona',()=>{
 const app=readFileSync(new URL('../dist/app.js',import.meta.url),'utf8'),html=readFileSync(new URL('../dist/index.html',import.meta.url),'utf8');
 const anchors=app.match(/anchors:\{(.*?)\},gates:/)[1];
 assert.ok(!anchors.includes('voice'),'there is no voice activation step');
 // The spell bar is emptied and rebuilt per persona, so these two steps must take slots, never spell names.
 assert.ok(html.includes('id="spells" class="spells"></div>'),'the spell bar is built at runtime');
 assert.match(anchors,/attack:\(\)=>spellCards\(\)\.slice\(0,2\)/);
 assert.ok(anchors.includes("$('inventory').querySelectorAll('[data-consumable=shield],[data-consumable=heal]')"),'defence tips point to consumable inventory rows');
 // Slot order is what makes "first pair attacks, last pair defends" true whoever the player picked.
 for(const [name,deck] of Object.entries(PERSONAS)){
  assert.equal(deck.length,4,`${name} has four cards`);
  assert.deepEqual(deck.slice(-2),['shield','heal'],`${name} defends with the last two cards`);
  assert.ok(!SPELLS[deck[0]].bypassShield,`${name}'s first card is the blockable attack`);
  assert.ok(SPELLS[deck[1]].bypassShield,`${name}'s second card is the piercing attack`);
 }
 // The things this HUD pass removed must stay gone.
 for(const gone of ['tracking-retry','YOUR HEALTH','how-to-play'])assert.ok(!html.includes(gone),`${gone} is gone from the HUD`);
});

test('continuous games allow first-time tips after scanning, but never repeat seen tips',()=>{
 assert.equal(shouldOpen({...fresh,phase:'playing',continuous:true}),true);
 assert.equal(shouldOpen({...fresh,phase:'playing',continuous:true,seen:true}),false);
 assert.equal(shouldClose('playing',true),false);
});
