// Opt-in radar minimap. Owns its DOM, stylesheet, GPS watch and compass so the
// game loop only has to pass it server state. Positions are shared only after
// the player taps the radar, and are cleared when they stop, leave or disconnect.
import {RANGES,relativePosition,cameraHeading,smoothHeading,pickRange,radarPoint,formatDistance} from './geo.js?v=map1';
import {createTileMap} from './minimap-tiles.js?v=map1';
const SVG='http://www.w3.org/2000/svg',SCALE=100,VIEW=115,SOLO_RANGE=100,FRESH_MS=10000,STALE_MS=30000,SEND_MS=1000,RESEND_MS=3000;
const el=(tag,attrs={},parent)=>{const node=document.createElementNS(SVG,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);parent?.append(node);return node;};
// A stable, well separated color per player, derived from their id.
const colorFor=id=>{let hash=0;for(const ch of String(id))hash=(hash*31+ch.charCodeAt(0))>>>0;return `hsl(${hash%360} 85% 62%)`;};
const compassPoint=bearing=>['N','NE','E','SE','S','SW','W','NW'][Math.round(bearing/45)%8];
export function createMinimap({container,send,notify=()=>{},geolocation=globalThis.navigator?.geolocation}){
 if(!document.querySelector('link[data-minimap]')){const link=document.createElement('link');link.rel='stylesheet';link.href='minimap.css?v=map5';link.dataset.minimap='';document.head.append(link);}
 const root=document.createElement('div');root.className='minimap';root.hidden=true;
 root.innerHTML='<button type="button" class="minimap-radar" aria-expanded="false"><span class="minimap-cta"></span></button><div class="minimap-info"><span class="minimap-range"></span><span class="minimap-gps"></span></div><div class="minimap-zoom"><button type="button" data-zoom="out" aria-label="Zoom map out">−</button><button type="button" data-zoom="auto">Auto zoom</button><button type="button" data-zoom="in" aria-label="Zoom map in">+</button></div><ul class="minimap-list"></ul><div class="minimap-foot"><button type="button" class="minimap-stop">Stop sharing</button><p class="minimap-credit"></p></div>';
 const radar=root.querySelector('.minimap-radar'),cta=root.querySelector('.minimap-cta'),rangeLabel=root.querySelector('.minimap-range'),gpsLabel=root.querySelector('.minimap-gps'),list=root.querySelector('.minimap-list'),stopButton=root.querySelector('.minimap-stop'),credit=root.querySelector('.minimap-credit'),zoomButtons=Object.fromEntries([...root.querySelectorAll('[data-zoom]')].map(b=>[b.dataset.zoom,b]));
 const svg=el('svg',{viewBox:`${-VIEW} ${-VIEW} ${VIEW*2} ${VIEW*2}`,'aria-hidden':'true'});radar.prepend(svg);const tiles=createTileMap(radar);credit.textContent=tiles.attribution;
 for(const r of [1,2/3,1/3])el('circle',{class:'minimap-ring',r:r*SCALE},svg);
 el('line',{class:'minimap-ring',x1:-SCALE,x2:SCALE,y1:0,y2:0},svg);el('line',{class:'minimap-ring',y1:-SCALE,y2:SCALE,x1:0,x2:0},svg);
 const north=el('text',{class:'minimap-north','text-anchor':'middle','dominant-baseline':'central'},svg);north.textContent='N';
 // Every player is a round face marker: their scan photo inside a ring of their own color, or their initial
 // until a photo arrives. One shared clip path rounds every photo.
 const defs=el('defs',{},svg),clip=el('clipPath',{id:'minimap-face-clip',clipPathUnits:'objectBoundingBox'},defs);el('circle',{cx:.5,cy:.5,r:.5},clip);
 function marker(parent){const g=el('g',{class:'minimap-player'},parent);return{g,halo:el('circle',{class:'minimap-halo'},g),ring:el('circle',{class:'minimap-face-ring'},g),initial:el('text',{class:'minimap-initial','text-anchor':'middle','dominant-baseline':'central'},g),photo:el('image',{class:'minimap-face','clip-path':'url(#minimap-face-clip)',preserveAspectRatio:'xMidYMid slice'},g),label:el('text',{class:'minimap-label','text-anchor':'middle'},g)};}
 function paint(node,{radius,color,name,photo}){
  node.ring.setAttribute('r',radius+2.5);node.ring.setAttribute('fill',color);
  for(const [k,v] of Object.entries({x:-radius,y:-radius,width:radius*2,height:radius*2}))node.photo.setAttribute(k,v);
  if(node.photo.getAttribute('href')!==(photo||''))node.photo.setAttribute('href',photo||'');node.photo.style.display=photo?'':'none';
  node.initial.style.display=photo?'none':'';node.initial.setAttribute('font-size',radius*1.15);const letter=(name||'?').trim().charAt(0).toUpperCase();if(node.initial.textContent!==letter)node.initial.textContent=letter;
 }
 // Your own marker is drawn first, under everyone else's: you know where you are, and it must not hide a nearby player.
 const selfLayer=el('g',{},svg),dots=el('g',{},svg),self=marker(selfLayer),selfBeak=el('path',{class:'minimap-beak'},selfLayer);self.g.classList.add('minimap-me');let avatars=new Map();
 container.append(root);
 let players=[],myId=null,skew=0,position=null,heading=null,headingAt=0,watchId=null,sendTimer=null,lastSent=0,lastSentFix=0,compass=false,expanded=false,dirty=true,frame=0,manualRange=null,range=SOLO_RANGE,radarWidth=0;
 const nodes=new Map(),sharing=()=>watchId!==null;
 const invalidate=()=>{dirty=true;if(!frame)frame=requestAnimationFrame(()=>{frame=0;if(dirty&&!root.hidden)render();});};
 function onOrientation(event){const next=cameraHeading(event);if(next===null)return;const before=heading;heading=smoothHeading(heading,next);headingAt=Date.now();if(before===null||Math.abs(heading-before)>.5)invalidate();}
 function listenCompass(){if(compass)return;compass=true;window.addEventListener('deviceorientationabsolute',onOrientation);window.addEventListener('deviceorientation',onOrientation);}
 function publish(){if(!position||document.hidden)return;const at=Date.now();if(position.at<=lastSentFix&&at-lastSent<RESEND_MS)return;lastSent=at;lastSentFix=position.at;send({type:'location',location:{latitude:position.latitude,longitude:position.longitude,accuracy:position.accuracy}});}
 // compassGranted: the join screen already asked for motion access inside its tap, so asking again here
 // (outside any tap, where iOS would refuse) is skipped.
 async function enable({compassGranted=false}={}){
  if(sharing())return;if(!geolocation){notify('Location is unavailable in this browser.');return;}
  // iOS only grants compass access from inside a tap, so ask before anything else.
  try{if(compassGranted)listenCompass();else if(typeof DeviceOrientationEvent!=='undefined'){if(typeof DeviceOrientationEvent.requestPermission==='function'){if(await DeviceOrientationEvent.requestPermission()==='granted')listenCompass();}else listenCompass();}}catch{}
  if(sharing())return;
  watchId=geolocation.watchPosition(p=>{position={latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,at:Date.now()};publish();invalidate();},e=>{if(e.code===1){disable();notify('Allow location access in your browser settings to use the map.');}else if(!position)notify('No GPS fix yet. The map works best outdoors.');},{enableHighAccuracy:true,maximumAge:2000,timeout:20000});
  sendTimer=setInterval(publish,SEND_MS);invalidate();tiles.load().then(invalidate,()=>{});
 }
 function disable(){
  if(watchId!==null)geolocation.clearWatch(watchId);watchId=null;clearInterval(sendTimer);sendTimer=null;
  if(compass){compass=false;window.removeEventListener('deviceorientationabsolute',onOrientation);window.removeEventListener('deviceorientation',onOrientation);}
  if(position||lastSent)send({type:'location',location:null});position=null;heading=null;lastSent=0;lastSentFix=0;manualRange=null;setExpanded(false);invalidate();
 }
 function setExpanded(next){expanded=next;root.classList.toggle('expanded',expanded);radar.setAttribute('aria-expanded',String(expanded));}
 radar.onclick=()=>{if(!sharing())void enable();else{setExpanded(!expanded);invalidate();}};
 stopButton.onclick=()=>{disable();notify('Location sharing stopped.');};
 zoomButtons.in.onclick=()=>{manualRange=RANGES[Math.max(0,RANGES.indexOf(range)-1)];invalidate();};
 zoomButtons.out.onclick=()=>{manualRange=RANGES[Math.min(RANGES.length-1,RANGES.indexOf(range)+1)];invalidate();};
 zoomButtons.auto.onclick=()=>{manualRange=null;invalidate();};
 function render(){
  dirty=false;const active=sharing()&&!!position,facing=heading!==null&&Date.now()-headingAt<3000?heading:null;
  root.classList.toggle('active',active);cta.textContent=active?'':sharing()?'Locating…':'Tap to share location · show map';
  radar.setAttribute('aria-label',active?(expanded?'Shrink minimap':'Expand minimap'):'Share location to show the minimap');
  const serverNow=Date.now()-skew,seen=new Set(),rows=[];
  const visible=active?players.filter(p=>p.id!==myId&&p.connected&&p.location&&serverNow-p.location.at<STALE_MS).map(p=>({p,...relativePosition(position,p.location)})):[];
  range=manualRange??(visible.length?pickRange(visible.map(v=>v.distance)):SOLO_RANGE);
  for(const {p,distance,bearing} of visible){
   seen.add(p.id);let node=nodes.get(p.id);
   if(!node){node=marker(dots);nodes.set(p.id,node);}
   const point=radarPoint(distance,bearing,facing,range),color=colorFor(p.id);
   node.g.setAttribute('transform',`translate(${(point.x*SCALE).toFixed(1)} ${(point.y*SCALE).toFixed(1)})`);
   node.g.classList.toggle('stale',serverNow-p.location.at>FRESH_MS);node.g.classList.toggle('dead',p.health<=0);node.g.classList.toggle('clamped',point.clamped);
   const radius=(expanded?15:17)*(point.clamped?.65:1);paint(node,{radius,color,name:p.name,photo:avatars.get(p.id)});node.halo.setAttribute('fill',color);node.halo.setAttribute('r',point.clamped?0:Math.min(SCALE,p.location.accuracy/range*SCALE).toFixed(1));
   node.label.setAttribute('y',point.y>.45?-radius-8:radius+17);if(node.label.textContent!==p.name)node.label.textContent=p.name;
   rows.push({name:p.name,color,photo:avatars.get(p.id),text:`${formatDistance(distance)} ${compassPoint(bearing)}${p.health<=0?' · out':''}`,distance});
  }
  for(const [id,node] of nodes)if(!seen.has(id)){node.g.remove();nodes.delete(id);}
  const northPoint=radarPoint(1,0,facing,1);north.setAttribute('x',(northPoint.x*107).toFixed(1));north.setAttribute('y',(northPoint.y*107).toFixed(1));
  // You, at the centre: your own face in a white ring, with a small beak showing which way the camera points.
  const mine=players.find(p=>p.id===myId),selfRadius=expanded?15:17;self.g.style.display=active?'':'none';paint(self,{radius:selfRadius,color:'#f6f4ef',name:mine?.name,photo:avatars.get(myId)});self.halo.setAttribute('fill','#f6f4ef');self.halo.setAttribute('r',active?Math.min(SCALE,position.accuracy/range*SCALE).toFixed(1):0);
  selfBeak.style.display=active&&facing!==null?'':'none';selfBeak.setAttribute('d',`M0,${-selfRadius-12} L7,${-selfRadius-1.5} L-7,${-selfRadius-1.5} Z`);
  // The street map sits under the radar at the same scale: the outer ring is `range` metres.
  if(radar.clientWidth!==radarWidth){radarWidth=radar.clientWidth;tiles.resize();}
  root.classList.toggle('mapped',active&&tiles.update(position,range,radarWidth/2*SCALE/VIEW,facing));
  zoomButtons.in.disabled=range===RANGES[0];zoomButtons.out.disabled=range===RANGES[RANGES.length-1];zoomButtons.auto.disabled=manualRange===null;
  rangeLabel.textContent=active?`${formatDistance(range)} radius${facing===null?' · north up':''}`:'';gpsLabel.textContent=active?`GPS ±${Math.round(position.accuracy)} m`:'';
  const waiting=players.filter(p=>p.id!==myId&&p.connected).length-visible.length;
  list.replaceChildren(...rows.sort((a,b)=>a.distance-b.distance).map(row=>{const li=document.createElement('li'),swatch=document.createElement(row.photo?'img':'i'),name=document.createElement('b'),detail=document.createElement('span');if(row.photo){swatch.src=row.photo;swatch.alt='';}else swatch.style.background=row.color;swatch.style.borderColor=row.color;name.textContent=row.name;detail.textContent=row.text;li.append(swatch,name,detail);return li;}));
  if(active&&waiting>0){const li=document.createElement('li');li.className='minimap-waiting';li.textContent=`${waiting} player${waiting>1?'s':''} not sharing location`;list.append(li);}
 }
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){publish();invalidate();}});
 return {
  // Called with every server state. Practice modes never call this, so the map stays hidden there.
  // avatars: Map of player id to a small face photo (data URL) from their scan.
  setAvatars(next){avatars=next;invalidate();},
  update(room,id){players=room.players||[];myId=id;if(Number.isFinite(room.serverTime))skew=Date.now()-room.serverTime;root.hidden=false;invalidate();},
  stop(){disable();players=[];root.hidden=true;},
  // Starts sharing without a tap on the radar, for players who allowed location when they joined.
  enable,
  sharing,
 };
}
