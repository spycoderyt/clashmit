import test from 'node:test';
import assert from 'node:assert/strict';
import {createFaceTracks,LOCK} from '../dist/face-tracks.js';
import {DESCRIPTOR_LENGTH,encodeDescriptor,decodeDescriptor,validEncodedSamples,descriptorDistance,headTurn,MAX_SAMPLES} from '../dist/face-id.js';
const direction=seed=>{let s=seed*2654435761%4294967296;return Array.from({length:DESCRIPTOR_LENGTH},()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296-.5;});};
const unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
const person=seed=>unit(direction(seed));
const gallery=[{id:'ada',name:'Ada',samples:[person(1)]},{id:'bo',name:'Bo',samples:[person(2)]}];
const faceAt=(cx,cy,width=80,descriptor=null)=>({box:{x:cx-width/2,y:cy-width/2,width,height:width},score:.9,descriptor,pixels:width});
const bodyAround=(cx,headY,width=220,height=600)=>({box:{originX:cx-width/2,originY:headY-60,width,height},score:.8});
const named=(tracks,at)=>tracks.list(at).filter(t=>t.id);
function lockOn(tracks,cx=500,cy=300,start=0,who=1){for(let i=0;i<3;i++)tracks.updateFaces([faceAt(cx,cy,80,person(who))],start+i*100,gallery);return start+200;}
test('a name needs three recognised frames, then stays on the face while it is only followed',()=>{
 const tracks=createFaceTracks();
 tracks.updateFaces([faceAt(500,300,80,person(1))],0,gallery);tracks.updateFaces([faceAt(502,300,80,person(1))],100,gallery);assert.equal(named(tracks,100).length,0);
 tracks.updateFaces([faceAt(504,301,80,person(1))],200,gallery);const [locked]=named(tracks,200);assert.equal(locked.id,'ada');assert.equal(locked.source,'face');assert.ok(locked.fresh&&locked.confirmed);
 // Head turns to profile: still detected and moving, but no longer recognisable. The name holds.
 let at=200;for(let i=1;i<=10;i++){at+=100;tracks.updateFaces([faceAt(504+i*12,301)],at,gallery);}
 const [turned]=named(tracks,at);assert.equal(turned.id,'ada');assert.equal(turned.key,locked.key);assert.ok(Math.abs(turned.box.originX+turned.box.width/2-624)<25);
 // A stranger never gets a name however long they are watched.
 const crowd=createFaceTracks();for(let i=0;i<10;i++)crowd.updateFaces([faceAt(300,300,80,person(9))],i*100,gallery);assert.equal(named(crowd,900).length,0);
});
test('when the face disappears the lock moves to the body and returns to the face afterwards',()=>{
 const tracks=createFaceTracks();let at=lockOn(tracks);const key=named(tracks,at)[0].key;assert.equal(tracks.needsBodies(at),false);
 at+=200;tracks.updateFaces([],at,gallery);assert.equal(tracks.needsBodies(at),true);
 // Two people in frame: the lock binds to the one whose upper body contains the head, preferring the nearer fit.
 tracks.updateBodies([bodyAround(500,300),{box:{originX:100,originY:100,width:1200,height:900},score:.6},bodyAround(1200,320)],at);
 let [held]=named(tracks,at);assert.equal(held.source,'body');assert.ok(held.fresh&&held.confirmed);assert.equal(held.key,key);
 // The person walks right with their back turned; the head estimate follows the body box.
 for(let i=1;i<=20;i++){at+=200;tracks.updateFaces([],at,gallery);tracks.updateBodies([bodyAround(500+i*20,300),bodyAround(1200,320)],at);}
 [held]=named(tracks,at);assert.equal(held.source,'body');assert.equal(held.id,'ada');assert.ok(Math.abs(held.box.originX+held.box.width/2-900)<5);assert.ok(held.box.originY<330&&held.box.originY>200);
 // They start to turn back: a profile appears at the estimated head. It rejoins the same track and keeps
 // the name, but is not trusted as verified until it is recognised again.
 at+=100;tracks.updateFaces([faceAt(905,300,80)],at,gallery);[held]=named(tracks,at);assert.equal(held.key,key);assert.equal(held.source,'face');assert.equal(tracks.knownBoxes(at).length,0);
 at+=100;tracks.updateFaces([faceAt(905,300,80,person(1))],at,gallery);assert.equal(named(tracks,at)[0].id,'ada');assert.equal(tracks.knownBoxes(at).length,1);
 // Same story, but the face that comes back is clearly Bo: the name is dropped at once and Bo must earn his own.
 const swap=createFaceTracks();let t=lockOn(swap);t+=300;swap.updateFaces([],t,gallery);swap.updateBodies([bodyAround(500,300)],t);assert.equal(named(swap,t)[0].source,'body');
 t+=200;swap.updateBodies([bodyAround(500,300)],t);swap.updateFaces([faceAt(500,300,80,person(2))],t,gallery);assert.equal(named(swap,t).length,0);
 for(let i=0;i<2;i++){t+=100;swap.updateFaces([faceAt(500,300,80,person(2))],t,gallery);}assert.deepEqual(named(swap,t).map(x=>x.id),['bo']);
});
test('without a body the lock coasts briefly and then ends; a body alone cannot hold it forever',()=>{
 const tracks=createFaceTracks();let at=lockOn(tracks);
 tracks.updateFaces([],at+300,gallery);let [coasting]=named(tracks,at+300);assert.equal(coasting.source,'coast');assert.equal(coasting.fresh,true);
 assert.equal(named(tracks,at+LOCK.faceFreshMs+50)[0].fresh,false);assert.equal(named(tracks,at+LOCK.coastMs+50).length,0);
 const held=createFaceTracks();at=lockOn(held);const lost=at;while(at-lost<LOCK.bodyHoldMs+400){at+=200;held.updateFaces([],at,gallery);held.updateBodies([bodyAround(500,300)],at);if(at-lost<LOCK.bodyHoldMs-400)assert.equal(named(held,at).length,1,`held at ${at-lost}ms`);}
 assert.equal(named(held,at).length,0);
 // A body that stops being detected ends the lock once the coast window has also passed.
 const gone=createFaceTracks();at=lockOn(gone);gone.updateBodies([bodyAround(500,300)],at+300);assert.equal(named(gone,at+300+LOCK.bodyFreshMs-50)[0].source,'body');assert.equal(named(gone,at+LOCK.coastMs+LOCK.bodyFreshMs+400).length,0);
});
test('fresh face evidence moves a name; position alone never does',()=>{
 const tracks=createFaceTracks();let at=lockOn(tracks,500,300,0,1);
 // Ada's face vanishes and Bo walks into the same spot: Bo is followed but never called Ada.
 at+=1500;for(let i=0;i<4;i++){at+=100;tracks.updateFaces([faceAt(500,300,80,person(2))],at,gallery);}
 const ids=named(tracks,at).map(t=>t.id);assert.deepEqual(ids,['bo']);
 // Ada is body-tracked on the left while her face is recognised afresh on the right: the name follows the face.
 const moved=createFaceTracks();at=lockOn(moved,300,300,0,1);at+=300;moved.updateFaces([],at,gallery);moved.updateBodies([bodyAround(300,300)],at);assert.equal(named(moved,at)[0].source,'body');
 for(let i=0;i<3;i++){at+=100;moved.updateFaces([faceAt(1400,300,80,person(1))],at,gallery);moved.updateBodies([bodyAround(300,300)],at);}
 const ada=named(moved,at);assert.equal(ada.length,1);assert.ok(ada[0].box.originX>1300);assert.equal(ada[0].source,'face');
});
test('two tracked faces keep their own names and search windows',()=>{
 const tracks=createFaceTracks();let at=0;for(let i=0;i<4;i++){at=i*100;tracks.updateFaces([faceAt(400+i*5,300,80,person(1)),faceAt(1100-i*5,320,60,person(2))],at,gallery);}
 const byId=Object.fromEntries(named(tracks,at).map(t=>[t.id,t]));assert.ok(byId.ada.box.originX<600&&byId.bo.box.originX>900);
 const regions=tracks.regions(at);assert.equal(regions.length,2);for(const r of regions)assert.ok(r.width>=160&&r.width===r.height);assert.equal(tracks.knownBoxes(at).length,2);
 tracks.reset();assert.equal(tracks.list(at).length,0);
});
test('face signatures survive the compact wire format and bad input is rejected',()=>{
 const original=person(5),text=encodeDescriptor(original),decoded=decodeDescriptor(text);assert.equal(text.length,684);assert.ok(descriptorDistance(original,decoded)<.03);assert.ok(descriptorDistance(decoded,person(6))>1.2);
 assert.ok(validEncodedSamples([text,encodeDescriptor(person(6))]));
 for(const bad of [null,[],'x',[text.slice(1)],[text,42],Array(MAX_SAMPLES+1).fill(text),['!'.repeat(684)],[btoa('\\0'.repeat(512))]])assert.equal(validEncodedSamples(bad),false);
 // Landmarks: eyes level, nose centred means facing the camera; nose shifted means turned.
 assert.equal(headTurn([[0,0],[100,0],[50,40],[20,80],[80,80]]),0);assert.ok(headTurn([[0,0],[100,0],[85,40],[20,80],[80,80]])>.3);assert.ok(headTurn([[0,0],[100,0],[15,40],[20,80],[80,80]])<-.3);
});
