import test from 'node:test';import assert from 'node:assert/strict';
import {feetOf} from '../dist/skeleton-army.js';
test('feet are estimated straight below the face, about ten face-widths down',()=>{
 // A face 4% of a portrait view wide, centred at 30% height.
 const feet=feetOf({x:.48,y:.29,width:.04,height:.02},9/16);
 assert.ok(Math.abs(feet.x-.5)<1e-9,'directly below the face');
 assert.ok(Math.abs(feet.y-(.3+10*.04*9/16))<1e-9);assert.ok(feet.y>.3,'feet are below the head');
});
test('a nearer opponent has lower feet and larger skeletons',()=>{
 const far=feetOf({x:.49,y:.3,width:.02,height:.01},9/16),near=feetOf({x:.46,y:.3,width:.08,height:.04},9/16);
 assert.ok(near.y>far.y);assert.ok(near.size>far.size);
});
test('skeleton size stays legible and bounded; bad boxes give no feet',()=>{
 assert.equal(feetOf({x:.5,y:.3,width:.001,height:.001},9/16).size,.045);assert.equal(feetOf({x:.2,y:.1,width:.6,height:.2},9/16).size,.2);
 assert.equal(feetOf(null),null);assert.equal(feetOf({x:0,y:0,width:0,height:0}),null);
});
test('an approaching army looms: it grows slowly while far and fast as it arrives',async()=>{
 // The curve is internal; observe it through the sizes the layer actually places.
 const placed=[];const el=()=>({style:{setProperty(){},set transform(v){placed.push(+/scale\(([\d.]+)\)/.exec(v)[1]);}},classList:{add(){}},set innerHTML(v){},remove(){},append(){},setAttribute(){}});
 const container={append(){},getBoundingClientRect:()=>({width:375,height:812})};
 globalThis.document={createElement:el};const {createSkeletonArmy}=await import('../dist/skeleton-army.js');
 const army=createSkeletonArmy(container,{clock:()=>0}),feet={x:.5,y:.45,size:.06};
 const sizeAt=progress=>{placed.length=0;army.update({incoming:[{id:'x',who:'foe',progress,feet}],ground:.7});return Math.max(...placed);};
 const start=sizeAt(0),mid=sizeAt(.5),end=sizeAt(1);delete globalThis.document;
 assert.ok(start<mid&&mid<end,'it grows the whole way');
 assert.ok(end-mid>(mid-start)*1.8,`the second half must loom far more than the first (${start.toFixed(2)} → ${mid.toFixed(2)} → ${end.toFixed(2)})`);
 assert.ok(end>start*4,'it arrives several times larger than it set out');
});
test('each opponent keeps their own army: marches and mobs are drawn where that player stands',async()=>{
 const placed=[];const el=()=>({style:{setProperty(){},set transform(v){const m=/translate3d\(([\d.-]+)px/.exec(v);placed.push(+m[1]);}},classList:{add(){}},set innerHTML(v){},remove(){},append(){},setAttribute(){}});
 globalThis.document={createElement:el};const {createSkeletonArmy}=await import('../dist/skeleton-army.js');
 const army=createSkeletonArmy({append(){},getBoundingClientRect:()=>({width:400,height:800})},{clock:()=>0});
 const left={x:.2,y:.5,size:.06},right={x:.8,y:.5,size:.06};
 army.update({mobbed:[{who:'ann',feet:left},{who:'bob',feet:right}],ground:.7});delete globalThis.document;
 const xs=placed.map(x=>x/400),nearLeft=xs.filter(x=>Math.abs(x-.2)<.15).length,nearRight=xs.filter(x=>Math.abs(x-.8)<.15).length;
 assert.equal(xs.length,24,'two mobs of twelve');assert.equal(nearLeft,12);assert.equal(nearRight,12);
});
