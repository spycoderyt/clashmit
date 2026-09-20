// Minimap. Owns its DOM, stylesheet, GPS watch and compass so the game only has to pass it server state.
// Two views of the same thing:
//   corner   a small rounded-square map, centred on you, 50 m to each side, turning with your compass heading
//   full     tap the corner map: a full-screen map, north up, dragged and pinched like any other map
// Every player is a round face marker (their scan photo, or their initial). Positions are shared only once a
// player allows location, and are cleared when they stop, leave or disconnect.
import {relativePosition,cameraHeading,smoothHeading,radarPoint} from './geo.js?v=map1';
import {createTileMap} from './minimap-tiles.js?v=map9';
const SVG='http://www.w3.org/2000/svg',SCALE=100,VIEW=115,CORNER_METRES=50,FULL_METRES=50,FRESH_MS=10000,STALE_MS=30000,SEND_MS=1000,RESEND_MS=3000;
const el=(tag,attrs={},parent)=>{const node=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);parent?.append(node);return node;};
// A stable, well separated color per player, derived from their id.
const colorFor=id=>{let hash=0;for(const ch of String(id))hash=(hash*31+ch.charCodeAt(0))>>>0;return `hsl(${hash%360} 85% 62%)`;};
export function createMinimap({container,send,notify=()=>{},geolocation=globalThis.navigator?.geolocation}){
 if(!document.querySelector('link[data-minimap]')){const link=document.createElement('link');link.rel='stylesheet';link.href='minimap.css?v=automap2';link.dataset.minimap='';document.head.append(link);}
 const root=document.createElement('div');root.className='minimap';root.hidden=true;
 root.innerHTML='<div class="minimap-frame" role="button" aria-label="Open the full-screen map" tabindex="0"><span class="minimap-cta"></span></div><span class="minimap-range"></span><button type="button" class="minimap-close" aria-label="Close map">✕</button><button type="button" class="minimap-recenter" aria-label="Centre the map on me">◎</button><div class="minimap-foot"><button type="button" class="minimap-stop">Stop sharing</button><span class="minimap-gps"></span><span class="minimap-credit"></span></div>';
 const frame=root.querySelector('.minimap-frame'),cta=root.querySelector('.minimap-cta'),rangeLabel=root.querySelector('.minimap-range'),gpsLabel=root.querySelector('.minimap-gps'),credit=root.querySelector('.minimap-credit'),recenter=root.querySelector('.minimap-recenter');
 // ?map=<theme> previews another map theme without changing the default in minimap-tiles.js.
 const svg=el('svg',{'aria-hidden':'true'});frame.prepend(svg);const tiles=createTileMap(frame,{theme:new URLSearchParams(location.search).get('map')||undefined});credit.textContent=tiles.attribution;
 const north=el('text',{class:'minimap-north','text-anchor':'middle','dominant-baseline':'central'},svg);north.textContent='N';
 // One shared clip path rounds every photo.
 const defs=el('defs',{},svg),clip=el('clipPath',{id:'minimap-face-clip',clipPathUnits:'objectBoundingBox'},defs);el('circle',{cx:.5,cy:.5,r:.5},clip);
 function marker(parent){const g=el('g',{class:'minimap-player'},parent);return{g,halo:el('circle',{class:'minimap-halo'},g),ring:el('circle',{class:'minimap-face-ring'},g),initial:el('text',{class:'minimap-initial','text-anchor':'middle','dominant-baseline':'central'},g),photo:el('image',{class:'minimap-face','clip-path':'url(#minimap-face-clip)',preserveAspectRatio:'xMidYMid slice'},g),out:el('text',{class:'minimap-out','text-anchor':'middle','dominant-baseline':'central'},g),label:el('text',{class:'minimap-label','text-anchor':'middle'},g)};}
 function paint(node,{radius,color,name,photo,dead=false,label=''}){
  node.ring.setAttribute('r',radius+2.5);node.ring.setAttribute('fill',dead?'#7d8492':color);
  for(const [k,v] of Object.entries({x:-radius,y:-radius,width:radius*2,height:radius*2}))node.photo.setAttribute(k,v);
  if(node.photo.getAttribute('href')!==(photo||''))node.photo.setAttribute('href',photo||'');node.photo.style.display=photo?'':'none';
  node.initial.style.display=photo?'none':'';node.initial.setAttribute('font-size',radius*1.15);const letter=(name||'?').trim().charAt(0).toUpperCase();if(node.initial.textContent!==letter)node.initial.textContent=letter;
  // A knocked-out player is greyed and crossed out, so the map shows at a glance who is still in.
  node.g.classList.toggle('dead',dead);node.out.textContent=dead?'✕':'';node.out.setAttribute('font-size',radius*1.7);
  node.label.setAttribute('y',radius+15);if(node.label.textContent!==label)node.label.textContent=label;
 }
 // Your own marker is drawn first, under everyone else's: you know where you are, and it must not hide a nearby player.
 const selfLayer=el('g',{},svg),dots=el('g',{},svg),self=marker(selfLayer),selfBeak=el('path',{class:'minimap-beak'},self.g);self.g.classList.add('minimap-me');let avatars=new Map();
 container.append(root);
 let players=[],myId=null,skew=0,position=null,heading=null,headingAt=0,watchId=null,sendTimer=null,lastSent=0,lastSentFix=0,compass=false,full=false,following=true,centredAt=0,wired=false,dirty=true,frameRequest=0,size='';
 let locationStatus='Locating…';
 const nodes=new Map(),sharing=()=>watchId!==null;
 const invalidate=()=>{dirty=true;if(!frameRequest)frameRequest=requestAnimationFrame(()=>{frameRequest=0;if(dirty&&!root.hidden)render();});};
 function onOrientation(event){const next=cameraHeading(event);if(next===null)return;const before=heading;heading=smoothHeading(heading,next);headingAt=Date.now();if(before===null||Math.abs(heading-before)>.5)invalidate();}
 function listenCompass(){if(compass)return;compass=true;window.addEventListener('deviceorientationabsolute',onOrientation);window.addEventListener('deviceorientation',onOrientation);}
 function publish(){if(!position||document.hidden)return;const at=Date.now();if(position.at<=lastSentFix&&at-lastSent<RESEND_MS)return;lastSent=at;lastSentFix=position.at;send({type:'location',location:{latitude:position.latitude,longitude:position.longitude,accuracy:position.accuracy}});}
 // compassGranted: the join screen already asked for motion access inside its tap, so asking again here
 // (outside any tap, where iOS would refuse) is skipped.
 async function enable({compassGranted=false,requestCompass=true}={}){
  if(sharing())return;if(!geolocation){locationStatus='Location unavailable';invalidate();notify('Location is unavailable in this browser.');return;}
  // iOS only grants compass access from inside a tap, so ask before anything else.
  try{if(compassGranted)listenCompass();else if(typeof DeviceOrientationEvent!=='undefined'){if(typeof DeviceOrientationEvent.requestPermission==='function'){if(requestCompass&&await DeviceOrientationEvent.requestPermission()==='granted')listenCompass();}else listenCompass();}}catch{}
  if(sharing())return;
  locationStatus='Locating…';watchId=geolocation.watchPosition(p=>{position={latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,at:Date.now()};publish();invalidate();},e=>{if(e.code===1){disable();locationStatus='Location blocked';invalidate();notify('Allow location access in your browser settings to use the map.');}else if(!position)notify('No GPS fix yet. The map works best outdoors.');},{enableHighAccuracy:true,maximumAge:2000,timeout:20000});
  sendTimer=setInterval(publish,SEND_MS);invalidate();tiles.load().then(()=>{if(!wired){wired=true;tiles.onMove(invalidate);tiles.onGrab(()=>{if(full&&following){following=false;invalidate();}});}size='';invalidate();},()=>{});
 }
 function disable(){
  if(watchId!==null)geolocation.clearWatch(watchId);watchId=null;clearInterval(sendTimer);sendTimer=null;
  if(compass){compass=false;window.removeEventListener('deviceorientationabsolute',onOrientation);window.removeEventListener('deviceorientation',onOrientation);}
  if(position||lastSent)send({type:'location',location:null});position=null;heading=null;lastSent=0;lastSentFix=0;locationStatus='Location off';setFull(false);invalidate();
 }
 function setFull(next){if(full===next)return;full=next;following=true;size='';root.classList.toggle('full',full);tiles.setInteractive(full);frame.setAttribute('aria-label',full?'Map':'Open the full-screen map');frame.tabIndex=full?-1:0;invalidate();}
 const open=()=>{if(full)return;if(!sharing())void enable();else if(position)setFull(true);};
 frame.onclick=open;frame.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();open();}};
 root.querySelector('.minimap-close').onclick=()=>setFull(false);
 recenter.onclick=()=>{following=true;centredAt=0;invalidate();};
 root.querySelector('.minimap-stop').onclick=()=>{disable();notify('Location sharing stopped.');};
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&full)setFull(false);});
 function render(){
  dirty=false;const active=sharing()&&!!position,facing=heading!==null&&Date.now()-headingAt<3000?heading:null,width=frame.clientWidth,height=frame.clientHeight;
  root.classList.toggle('active',active);cta.textContent=active?'':sharing()?'Locating…':locationStatus;if(!active&&full)setFull(false);
  const resized=size!==`${width}x${height}x${full}`;if(resized){size=`${width}x${height}x${full}`;tiles.resize();svg.setAttribute('viewBox',full?`0 0 ${width} ${height}`:`${-VIEW} ${-VIEW} ${VIEW*2} ${VIEW*2}`);}
  // Corner view: the map is a backdrop scaled so 50 m reaches the edge. Full view: the map decides, we project onto it.
  let mapped=false;
  // While following, the full-screen map re-centres only when there is a new fix, never in answer to its own move events.
  if(active&&full){if(tiles.ready&&(resized||(following&&centredAt!==position.at))){centredAt=position.at;tiles.centerOn(position,resized?FULL_METRES:null,Math.min(width,height)/2);}mapped=tiles.ready;}
  else if(active)mapped=tiles.follow(position,CORNER_METRES,width/2*SCALE/VIEW,facing);
  root.classList.toggle('mapped',mapped);
  // Where a position lands in the current view, plus how many view units make a metre there.
  const perMetre=full?1/(tiles.metresPerPixel(position?.latitude||0)||FULL_METRES/(Math.min(width,height)/2)):SCALE/CORNER_METRES;
  const place=location=>{
   if(full){const p=tiles.project(location.latitude,location.longitude);if(p)return{x:p.x,y:p.y,clamped:false};const r=relativePosition(position,location),q=radarPoint(r.distance,r.bearing,null,Infinity);return{x:width/2+Math.sin(r.bearing*Math.PI/180)*r.distance*perMetre,y:height/2-Math.cos(r.bearing*Math.PI/180)*r.distance*perMetre,clamped:q.clamped};}
   const r=relativePosition(position,location),q=radarPoint(r.distance,r.bearing,facing,CORNER_METRES);return{x:q.x*SCALE,y:q.y*SCALE,clamped:q.clamped};
  };
  const serverNow=Date.now()-skew,seen=new Set(),radius=full?22:17;
  const visible=active?players.filter(p=>p.id!==myId&&p.connected&&p.location&&serverNow-p.location.at<STALE_MS):[];
  for(const p of visible){
   seen.add(p.id);let node=nodes.get(p.id);if(!node){node=marker(dots);nodes.set(p.id,node);}
   const point=place(p.location),color=colorFor(p.id),r=radius*(point.clamped?.65:1);
   node.g.setAttribute('transform',`translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})`);node.g.classList.toggle('stale',serverNow-p.location.at>FRESH_MS);
   paint(node,{radius:r,color,name:p.name,photo:avatars.get(p.id),dead:p.health<=0,label:full?p.name:''});node.halo.setAttribute('fill',color);node.halo.setAttribute('r',point.clamped?0:Math.min(full?400:SCALE,p.location.accuracy*perMetre).toFixed(1));
  }
  for(const [id,node] of nodes)if(!seen.has(id)){node.g.remove();nodes.delete(id);}
  // You: your own face in a white ring, with a small beak showing which way the camera points.
  const mine=players.find(p=>p.id===myId);self.g.style.display=active?'':'none';
  if(active){const at=full?place(position):{x:0,y:0};self.g.setAttribute('transform',`translate(${at.x.toFixed(1)} ${at.y.toFixed(1)})`);paint(self,{radius,color:'#f6f4ef',name:mine?.name,photo:avatars.get(myId),dead:mine?.health<=0,label:full?'You':''});self.halo.setAttribute('fill','#f6f4ef');self.halo.setAttribute('r',Math.min(full?400:SCALE,position.accuracy*perMetre).toFixed(1));
   selfBeak.style.display=facing!==null?'':'none';selfBeak.setAttribute('d',`M0,${-radius-12} L7,${-radius-1.5} L-7,${-radius-1.5} Z`);selfBeak.setAttribute('transform',`rotate(${full&&facing!==null?facing.toFixed(1):0})`);}
  // North: around the rim of the turning corner map; the full-screen map is always north up.
  north.style.display=active&&!full?'':'none';const n=radarPoint(1,0,facing,1);north.setAttribute('x',(n.x*100).toFixed(1));north.setAttribute('y',(n.y*100).toFixed(1));
  rangeLabel.textContent=active&&!full?`${CORNER_METRES} m${facing===null?' · north up':''}`:'';gpsLabel.textContent=active?`GPS ±${Math.round(position.accuracy)} m`:'';
  recenter.hidden=!full||following;
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){publish();invalidate();}});
 window.addEventListener('resize',()=>{size='';invalidate();});
 return {
  // Called with every server state. Practice modes never call this, so the map stays hidden there.
  update(room,id){players=room.players||[];myId=id;if(Number.isFinite(room.serverTime))skew=Date.now()-room.serverTime;root.hidden=false;invalidate();},
  // avatars: Map of player id to a small face photo (data URL) from their scan.
  setAvatars(next){avatars=next;invalidate();},
  stop(){disable();locationStatus='Locating…';players=[];root.hidden=true;},
  // Starts sharing without a tap on the map, for players who allowed location when they joined.
  enable,
  setPermission(state){if(!sharing()&&state==='denied'){locationStatus='Location blocked';invalidate();}},
  sharing,
 };
}
