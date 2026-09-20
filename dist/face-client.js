// One shared worker for the face scan dialog and the in-game tracker, so the 30 MB engine
// is loaded once. detect() takes regions of a camera frame and resolves with the faces in them.
const INIT_TIMEOUT_MS=60000,MAX_INIT_MS=180000,FRAME_TIMEOUT_MS=3000;
let worker=null,ready=null,session=null,seq=0;const pending=new Map(),listeners=new Set();
function failSession(current,error){
 if(session!==current)return;
 clearTimeout(current.initTimer);clearTimeout(current.totalTimer);current.reject(error);
 current.worker?.terminate();worker=null;ready=null;session=null;listeners.clear();
 for(const entry of pending.values()){clearTimeout(entry.timer);entry.reject(error);}pending.clear();
}
export function startFaceEngine(onProgress){
 if(onProgress&&!session?.initialized){listeners.add(onProgress);if(session?.progress)onProgress(session.progress);}
 if(ready)return ready;
 const current={worker:null,initialized:false,initTimer:null,totalTimer:null,progress:null,reject:null};session=current;
 let resolveInit,rejectInit;
 const promise=new Promise((resolve,reject)=>{resolveInit=resolve;rejectInit=reject;});
 ready=promise;current.reject=rejectInit;
 try{
  worker=current.worker=new Worker(new URL('./face-worker.js?v=face13',import.meta.url),{type:'module'});
  worker.onerror=e=>failSession(current,Error(e.message||'Face engine failed to start'));
  worker.onmessageerror=()=>failSession(current,Error('Face engine could not communicate. Tap Try again.'));
  worker.onmessage=({data})=>{
   if(session!==current)return; // A late reply from a replaced worker cannot change the new session.
   if(data.type==='progress'){current.progress=data.text;if(!current.initialized){clearTimeout(current.initTimer);current.initTimer=setTimeout(()=>failSession(current,Error('Face engine did not finish loading. Tap Try again.')),INIT_TIMEOUT_MS);}for(const listener of listeners){try{listener(data.text);}catch{}}}
   else if(data.type==='ready'){clearTimeout(current.initTimer);clearTimeout(current.totalTimer);current.initialized=true;listeners.clear();resolveInit();}
   else if(data.type==='error')failSession(current,Error(data.message));
   else if(data.type==='faces'){const entry=pending.get(data.seq);if(!entry)return;pending.delete(data.seq);clearTimeout(entry.timer);if(data.error)entry.reject(Error(data.error));else entry.resolve(data);}
  };
  current.initTimer=setTimeout(()=>failSession(current,Error('Face engine did not finish loading. Tap Try again.')),INIT_TIMEOUT_MS);
  current.totalTimer=setTimeout(()=>failSession(current,Error('Face engine did not finish loading. Check your connection and tap Try again.')),MAX_INIT_MS);
  worker.postMessage({type:'init'});
 }catch(error){failSession(current,error);}
 return promise;
}
const canvases=new Map();
// Copies one region of a video/canvas into an ImageBitmap no larger than maxSize on its long side.
export async function grabRegion(source,region,maxSize){
 const scale=Math.min(1,maxSize/Math.max(region.width,region.height)),w=Math.max(1,Math.round(region.width*scale)),h=Math.max(1,Math.round(region.height*scale)),key=`${w}x${h}`;
 let canvas=canvases.get(key);if(!canvas){if(canvases.size>12)canvases.clear();canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;canvases.set(key,canvas);}
 canvas.getContext('2d').drawImage(source,region.x,region.y,region.width,region.height,0,0,w,h);return createImageBitmap(canvas);
}
// regions: [{x,y,width,height,maxSize,detectSize,full}] in source pixels.
export async function detectFaces(source,regions,options={}){
 await startFaceEngine();
 const current=session,prepared=[];let transferred=false;
 try{
  for(const r of regions)prepared.push({x:r.x,y:r.y,width:r.width,height:r.height,detectSize:r.detectSize,minScore:r.minScore,full:!!r.full,bitmap:await grabRegion(source,r,r.maxSize||640)});
  if(!current||session!==current)throw Error('Face engine restarted. Retrying.');
  const id=++seq;
  return await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>failSession(current,Error('Face tracking did not respond. Retrying.')),FRAME_TIMEOUT_MS);
   pending.set(id,{resolve,reject,timer});
   try{current.worker.postMessage({type:'frame',seq:id,regions:prepared,...options},prepared.map(r=>r.bitmap));transferred=true;}
   catch(error){failSession(current,error);}
  });
 }finally{if(!transferred)for(const region of prepared)region.bitmap.close?.();}
}
export const clampRegion=(r,width,height)=>{const w=Math.min(width,Math.max(1,Math.round(r.width))),h=Math.min(height,Math.max(1,Math.round(r.height))),x=Math.round(Math.min(width-w,Math.max(0,r.x))),y=Math.round(Math.min(height-h,Math.max(0,r.y)));return{x,y,width:w,height:h};};
