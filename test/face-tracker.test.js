import test from 'node:test';
import assert from 'node:assert/strict';
import {createFaceTracker} from '../dist/face-tracker.js';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(predicate){const deadline=Date.now()+700;while(!predicate()){if(Date.now()>deadline)assert.fail('tracker did not complete a frame');await wait(5);}}

test('camera tracker avoids duplicate frames and discards body results from an earlier tracking session',async()=>{
 const names=['document','window','Worker','createImageBitmap'],originals=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 let holdFaceReplies=false;const workers=[],descriptor=Array(512).fill(0);descriptor[0]=1;
 const face={box:{x:200,y:100,width:80,height:100},score:.99,pixels:80,descriptor};
 class FakeWorker{
  constructor(url){this.face=String(url).includes('face-worker');this.frames=0;workers.push(this);}
  postMessage(data){if(data.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));else if(data.type==='frame'){
   this.frames++;
   if(this.face){this.pending=data;if(!holdFaceReplies)queueMicrotask(()=>this.respondFace());}
  }}
  respondFace(){const data=this.pending;this.pending=null;if(data)this.onmessage?.({data:{type:'faces',seq:data.seq,faces:[face],ms:10}});}
  bodies(){this.onmessage?.({data:{type:'detections',detections:[{score:.99,box:{originX:160,originY:80,width:180,height:360}}]}});}
  terminate(){}
 }
 globalThis.Worker=FakeWorker;globalThis.window={Worker:FakeWorker};
 globalThis.document={hidden:false,createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}})})};
 globalThis.createImageBitmap=async canvas=>({width:canvas.width,height:canvas.height,close(){}});
 const video={readyState:2,videoWidth:640,videoHeight:480,currentTime:0};
 const tracker=createFaceTracker(video,{getGallery:()=>[{id:'ada',name:'Ada',samples:[descriptor]}]});
 try{
  await tracker.start();const faceWorker=workers.find(w=>w.face);await until(()=>faceWorker.frames===1);await wait(80);
  assert.equal(faceWorker.frames,1,'no repeated inference over an unchanged camera frame');
  async function advance(){const before=faceWorker.frames;video.currentTime+=.1;await until(()=>faceWorker.frames>before);await wait(5);}
  await advance();await advance();assert.equal(tracker.targets()[0].id,'ada');
  // Slow recognition must still reuse a verified identity on the next detection pass.
  holdFaceReplies=true;let slowBefore=faceWorker.frames;video.currentTime+=.1;await until(()=>faceWorker.frames>slowBefore);
  const actualNow=Date.now;try{Date.now=()=>actualNow()+300;faceWorker.respondFace();await wait(5);}finally{Date.now=actualNow;}
  slowBefore=faceWorker.frames;video.currentTime+=.1;await until(()=>faceWorker.frames>slowBefore);
  assert.equal(faceWorker.pending.describeMax,1);assert.equal(faceWorker.pending.known.length,1,'slow phones skip repeated descriptors for the verified face');
  faceWorker.respondFace();holdFaceReplies=false;await wait(5);
  await advance();const bodyWorker=workers.find(w=>!w.face);await until(()=>bodyWorker?.frames===1);
  tracker.stop();await tracker.start();await until(()=>faceWorker.frames===7);await advance();await advance();
  assert.equal(tracker.targets()[0].id,'ada');
  bodyWorker.bodies();assert.equal(tracker.targets()[0].bodyBox,null,'late old body result cannot attach to newly recognized player');
  await wait(650);await advance();await wait(650);await advance();await until(()=>bodyWorker.frames===2);bodyWorker.bodies();
  assert.ok(tracker.targets()[0].bodyBox,'new session still accepts its own fresh body result');
  holdFaceReplies=true;let before=faceWorker.frames;video.currentTime+=.1;await until(()=>faceWorker.frames>before);
  before=faceWorker.frames;tracker.stop();await tracker.start();await wait(80);
  assert.equal(faceWorker.frames,before,'restart waits for old inference instead of overlapping expensive face work');
  faceWorker.respondFace();await until(()=>faceWorker.frames>before);faceWorker.respondFace();await wait(10);
  before=faceWorker.frames;video.currentTime+=.1;await until(()=>faceWorker.frames>before);
  const lastSeen=tracker.lastFrameAt();document.hidden=true;faceWorker.respondFace();await wait(20);
  assert.equal(tracker.lastFrameAt(),lastSeen,'a result finishing in the background cannot refresh face lock');
  before=faceWorker.frames;video.currentTime+=.1;await wait(80);assert.equal(faceWorker.frames,before,'hidden pages suspend inference');
  document.hidden=false;video.currentTime+=.1;await until(()=>faceWorker.frames>before);
  const realNow=Date.now,seenBeforeSlow=tracker.lastFrameAt();
  try{Date.now=()=>realNow()+2500;faceWorker.respondFace();await wait(10);}finally{Date.now=realNow;}
  assert.equal(tracker.lastFrameAt(),seenBeforeSlow,'a 2.5-second result cannot revive the target');
  before=faceWorker.frames;video.currentTime+=.1;await until(()=>faceWorker.frames>before);
  assert.equal(faceWorker.pending.regions.length,1,'discarded slow inference lowers the next pass budget');
  assert.ok(faceWorker.pending.regions[0].detectSize<=320);assert.equal(faceWorker.pending.describeMax,1);
  assert.equal(faceWorker.pending.upper,true,'phones in front of faces still get upper-face recognition');
  faceWorker.respondFace();await wait(10);

 }finally{
  tracker.dispose();
  for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
 }
});
