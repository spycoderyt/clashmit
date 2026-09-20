// Screen-space gesture test only. Coordinates use the same unmirrored image:
// hand x/y are its centre; face x/y are the top-left of its box. No world range
// or depth is inferred from these coordinates.
const HOLD_MS=100,MAX_GAP_MS=250,SWING_MS=600;
const corner=hand=>hand.y>.62?(hand.x<.35?'left':hand.x>.65?'right':null):null;
const validHand=hand=>hand&&[hand.x,hand.y,hand.size].every(Number.isFinite)&&hand.x>=0&&hand.x<=1&&hand.y>=0&&hand.y<=1&&hand.size>0&&hand.size<=1;
const validFace=face=>face&&((typeof face.id==='string'&&face.id.length>0)||(typeof face.id==='number'&&Number.isFinite(face.id)))&&[face.x,face.y,face.width,face.height].every(Number.isFinite)&&face.width>0&&face.height>0;

// First entry of a swept hand centre into the face box, expanded by a small
// hand radius. This catches a fast movement that skips over a box in one frame.
function entryTime(from,to,face,radius){
 if(!validFace(face))return null;
 const left=Math.max(0,face.x),right=Math.min(1,face.x+face.width),top=Math.max(0,face.y),bottom=Math.min(1,face.y+face.height);
 if(left>=right||top>=bottom)return null;
 let enter=0,leave=1;
 for(const [start,end,min,max] of [[from.x,to.x,left-radius,right+radius],[from.y,to.y,top-radius,bottom+radius]]){
  const delta=end-start;
  if(Math.abs(delta)<1e-9){if(start<min||start>max)return null;continue;}
  const a=(min-start)/delta,b=(max-start)/delta;
  enter=Math.max(enter,Math.min(a,b));leave=Math.min(leave,Math.max(a,b));
  if(enter>leave)return null;
 }
 return enter;
}

export function createMeleeTracker({damage=5,cooldown=1000}={}){
 if(!Number.isFinite(damage)||damage<=0||!Number.isFinite(cooldown)||cooldown<0)throw new RangeError('Use positive damage and a nonnegative cooldown.');
 let previous,lastAt,lastHitAt,side,cornerSince,origin,armed,needsReturn,departedAt;
 function reset(){previous=null;lastAt=null;lastHitAt=-Infinity;side=null;cornerSince=null;origin=null;armed=false;needsReturn=false;departedAt=null;}
 reset();
 const remaining=at=>Math.max(0,cooldown-(at-lastHitAt));
 const result=(at,hit=null)=>({hit,phase:remaining(at)>0?'cooldown':needsReturn?'return':armed?'armed':'ready',cooldownRemaining:remaining(at),side});
 function loseHistory(){needsReturn=needsReturn||armed||departedAt!==null;previous=null;cornerSince=null;origin=null;armed=false;departedAt=null;}
 function update({hand=null,faces=[],at}={}){
  if(!Number.isFinite(at)){loseHistory();return result(lastAt??0);}
  if(lastAt!==null&&at<=lastAt){loseHistory();return result(lastAt);}
  lastAt=at;
  if(hand!==null&&!validHand(hand)){loseHistory();return result(at);}
  if(!hand){cornerSince=null;if(previous&&at-previous.at>MAX_GAP_MS)loseHistory();return result(at);}
  if(previous&&at-previous.at>MAX_GAP_MS)loseHistory();
  const current={x:hand.x,y:hand.y,size:hand.size,at},atCorner=corner(current),from=previous;
  previous=current;
  if(remaining(at)>0){armed=false;origin=null;cornerSince=null;departedAt=null;return result(at);}
  if(needsReturn){if(!atCorner)return result(at);needsReturn=false;side=atCorner;cornerSince=at;}
  if(!armed){
   if(!atCorner){cornerSince=null;return result(at);}
   if(side!==atCorner||cornerSince===null){side=atCorner;cornerSince=at;}
   if(at-cornerSince>=HOLD_MS){armed=true;origin=current;departedAt=null;}
   return result(at);
  }
  if(atCorner){
   if(departedAt!==null||atCorner!==side){armed=false;side=atCorner;cornerSince=at;origin=null;departedAt=null;}
   else origin=current;
   return result(at);
  }
  departedAt??=at;
  if(at-departedAt>=SWING_MS){armed=false;needsReturn=true;origin=null;cornerSince=null;return result(at);}
  if(!from||!origin)return result(at);
  const dx=current.x-origin.x,up=origin.y-current.y,inward=side==='left'?dx:-dx;
  const step=Math.hypot(current.x-from.x,current.y-from.y),speed=step/((at-from.at)/1000);
  // Require useful movement and speed, not a small high-frequency hand jitter.
  if(Math.hypot(dx,up)<.16||step<.035||speed<.8||(up<.1&&inward<.12)||inward<-.08||up<-.08)return result(at);
  const radius=Math.min(.035,Math.max(.008,current.size*.35));
  let target=null,first=Infinity;
  for(const face of Array.isArray(faces)?faces:[]){const entry=entryTime(from,current,face,radius);if(entry!==null&&entry<first){first=entry;target=face;}}
  if(!target)return result(at);
  lastHitAt=at;armed=false;needsReturn=true;cornerSince=null;origin=null;departedAt=null;
  return result(at,{id:target.id,damage});
 }
 return{update,reset};
}
