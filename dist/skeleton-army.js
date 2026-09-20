// The skeleton army walks on the ground. Nothing here detects a real floor: the tracker reports a face
// (or a head estimated from a body), so the feet are estimated from it and the near ground is the top of the HUD.
// A face box is about 15cm wide and an adult's feet are about 157cm below the middle of their face.
const FACE_WIDTHS_TO_FEET=10;
export function feetOf(box,aspect=9/16){
 if(!box||!(box.width>0)||!(aspect>0))return null;
 // Box units are fractions of the view's width and height; heights below are fractions of its height.
 const person=FACE_WIDTHS_TO_FEET*box.width*aspect,y=box.y+box.height/2+person;
 return{x:box.x+box.width/2,y,size:Math.max(.045,Math.min(.2,person*.3))};
}
const clamp=(v,lo=0,hi=1)=>Math.max(lo,Math.min(hi,v)),lerp=(a,b,t)=>a+(b-a)*t;
const BONES='<svg viewBox="0 0 40 60" width="40" height="60" aria-hidden="true"><ellipse cx="20" cy="58.6" rx="12" ry="2.8" fill="#0008"/><g stroke="#14161b" stroke-width="1.1" fill="#f4f1e2">'
 +'<g class="leg leg-l"><rect x="14.6" y="38" width="3.4" height="19" rx="1.7"/><rect x="11.5" y="55.4" width="7.5" height="3.2" rx="1.6"/></g>'
 +'<g class="leg leg-r"><rect x="22" y="38" width="3.4" height="19" rx="1.7"/><rect x="21" y="55.4" width="7.5" height="3.2" rx="1.6"/></g>'
 +'<rect x="18.5" y="18" width="3" height="21" rx="1.5"/><rect x="12" y="22.5" width="16" height="2.5" rx="1.2"/><rect x="12.6" y="26.8" width="14.8" height="2.5" rx="1.2"/><rect x="13.4" y="31.1" width="13.2" height="2.5" rx="1.2"/><rect x="13.5" y="36" width="13" height="3.6" rx="1.8"/>'
 +'<g class="arm arm-l"><rect x="7.8" y="21.5" width="3.1" height="15" rx="1.5"/></g><g class="arm arm-r"><rect x="29.1" y="21.5" width="3.1" height="15" rx="1.5"/></g>'
 +'<rect x="15" y="13.5" width="10" height="6" rx="2.4"/><circle cx="20" cy="9.6" r="8.6"/>'
 +'<g class="face" fill="#14161b" stroke="none"><circle cx="16.4" cy="9.4" r="2.3"/><circle cx="23.6" cy="9.4" r="2.3"/><rect x="19.2" y="12.4" width="1.6" height="2.4" rx=".8"/></g></g></svg>';
