import {findHeadbands,mapBand,personSearchRegion,associateHeadbands,bandColor} from './headband.js?v=headband1';
export function createPersonTracker(video,onResult,onStatus,getProfiles){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 const colors=document.createElement('canvas'),colorCtx=colors.getContext('2d',{willReadFrequently:true});
 const colorBuffers={};
 let worker,timer,timeout,generation=0,active=false,frameAt=0,inputWidth=0,inputHeight=0,bands=[],region;
 function fail(message){stop();onStatus(message);}
 function stop(){generation++;active=false;clearTimeout(timer);clearTimeout(timeout);worker?.terminate();worker=null;onResult([],0,0,0);}
 async function frame(){
  if(!active)return;
  if(document.hidden||video.readyState<2||!video.videoWidth){timer=setTimeout(frame,100);return;}
  const profiles=getProfiles(),g=generation;frameAt=Date.now();
  if(!bandColor(profiles.opponent?.rgb)){onResult([],0,0,frameAt);onStatus('Scan a red or blue headband first');timer=setTimeout(frame,200);return;}
  canvas.width=Math.min(1280,video.videoWidth);canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);ctx.drawImage(video,0,0,canvas.width,canvas.height);
  colors.width=Math.min(640,canvas.width);colors.height=Math.round(colors.width*canvas.height/canvas.width);colorCtx.drawImage(canvas,0,0,colors.width,colors.height);
  bands=findHeadbands(colorCtx.getImageData(0,0,colors.width,colors.height),profiles.opponent,profiles.own,colorBuffers).map(b=>mapBand(b,canvas.width/colors.width,canvas.height/colors.height));
  if(!bands.length){onResult([],canvas.width,canvas.height,frameAt);onStatus(`Looking for ${bandColor(profiles.opponent.rgb)} headband`);timer=setTimeout(frame,60);return;}
  // The color candidate guides a stable body search, with no alternating crops.
  region=personSearchRegion(bands,canvas.width,canvas.height);
  onStatus('Band color found · checking person');
  try{const bitmap=await createImageBitmap(canvas,Math.floor(region.x),Math.floor(region.y),Math.ceil(region.width),Math.ceil(region.height),{resizeWidth:640,resizeHeight:Math.round(640*region.height/region.width)});if(g!==generation){bitmap.close();return;}inputWidth=bitmap.width;inputHeight=bitmap.height;timeout=setTimeout(()=>fail('Tracking stalled · tap Retry tracking'),5000);worker.postMessage({type:'frame',bitmap,time:performance.now()},[bitmap]);}catch{if(g===generation)fail('Camera tracking unavailable · tap Retry tracking');}
 }
 function start(){
  stop();active=true;onStatus('Loading person confirmation…');
  if(!window.Worker||!window.createImageBitmap){fail('This browser cannot run tracking. Try current Safari or Chrome.');return;}
  worker=new Worker(new URL('./detection-worker.js?v=headband1',import.meta.url));
  timeout=setTimeout(()=>fail('Model loading timed out · tap Retry tracking'),45000);
  worker.onerror=()=>fail('Could not load tracking · tap Retry tracking');
  worker.onmessage=({data})=>{
   clearTimeout(timeout);
   if(data.type==='ready')frame();
   if(data.type==='error'){console.error('Person confirmation:',data.message);fail('Tracking unavailable · tap Retry tracking');}
   if(data.type==='detections'){
    const people=data.detections.map(d=>({...d,box:{originX:region.x+d.box.originX*region.width/inputWidth,originY:region.y+d.box.originY*region.height/inputHeight,width:d.box.width*region.width/inputWidth,height:d.box.height*region.height/inputHeight}}));
    const confirmed=associateHeadbands(bands,people),elapsed=Date.now()-frameAt;
    onResult(confirmed,canvas.width,canvas.height,frameAt);
    onStatus(elapsed>650?'Tracking slow · hold still':confirmed.length>1?'Multiple matching headbands · uncertain':confirmed.length?`Headband + person · ${elapsed}ms`:'Color seen · no headband/person match');timer=setTimeout(frame,60);
   }
  };
  worker.postMessage({type:'init'});
 }
 return{start,stop};
}
