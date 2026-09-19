import test from 'node:test';
import assert from 'node:assert/strict';
import {PALETTE,PAIR_IDS,classifyColor,pairId} from '../dist/palette.js';
import {findStripes,pairStripes,recognizePairs,stacked} from '../dist/headband-pair.js';
const rgb=name=>PALETTE.find(c=>c.name===name).rgb;
function frame(rects=[],width=100,height=160){
 const data=new Uint8ClampedArray(width*height*4);
 for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=80;data[i+3]=255;}
 for(const [x,y,w,h,color] of rects)for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)data.set([...rgb(color),255],(yy*width+xx)*4);
 return{data,width,height};
}
test('all six printed colors classify, and near-misses are rejected rather than guessed',()=>{
 for(const c of PALETTE)assert.equal(classifyColor(c.rgb),c.name);
 assert.equal(PALETTE.length,6);
 assert.equal(PAIR_IDS.length,30);
 assert.equal(new Set(PAIR_IDS).size,30);
 assert.equal(classifyColor([120,120,120]),null);
 assert.equal(classifyColor([5,5,5]),null);
 assert.equal(classifyColor(null),null);
 // Dimming must never turn cyan into navy; unknown is the safe answer.
 for(const scale of [.3,.45,.6,.8,1]){
  const got=classifyColor(rgb('cyan').map(v=>Math.round(v*scale)));
  assert.ok(got===null||got==='cyan',`cyan at ${scale} became ${got}`);
 }
 assert.equal(pairId('red','red'),null);
 assert.equal(pairId('red','navy'),'red-navy');
});
test('two stacked stripes read as one ordered id, and flipping them reverses it',()=>{
 const a=recognizePairs(frame([[35,24,24,5,'red'],[35,29,24,5,'cyan']]));
 assert.equal(a.length,1);
 assert.equal(a[0].id,'red-cyan');
 assert.equal(a[0].top,'red');
 assert.equal(a[0].bottom,'cyan');
 const b=recognizePairs(frame([[35,24,24,5,'cyan'],[35,29,24,5,'red']]));
 assert.equal(b.length,1);
 assert.equal(b[0].id,'cyan-red');
});
test('every one of the thirty printed pairs is recognized and unique',()=>{
 const seen=new Set();
 for(const top of PALETTE)for(const bottom of PALETTE){
  if(top.name===bottom.name)continue;
  const found=recognizePairs(frame([[35,24,24,5,top.name],[35,29,24,5,bottom.name]]));
  assert.equal(found.length,1,`${top.name}-${bottom.name} not found`);
  assert.equal(found[0].id,`${top.name}-${bottom.name}`);
  seen.add(found[0].id);
 }
 assert.equal(seen.size,30);
 assert.deepEqual([...seen].sort(),[...PAIR_IDS].sort());
});
test('a repeating stack is reported ambiguous instead of resolving to a wrong id',()=>{
 // Cutting the printed sheet across three bands gives ABA, which reads as both
 // orders. The marker must be rejected, not guessed.
 const repeated=pairStripes(findStripes(frame([[35,20,24,5,'red'],[35,25,24,5,'cyan'],[35,30,24,5,'red']])));
 assert.equal(repeated.length,1);
 assert.equal(repeated[0].id,null);
 assert.equal(repeated[0].ambiguous,true);
 assert.equal(repeated[0].reason,'repeating stack');
 assert.equal(recognizePairs(frame([[35,20,24,5,'red'],[35,25,24,5,'cyan'],[35,30,24,5,'red']])).length,0);
});
test('a lone stripe and two unrelated stripes never form a player id',()=>{
 assert.equal(recognizePairs(frame([[35,24,24,5,'red']])).length,0);
 // Far apart vertically.
 assert.equal(recognizePairs(frame([[35,20,24,5,'red'],[35,120,24,5,'cyan']])).length,0);
 // Side by side rather than stacked.
 assert.equal(recognizePairs(frame([[5,24,24,5,'red'],[65,24,24,5,'cyan']])).length,0);
 // Mismatched widths are two different objects, not one band.
 assert.equal(recognizePairs(frame([[35,24,8,3,'red'],[20,27,60,5,'cyan']])).length,0);
});
test('two players wearing different bands are told apart in one frame',()=>{
 const found=recognizePairs(frame([[10,20,22,5,'green'],[10,25,22,5,'orange'],[62,60,22,5,'orange'],[62,65,22,5,'green']]));
 assert.equal(found.length,2);
 assert.deepEqual(found.map(m=>m.id).sort(),['green-orange','orange-green']);
});
test('speckles, huge fields and reused buffers cannot invent a marker',()=>{
 assert.equal(recognizePairs(frame([[5,5,2,2,'red'],[5,7,2,2,'cyan']])).length,0);
 assert.equal(recognizePairs(frame([[0,0,100,80,'red'],[0,80,100,80,'cyan']])).length,0);
 const buffers={};
 assert.equal(recognizePairs(frame([[35,24,24,5,'red'],[35,29,24,5,'cyan']]),buffers).length,1);
 assert.equal(recognizePairs(frame(),buffers).length,0);
});
test('stacking tolerates a small gap and head tilt but not a distant stripe',()=>{
 const top={box:{originX:10,originY:10,width:30,height:6},color:'red',area:180};
 assert.equal(stacked(top,{box:{originX:10,originY:16,width:30,height:6}}),true);
 assert.equal(stacked(top,{box:{originX:13,originY:18,width:28,height:6}}),true);
 assert.equal(stacked(top,{box:{originX:10,originY:40,width:30,height:6}}),false);
 assert.equal(stacked(top,{box:{originX:55,originY:16,width:30,height:6}}),false);
});
