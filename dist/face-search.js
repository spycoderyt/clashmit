import {clampRegion} from './face-client.js?v=face13';
// Alternate full-frame and native-resolution aiming crops even before the first face is found.
// A full-frame miss must never prevent the closer search that can discover a distant face.
export function createFaceSearch(){
 let lastFull=-Infinity,lastReticle=-Infinity,tight=false;
 return {reset(){lastFull=lastReticle=-Infinity;tight=false;},next({width,height,at,point,follow=[],budgetMs=0}){
  const slow=budgetMs>220,severe=budgetMs>800,detectSize=severe?320:slow?416:640;
  const regions=follow.slice(0,slow?1:2).map(r=>({...clampRegion(r,width,height),maxSize:384,detectSize:320,minScore:.3}));
  const full=()=>{lastFull=at;return{x:0,y:0,width,height,maxSize:detectSize,detectSize,full:true,minScore:.45};};
  const crop=()=>{lastReticle=at;tight=width>2000&&!tight;const w=Math.min(width,slow?480:tight?640:Math.max(640,width/3)),h=Math.min(height,w*.75);return{...clampRegion({x:point.x-w/2,y:point.y-h/2,width:w,height:h},width,height),maxSize:severe?320:slow?416:640,detectSize,minScore:.45};};
  if(!regions.length){regions.push(lastFull<=lastReticle?full():crop());}
  // On a slow phone, keep the close-up follow pass while a face is present. A full-frame
  // pass can lose a small face and forces acquisition to start again. Search resumes on loss.
  else if(!slow&&at-lastFull>Math.min(2000,Math.max(700,budgetMs*3))){regions.length=1;regions.push(full());}
  else if(!slow&&regions.length<2&&at-lastReticle>500&&!regions.some(r=>point.x>r.x&&point.x<r.x+r.width&&point.y>r.y&&point.y<r.y+r.height))regions.push(crop());
  return regions;
 }};
}
// Completed detections get a usable display window on slower phones. Never revive a stalled frame.
export const detectionTime=(capturedAt,completedAt)=>!Number.isFinite(capturedAt)||!Number.isFinite(completedAt)||completedAt<capturedAt||completedAt-capturedAt>2000?null:completedAt;
// React to a slow pass immediately, including discarded passes, then recover gradually.
export const updateInferenceBudget=(previous,elapsed)=>Number.isFinite(elapsed)&&elapsed>=0?Math.max(elapsed,(Number.isFinite(previous)?previous:0)*.7+elapsed*.3):previous;

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
