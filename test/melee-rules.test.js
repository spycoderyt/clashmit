import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeleeTracker} from '../dist/melee-rules.js';
const left={x:.15,y:.85,size:.08},right={x:.85,y:.85,size:.08};
const face={id:'target',x:.4,y:.35,width:.2,height:.2};
const end={x:.7,y:.2,size:.08};
const move=(tracker,hand,at,faces=[face])=>tracker.update({hand,faces,at});
function arm(tracker,hand=left,at=0){assert.equal(move(tracker,hand,at).phase,'ready');assert.equal(move(tracker,hand,at+99).phase,'ready');assert.equal(move(tracker,hand,at+100).phase,'armed');}

test('a left or right corner needs 100 ms of holding before a fast sweep can hit',()=>{
 for(const [start,finish,side] of [[left,end,'left'],[right,{...end,x:.3},'right']]){
  const tracker=createMeleeTracker();arm(tracker,start);
  const hit=move(tracker,finish,200);
  assert.deepEqual(hit.hit,{id:'target',damage:5});assert.equal(hit.phase,'cooldown');assert.equal(hit.cooldownRemaining,1000);assert.equal(hit.side,side);
 }
});

test('the swept path hits a crossed face even when the hand ends past it, once only',()=>{
 const tracker=createMeleeTracker();arm(tracker);
 assert.ok(move(tracker,end,200).hit);assert.equal(move(tracker,end,210).hit,null);
 assert.equal(move(tracker,end,400).hit,null);
});

test('the first face along the sweep wins, not the first face in the input array',()=>{
 const tracker=createMeleeTracker();arm(tracker);
 const near={id:'near',x:.3,y:.55,width:.1,height:.1},far={id:'far',x:.55,y:.28,width:.1,height:.1};
 assert.equal(move(tracker,end,200,[far,near]).hit.id,'near');
});

test('a hand held over a face never arms, and corner jitter does not count as a swing',()=>{
 const tracker=createMeleeTracker();
 for(let at=0;at<=1000;at+=100)assert.equal(move(tracker,{x:.5,y:.45,size:.08},at).hit,null);
 tracker.reset();arm(tracker);
 for(let at=110;at<200;at+=10)assert.equal(move(tracker,{x:.15+(at%20)/1000,y:.84,size:.08},at).hit,null);
 assert.equal(move(tracker,left,200).phase,'armed');
});

test('a slow drag cannot hit even if it reaches a face',()=>{
 const tracker=createMeleeTracker();arm(tracker);
 for(let n=1;n<=10;n++)assert.equal(move(tracker,{x:.15+n*.03,y:.85-n*.04,size:.08},100+n*200).hit,null);
});

test('a swing uses current face boxes only and cannot hit a face that appears after the hand stops',()=>{
 const tracker=createMeleeTracker();arm(tracker);
 assert.equal(move(tracker,end,200,[]).hit,null);
 assert.equal(move(tracker,end,210,[face]).hit,null);
});

test('cooldown and returning to a corner are both required before another hit',()=>{
 const tracker=createMeleeTracker();arm(tracker);move(tracker,end,200);
 assert.equal(move(tracker,left,400).phase,'cooldown');
 assert.equal(move(tracker,end,600).hit,null);
 assert.equal(move(tracker,end,800).hit,null);move(tracker,end,1000);
 assert.equal(move(tracker,end,1200).phase,'return');
 assert.equal(move(tracker,left,1300).phase,'ready');
 assert.equal(move(tracker,left,1400).phase,'armed');
 assert.ok(move(tracker,end,1500).hit);
});

test('a missed swing expires and needs a fresh corner hold',()=>{
 const tracker=createMeleeTracker();arm(tracker);
 assert.equal(move(tracker,end,200,[]).hit,null);
 move(tracker,end,400,[]);move(tracker,end,600,[]);
 assert.equal(move(tracker,end,800,[]).phase,'return');
 assert.equal(move(tracker,end,900).hit,null);
 assert.equal(move(tracker,left,1000).phase,'ready');assert.equal(move(tracker,left,1100).phase,'armed');
 assert.ok(move(tracker,end,1200).hit);
});

test('long sample gaps and hand loss clear the armed path instead of creating a phantom hit',()=>{
 for(const missing of [false,true]){
  const tracker=createMeleeTracker();arm(tracker);
  if(missing){move(tracker,null,200);assert.equal(move(tracker,null,351).phase,'return');}
  const afterGap=move(tracker,end,400);assert.equal(afterGap.hit,null);assert.equal(afterGap.phase,'return');
  assert.equal(move(tracker,left,500).phase,'ready');assert.equal(move(tracker,left,600).phase,'armed');assert.ok(move(tracker,end,700).hit);
 }
});

test('a brief hand loss can keep an armed gesture, but cannot count as a corner hold',()=>{
 const tracker=createMeleeTracker();arm(tracker);move(tracker,null,150);assert.ok(move(tracker,end,200).hit);
 tracker.reset();move(tracker,left,0);move(tracker,null,50);assert.equal(move(tracker,left,100).phase,'ready');assert.equal(move(tracker,left,200).phase,'armed');
});

test('reset clears cooldown and movement history, and custom damage applies to the next armed hit',()=>{
 const tracker=createMeleeTracker({damage:7,cooldown:2000});arm(tracker);
 assert.deepEqual(move(tracker,end,200).hit,{id:'target',damage:7});tracker.reset();
 assert.equal(move(tracker,end,0).phase,'ready');assert.equal(move(tracker,end,0).hit,null);
 arm(tracker,left,100);assert.equal(move(tracker,end,300).cooldownRemaining,2000);
});

test('invalid samples and times cannot hit; invalid face boxes are ignored',()=>{
 for(const invalid of [{...left,x:NaN},{...left,y:Infinity},{...left,size:0},{...left,x:2}]){
  const tracker=createMeleeTracker();arm(tracker);assert.equal(move(tracker,invalid,150).hit,null);assert.equal(move(tracker,end,200).hit,null);
 }
 for(const at of [NaN,Infinity,50,100]){
  const tracker=createMeleeTracker();arm(tracker);assert.equal(move(tracker,end,at).hit,null);assert.equal(move(tracker,end,200).hit,null);
 }
 const tracker=createMeleeTracker();arm(tracker);
 assert.equal(move(tracker,end,200,[{...face,x:NaN},{...face,width:-1},{...face,id:null}]).hit,null);
 assert.throws(()=>createMeleeTracker({damage:NaN}),RangeError);assert.throws(()=>createMeleeTracker({cooldown:-1}),RangeError);
});
