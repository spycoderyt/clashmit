import {findHeadbands,mapBand,bandColor} from './headband.js?v=smooth1';
// Cheap color tracking runs independently of optional face/body decoration.
export function createPersonTracker(video,onResult,onStatus,getProfiles){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true}),buffers={};
 let worker,timer,timeout,active=false,generation=0,frameAt=0,region,sourceWidth,sourceHeight,lastFull=0,profileKey;
 function stop(){active=false;generation++;clearTimeout(timer);clearTimeout(timeout);worker?.terminate();worker=null;onResult([],0,0,0);}
 function deliver(bands){
  if(!active)return;clearTimeout(timeout);
  const mapped=bands.map(b=>{const next=mapBand(b,region.width/canvas.width,region.height/canvas.height);next.box.originX+=region.x;next.box.originY+=region.y;const p=next.box,min=Math.min(sourceWidth,sourceHeight),distance=Math.hypot((p.originX+p.width/2-sourceWidth*.5)/min,(p.originY+p.height/2-sourceHeight*.4)/min);next.priority=.7*Math.exp(-distance*3)+.2*next.match+.1*Math.min(1,next.fill);return next;});
  onResult(mapped,sourceWidth,sourceHeight,frameAt);const elapsed=Date.now()-frameAt;onStatus(mapped.length?`Headband tracking · ${elapsed}ms`:'Looking for headband');timer=setTimeout(frame,Math.max(0,33-elapsed));
 }
 async function frame(){
  if(!active)return;
  if(document.hidden||video.readyState<2||!video.videoWidth){timer=setTimeout(frame,100);return;}
  const profiles=getProfiles(),g=generation;frameAt=Date.now();sourceWidth=video.videoWidth;sourceHeight=video.videoHeight;
  if(!bandColor(profiles.opponent?.rgb)){onResult([],sourceWidth,sourceHeight,frameAt);onStatus('Scan a red or blue headband first');timer=setTimeout(frame,100);return;}
  const key=JSON.stringify([profiles.opponent.rgb,profiles.own?.rgb]);if(key!==profileKey){lastFull=0;profileKey=key;}
  const track=profiles.track;
  if(track?.confirmed&&track.fresh&&frameAt-lastFull<750){const b=track.box,cx=b.originX+b.width/2,cy=b.originY+b.height/2,halfW=Math.max(64,b.width*2),halfH=Math.max(48,b.height*3+b.width*.5),x=Math.max(0,Math.floor(cx-halfW)),y=Math.max(0,Math.floor(cy-halfH));region={x,y,width:Math.max(1,Math.min(sourceWidth,Math.ceil(cx+halfW))-x),height:Math.max(1,Math.min(sourceHeight,Math.ceil(cy+halfH))-y)};}else{region={x:0,y:0,width:sourceWidth,height:sourceHeight};lastFull=frameAt;}
  // Keep small bands at native resolution inside the local search; cap only
  // large searches. Periodic full frames allow recovery after rapid movement.
  const maxWidth=region.width===sourceWidth?960:640,w=Math.min(maxWidth,region.width),h=Math.max(1,Math.round(w*region.height/region.width));if(canvas.width!==w)canvas.width=w;if(canvas.height!==h)canvas.height=h;
  ctx.drawImage(video,region.x,region.y,region.width,region.height,0,0,w,h);
  if(!worker){deliver(findHeadbands(ctx.getImageData(0,0,w,h),profiles.opponent,profiles.own,buffers));return;}
  try{const bitmap=await createImageBitmap(canvas);if(g!==generation){bitmap.close();return;}timeout=setTimeout(()=>{worker?.terminate();worker=null;onStatus('Using camera color tracking');frame();},2000);worker.postMessage({type:'frame',bitmap,width:w,height:h,opponent:profiles.opponent,own:profiles.own},[bitmap]);}catch{if(g===generation){worker?.terminate();worker=null;timer=setTimeout(frame,0);}}
 }
 function start(){stop();active=true;lastFull=0;onStatus('Starting headband tracking…');
  if(!window.Worker||!window.createImageBitmap){frame();return;}
  const g=generation;worker=new Worker(new URL('./color-worker.js?v=smooth1',import.meta.url),{type:'module'});
  const fallback=()=>{if(g!==generation)return;clearTimeout(timeout);worker?.terminate();worker=null;frame();};timeout=setTimeout(fallback,4000);worker.onerror=fallback;
  worker.onmessage=({data})=>{if(g!==generation)return;if(data.type==='ready'){clearTimeout(timeout);if(!data.supported){worker.terminate();worker=null;}frame();}else if(data.type==='bands')deliver(data.bands);else if(data.type==='error')fallback();};worker.postMessage({type:'init'});
 }
 return{start,stop};
}
