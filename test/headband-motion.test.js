import test from 'node:test';
import assert from 'node:assert/strict';
import {createHeadbandMotion} from '../dist/headband-motion.js';

const band=(x=100,y=60,width=30,height=6,extra={})=>({box:{originX:x,originY:y,width,height},match:.95,self:.02,area:width*height*.85,fill:.85,...extra});
const center=b=>({x:b.originX+b.width/2,y:b.originY+b.height/2});
function acquire(track,x=100,width=30){track.update([band(x,60,width,Math.max(2,width/5))],0);track.update([band(x+3,60,width,Math.max(2,width/5))],80);assert.equal(track.get(80)?.confirmed,true);}

test('a headband acquires without any face/body and duplicate observations cannot confirm it',()=>{
 const track=createHeadbandMotion(),sample=band();
 track.update([sample],0);assert.notEqual(track.get(0)?.confirmed,true);
 track.update([sample],0);assert.notEqual(track.get(0)?.confirmed,true);
 track.update([band(103)],80);const row=track.get(80);
 assert.equal(row.confirmed,true);assert.equal(row.fresh,true);assert.equal(row.seenAt,80);
 assert.ok(row.band);assert.ok(Math.abs(row.match-.95)<1e-6);assert.ok(Math.abs(row.self-.02)<1e-6);
 assert.ok(row.box.width<50,'The tracked box remains the headband, not an invented whole body.');
});

test('a moving headband retains confirmation as it grows from distant to close-up size',()=>{
 const track=createHeadbandMotion(),widths=[9,10,12,15,19,24,31,40,52,67,87,113,147];
 for(let i=0;i<widths.length;i++){
  const sample=band(90+i*4,60+i,widths[i],Math.max(2,widths[i]/5)),at=i*60;
  track.update([sample],at);const row=track.get(at);
  if(!i)continue;
  assert.equal(row?.confirmed,true,`Lock should survive width ${widths[i]} pixels.`);assert.equal(row.fresh,true);
  assert.ok(row.box.width>=sample.box.width*.55&&row.box.width<=sample.box.width*1.4,'Size smoothing must follow approach instead of freezing at the acquisition size.');
  assert.ok(Math.abs(center(row.box).x-center(sample.box).x)<Math.max(12,sample.box.width*.6),'Filtered position follows the moving band.');
 }
});

test('tiny bands survive camera jitter even when consecutive boxes do not overlap',()=>{
 const track=createHeadbandMotion();
 track.update([band(100,60,7,2)],0);track.update([band(105,60,7,2)],80);
 assert.equal(track.get(80)?.confirmed,true);
 track.update([band(113,61,7,2)],160);assert.equal(track.get(160)?.confirmed,true);
 assert.equal(track.get(160)?.fresh,true);
});

test('a larger far-away matching-color object does not steal an established track',()=>{
 const track=createHeadbandMotion();acquire(track);
 const distractor=band(450,250,140,40,{match:.99});
 for(let i=0;i<4;i++){
  const at=160+i*80,target=band(107+i*4);
  track.update(i%2?[target,distractor]:[distractor,target],at);
  const row=track.get(at);assert.equal(row?.confirmed,true);assert.equal(row.fresh,true);
  assert.ok(center(row.box).x<200,'Candidate ordering and area must not redirect a live lock.');
 }
});

test('a same-color crossing disables the lock immediately and requires fresh confirmation',()=>{
 const track=createHeadbandMotion();acquire(track);
 track.update([band(104),band(108)],160);
 assert.equal(track.get(160),null,'Two similarly plausible nearby bands are unsafe to identify.');
 track.update([band(110)],240);assert.notEqual(track.get(240)?.confirmed,true);
 track.update([band(113)],320);assert.equal(track.get(320)?.confirmed,true);
});

test('cold acquisition rejects equally plausible colored objects instead of choosing the biggest',()=>{
 const track=createHeadbandMotion();
 track.update([band(100),band(400,100,100,20)],0);
 track.update([band(103),band(403,100,100,20)],80);
 assert.equal(track.get(80),null);
 track.update([band(107)],160);assert.notEqual(track.get(160)?.confirmed,true);
 track.update([band(110)],240);assert.equal(track.get(240)?.confirmed,true);
});

test('brief visual prediction cannot refresh observation time or permit stale hits',()=>{
 const track=createHeadbandMotion();acquire(track);
 track.update([],160);const early=track.get(160);assert.ok(early);assert.equal(early.seenAt,80);
 const later=track.get(270);assert.ok(later,'A short dropout can retain its visual marker.');
 assert.equal(later.fresh,false,'More than 180 ms without a detection cannot count as fresh tracking.');assert.equal(later.seenAt,80);
 assert.deepEqual(later.box,early.box,'Prediction stops advancing after 80 ms instead of drifting indefinitely.');
 assert.ok(track.get(479));assert.equal(track.get(481),null);
 track.update([band(115)],500);assert.notEqual(track.get(500)?.confirmed,true,'An expired identity must be reacquired.');
});

test('one-frame jumps, old frames, and reset cannot inherit a confirmed identity',()=>{
 const track=createHeadbandMotion();acquire(track);const before=track.get(80);
 track.update([band(500)],40);assert.deepEqual(track.get(80),before,'A delayed frame cannot move or confirm the current track.');
 track.update([band(500)],160);const jumped=track.get(160);
 assert.ok(!jumped||center(jumped.box).x<300||!jumped.confirmed,'A single distant candidate cannot inherit confirmation.');
 track.reset();assert.equal(track.get(160),null);track.update([band(500)],200);assert.notEqual(track.get(200)?.confirmed,true);
});
