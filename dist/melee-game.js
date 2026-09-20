import {createMeleeTracker} from './melee-rules.js';
const SAMPLE_MS=110,MAX_AGE_MS=250,MAX_FRAME=480;
const finite=values=>values.every(Number.isFinite);

// Source-image coordinates to the visible, object-fit: cover camera viewport.
// Cropped-out hands are rejected rather than clamped onto a face at the edge.
export function coverHand(hand,source,viewport,container){
 if(!hand||!finite([hand.x,hand.y,hand.size,source?.width,source?.height,viewport?.width,viewport?.height,viewport?.left,viewport?.top,container?.width,container?.height,container?.left,container?.top])||Math.min(source.width,source.height,viewport.width,viewport.height,container.width,container.height,hand.size)<=0)return null;
 const scale=Math.max(viewport.width/source.width,viewport.height/source.height),width=source.width*scale,height=source.height*scale;
 const x=(viewport.left-container.left+(viewport.width-width)/2+hand.x*width)/container.width;
 const y=(viewport.top-container.top+(viewport.height-height)/2+hand.y*height)/container.height;
 if(x<0||x>1||y<0||y>1)return null;
 return{...hand,x,y,size:Math.min(1,hand.size*Math.max(width/container.width,height/container.height))};
}
function palm(hand){
 const landmarks=hand?.landmarks,indices=[0,5,9,13,17];
 if(!indices.every(i=>landmarks?.[i]&&finite([landmarks[i].x,landmarks[i].y])))return null;
 return{x:indices.reduce((sum,i)=>sum+landmarks[i].x,0)/5,y:indices.reduce((sum,i)=>sum+landmarks[i].y,0)/5,size:Math.hypot(landmarks[5].x-landmarks[17].x,landmarks[5].y-landmarks[17].y),handedness:hand.handedness||'Unknown',confidence:hand.handednessScore||0,angle:Math.atan2(landmarks[9].y-landmarks[0].y,landmarks[9].x-landmarks[0].x)+Math.PI/2};
}
export function createMeleeGame({video,container,getTargets=()=>[],onHit=()=>{},isEnabled=()=>true}={}){
 const tracker=createMeleeTracker({damage:5,cooldown:1000}),canvas=document.createElement('canvas'),capture=document.createElement('canvas');
 canvas.className='melee-game-overlay';canvas.setAttribute('aria-hidden','true');Object.assign(canvas.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',zIndex:'5'});container.append(canvas);
 const context=canvas.getContext('2d'),captureContext=capture.getContext('2d',{alpha:false});
 let running=false,worker=null,ready=false,run=0,generation=0,attempts=0,pending=null,capturing=false,seq=0,captureTimer=0,initTimer=0,workerTimer=0,retryAt=0,raf=0,paintTimer=0,drawGeometry=null,lastVideoTime=-1,lastHand=null,display=null,lastResultAt=-Infinity,cooldownUntil=0,wasEnabled=false;
 const enabled=()=>{try{return running&&!document.hidden&&!!isEnabled();}catch{return false;}};
 function erase(){context?.clearRect(0,0,canvas.width,canvas.height);}
 function clear(){generation++;tracker.reset();lastHand=null;display=null;lastResultAt=-Infinity;cooldownUntil=0;drawGeometry=null;cancelAnimationFrame(raf);clearTimeout(paintTimer);paintTimer=0;raf=0;erase();}
 function terminate(){clearTimeout(initTimer);clearTimeout(workerTimer);worker?.terminate();worker=null;ready=false;pending=null;capturing=false;}
 function stop(){running=false;run++;clearTimeout(captureTimer);terminate();clear();wasEnabled=false;lastVideoTime=-1;}
 function fail(){terminate();clear();retryAt=performance.now()+2000;}
 function draw(at){
  raf=0;clearTimeout(paintTimer);paintTimer=0;if(!enabled()||!lastHand||at-lastResultAt>MAX_AGE_MS){display=null;erase();return;}
  const box=drawGeometry;if(!box)return;const dpr=Math.min(1.5,devicePixelRatio||1),width=box.width,height=box.height;if(!width||!height)return;
  if(canvas.width!==Math.round(width*dpr)||canvas.height!==Math.round(height*dpr)){canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);}
  context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,width,height);
  if(!display)display={...lastHand};else{display.x+=(lastHand.x-display.x)*.4;display.y+=(lastHand.y-display.y)*.4;const turn=Math.atan2(Math.sin(lastHand.angle-display.angle),Math.cos(lastHand.angle-display.angle));display.angle+=turn*.3;}
  const cooling=at<cooldownUntil,length=Math.max(62,Math.min(108,lastHand.size*width*2));
  context.save();context.translate(display.x*width,display.y*height);context.rotate(display.angle);context.globalAlpha=cooling?.45:.95;
  context.fillStyle=cooling?'#8595a5':'#dcecf6';context.strokeStyle=cooling?'#697b91':'#f3cc73';context.lineWidth=2;
  context.beginPath();context.moveTo(-6,-13);context.lineTo(-7,-length+12);context.lineTo(0,-length);context.lineTo(7,-length+12);context.lineTo(6,-13);context.closePath();context.fill();context.stroke();
  context.strokeStyle=cooling?'#b5c0cd':'#fff';context.lineWidth=1;context.beginPath();context.moveTo(0,-length+10);context.lineTo(0,-15);context.stroke();
  context.fillStyle=cooling?'#8291a1':'#f3cc73';context.fillRect(-17,-15,34,6);context.fillStyle=cooling?'#5d6979':'#96734a';context.fillRect(-4,-9,8,20);context.restore();
  const moving=Math.hypot(lastHand.x-display.x,lastHand.y-display.y)>.0004||Math.abs(Math.atan2(Math.sin(lastHand.angle-display.angle),Math.cos(lastHand.angle-display.angle)))>.003;
  if(moving)raf=requestAnimationFrame(draw);
  else{
   // A settled sword needs no 60 Hz canvas repaint. Wake for the next sample,
   // a cooldown color change, or the strict stale-frame deadline.
   const delay=Math.max(1,Math.min(MAX_AGE_MS-(at-lastResultAt)+1,cooling?cooldownUntil-at:Infinity));
   paintTimer=setTimeout(()=>{paintTimer=0;if(!raf)raf=requestAnimationFrame(draw);},delay);
  }
 }
 function select(hands,geometry){
  let candidates=hands.map(palm).filter(Boolean).map(hand=>coverHand(hand,geometry.source,geometry.viewport,geometry.container)).filter(Boolean);
  if(lastHand){
   candidates=candidates.filter(hand=>!(hand.confidence>.6&&lastHand.confidence>.6&&hand.handedness!=='Unknown'&&lastHand.handedness!=='Unknown'&&hand.handedness!==lastHand.handedness));
   candidates.sort((a,b)=>Math.hypot(a.x-lastHand.x,a.y-lastHand.y)-Math.hypot(b.x-lastHand.x,b.y-lastHand.y));
   return candidates[0]&&Math.hypot(candidates[0].x-lastHand.x,candidates[0].y-lastHand.y)<=.45?candidates[0]:null;
  }
  return candidates.sort((a,b)=>b.size-a.size)[0]||null;
 }
 function initWorker(token){
  attempts++;try{worker=new Worker(new URL('./melee-worker.js',import.meta.url));}catch{fail();return;}
  const currentWorker=worker;
  initTimer=setTimeout(()=>{if(run===token&&worker===currentWorker)fail();},45000);
  worker.onerror=()=>{if(run===token&&worker===currentWorker)fail();};
  worker.onmessage=({data})=>{
   if(!running||run!==token||worker!==currentWorker)return;
   if(data.type==='ready'){clearTimeout(initTimer);ready=true;return;}
   if(data.type==='error'){fail();return;}
   if(data.type!=='frame'||!pending||data.id!==pending.id)return;
   const sent=pending;pending=null;clearTimeout(workerTimer);
   if(sent.generation!==generation||!enabled())return;
   const now=performance.now();
   if(data.error){fail();return;}
   if(data.dropped||now-sent.at>MAX_AGE_MS||data.timestamp!==sent.at||video.videoWidth!==sent.geometry.source.width||video.videoHeight!==sent.geometry.source.height){tracker.update({hand:null,faces:[],at:sent.at});lastHand=null;display=null;erase();return;}
   const hand=select(Array.isArray(data.hands)?data.hands:[],sent.geometry);let targets=[];try{targets=getTargets()||[];}catch{}
   const result=tracker.update({hand,faces:targets,at:sent.at});lastHand=hand;drawGeometry=sent.geometry.container;lastResultAt=sent.at;cooldownUntil=sent.at+result.cooldownRemaining;
   if(hand&&!raf){clearTimeout(paintTimer);paintTimer=0;raf=requestAnimationFrame(draw);}if(!hand){display=null;erase();}
   if(result.hit&&enabled()){try{onHit({targetId:result.hit.id,damage:result.hit.damage,at:sent.at});}catch{}}
  };
  worker.postMessage({type:'init',handsOnly:true});
 }
 async function sample(token){
  if(!running||run!==token)return;
  const canTrack=enabled();if(!canTrack&&wasEnabled)clear();wasEnabled=canTrack;
  if(canTrack&&video.readyState>=2&&video.videoWidth>0&&video.videoHeight>0&&context&&captureContext){
   if(!worker&&attempts<2&&performance.now()>=retryAt)initWorker(token);
   if(ready&&!pending&&!capturing&&video.currentTime!==lastVideoTime){
    capturing=true;const version=generation,at=performance.now(),source={width:video.videoWidth,height:video.videoHeight},geometry={source,viewport:video.getBoundingClientRect(),container:container.getBoundingClientRect()};
    const scale=Math.min(1,MAX_FRAME/Math.max(source.width,source.height)),width=Math.max(1,Math.round(source.width*scale)),height=Math.max(1,Math.round(source.height*scale));
    if(capture.width!==width)capture.width=width;if(capture.height!==height)capture.height=height;
    let bitmap;
    try{
     captureContext.drawImage(video,0,0,capture.width,capture.height);lastVideoTime=video.currentTime;bitmap=await createImageBitmap(capture);
     if(run!==token||!running||version!==generation||!enabled()||performance.now()-at>MAX_AGE_MS){bitmap.close();bitmap=null;}
     else{
      const id=++seq;pending={id,at,generation:version,geometry};worker.postMessage({type:'frame',id,timestamp:at,bitmap},[bitmap]);bitmap=null;
      workerTimer=setTimeout(()=>{if(run===token&&pending?.id===id)fail();},2500);
     }
    }catch{bitmap?.close();if(run===token)fail();}
    finally{if(run===token)capturing=false;}
   }
  }
  if(running&&run===token&&!document.hidden){clearTimeout(captureTimer);captureTimer=setTimeout(()=>sample(token),SAMPLE_MS);}
 }
 function start(){
  if(running)return true;
  if(typeof Worker!=='function'||typeof createImageBitmap!=='function'||!context||!captureContext)return false;
  running=true;attempts=0;retryAt=0;lastVideoTime=-1;const token=++run;void sample(token);return true;
 }
 function visibility(){if(document.hidden){clear();clearTimeout(captureTimer);captureTimer=0;}else if(running){clearTimeout(captureTimer);void sample(run);}}
 document.addEventListener('visibilitychange',visibility);
 window.addEventListener('resize',clear);
 const resizeObserver=typeof ResizeObserver==='function'?new ResizeObserver(clear):null;resizeObserver?.observe(container);resizeObserver?.observe(video);
 function dispose(){stop();resizeObserver?.disconnect();document.removeEventListener('visibilitychange',visibility);window.removeEventListener('resize',clear);canvas.remove();}
 return{start,stop,clear,dispose};
}
