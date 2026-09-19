import {torsoPatches} from './shirt-coverage.js?v=coverage1';
export function createPersonTracker(video,onResult,onStatus){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 const sample=document.createElement('canvas');sample.width=sample.height=32;const sampleCtx=sample.getContext('2d',{willReadFrequently:true});
 let worker,timer,timeout,generation=0,active=false,frameAt=0,inputWidth=0,inputHeight=0;
 function fail(message){stop();onStatus(message);}
 function stop(){generation++;active=false;clearTimeout(timer);clearTimeout(timeout);worker?.terminate();worker=null;onResult([],0,0,0);}
 async function frame(){
  if(!active)return;
  if(document.hidden||video.readyState<2||!video.videoWidth){timer=setTimeout(frame,100);return;}
  const g=generation;frameAt=Date.now();canvas.width=Math.min(1280,video.videoWidth);canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);ctx.drawImage(video,0,0,canvas.width,canvas.height);
  try{const bitmap=await createImageBitmap(canvas,{resizeWidth:640,resizeHeight:Math.round(640*canvas.height/canvas.width)});if(g!==generation){bitmap.close();return;}inputWidth=bitmap.width;inputHeight=bitmap.height;timeout=setTimeout(()=>fail('Tracking stalled · tap Retry tracking'),5000);worker.postMessage({type:'frame',bitmap,time:performance.now()},[bitmap]);}catch{if(g===generation)fail('Camera tracking unavailable · tap Retry tracking');}
 }
 function start(){
  stop();active=true;onStatus('Loading person detection…');
  if(!window.Worker||!window.createImageBitmap){fail('This browser cannot run person tracking. Try current Safari or Chrome.');return;}
  worker=new Worker(new URL('./detection-worker.js?v=coverage1',import.meta.url));
  timeout=setTimeout(()=>fail('Model loading timed out · tap Retry tracking'),45000);
  worker.onerror=()=>fail('Could not load tracking · tap Retry tracking');
  worker.onmessage=({data})=>{
   clearTimeout(timeout);
   if(data.type==='ready'){onStatus('Looking for people');frame();}
   if(data.type==='error'){console.error('Person tracker:',data.message);fail('Tracking unavailable · tap Retry tracking');}
   if(data.type==='detections'){
    let small=0;
    const detections=data.detections.map(d=>{
     const box={originX:d.box.originX*canvas.width/inputWidth,originY:d.box.originY*canvas.height/inputHeight,width:d.box.width*canvas.width/inputWidth,height:d.box.height*canvas.height/inputHeight};
     const patches=torsoPatches(box).flatMap(r=>{
      const x=Math.max(0,r.x),y=Math.max(0,r.y),w=Math.min(canvas.width,r.x+r.width)-x,h=Math.min(canvas.height,r.y+r.height)-y;
      // Upscaling cannot manufacture shirt detail. Reject genuinely tiny/clipped patches.
      if(w<8||h<8||w*h<r.width*r.height*.85)return[];
      sampleCtx.drawImage(canvas,x,y,w,h,0,0,32,32);return[{data:sampleCtx.getImageData(0,0,32,32).data}];
     });
     if(patches.length<2)small++;
     return{...d,box,patches};
    });
    const elapsed=Date.now()-frameAt;onResult(detections,canvas.width,canvas.height,frameAt);
    onStatus(elapsed>650?'Tracking slow · hold still':small?'Shirt uncertain · move closer':`${detections.length} seen · ${elapsed}ms`);timer=setTimeout(frame,40);
   }
  };
  worker.postMessage({type:'init'});
 }
 return{start,stop};
}
