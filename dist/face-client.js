// One shared worker for the face scan dialog and the in-game tracker, so the 30 MB engine
// is loaded once. detect() takes regions of a camera frame and resolves with the faces in them.
let worker=null,ready=null,seq=0;const pending=new Map(),listeners=new Set();
export function startFaceEngine(onProgress){
 if(onProgress)listeners.add(onProgress);
 ready??=new Promise((resolve,reject)=>{
  try{worker=new Worker(new URL('./face-worker.js?v=face13',import.meta.url),{type:'module'});}catch(e){reject(e);return;}
  worker.onerror=e=>{const error=Error(e.message||'Face engine failed to start');reject(error);for(const entry of pending.values())entry.reject(error);pending.clear();worker=null;ready=null;};
  worker.onmessage=({data})=>{
   if(data.type==='progress')for(const listener of listeners)listener(data.text);
   else if(data.type==='ready'){listeners.clear();resolve();}
   else if(data.type==='error'){worker?.terminate();worker=null;ready=null;reject(Error(data.message));}
   else if(data.type==='faces'){const entry=pending.get(data.seq);pending.delete(data.seq);if(!entry)return;if(data.error)entry.reject(Error(data.error));else entry.resolve(data);}
  };
  worker.postMessage({type:'init'});
 });
 return ready;
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
 const prepared=[];for(const r of regions)prepared.push({x:r.x,y:r.y,width:r.width,height:r.height,detectSize:r.detectSize,minScore:r.minScore,full:!!r.full,bitmap:await grabRegion(source,r,r.maxSize||640)});
 const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});worker.postMessage({type:'frame',seq:id,regions:prepared,...options},prepared.map(r=>r.bitmap));});
}
export const clampRegion=(r,width,height)=>{const w=Math.min(width,Math.max(1,Math.round(r.width))),h=Math.min(height,Math.max(1,Math.round(r.height))),x=Math.round(Math.min(width-w,Math.max(0,r.x))),y=Math.round(Math.min(height-h,Math.max(0,r.y)));return{x,y,width:w,height:h};};
