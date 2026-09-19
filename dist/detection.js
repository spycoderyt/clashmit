import {findHeadbands,mapBand,createBandContinuity,bandColor} from './headband.js?v=face1';
import {makeDetectionFrame,readDetectionFrame} from './detection-input.js?v=face1';
export function createPersonTracker(video,onResult,onStatus,getProfiles){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
 const colors=document.createElement('canvas'),colorCtx=colors.getContext('2d',{willReadFrequently:true});
 const colorBuffers={},continuity=createBandContinuity();
 let worker,timer,timeout,generation=0,active=false,frameAt=0,bands=[],input,profileKey;
 function fail(message){stop();onStatus(message);}
 function stop(){generation++;active=false;clearTimeout(timer);clearTimeout(timeout);worker?.terminate();worker=null;continuity.reset();onResult([],0,0,0);}
 async function frame(){
  if(!active)return;
  if(document.hidden||video.readyState<2||!video.videoWidth){timer=setTimeout(frame,100);return;}
  const profiles=getProfiles(),g=generation;frameAt=Date.now();
  const key=JSON.stringify([profiles.opponent?.rgb,profiles.own?.rgb]);if(key!==profileKey){continuity.reset();profileKey=key;}
  if(!bandColor(profiles.opponent?.rgb)){onResult([],0,0,frameAt);onStatus('Scan a red or blue headband first');timer=setTimeout(frame,200);return;}
  canvas.width=Math.min(1280,video.videoWidth);canvas.height=Math.round(canvas.width*video.videoHeight/video.videoWidth);ctx.drawImage(video,0,0,canvas.width,canvas.height);
  colors.width=Math.min(640,canvas.width);colors.height=Math.round(colors.width*canvas.height/canvas.width);colorCtx.drawImage(canvas,0,0,colors.width,colors.height);
  bands=findHeadbands(colorCtx.getImageData(0,0,colors.width,colors.height),profiles.opponent,profiles.own,colorBuffers).map(b=>mapBand(b,canvas.width/colors.width,canvas.height/colors.height));
  if(!bands.length){continuity.reset();onResult([],canvas.width,canvas.height,frameAt);onStatus(`Looking for ${bandColor(profiles.opponent.rgb)} headband`);timer=setTimeout(frame,60);return;}
  onStatus('Band color found · checking face');
  try{input=await makeDetectionFrame(canvas,bands,performance.now());if(g!==generation){input.transfer.forEach(b=>b.close());return;}timeout=setTimeout(()=>fail('Tracking stalled · tap Retry tracking'),5000);worker.postMessage(input.message,input.transfer);}catch{if(g===generation)fail('Camera tracking unavailable · tap Retry tracking');}
 }
 function start(){
  stop();active=true;onStatus('Loading face + person confirmation…');
  if(!window.Worker||!window.createImageBitmap){fail('This browser cannot run tracking. Try current Safari or Chrome.');return;}
  worker=new Worker(new URL('./detection-worker.js?v=face1',import.meta.url));
  timeout=setTimeout(()=>fail('Model loading timed out · tap Retry tracking'),45000);
  worker.onerror=()=>fail('Could not load tracking · tap Retry tracking');
  worker.onmessage=({data})=>{
   clearTimeout(timeout);
   if(data.type==='ready')frame();
   if(data.type==='error'){console.error('Person confirmation:',data.message);fail('Tracking unavailable · tap Retry tracking');}
   if(data.type==='detections'){
    const result=readDetectionFrame(data,input,bands),confirmed=continuity.update(bands,result.confirmed,frameAt),elapsed=Date.now()-frameAt;
    onResult(confirmed,canvas.width,canvas.height,frameAt);
    onStatus(elapsed>650?'Tracking slow · hold still':confirmed.length>1?'Multiple matching headbands · uncertain':confirmed.length?`Headband + ${confirmed[0].validation} · ${elapsed}ms`:'Color seen · looking for face or person');timer=setTimeout(frame,60);
   }
  };
  worker.postMessage({type:'init'});
 }
 return{start,stop};
}
