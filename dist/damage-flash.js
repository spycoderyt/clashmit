import {targetMask,damageForMe} from './damage-mask.js';
import {coverRect} from './shirt.js?v=face1';
// Optional, low-resolution segmentation never participates in recognition or hit validation.
export function createDamageFlash({container,video,getTracks,getSize,getMyId,now=()=>performance.now()}){
 const canvas=document.createElement('canvas');canvas.className='damage-flash';canvas.setAttribute('aria-hidden','true');container.append(canvas);
 const ctx=canvas.getContext('2d'),scratch=document.createElement('canvas'),paint=scratch.getContext('2d'),masks=new Map(),active=new Map();
 let worker,ready=false,busy=false,job=null,epoch=0,frame=0,lastSample=0,interest=null,interestUntil=0,disabled=false;
 function warm(){if(worker||disabled||!globalThis.Worker)return;try{worker=new Worker(new URL('./damage-mask-worker.js',import.meta.url));worker.onmessage=({data})=>{
   if(data.type==='ready'){ready=true;return;}if(data.type==='error'){busy=false;return;}
   if(data.type==='mask'){busy=false;const sent=job;if(!sent||sent.epoch!==epoch||now()-sent.at>500)return;const face={x:(sent.face.originX-sent.crop.originX)/sent.crop.width*data.width,y:(sent.face.originY-sent.crop.originY)/sent.crop.height*data.height,width:sent.face.width/sent.crop.width*data.width,height:sent.face.height/sent.crop.height*data.height};
    const pixels=targetMask(data.confidence,data.width,data.height,face);if(!pixels.some((v,i)=>i%4===3&&v>0))return;const mask=document.createElement('canvas');mask.width=data.width;mask.height=data.height;mask.getContext('2d').putImageData(new ImageData(pixels,data.width,data.height),0,0);masks.set(data.id,{canvas:mask,crop:sent.crop,face:sent.face,at:sent.at});if(masks.size>8)masks.delete(masks.keys().next().value);
   }};worker.onerror=()=>{disabled=true;worker?.terminate();worker=null;ready=false;busy=false;};worker.postMessage({type:'init'});}catch{disabled=true;}}
 async function sample(id,at){
  if(!ready||busy||at-lastSample<330||video.readyState<2)return;const track=getTracks().find(t=>t.id===id&&t.fresh);if(!track)return;
  const {width,height}=getSize(),face=track.box;if(!width||!height)return;
  const body=track.bodyBox||{originX:face.originX-face.width*1.8,originY:face.originY-face.height*.3,width:face.width*4.6,height:face.height*9};
  let left=Math.max(0,body.originX),right=Math.min(width,body.originX+body.width),top=Math.max(0,body.originY),bottom=Math.min(height,body.originY+body.height);
  // Do not tint a neighbouring recognised player even if foreground masks touch.
  const center=face.originX+face.width/2;for(const other of getTracks())if(other.id&&other.id!==id&&other.fresh){const x=other.box.originX+other.box.width/2;if(x>left&&x<right){if(x<center)left=Math.max(left,(x+center)/2);else right=Math.min(right,(x+center)/2);}}
  if(right-left<2||bottom-top<2)return;const crop={originX:left,originY:top,width:right-left,height:bottom-top};busy=true;lastSample=at;const generation=epoch;
  try{const scale=Math.min(1,256/Math.max(crop.width,crop.height));scratch.width=Math.max(1,Math.round(crop.width*scale));scratch.height=Math.max(1,Math.round(crop.height*scale));paint.drawImage(video,left,top,crop.width,crop.height,0,0,scratch.width,scratch.height);const bitmap=await createImageBitmap(scratch);if(generation!==epoch||!worker){bitmap.close();busy=false;return;}job={epoch,id,at,crop,face:{...face}};worker.postMessage({type:'frame',id,bitmap},[bitmap]);}catch{busy=false;}
 }
 function tick(){frame=0;const at=now(),rect=container.getBoundingClientRect(),size=getSize();if(canvas.width!==Math.round(rect.width)||canvas.height!==Math.round(rect.height)){canvas.width=rect.width;canvas.height=rect.height;}ctx.clearRect(0,0,canvas.width,canvas.height);
  for(const[id,until]of active){if(at>=until){active.delete(id);continue;}const track=getTracks().find(t=>t.id===id&&t.fresh);if(!track)continue;const mask=masks.get(id);
   if(mask&&at-mask.at<650){const dx=track.box.originX-mask.face.originX,dy=track.box.originY-mask.face.originY,b=coverRect({...mask.crop,originX:mask.crop.originX+dx,originY:mask.crop.originY+dy},size.width,size.height,rect.width,rect.height);ctx.drawImage(mask.canvas,b.x*rect.width,b.y*rect.height,b.width*rect.width,b.height*rect.height);}
   else{const b=coverRect(track.box,size.width,size.height,rect.width,rect.height);ctx.fillStyle='rgba(255,0,0,.5)';ctx.beginPath();ctx.ellipse((b.x+b.width/2)*rect.width,(b.y+b.height/2)*rect.height,b.width*rect.width*.6,b.height*rect.height*.7,0,0,Math.PI*2);ctx.fill();}
  }
  if(interest&&at<interestUntil)void sample(interest,at);if(active.size||at<interestUntil)frame=requestAnimationFrame(tick);
 }
 function follow(id,duration=1500){interest=id;interestUntil=now()+duration;warm();if(!frame)frame=requestAnimationFrame(tick);}
 return{warm,prepare:id=>follow(id,2500),receive(event){if(!damageForMe(event,getMyId()))return;active.set(event.targetId,now()+240);follow(event.targetId,700);},clear(){epoch++;active.clear();masks.clear();interest=null;interestUntil=0;cancelAnimationFrame(frame);frame=0;ctx.clearRect(0,0,canvas.width,canvas.height);},dispose(){this.clear();worker?.terminate();canvas.remove();}};
}
