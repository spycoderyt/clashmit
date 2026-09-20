import {clampRegion} from './face-client.js?v=face13';
// Alternate full-frame and native-resolution aiming crops even before the first face is found.
// A full-frame miss must never prevent the closer search that can discover a distant face.
export function createFaceSearch(){
 let lastFull=-Infinity,lastReticle=-Infinity,tight=false;
 return {reset(){lastFull=lastReticle=-Infinity;tight=false;},next({width,height,at,point,follow=[],budgetMs=0}){
  const regions=follow.slice(0,2).map(r=>({...clampRegion(r,width,height),maxSize:384,detectSize:320,minScore:.3}));
  const full=()=>{lastFull=at;return{x:0,y:0,width,height,maxSize:640,detectSize:640,full:true,minScore:.45};};
  const crop=()=>{lastReticle=at;tight=width>2000&&!tight;const w=Math.min(width,tight?640:Math.max(640,width/3)),h=Math.min(height,w*.75);return{...clampRegion({x:point.x-w/2,y:point.y-h/2,width:w,height:h},width,height),maxSize:640,detectSize:640,minScore:.45};};
  if(!regions.length){regions.push(lastFull<=lastReticle?full():crop());}
  else if(at-lastFull>Math.max(700,budgetMs*4)){regions.length=1;regions.push(full());}
  else if(regions.length<2&&at-lastReticle>500&&!regions.some(r=>point.x>r.x&&point.x<r.x+r.width&&point.y>r.y&&point.y<r.y+r.height))regions.push(crop());
  return regions;
 }};
}
// Completed detections get a usable display window on slower phones. Never revive a stalled frame.
export const detectionTime=(capturedAt,completedAt)=>completedAt-capturedAt>2000?null:completedAt;

// Camera freezes must not refresh a face lock or waste another inference pass.
// currentTime advances with decoded camera frames; sources without it retain the old behavior.
export function createVideoFrameGate(){
 let stamp=null;
 return{reset(){stamp=null;},take(video){
  if(!Number.isFinite(video.currentTime))return true;
  const next=`${video.currentTime}:${video.videoWidth}:${video.videoHeight}`;
  if(next===stamp)return false;stamp=next;return true;
 }};
}
