// In-game face lock. Feeds camera regions to the recognition worker, keeps the tracks in
// face-tracks.js up to date, and wakes the person detector only while a named player's face
// is hidden, so their body carries the lock until the face comes back.
import {createFaceTracks,LOCK} from './face-tracks.js?v=damage1';
import {startFaceEngine,detectFaces,grabRegion} from './face-client.js?v=face13';
import {createFaceSearch,detectionTime,createVideoFrameGate,updateInferenceBudget} from './face-search.js?v=1';
const BODY_EVERY_MS=250,BODY_IDLE_MS=1200,MIN_TICK_MS=50;
// A face half hidden behind a phone scores lower with the detector. Searches stay fairly strict so stray
// patterns are not boxed, but a face already being followed is allowed to score much lower.

export function createFaceTracker(video,{getGallery,onStatus=()=>{},focus={x:.5,y:.4}}){
 const tracks=createFaceTracks(),search=createFaceSearch(),frameGate=createVideoFrameGate();
 let active=false,generation=0,timer=null,width=0,height=0,lastFrameAt=0,bodyWorker=null,bodyReady=false,bodyBusy=false,lastBodies=0,bodySeq=0,inferenceMs=0,inFlight=false;
 function startBodyWorker(){
  if(bodyWorker||!window.Worker)return;
  try{bodyWorker=new Worker(new URL('./detection-worker.js?v=face13',import.meta.url));}catch{return;}
  const worker=bodyWorker;
  bodyWorker.onerror=()=>{if(worker!==bodyWorker)return;bodyWorker?.terminate();bodyWorker=null;bodyReady=false;bodyBusy=false;};
  bodyWorker.onmessage=({data})=>{
   if(worker!==bodyWorker)return;
   if(data.type==='ready'){bodyReady=true;return;}
   if(data.type==='error'){bodyBusy=false;return;}
   if(data.type==='detections'&&worker.sent){const {at,k,g}=worker.sent;worker.sent=null;bodyBusy=false;
    if(!active||document.hidden||g!==generation||worker!==bodyWorker||Date.now()-at>LOCK.bodyFreshMs)return;
    tracks.updateBodies(data.detections.map(d=>({score:d.score,box:{originX:d.box.originX*k,originY:d.box.originY*k,width:d.box.width*k,height:d.box.height*k}})),at);}
  };
  bodyWorker.postMessage({type:'init'});
 }
 async function requestBodies(at,every=BODY_EVERY_MS){
  if(document.hidden||!bodyReady||bodyBusy||at-lastBodies<every)return;bodyBusy=true;lastBodies=at;const g=generation,worker=bodyWorker;
  try{const bitmap=await grabRegion(video,{x:0,y:0,width,height},640);if(!active||document.hidden||g!==generation||worker!==bodyWorker){bitmap.close();if(worker===bodyWorker)bodyBusy=false;return;}worker.sent={at,k:width/bitmap.width,g};worker.postMessage({type:'frame',bitmap,time:++bodySeq*40,faceFrames:[]},[bitmap]);}
  catch{if(worker===bodyWorker)bodyBusy=false;}
 }
 async function tick(){
  if(!active)return;const g=generation,started=Date.now();
  // A stop/start must not queue new inference over the old session still finishing.
  if(inFlight){timer=setTimeout(tick,MIN_TICK_MS);return;}
  if(document.hidden||video.readyState<2||!video.videoWidth){timer=setTimeout(tick,120);return;}
  if(!frameGate.take(video)){timer=setTimeout(tick,MIN_TICK_MS);return;}
  width=video.videoWidth;height=video.videoHeight;const point={x:focus.x*width,y:focus.y*height},regions=search.next({width,height,at:started,point,follow:tracks.regions(started,inferenceMs>220?1:2,point),budgetMs:inferenceMs});
  inFlight=true;tracks.beginFrame(started);
  try{
   const result=await detectFaces(video,regions,{known:inferenceMs>220?[]:tracks.knownBoxes(started),describeMax:inferenceMs>220?1:2,focus:point,upper:true});if(!active||g!==generation)return;
   if(document.hidden){timer=setTimeout(tick,120);return;}
   // A pass that only looked inside small windows says nothing about faces elsewhere, so tracks outside
   // those windows simply keep coasting until the next full-frame pass.
   inferenceMs=updateInferenceBudget(inferenceMs,Date.now()-started);
   const at=detectionTime(started,Date.now());
   if(at===null){onStatus('Tracking is slow · hold the phone steady');timer=setTimeout(tick,100);return;}
   tracks.updateFaces(result.faces,at,getGallery());lastFrameAt=at;
   const named=tracks.list(at).filter(t=>t.id);onStatus(named.length?`Face lock · ${named.length} player${named.length>1?'s':''} · ${Math.round(result.ms)}ms`:result.faces.length?`Identifying · ${Math.round(result.ms)}ms`:'Looking for players');
   // Often while a named face is hidden; occasionally otherwise, so the body is already bound when the face goes.
   // On slower phones, reserve CPU and memory for faces until body fallback is actually needed.
   if(inferenceMs<=220&&named.length&&(inferenceMs<160||tracks.needsBodies(at)))startBodyWorker();
   if(inferenceMs<=220&&tracks.needsBodies(at))void requestBodies(at,Math.max(BODY_EVERY_MS,inferenceMs*4));else if(inferenceMs<160&&tracks.wantsBodies(at))void requestBodies(at,BODY_IDLE_MS);
  }catch(e){if(active&&g===generation)inferenceMs=updateInferenceBudget(inferenceMs,Date.now()-started);if(active&&g===generation)onStatus('Face tracking paused · '+(e.message||'retrying'));}finally{inFlight=false;tracks.endFrame();}
  if(active&&g===generation)timer=setTimeout(tick,Math.max(0,MIN_TICK_MS-(Date.now()-started)));
 }
 return{
  async start(){
   this.stop();active=true;const g=++generation;onStatus('Loading face recognition…');
   try{await startFaceEngine(text=>{if(active&&g===generation)onStatus(text);});}catch(e){if(g===generation){active=false;onStatus('Face recognition could not load. Check the connection and retry.');}return;}
   if(!active||g!==generation)return;onStatus('Looking for players');tick();
  },
  stop(){active=false;generation++;clearTimeout(timer);tracks.reset();lastFrameAt=0;search.reset();frameGate.reset();
   // A previous generation may still be in flight. Do not start another body job over it.
   // Keep bodyBusy until the old bitmap/job finishes, including a capture still awaiting ImageBitmap.
  },
  dispose(){this.stop();bodyWorker?.terminate();bodyWorker=null;bodyReady=false;bodyBusy=false;},
  reset(){tracks.reset();},
  targets:(now=Date.now())=>tracks.list(now),
  size:()=>({width,height}),
  lastFrameAt:()=>lastFrameAt,
 };
}
