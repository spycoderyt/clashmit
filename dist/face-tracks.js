// Lock-on logic, with no camera, DOM or model code so it can be tested directly.
// A face is recognised rarely (it needs enough pixels and a usable angle) but it can be
// FOLLOWED all the time. So identity is decided by face, then carried by whatever is still
// visible:
//   face  - the face detector still sees this head, even in profile where it cannot be recognised
//   body  - the face is gone (head turned away, phone in front of it) but the person detector
//           still sees the body the face belonged to; the head is estimated from the body box
//   coast - nothing seen for a moment; the last motion is extrapolated briefly
// A name moves to another track only on fresh face evidence, never by position alone.
//
// People crossing in front: a followed head is matched to the next frame by position, so someone running
// past can briefly be mistaken for it. Any hand-over that looks wrong (a jump, a sudden size change, or two
// faces competing for one track) marks the track "suspect": it is re-checked on the very next frame instead
// of after verifyMs, and while suspect its last trusted position is kept. If the re-check says this is not
// the named player, the intruder is split off into a track of their own and the named track goes back to
// where the player really was, to be carried by their body or to coast until they reappear.
import {matchPlayer,distanceToPlayer,createIdentityVoter,headTurn,MATCH,UPPER} from './face-id.js?v=face13';
// bodyAfterMs: how long a face may go unseen before it counts as hidden. It has to cover a few recognition
// passes, which take 50 to 250 ms each on a phone, or the lock would flicker between face and body.
// suspectMs: a suspicion that can be neither confirmed nor refuted (a profile, a distant face) lapses after this.
export const LOCK={faceFreshMs:600,bodyFreshMs:1000,coastMs:1200,bodyHoldMs:6000,verifyMs:1000,bodyAfterMs:450,bodyRefreshMs:1200,mismatchStrikes:2,suspectMs:2000};
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
   // A named head that is being followed frame to frame cannot plausibly halve or double in size between frames.
   const steady=t.id&&!carried,low=steady?.55:.4,high=steady?1.8:2.5;let inGate=0;
   // Only a face close enough to be mistaken for this one competes for it; neighbours standing alongside do not.
   faces.forEach((f,i)=>{const cx=f.box.x+f.box.width/2,cy=f.box.y+f.box.height/2,distance=Math.hypot(cx-p.x,cy-p.y),ratio=f.box.width/t.width;if(distance<=t.width)inGate++;if(distance<=gate&&ratio>low&&ratio<high)pairs.push({t,i,distance,ratio,cost:distance/Math.max(20,t.width)+Math.abs(Math.log(ratio))*.4});});
   t.crowded=inGate>1;
  }
  pairs.sort((a,b)=>a.cost-b.cost);const matched=new Set();
  for(const {t,i,distance,ratio} of pairs){
   if(matched.has(t)||!unused.has(i))continue;matched.add(t);unused.delete(i);const f=faces[i],cx=f.box.x+f.box.width/2,cy=f.box.y+f.box.height/2,dt=Math.max(1,at-t.seenAt),returning=at-t.seenAt>LOCK.bodyAfterMs;
   if(t.id){
    // Remember where the player was the last time nothing looked odd, then decide whether this hand-over does.
    const odd=distance>t.width*.6||Math.abs(Math.log(ratio))>.3||t.crowded;if(t.suspectSince&&at-t.suspectSince>LOCK.suspectMs)t.suspectSince=null;
    if(odd&&!t.suspectSince){t.suspectSince=at;t.verifiedAt=-Infinity;}
    if(!t.suspectSince)t.safe={cx:t.cx,cy:t.cy,rawX:t.rawX,rawY:t.rawY,vx:t.vx,vy:t.vy,width:t.width,height:t.height,seenAt:t.seenAt};
   }
   // A face coming back after a gap is judged on fresh frames only, not on votes from before it left.
   if(returning){t.vx=0;t.vy=0;t.cx=cx;t.cy=cy;t.verifiedAt=-Infinity;t.voter.reset();}
   else{const alpha=.65;t.vx=t.vx*.5+(cx-t.rawX)/dt*.5;t.vy=t.vy*.5+(cy-t.rawY)/dt*.5;const p=predicted(t,at);t.cx=p.x+(cx-p.x)*alpha;t.cy=p.y+(cy-p.y)*alpha;}
   t.rawX=cx;t.rawY=cy;t.width=t.width*.3+f.box.width*.7;t.height=t.height*.3+f.box.height*.7;t.seenAt=at;t.hits++;identify(t,f,at,gallery);
  }
  for(const i of unused){const f=faces[i],cx=f.box.x+f.box.width/2,cy=f.box.y+f.box.height/2,t={key:nextKey++,cx,cy,rawX:cx,rawY:cy,vx:0,vy:0,width:f.box.width,height:f.box.height,seenAt:at,firstAt:at,hits:1,id:null,verifiedAt:-Infinity,voter:createIdentityVoter(),body:null};tracks.push(t);identify(t,f,at,gallery);}
 }
 // The head this track is following turned out not to be its named player. If the mix-up began with a
 // suspicious hand-over, give the intruder a track of their own and put the named track back where the
 // player was last trusted to be; otherwise there is nowhere to go back to, so the name is simply dropped.
 function reject(t,at,match){
  const safe=t.suspectSince&&t.safe&&at-t.safe.seenAt<=LOCK.coastMs?t.safe:null;
  if(!safe){t.id=null;t.body=null;t.strikes=0;t.suspectSince=null;return;}
  const intruder={key:nextKey++,cx:t.cx,cy:t.cy,rawX:t.rawX,rawY:t.rawY,vx:t.vx,vy:t.vy,width:t.width,height:t.height,seenAt:t.seenAt,firstAt:at,hits:1,id:null,verifiedAt:-Infinity,voter:createIdentityVoter(),body:null,lastMatch:match};
  intruder.voter.push(match);tracks.push(intruder);Object.assign(t,safe);t.suspectSince=null;t.strikes=0;t.voter.reset();
  // The player's own face is, by definition, not what we were looking at, so it counts as hidden from now on:
  // the body bound before the mix-up carries the lock, and it must not be re-bound to whoever is in front.
  t.seenAt=Math.min(t.seenAt,at-LOCK.bodyAfterMs-1);
 }
 function identify(t,face,at,gallery){
  if(!face.descriptor||!gallery?.length)return;
  const pixels=face.pixels??face.box.width,match=matchPlayer(face,gallery,{facePx:pixels});
  if(t.id){
   if(match.confident&&match.id===t.id){t.verifiedAt=at;t.strikes=0;t.suspectSince=null;t.voter.push(match);t.lastMatch=match;return;}
   // One clear look at another player, or repeated clear frontal looks that resemble the named player on
   // neither signature, mean this is not them. Profiles and small faces never count against a name.
   const own=distanceToPlayer(face,gallery.find(p=>p.id===t.id)),clear=pixels>=MATCH.minFacePx*1.5&&(!face.landmarks||Math.abs(headTurn(face.landmarks))<.25);
   const foreign=clear&&own.full>MATCH.threshold+.2&&own.upper>UPPER.threshold+.2;
   if(match.confident||(foreign&&(t.strikes=(t.strikes||0)+1)>=LOCK.mismatchStrikes)){const before=tracks.length;reject(t,at,match);if(tracks.length>before||!match.confident)return;}
   else{if(!foreign)t.strikes=0;t.lastMatch=match;return;}
  }
  const voted=t.voter.push(match);t.lastMatch=match;
  if(voted.id){
   // One name, one track: fresh face evidence here takes the name from any older track.
   for(const other of tracks)if(other!==t&&other.id===voted.id){other.id=null;other.body=null;other.voter.reset();}
   t.id=voted.id;t.verifiedAt=at;t.strikes=0;t.suspectSince=null;
  }
 }
 // bodies: [{box:{originX,originY,width,height},score}] person boxes in source pixels.
 function updateBodies(bodies,at){
  for(const t of tracks){
   if(!t.id)continue;let best=null;const faceVisible=at-t.seenAt<=LOCK.bodyAfterMs&&!t.suspectSince;
   if(t.body&&!faceVisible){
    // Face hidden: stay with the body already bound. Someone crossing in front is nearer the camera and so
    // noticeably bigger; a box that suddenly differs in height is not the same person.
    for(const b of bodies){const score=iou(b.box,t.body.box),scale=b.box.height/t.body.box.height;if(score>=.2&&scale>.7&&scale<1.4&&(!best||score>best.score))best={b,score};}
   }else if(faceVisible||!t.body){
    // Bind (and keep re-binding) while the face says exactly where the head is: the person whose upper part
    // contains it. The smallest such box wins, so a person standing behind does not swallow the one in front.
    const head=faceVisible?{x:t.cx,y:t.cy}:predicted(t,Math.min(at,t.seenAt+250));
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
   return{key:t.key,id:t.id,via:t.lastMatch?.via||null,source,fresh:source==='coast'?at-t.seenAt<=LOCK.faceFreshMs:fresh,confirmed:!!t.id,hits:t.hits,seenAt:t.seenAt,match:t.lastMatch||null,votes:t.voter.identity.votes,box:{originX:p.x-t.width/2,originY:p.y-t.height/2,width:t.width,height:t.height}};
  });
 }
 return{
  updateFaces,updateBodies,list,reset(){tracks=[];},
  // True while a named track has lost its face, which is when the person detector is worth running.
  needsBodies:at=>tracks.some(t=>t.id&&at-t.seenAt>LOCK.bodyAfterMs),
  // Also worth an occasional look while the face is visible, so the body is already known when the face goes.
  wantsBodies:at=>tracks.some(t=>t.id&&(!t.body||at-t.body.at>LOCK.bodyRefreshMs)),
  // Boxes of faces that were recognised recently; the worker skips describing these to save time.
  knownBoxes:at=>tracks.filter(t=>t.id&&!t.suspectSince&&at-t.verifiedAt<=LOCK.verifyMs&&at-t.seenAt<=LOCK.bodyAfterMs).map(t=>({x:t.cx-t.width/2,y:t.cy-t.height/2,width:t.width,height:t.height})),
  // Native-resolution search windows around tracked faces for the cheap follow pass.
  // When there are more faces than windows, the ones nearest the reticle (`focus`, source pixels) win.
  regions:(at,limit=2,focus=null)=>tracks.filter(t=>at-t.seenAt<=LOCK.faceFreshMs).sort((a,b)=>focus?Math.hypot(a.cx-focus.x,a.cy-focus.y)-Math.hypot(b.cx-focus.x,b.cy-focus.y):b.seenAt-a.seenAt).slice(0,limit).map(t=>{const p=predicted(t,at),size=Math.max(160,t.width*3.2);return{x:p.x-size/2,y:p.y-size/2,width:size,height:size};}),
 };
}
