// Render-only smoothing. Never changes recognition, identity, freshness, or hit testing.
export function createBoxMotion(){
 let value=null,key=null,lastAt=0;
 return{reset(){value=null;key=null;lastAt=0;},sample(next,nextKey,at){
  const dt=Math.max(0,at-lastAt),jump=value?Math.hypot(next.x-value.x,next.y-value.y):0;
  if(!value||key!==nextKey||dt>250||jump>Math.max(next.width,next.height)*1.5){value={...next};key=nextKey;lastAt=at;return{...value};}
  lastAt=at;const scale=Math.max(.01,next.width,next.height),tau=jump>scale*.2?28:70,positionAlpha=1-Math.exp(-dt/tau),sizeAlpha=1-Math.exp(-dt/100);
  for(const k of ['x','y'])value[k]+=(next[k]-value[k])*positionAlpha;
  for(const k of ['width','height'])value[k]+=(next[k]-value[k])*sizeAlpha;
  return{...value};
 }};
}
