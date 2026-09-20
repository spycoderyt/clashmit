import test from 'node:test';
import assert from 'node:assert/strict';
import {MATCH,DESCRIPTOR_LENGTH,FACE_TEMPLATE,descriptorDistance,validDescriptor,matchFace,createIdentityVoter,addSample,estimateMetres,summarize,alignmentTransform} from '../dist/face-id.js';
// Deterministic stand-ins for ArcFace output: unit vectors, where one person's photos are their
// base direction plus a small wobble and different people are unrelated directions.
const direction=seed=>{let s=seed*2654435761%4294967296;return Array.from({length:DESCRIPTOR_LENGTH},()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296-.5;});};
const unit=v=>{const n=Math.hypot(...v);return v.map(x=>x/n);};
const face=(person,photo=0,wobble=.4)=>{const base=unit(direction(person)),noise=unit(direction(person*1000+photo+7));return unit(base.map((x,i)=>x+(photo?wobble*noise[i]:0)));};
const near=(actual,expected,tolerance)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} is not within ${tolerance} of ${expected}`);
test('unit descriptors: one person stays close, different people sit near 1.41',()=>{
 assert.equal(descriptorDistance(face(1),face(1)),0);near(descriptorDistance(face(1),face(1,2)),.39,.05);near(descriptorDistance(face(1),face(2)),1.41,.12);
 assert.ok(validDescriptor(face(1)));assert.ok(validDescriptor(new Float32Array(DESCRIPTOR_LENGTH)));
 for(const bad of [null,[],face(1).slice(1),new Array(128).fill(0),[...face(1).slice(1),NaN]])assert.equal(validDescriptor(bad),false);
});
test('a face is matched only when it is clearly one enrolled player and large enough',()=>{
 const gallery=[{id:'a',name:'Ada',samples:[face(1),face(1,3)]},{id:'b',name:'Bo',samples:[face(2)]},{id:'c',name:'Empty',samples:[]}];
 const ada=matchFace(face(1,5),gallery,{facePx:80});assert.equal(ada.id,'a');assert.equal(ada.confident,true);assert.ok(ada.distance<MATCH.threshold&&ada.runnerUp-ada.distance>MATCH.margin);
 const stranger=matchFace(face(9),gallery,{facePx:80});assert.equal(stranger.confident,false);assert.ok(stranger.distance>MATCH.threshold);
 // The same good descriptor on a tiny face is reported but never trusted.
 const tiny=matchFace(face(1,5),gallery,{facePx:MATCH.minFacePx-1});assert.equal(tiny.id,'a');assert.equal(tiny.tooSmall,true);assert.equal(tiny.confident,false);
 // Two enrolled people who look alike: the closest is reported but not trusted.
 const twins=[{id:'a',name:'Ada',samples:[face(1)]},{id:'t',name:'Twin',samples:[face(1,7,.1)]}];
 const unsure=matchFace(face(1,2,.05),twins);assert.ok(unsure.distance<MATCH.threshold);assert.ok(unsure.runnerUp-unsure.distance<MATCH.margin);assert.equal(unsure.confident,false);
 assert.equal(matchFace(face(1),[]).confident,false);assert.equal(matchFace(face(1),[]).id,null);
});
test('identity needs several agreeing frames and is withheld when frames disagree',()=>{
 const voter=createIdentityVoter({window:5,needed:3}),yes=id=>({id,confident:true}),no={id:'a',confident:false};
 assert.equal(voter.push(yes('a')).id,null);assert.equal(voter.push(no).id,null);assert.equal(voter.push(yes('a')).id,null);
 assert.deepEqual(voter.push(yes('a')),{id:'a',votes:3});
 // One confident frame for somebody else breaks the lock until it ages out of the window.
 assert.equal(voter.push(yes('b')).id,null);for(let i=0;i<4;i++)voter.push(yes('a'));assert.equal(voter.identity.id,null);assert.deepEqual(voter.push(yes('a')),{id:'a',votes:5});
 // Unconfident frames alone never identify anyone, and reset forgets everything.
 voter.reset();for(let i=0;i<10;i++)assert.equal(voter.push(no).id,null);assert.equal(voter.push(null).id,null);
});
test('enrolment keeps varied samples and ignores duplicates, junk and overflow',()=>{
 const person={id:'a',name:'Ada',samples:[]};
 assert.equal(addSample(person,face(1)),true);assert.equal(addSample(person,face(1)),false);assert.equal(addSample(person,face(1,2,.1)),false);assert.equal(addSample(person,face(1,4,.6)),true);
 assert.equal(addSample(person,[1,2,3]),false);assert.equal(person.samples.length,2);assert.ok(Array.isArray(person.samples[0]));
 const full={samples:[]};for(let i=1;i<40;i++)addSample(full,face(i));assert.equal(full.samples.length,8);
});
test('range estimate follows apparent face width',()=>{
 const at2m=estimateMetres(107,1920),at4m=estimateMetres(53.5,1920);near(at4m/at2m,2,1e-9);assert.ok(at2m>1.5&&at2m<2.6);
 assert.equal(estimateMetres(0,1920),null);assert.equal(estimateMetres(50,0),null);
});
test('a recording reports detection, right and wrong identification rates',()=>{
 const frames=[{found:true,id:'a',distance:.4,facePx:60,ms:80},{found:true,id:null,distance:.9,facePx:58,ms:90},{found:true,id:'b',distance:.8,facePx:62,ms:100},{found:false,ms:70}];
 const s=summarize(frames,'a');assert.equal(s.frames,4);near(s.detectRate,.75,1e-9);near(s.rightRate,.25,1e-9);near(s.wrongRate,.25,1e-9);near(s.medianDistance,.8,1e-9);assert.equal(s.medianFacePx,60);assert.equal(s.medianMs,85);
 // With a stranger in view every identification is a false alarm.
 const stranger=summarize(frames);assert.equal(stranger.rightRate,0);near(stranger.wrongRate,.5,1e-9);
 assert.deepEqual(summarize([]),{frames:0,detectRate:0,rightRate:0,wrongRate:0,medianDistance:null,medianFacePx:null,medianMs:null});
});
test('face alignment maps eye, nose and mouth landmarks onto the recogniser template',()=>{
 // Landmarks that are the template rotated 20 degrees, scaled 3x and moved must map straight back.
 const template=FACE_TEMPLATE,angle=20*Math.PI/180,scale=3;
 const landmarks=template.map(([x,y])=>[scale*(x*Math.cos(angle)-y*Math.sin(angle))+400,scale*(x*Math.sin(angle)+y*Math.cos(angle))+250]);
 const {a,b,tx,ty}=alignmentTransform(landmarks);near(Math.hypot(a,b),1/scale,1e-9);
 landmarks.forEach(([x,y],i)=>{near(a*x-b*y+tx,template[i][0],1e-6);near(b*x+a*y+ty,template[i][1],1e-6);});
});
