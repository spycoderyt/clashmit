import {colorProfile,torsoRect} from './shirt.js';
export function createPersonTracker(video,onResult,onStatus){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 let worker,timer,timeout,generation=0,active=false,frameAt=0,crop,frameCount=0,zoom=false;
 function fail(message){stop();onStatus(message);}
 function stop(){generation++;active=false;clearTimeout(timer);clearTimeout(timeout);worker?.terminate();worker=null;onResult([],0,0,0);}
 async function frame(){
  if(!active)return;
  if(document.hidden||video.readyState<2||!video.videoWidth){timer=setTimeout(frame,100);return;}
  const g=generation;frameAt=Date.now();canvas.width=Math.min(1280,video.videoWidth);canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);ctx.drawImage(video,0,0,canvas.width,canvas.height);
  // A center crop makes distant bodies larger in the detector's fixed-size input.
  // Alternate full/cropped views in far mode; color always comes from original pixels.
  const cropped=zoom&&frameCount++%3!==0,rect=video.getBoundingClientRect();
  const scale=Math.max(rect.width/canvas.width,rect.height/canvas.height);
  const visibleW=rect.width/scale,visibleH=rect.height/scale;
  const width=cropped?visibleW*.7:canvas.width,height=cropped?visibleH*.7:canvas.height;
  crop={x:cropped?(canvas.width-width)/2:0,y:cropped?Math.max(0,Math.min(canvas.height-height,canvas.height/2-visibleH*.1-height/2)):0,width,height};
  try{const bitmap=await createImageBitmap(canvas,Math.round(crop.x),Math.round(crop.y),Math.round(width),Math.round(height),{resizeWidth:640,resizeHeight:Math.round(640*height/width)});if(g!==generation){bitmap.close();return;}crop.bitmapW=bitmap.width;crop.bitmapH=bitmap.height;timeout=setTimeout(()=>fail('Tracking stalled · tap Retry tracking'),5000);worker.postMessage({type:'frame',bitmap,time:performance.now()},[bitmap]);}catch{if(g===generation)fail('Camera tracking unavailable · tap Retry tracking');}
 }
 function start(){
  stop();active=true;frameCount=0;onStatus('Loading person detection…');
  if(!window.Worker||!window.createImageBitmap){fail('This browser cannot run person tracking. Try current Safari or Chrome.');return;}
  worker=new Worker(new URL('./detection-worker.js?v=tracking2',import.meta.url));
  timeout=setTimeout(()=>fail('Model loading timed out · tap Retry tracking'),45000);
  worker.onerror=()=>fail('Could not load tracking · tap Retry tracking');
  worker.onmessage=({data})=>{
   clearTimeout(timeout);
   if(data.type==='ready'){onStatus('Looking for people');frame();}
   if(data.type==='error'){console.error('Person tracker:',data.message);fail('Tracking unavailable · tap Retry tracking');}
   if(data.type==='detections'){
    let small=0;
    const detections=data.detections.map(d=>{
     const box={originX:crop.x+d.box.originX*crop.width/crop.bitmapW,originY:crop.y+d.box.originY*crop.height/crop.bitmapH,width:d.box.width*crop.width/crop.bitmapW,height:d.box.height*crop.height/crop.bitmapH};
     const r=torsoRect(box),x=Math.max(0,Math.round(r.x)),y=Math.max(0,Math.round(r.y)),w=Math.min(canvas.width-x,Math.round(r.width)),h=Math.min(canvas.height-y,Math.round(r.height));
     if(w<6||h<6){small++;return{...d,box,profile:null};}
     return{...d,box,sampleWidth:w,profile:colorProfile(ctx.getImageData(x,y,w,h).data)};
    });
    const elapsed=Date.now()-frameAt;onResult(detections,canvas.width,canvas.height,frameAt);
    onStatus(elapsed>650?'Tracking slow · hold still':small?'Shirt too small · use Far mode':`${zoom?'Far':'Wide'} · ${detections.length} seen · ${elapsed}ms`);timer=setTimeout(frame,40);
   }
  };
  worker.postMessage({type:'init'});
 }
 return{start,stop,setZoom(value){zoom=value;}};
}
