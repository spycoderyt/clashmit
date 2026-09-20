// Lock-on logic, with no camera, DOM or model code so it can be tested directly.
// A face is recognised rarely (it needs enough pixels and a usable angle) but it can be
// FOLLOWED all the time. So identity is decided by face, then carried by whatever is still
// visible:
//   face  - the face detector still sees this head, even in profile where it cannot be recognised
//   body  - the face is gone (head turned away, phone in front of it) but the person detector
//           still sees the body the face belonged to; the head is estimated from the body box
//   coast - nothing seen for a moment; the last motion is extrapolated briefly
// A name moves to another track only on fresh face evidence, never by position alone.
import {matchFace,createIdentityVoter} from './face-id.js?v=face8';
export const LOCK={faceFreshMs:400,bodyFreshMs:700,coastMs:1200,bodyHoldMs:6000,verifyMs:1500,bodyAfterMs:150};
const center=b=>({x:b.originX+b.width/2,y:b.originY+b.height/2});
const iou=(a,b)=>{const w=Math.min(a.originX+a.width,b.originX+b.width)-Math.max(a.originX,b.originX),h=Math.min(a.originY+a.height,b.originY+b.height)-Math.max(a.originY,b.originY);if(w<=0||h<=0)return 0;const i=w*h;return i/(a.width*a.height+b.width*b.height-i);};
// Where the head sits inside a person box: centred, just below the top edge.
const headOf=(body,headWidth)=>({x:body.originX+body.width/2,y:body.originY+Math.max(headWidth*.6,body.height*.1)});
export function createFaceTracks(){
 let tracks=[],nextKey=1;
 const predicted=(t,at)=>{const dt=Math.min(250,Math.max(0,at-t.seenAt));return{x:t.cx+t.vx*dt,y:t.cy+t.vy*dt};};
 function drop(at){tracks=tracks.filter(t=>{const faceGap=at-t.seenAt;if(faceGap<=LOCK.coastMs)return true;return !!t.id&&!!t.body&&at-t.body.at<=LOCK.bodyFreshMs&&faceGap<=LOCK.bodyHoldMs;});}
 // faces: [{box:{x,y,width,height},score,descriptor?,pixels?}] in source pixels. pixels is the face
 // width in the pixels the descriptor was actually computed from, which gates recognition.
 function updateFaces(faces,at,gallery){
  drop(at);const unused=new Set(faces.map((_,i)=>i)),pairs=[];
  for(const t of tracks){
   // A body-carried track expects its face back at the estimated head, with a generous gate.
   const carried=t.body&&at-t.seenAt>LOCK.bodyAfterMs,p=carried?headOf(t.body.box,t.width):predicted(t,at),gate=Math.max(60,t.width*(carried?2.5:1.6));
   faces.forEach((f,i)=>{const cx=f.box.x+f.box.width/2,cy=f.box.y+f.box.height/2,distance=Math.hypot(cx-p.x,cy-p.y),ratio=f.box.width/t.width;if(distance<=gate&&ratio>.4&&ratio<2.5)pairs.push({t,i,cost:distance/Math.max(20,t.width)+Math.abs(Math.log(ratio))*.4});});
  }
  pairs.sort((a,b)=>a.cost-b.cost);const matched=new Set();
  for(const {t,i} of pairs){
   if(matched.has(t)||!unused.has(i))continue;matched.add(t);unused.delete(i);const f=faces[i],cx=f.box.x+f.box.width/2,cy=f.box.y+f.box.height/2,dt=Math.max(1,at-t.seenAt),returning=at-t.seenAt>LOCK.bodyAfterMs;
   // A face coming back after a gap is judged on fresh frames only, not on votes from before it left.
   if(returning){t.vx=0;t.vy=0;t.cx=cx;t.cy=cy;t.verifiedAt=-Infinity;t.voter.reset();}
   else{const alpha=.65;t.vx=t.vx*.5+(cx-t.rawX)/dt*.5;t.vy=t.vy*.5+(cy-t.rawY)/dt*.5;const p=predicted(t,at);t.cx=p.x+(cx-p.x)*alpha;t.cy=p.y+(cy-p.y)*alpha;}
   t.rawX=cx;t.rawY=cy;t.width=t.width*.3+f.box.width*.7;t.height=t.height*.3+f.box.height*.7;t.seenAt=at;t.hits++;identify(t,f,at,gallery);
  }
  for(const i of unused){const f=faces[i],cx=f.box.x+f.box.width/2,cy=f.box.y+f.box.height/2,t={key:nextKey++,cx,cy,rawX:cx,rawY:cy,vx:0,vy:0,width:f.box.width,height:f.box.height,seenAt:at,firstAt:at,hits:1,id:null,verifiedAt:-Infinity,voter:createIdentityVoter(),body:null};tracks.push(t);identify(t,f,at,gallery);}
 }
 function identify(t,face,at,gallery){
  if(!face.descriptor||!gallery?.length)return;
  const match=matchFace(face.descriptor,gallery,{facePx:face.pixels??face.box.width}),voted=t.voter.push(match);t.lastMatch=match;
  if(voted.id){
   // One name, one track: fresh face evidence here takes the name from any older track.
   if(t.id!==voted.id)for(const other of tracks)if(other!==t&&other.id===voted.id){other.id=null;other.body=null;other.voter.reset();}
   t.id=voted.id;t.verifiedAt=at;
  }else if(t.id&&match.confident){
   // One clear look at somebody else is enough to take the name away; it has to be earned back by votes.
   if(match.id===t.id)t.verifiedAt=at;else{t.id=null;t.body=null;}
  }
 }
 // bodies: [{box:{originX,originY,width,height},score}] person boxes in source pixels.
 function updateBodies(bodies,at){
  for(const t of tracks){
   if(!t.id)continue;let best=null;
   if(t.body){for(const b of bodies){const score=iou(b.box,t.body.box);if(score>=.2&&(!best||score>best.score))best={b,score};}}
   else{
    // First binding: the person whose upper part contains this head. The smallest such box wins,
    // so a person standing behind does not swallow the one in front.
    const head=predicted(t,Math.min(at,t.seenAt+250));
    for(const b of bodies){const box=b.box,inside=head.x>=box.originX&&head.x<=box.originX+box.width&&head.y>=box.originY-box.height*.08&&head.y<=box.originY+box.height*.45;if(inside&&(!best||box.width*box.height<best.b.box.width*best.b.box.height))best={b,score:1};}
   }
   if(best){const scale=t.body?best.b.box.height/t.body.box.height:1;if(at-t.seenAt>LOCK.bodyAfterMs&&scale>.5&&scale<2){t.width*=scale;t.height*=scale;}t.body={box:{...best.b.box},at};}
  }
  drop(at);
 }
 const mode=(t,at)=>at-t.seenAt<=LOCK.bodyAfterMs?'face':t.body&&at-t.body.at<=LOCK.bodyFreshMs?'body':'coast';
 function list(at){
  drop(at);
  return tracks.map(t=>{
   const source=mode(t,at),p=source==='body'?headOf(t.body.box,t.width):predicted(t,at),fresh=source==='face'?at-t.seenAt<=LOCK.faceFreshMs:source==='body';
   return{key:t.key,id:t.id,source,fresh:source==='coast'?at-t.seenAt<=LOCK.faceFreshMs:fresh,confirmed:!!t.id,hits:t.hits,seenAt:t.seenAt,match:t.lastMatch||null,votes:t.voter.identity.votes,box:{originX:p.x-t.width/2,originY:p.y-t.height/2,width:t.width,height:t.height}};
  });
 }
 return{
  updateFaces,updateBodies,list,reset(){tracks=[];},
  // True while a named track has lost its face, which is when the person detector is worth running.
  needsBodies:at=>tracks.some(t=>t.id&&at-t.seenAt>LOCK.bodyAfterMs),
  // Boxes of faces that were recognised recently; the worker skips describing these to save time.
  knownBoxes:at=>tracks.filter(t=>t.id&&at-t.verifiedAt<=LOCK.verifyMs&&at-t.seenAt<=LOCK.bodyAfterMs).map(t=>({x:t.cx-t.width/2,y:t.cy-t.height/2,width:t.width,height:t.height})),
  // Native-resolution search windows around tracked faces for the cheap follow pass.
  // When there are more faces than windows, the ones nearest the reticle (`focus`, source pixels) win.
  regions:(at,limit=2,focus=null)=>tracks.filter(t=>at-t.seenAt<=LOCK.faceFreshMs).sort((a,b)=>focus?Math.hypot(a.cx-focus.x,a.cy-focus.y)-Math.hypot(b.cx-focus.x,b.cy-focus.y):b.seenAt-a.seenAt).slice(0,limit).map(t=>{const p=predicted(t,at),size=Math.max(160,t.width*3.2);return{x:p.x-size/2,y:p.y-size/2,width:size,height:size};}),
 };
}
