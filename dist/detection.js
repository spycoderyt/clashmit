import {colorProfile,torsoRect} from './shirt.js';
export function createPersonTracker(video,onResult,onStatus){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 let worker,timer,timeout,generation=0,active=false,frameAt=0;
 function fail(message){stop();onStatus(message);}
 function stop(){generation++;active=false;clearTimeout(timer);clearTimeout(timeout);worker?.terminate();worker=null;onResult([],0,0,0);}
 async function frame(){
  if(!active)return;
  if(document.hidden||video.readyState<2||!video.videoWidth){timer=setTimeout(frame,200);return;}
  const g=generation;frameAt=Date.now();canvas.width=640;canvas.height=Math.round(640*video.videoHeight/video.videoWidth);ctx.drawImage(video,0,0,canvas.width,canvas.height);
  try{const bitmap=await createImageBitmap(canvas);if(g!==generation){bitmap.close();return;}timeout=setTimeout(()=>fail('Tracking stalled · tap Retry tracking'),5000);worker.postMessage({type:'frame',bitmap,time:performance.now()},[bitmap]);}catch{if(g===generation)fail('Camera tracking unavailable · tap Retry tracking');}
 }
 function start(){
  stop();active=true;onStatus('Loading person detection…');
  if(!window.Worker||!window.createImageBitmap){fail('This browser cannot run person tracking. Try current Safari or Chrome.');return;}
  worker=new Worker(new URL('./detection-worker.js',import.meta.url));
  timeout=setTimeout(()=>fail('Model loading timed out · tap Retry tracking'),45000);
  worker.onerror=()=>fail('Could not load tracking · tap Retry tracking');
  worker.onmessage=({data})=>{
   clearTimeout(timeout);
   if(data.type==='ready'){onStatus('Looking for people');frame();}
   if(data.type==='error'){console.error('Person tracker:',data.message);fail('Tracking unavailable · tap Retry tracking');}
   if(data.type==='detections'){
    const detections=data.detections.flatMap(d=>{const r=torsoRect(d.box),x=Math.max(0,Math.round(r.x)),y=Math.max(0,Math.round(r.y)),w=Math.min(canvas.width-x,Math.round(r.width)),h=Math.min(canvas.height-y,Math.round(r.height));if(w<12||h<12)return[];return[{...d,profile:colorProfile(ctx.getImageData(x,y,w,h).data)}];});
    onResult(detections,canvas.width,canvas.height,frameAt);onStatus(detections.length?`${detections.length} person${detections.length===1?'':'s'} detected`:'Looking for people');timer=setTimeout(frame,120);
   }
  };
  worker.postMessage({type:'init'});
 }
 return{start,stop};
}
