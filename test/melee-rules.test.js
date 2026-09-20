import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeleeTracker} from '../dist/melee-rules.js';
const hand=(x,y)=>({x,y,size:.08});
const left=hand(.2,.45),right=hand(.8,.45),face={id:'target',x:.4,y:.35,width:.2,height:.2};
const move=(tracker,p,at,faces=[face])=>tracker.update({hand:p,faces,at});

test('fast deliberate sweeps can start at the centre, top, bottom or either side without arming',()=>{
 for(const [start,end]of [[left,right],[right,left],[hand(.5,.1),hand(.5,.8)],[hand(.5,.8),hand(.5,.1)],[hand(.25,.2),hand(.75,.7)]]){
  const tracker=createMeleeTracker();assert.equal(move(tracker,start,0).phase,'ready');
  const hit=move(tracker,end,100);assert.deepEqual(hit.hit,{id:'target',damage:5});assert.equal(hit.phase,'cooldown');assert.equal(hit.cooldownRemaining,1000);
 }
});

test('swept paths catch a face skipped between frames and select the first face along the path',()=>{
 const tracker=createMeleeTracker(),near={id:'near',x:.3,y:.4,width:.1,height:.1},far={id:'far',x:.6,y:.4,width:.1,height:.1};
 move(tracker,left,0);assert.equal(move(tracker,right,100,[far,near]).hit.id,'near');
 assert.equal(move(tracker,right,110).hit,null);assert.equal(move(tracker,right,200).hit,null);
});

test('small individual frame movements form a deliberate fast sweep without requiring a large jump',()=>{
 const tracker=createMeleeTracker();move(tracker,hand(.2,.45),0);assert.equal(move(tracker,hand(.28,.45),40).hit,null);
 assert.equal(move(tracker,hand(.36,.45),80).hit,null);
 assert.deepEqual(move(tracker,hand(.44,.45),120).hit,{id:'target',damage:5});
});

test('stationary overlaps and rapid back-and-forth hand jitter never deal damage',()=>{
 const tracker=createMeleeTracker();
 for(let at=0;at<=1500;at+=50)assert.equal(move(tracker,hand(.5,.45),at).hit,null);
 tracker.reset();
 for(let i=0;i<150;i++)assert.equal(move(tracker,hand(.5+(i%2?.025:-.025),.45+(i%3)*.006),i*10).hit,null);
});

test('a slow drag across a face never deals damage',()=>{
 const tracker=createMeleeTracker();
 for(let i=0;i<35;i++)assert.equal(move(tracker,hand(.15+i*.02,.45),i*100).hit,null);
});

test('face boxes are taken from the current sample and cannot be hit after a hand stops',()=>{
 const tracker=createMeleeTracker();move(tracker,left,0);
 assert.equal(move(tracker,right,100,[]).hit,null);assert.equal(move(tracker,right,150,[face]).hit,null);
 assert.equal(move(tracker,right,200,[face]).hit,null);
});

test('cooldown rejects a second sweep at 999ms and permits one at exactly 1000ms',()=>{
 for(const [elapsed,allowed]of [[999,false],[1000,true]]){
  const tracker=createMeleeTracker();move(tracker,left,0);assert.ok(move(tracker,right,100).hit);
  for(let at=200;at<=1000;at+=100)assert.equal(move(tracker,right,at).hit,null);
  const next=move(tracker,left,100+elapsed);assert.equal(!!next.hit,allowed);
  assert.equal(next.cooldownRemaining,allowed?1000:1);
 }
});

test('successive centre sweeps work without visiting a lower corner, but continued holding does not',()=>{
 const tracker=createMeleeTracker();move(tracker,left,0);assert.ok(move(tracker,right,100).hit);
 for(let at=200;at<=1100;at+=100)assert.equal(move(tracker,right,at).hit,null);
 assert.ok(move(tracker,left,1200).hit);
 for(let at=1300;at<=2200;at+=100)assert.equal(move(tracker,left,at).hit,null);
 assert.ok(move(tracker,right,2300).hit);
});

test('a missed sweep can be followed immediately by a valid reverse sweep anywhere',()=>{
 const tracker=createMeleeTracker();move(tracker,left,0);
 assert.equal(move(tracker,right,100,[]).hit,null);assert.deepEqual(move(tracker,left,200).hit,{id:'target',damage:5});
});

test('missing frames and long sample gaps clear motion history rather than bridge a phantom hit',()=>{
 for(const missing of [false,true]){
  const tracker=createMeleeTracker();move(tracker,left,0);
  if(missing)move(tracker,null,50);
  assert.equal(move(tracker,right,missing?100:251).hit,null);
  assert.ok(move(tracker,left,missing?200:351).hit,'a new real movement can hit after reacquisition');
 }
});

test('tracking loss clears movement history while preserving a recent hit cooldown',()=>{
 const tracker=createMeleeTracker();move(tracker,left,0);move(tracker,right,100);move(tracker,null,150);
 assert.equal(move(tracker,left,200).hit,null);assert.equal(move(tracker,right,250).hit,null);
 assert.equal(move(tracker,right,350).cooldownRemaining,750);
});

test('invalid times and invalid hands do not hit and invalidate the previous path',()=>{
 for(const invalid of [{...left,x:NaN},{...left,y:Infinity},{...left,size:0},{...left,x:2}]){
  const tracker=createMeleeTracker();move(tracker,left,0);assert.equal(move(tracker,invalid,50).hit,null);assert.equal(move(tracker,right,100).hit,null);
 }
 for(const at of [NaN,Infinity,-1,0]){
  const tracker=createMeleeTracker();move(tracker,left,0);assert.equal(move(tracker,right,at).hit,null);assert.equal(move(tracker,right,100).hit,null);
 }
});

test('invalid face boxes cannot hit, and reset clears history and cooldown for a new local demo',()=>{
 const tracker=createMeleeTracker({damage:7,cooldown:800});move(tracker,left,0);
 assert.equal(move(tracker,right,100,[{...face,x:NaN},{...face,width:-1},{...face,id:null}]).hit,null);
 assert.deepEqual(move(tracker,left,200).hit,{id:'target',damage:7});tracker.reset();
 assert.equal(move(tracker,right,0).cooldownRemaining,0);assert.equal(move(tracker,left,100).cooldownRemaining,800);
 assert.throws(()=>createMeleeTracker({damage:NaN}),RangeError);assert.throws(()=>createMeleeTracker({cooldown:-1}),RangeError);
});
