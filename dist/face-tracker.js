// In-game face lock. Feeds camera regions to the recognition worker, keeps the tracks in
// face-tracks.js up to date, and wakes the person detector only while a named player's face
// is hidden, so their body carries the lock until the face comes back.
import {createFaceTracks} from './face-tracks.js?v=face13';
import {startFaceEngine,detectFaces,grabRegion,clampRegion} from './face-client.js?v=face13';
const FULL_EVERY_MS=700,RETICLE_EVERY_MS=500,BODY_EVERY_MS=250,BODY_IDLE_MS=1200,MIN_TICK_MS=50;
// A face half hidden behind a phone scores lower with the detector. Searches stay fairly strict so stray
// patterns are not boxed, but a face already being followed is allowed to score much lower.
const SEARCH_SCORE=.45,FOLLOW_SCORE=.3;
export function createFaceTracker(video,{getGallery,onStatus=()=>{},focus={x:.5,y:.4}}){
 const tracks=createFaceTracks();
 let active=false,generation=0,timer=null,width=0,height=0,lastFrameAt=0,lastFull=0,lastReticle=0,tight=false,bodyWorker=null,bodyReady=false,bodyBusy=false,lastBodies=0,bodySeq=0;
 function startBodyWorker(){
  if(bodyWorker||!window.Worker)return;
  try{bodyWorker=new Worker(new URL('./detection-worker.js?v=face13',import.meta.url));}catch{return;}
  bodyWorker.onerror=()=>{bodyWorker?.terminate();bodyWorker=null;bodyReady=false;bodyBusy=false;};
  bodyWorker.onmessage=({data})=>{
   if(data.type==='ready'){bodyReady=true;return;}
   if(data.type==='error'){bodyBusy=false;return;}
   if(data.type==='detections'&&bodyWorker?.sent){const {at,k}=bodyWorker.sent;bodyBusy=false;tracks.updateBodies(data.detections.map(d=>({score:d.score,box:{originX:d.box.originX*k,originY:d.box.originY*k,width:d.box.width*k,height:d.box.height*k}})),at);}
  };
  bodyWorker.postMessage({type:'init'});
 }
 async function requestBodies(at,every=BODY_EVERY_MS){
  if(!bodyReady||bodyBusy||at-lastBodies<every)return;bodyBusy=true;lastBodies=at;
  try{const bitmap=await grabRegion(video,{x:0,y:0,width,height},640);if(!active||!bodyWorker){bitmap.close();bodyBusy=false;return;}bodyWorker.sent={at,k:width/bitmap.width};bodyWorker.postMessage({type:'frame',bitmap,time:++bodySeq*40,faceFrames:[]},[bitmap]);}
  catch{bodyBusy=false;}
 }
 async function tick(){
  if(!active)return;const g=generation,started=Date.now();
  if(document.hidden||video.readyState<2||!video.videoWidth){timer=setTimeout(tick,120);return;}
  width=video.videoWidth;height=video.videoHeight;const at=started,point={x:focus.x*width,y:focus.y*height},regions=[];
  // Cheap pass: a small native-resolution window around each face already being followed.
  for(const r of tracks.regions(at,2,point))regions.push({...clampRegion(r,width,height),maxSize:384,detectSize:320,minScore:FOLLOW_SCORE});
  if(!regions.length||at-lastFull>FULL_EVERY_MS){regions.length=Math.min(regions.length,1);regions.push({x:0,y:0,width,height,maxSize:640,detectSize:640,full:true,minScore:SEARCH_SCORE});lastFull=at;}
  else if(regions.length<2&&at-lastReticle>RETICLE_EVERY_MS&&!regions.some(r=>point.x>r.x&&point.x<r.x+r.width&&point.y>r.y&&point.y<r.y+r.height)){
   // Search where the player is aiming, at more pixels per face than the full frame gives. On 4K
   // cameras alternate a wide window with a tight native-resolution one for distant faces.
   tight=width>2000&&!tight;const w=tight?640:Math.max(640,width/3),h=Math.min(height,w*3/4);
   regions.push({...clampRegion({x:point.x-w/2,y:point.y-h/2,width:w,height:h},width,height),maxSize:640,detectSize:640,minScore:SEARCH_SCORE});lastReticle=at;
  }
  try{
   const result=await detectFaces(video,regions,{known:tracks.knownBoxes(at),describeMax:2,focus:point,upper:true});if(!active||g!==generation)return;
   // A pass that only looked inside small windows says nothing about faces elsewhere, so tracks outside
   // those windows simply keep coasting until the next full-frame pass.
   tracks.updateFaces(result.faces,at,getGallery());lastFrameAt=at;
   const named=tracks.list(at).filter(t=>t.id);onStatus(named.length?`Face lock · ${named.length} player${named.length>1?'s':''} · ${Math.round(result.ms)}ms`:result.faces.length?`Identifying · ${Math.round(result.ms)}ms`:'Looking for players');
   // Often while a named face is hidden; occasionally otherwise, so the body is already bound when the face goes.
   if(tracks.needsBodies(at))void requestBodies(at);else if(tracks.wantsBodies(at))void requestBodies(at,BODY_IDLE_MS);
  }catch(e){if(active&&g===generation)onStatus('Face tracking paused · '+(e.message||'retrying'));}
  if(active&&g===generation)timer=setTimeout(tick,Math.max(0,MIN_TICK_MS-(Date.now()-started)));
 }
 return{
  async start(){
   this.stop();active=true;const g=++generation;onStatus('Loading face recognition…');
   try{await startFaceEngine(text=>{if(active&&g===generation)onStatus(text);});}catch(e){if(g===generation){active=false;onStatus('Face recognition could not load. Check the connection and retry.');}return;}
   if(!active||g!==generation)return;startBodyWorker();onStatus('Looking for players');tick();
  },
  stop(){active=false;generation++;clearTimeout(timer);tracks.reset();lastFrameAt=0;lastFull=0;bodyBusy=false;},
  dispose(){this.stop();bodyWorker?.terminate();bodyWorker=null;bodyReady=false;},
  reset(){tracks.reset();},
  targets:(now=Date.now())=>tracks.list(now),
  size:()=>({width,height}),
  lastFrameAt:()=>lastFrameAt,
 };
}