const MARCHERS=12,CROWD=9,NEAR_SIZE=.2,ARRIVE_SIZE=.34;
// Apparent size goes as 1/distance, so a straight blend looks flat. Walking at a steady pace, an army
// coming at you creeps while it is far and then looms; one marching away shrinks fast and then crawls.
// Returns the size at `t` and how far along the screen path that size puts the soldier.
function perspective(from,to,t){const size=1/lerp(1/from,1/to,t),span=to-from;return{size,along:Math.abs(span)<1e-6?t:(size-from)/span};}
// Fixed per-soldier constants keep each skeleton in its own lane from frame to frame.
const soldier=i=>{const h=Math.sin((i+1)*12.9898)*43758.5453,r=h-Math.floor(h);return{lane:(i+.5)/MARCHERS,stagger:r,phase:r*6.283,ring:i*2.39996};};
export function createSkeletonArmy(container,{clock=()=>performance.now()}={}){
 const layer=document.createElement('div');layer.className='skeleton-army';layer.setAttribute('aria-hidden','true');container.append(layer);
 const groups=new Map(),lastFeet=new Map();
 function group(key,count,clawing,away=false){
  let g=groups.get(key);if(g)return g;
  g={key,soldiers:Array.from({length:count},(_,i)=>{const el=document.createElement('div');el.className='skel'+(clawing?' claw':'')+(away?' away':'');el.innerHTML=BONES;el.style.setProperty('--skel-delay',(-soldier(i).stagger*.4).toFixed(2)+'s');layer.append(el);return{el,...soldier(i),lane:(i+.5)/count};})};
  groups.set(key,g);return g;
 }
 function place(s,x,y,size,view){const k=size*view.height/60;s.el.style.transform=`translate3d(${(x*view.width).toFixed(1)}px,${(y*view.height).toFixed(1)}px,0) scale(${k.toFixed(3)})`;s.el.style.zIndex=String(Math.round(y*1000));}
 function retire(g){groups.delete(g.key);for(const s of g.soldiers)s.el.classList.add('gone');setTimeout(()=>{for(const s of g.soldiers)s.el.remove();},450);}
 // Each army belongs to one other player: `who` is that player's id and `feet` where they stand now, or null
 // while they are out of sight. `ground` is where the near ground meets the HUD, as a fraction of the view's height.
 //   outgoing: [{id,who,progress,feet}]  my armies marching at a player
 //   incoming: [{id,who,progress,feet}]  a player's army marching at me
 //   mobbed:   [{who,feet}]              players my landed army is attacking
 function update({outgoing=[],incoming=[],mobbed=[],onMe=false,ground=.62}={}){
  const rect=container.getBoundingClientRect(),view={width:rect.width,height:rect.height};if(!view.width||!view.height)return;
  const aspect=view.width/view.height,time=clock(),wanted=new Set();
  // Feet hidden behind the HUD, or that player not sighted yet: stand the army on the visible ground instead.
  const standing=(who,feet)=>{if(feet)lastFeet.set(who,feet);const seen=feet||lastFeet.get(who)||{x:.5,y:ground-.12,size:.07};return{x:seen.x,y:Math.min(seen.y,ground-.02),size:seen.size};};
  const bob=(s,size)=>Math.abs(Math.sin(time*.012+s.phase))*size*.07;
  const spot=(far,s)=>({x:far.x+(s.lane-.5)*far.size*2.4/aspect,y:far.y+(s.stagger-.5)*far.size*.35});
  for(const {id,who,progress,feet} of outgoing){
   const g=group('out:'+id,MARCHERS,false,true),far=standing(who,feet);wanted.add(g.key);
   for(const s of g.soldiers){const t=clamp(progress*1.3-s.stagger*.3),to=spot(far,s),{size,along}=perspective(NEAR_SIZE,far.size,t);place(s,lerp(.1+.8*s.lane,to.x,along),lerp(ground+.05,to.y,along)-bob(s,size),size,view);}
  }
  for(const {id,who,progress,feet} of incoming){
   const g=group('in:'+id,MARCHERS,false),far=standing(who,feet);wanted.add(g.key);
   // They fan out across the view and walk on past its bottom edge: at you, not to a spot in front of you.
   for(const s of g.soldiers){const t=clamp(progress*1.3-s.stagger*.3),from=spot(far,s),{size,along}=perspective(far.size,ARRIVE_SIZE,t);place(s,lerp(from.x,-.05+1.1*s.lane,along),lerp(from.y,ground+.1,along)-bob(s,size),size,view);}
  }
  for(const {who,feet} of mobbed){
   if(!feet)continue; // a mob is only drawn on a player who can be seen
   const g=group('mob:'+who,MARCHERS,true,true),far=standing(who,feet);wanted.add(g.key);
   // A flattened ring reads as a crowd standing on the ground around the legs.
   for(const s of g.soldiers){const r=far.size*(.45+.7*s.stagger);place(s,far.x+Math.cos(s.ring)*r/aspect,far.y+Math.sin(s.ring)*r*.3-bob(s,far.size)*1.6,far.size,view);}
  }
  if(onMe){
   const g=group('me',CROWD,true);wanted.add(g.key);
   for(const s of g.soldiers){const size=NEAR_SIZE*(.72+.2*s.stagger);place(s,.06+.88*s.lane,ground+size*.18-bob(s,size)*2.2,size,view);}
  }
  for(const g of [...groups.values()])if(!wanted.has(g.key))retire(g);
 }
 function clear(){for(const g of [...groups.values()]){groups.delete(g.key);for(const s of g.soldiers)s.el.remove();}lastFeet.clear();}
 return{update,clear,dispose(){clear();layer.remove();},get active(){return groups.size>0;}};
}
