import {ORBITAL} from './orbital-rules.js';
import {createTileMap} from './minimap-tiles.js';
const R=6378137,RAD=Math.PI/180,FRESH_MS=15000;
const COLORS={mage:'#76baff',witch:'#ca9aff',archer:'#f3cc73'};
const SPELL_COLORS={lightning:'#a7d6ff',fireball:'#ff9b54',meteor:'#ff725d',poison:'#a6e979',skeletonArmy:'#e8e1c5',soulReaper:'#c492ff',arrows:'#f3cc73',bombArrow:'#ffb764',ballista:'#ffe4a0',heal:'#8fe2a2',shield:'#7fbfff',flashbang:'#ffffff',orbital:'#ff846f'};
const valid=p=>p&&Number.isFinite(p.latitude)&&Math.abs(p.latitude)<85&&Number.isFinite(p.longitude)&&Math.abs(p.longitude)<=180;
const xy=p=>({x:R*p.longitude*RAD,y:R*Math.log(Math.tan(Math.PI/4+p.latitude*RAD/2))});
const unxy=p=>({latitude:(2*Math.atan(Math.exp(p.y/R))-Math.PI/2)/RAD,longitude:p.x/R/RAD});
export function fitLiveView(points,width,height){
 const coords=points.filter(valid).map(xy);if(!coords.length||!(width>0)||!(height>0))return null;
 const xs=coords.map(p=>p.x),ys=coords.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const center=unxy({x:(minX+maxX)/2,y:(minY+maxY)/2}),scale=Math.cos(center.latitude*RAD);
 return{...center,metresPerPixel:Math.max(.22,(maxX-minX)*scale/Math.max(80,width-110),(maxY-minY)*scale/Math.max(80,height-140))};
}
export function projectLivePoint(point,view,width,height){
 if(!valid(point)||!valid(view)||!(view.metresPerPixel>0))return null;
 const p=xy(point),c=xy(view),scale=Math.cos(view.latitude*RAD)/view.metresPerPixel;
 return{x:width/2+(p.x-c.x)*scale,y:height/2-(p.y-c.y)*scale};
}

// Portraits change far less often than map snapshots. Keep one decoded image per player.
export function createLivePortraitCache({makeImage=()=>new Image(),onLoad=()=>{}}={}){
 const entries=new Map();
 function release(entry){entry.image.onload=null;entry.image.onerror=null;entry.image.src='';}
 function sync(players){
  const ids=new Set(players.map(player=>player.id));
  for(const [id,entry] of entries)if(!ids.has(id)){entries.delete(id);release(entry);}
  for(const player of players){
   const source=typeof player.avatar==='string'&&/^data:image\/(?:jpeg|png|webp);base64,/.test(player.avatar)?player.avatar:null;
   const previous=entries.get(player.id);if(previous?.source===source)continue;
   if(previous){entries.delete(player.id);release(previous);}if(!source)continue;
   const image=makeImage(),entry={source,image,loaded:false};entries.set(player.id,entry);
   image.onload=()=>{if(entries.get(player.id)!==entry)return;entry.loaded=image.naturalWidth>0&&image.naturalHeight>0;onLoad();};
   image.onerror=()=>{if(entries.get(player.id)!==entry)return;entry.loaded=false;onLoad();};
   image.src=source;
  }
 }
 return{sync,get(id){const entry=entries.get(id);return entry?.loaded?entry.image:null;},clear(){for(const entry of entries.values())release(entry);entries.clear();}};
}

export function createLiveMap(host,{onCount=()=>{},createTiles=createTileMap}={}){
 const tiles=createTiles(host,{theme:'midnight'}),canvas=document.createElement('canvas');canvas.className='live-map-overlay';canvas.setAttribute('aria-hidden','true');host.append(canvas);
 const empty=document.createElement('div');empty.className='live-map-empty';const title=document.createElement('strong'),hint=document.createElement('span');title.textContent='Waiting for player locations';hint.textContent='The map appears when players share their GPS location.';empty.append(title,hint);host.append(empty);
 const attribution=document.createElement('div');attribution.className='live-map-attribution';
 for(const [text,url] of [['OpenFreeMap','https://openfreemap.org/'],['OpenMapTiles','https://openmaptiles.org/'],['© OpenStreetMap','https://www.openstreetmap.org/copyright']]){if(attribution.childNodes.length)attribution.append(' · ');const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.textContent=text;attribution.append(a);}host.append(attribution);
 const context=canvas.getContext('2d');let players=[],casts=new Map(),view=null,targetView=null,width=1,height=1,visible=true,raf=0,lastFrame=0,animateUntil=0,anchorServer=Date.now(),anchorLocal=performance.now(),loading=false,destroyed=false;
 const positions=new Map(),portraits=createLivePortraitCache({onLoad:()=>{animateUntil=performance.now()+100;request();}}),clock=()=>anchorServer+performance.now()-anchorLocal;
 // Many simultaneous casts share their caster/target coordinates. Project each unique point once per frame.
 const projections=new Map(),labelsByPlayer=new Map();
 function project(point){
  let row=projections.get(point.latitude);if(!row){row=new Map();projections.set(point.latitude,row);}
  if(!row.has(point.longitude))row.set(point.longitude,tiles.ready?tiles.project(point.latitude,point.longitude):projectLivePoint(point,view,width,height));
  return row.get(point.longitude);
 }
 function labelFor(player){
  const fullName=String(player.name||'Player');let label=labelsByPlayer.get(player.id);
  if(!label||label.fullName!==fullName){const words=fullName.trim().split(/\s+/);label={fullName,name:fullName.slice(0,20),initials:[words[0],...(words.length>1?[words.at(-1)]:[])].map(word=>Array.from(word)[0]||'').join('').toUpperCase(),width:null};labelsByPlayer.set(player.id,label);}
  return label;
 }
 function fontsChanged(){for(const label of labelsByPlayer.values())label.width=null;animateUntil=performance.now()+100;request();}
 document.fonts?.addEventListener('loadingdone',fontsChanged);
 function resize(){if(destroyed)return;const box=host.getBoundingClientRect();width=Math.max(1,box.width);height=Math.max(1,box.height);const dpr=Math.min(2,devicePixelRatio||1);if(canvas.width!==Math.round(width*dpr))canvas.width=Math.round(width*dpr);if(canvas.height!==Math.round(height*dpr))canvas.height=Math.round(height*dpr);context?.setTransform(dpr,0,0,dpr,0,0);tiles.resize();targetView=fitLiveView(players.map(p=>p.location),width,height);animateUntil=performance.now()+500;request();}
 function request(){if(!destroyed&&visible&&!raf)raf=requestAnimationFrame(frame);}
 function duration(cast){if(cast.kind==='impact')return 500;return cast.kind==='orbital'||cast.spell==='orbital'?Math.max(1000,cast.flightMs||5000):['heal','shield','flashbang'].includes(cast.spell)?1100:Math.max(180,cast.flightMs||500);}
 function drawCast(cast,now){
  const elapsed=now-cast.at,flight=duration(cast),tail=cast.kind==='orbital'?900:600;
  if(elapsed<0||elapsed>flight+tail)return;
  const source=cast.from||cast.point||players.find(p=>p.id===cast.actorId)?.location,target=cast.to||cast.point||players.find(p=>p.id===cast.targetId)?.location||source;
  if(!valid(source)||!valid(target))return;const a=project(source),b=project(target);if(!a||!b)return;
  const t=Math.min(1,elapsed/flight),fade=elapsed<=flight?1:Math.max(0,1-(elapsed-flight)/tail),color=cast.blocked?'#76baff':cast.missed?'#7c91ac':SPELL_COLORS[cast.spell]||'#f3cc73';context.save();context.globalAlpha=fade;
  if(cast.kind==='impact'){
   context.beginPath();context.arc(b.x,b.y,5+22*t,0,Math.PI*2);context.strokeStyle=color;context.lineWidth=2;context.globalAlpha=fade*(1-t*.7);context.stroke();
   if(cast.missed||cast.blocked){context.font='500 11px \"IBM Plex Sans\", sans-serif';context.textAlign='center';context.fillStyle=color;context.fillText(cast.blocked?'Blocked':'Miss',b.x,b.y-18);}
  }else if(cast.kind==='orbital'||cast.spell==='orbital'){
   const centre=project(cast.point||target),radius=(cast.radius||ORBITAL.radius)/view.metresPerPixel;context.beginPath();context.arc(centre.x,centre.y,Math.max(8,radius),0,Math.PI*2);context.fillStyle='#ff725d22';context.fill();context.strokeStyle=color;context.lineWidth=2;context.setLineDash([5,5]);context.stroke();context.setLineDash([]);
   context.fillStyle='#fff1e9';context.font='600 12px "IBM Plex Sans", sans-serif';context.textAlign='center';context.fillText(elapsed<flight?`Airstrike · ${Math.ceil((flight-elapsed)/1000)}s`:'Impact',centre.x,centre.y-radius-10);
   const y=centre.y-(1-t)*Math.min(140,height*.3);context.beginPath();context.moveTo(centre.x,y-8);context.lineTo(centre.x+4,y+4);context.lineTo(centre.x-4,y+4);context.closePath();context.fillStyle=color;context.fill();
  }else if(['heal','shield','flashbang'].includes(cast.spell)){
   const radius=10+34*t;context.beginPath();context.arc(a.x,a.y,radius,0,Math.PI*2);context.strokeStyle=color;context.lineWidth=cast.spell==='shield'?3:2;context.globalAlpha=fade*(1-t*.75);context.stroke();context.fillStyle=color;context.font='600 11px "IBM Plex Sans", sans-serif';context.textAlign='center';context.fillText(cast.spell==='heal'?'Heal':cast.spell==='shield'?'Shield':'Flashbang',a.x,a.y-radius-8);
  }else if(cast.spell==='lightning'){
   const nx=-(b.y-a.y),ny=b.x-a.x,length=Math.max(1,Math.hypot(nx,ny));context.beginPath();context.moveTo(a.x,a.y);
   for(let i=1;i<=6;i++){const along=i/6,jitter=i===6?0:(i%2?1:-1)*5;context.lineTo(a.x+(b.x-a.x)*along+nx/length*jitter,a.y+(b.y-a.y)*along+ny/length*jitter);}context.strokeStyle=color;context.lineWidth=2.5;context.globalAlpha=fade;context.stroke();
  }else{
   context.beginPath();context.moveTo(a.x,a.y);context.lineTo(b.x,b.y);context.strokeStyle=color;context.lineWidth=1;context.globalAlpha=.22*fade;context.stroke();context.globalAlpha=fade;
   const x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t;context.beginPath();context.arc(x,y,t===1?5+12*(1-fade):5,0,Math.PI*2);context.fillStyle=color;if(t<1)context.fill();else{context.lineWidth=2;context.strokeStyle=color;context.stroke();}
  }
  context.restore();
 }
 function drawPlayers(){
  const labels=[];
  for(const player of players){
   const label=labelFor(player),saved=positions.get(player.id);if(!saved)continue;saved.latitude+=(player.location.latitude-saved.latitude)*.3;saved.longitude+=(player.location.longitude-saved.longitude)*.3;
   const point=project(saved);if(!point)continue;const color=COLORS[player.persona]||COLORS.mage,hp=Math.max(0,Math.min(1,(player.health||0)/70));
   context.beginPath();context.arc(point.x,point.y,18,0,Math.PI*2);context.fillStyle='#081c37';context.fill();
   const portrait=portraits.get(player.id);
   if(portrait){
    const size=Math.min(portrait.naturalWidth,portrait.naturalHeight);context.save();context.beginPath();context.arc(point.x,point.y,14,0,Math.PI*2);context.clip();
    context.drawImage(portrait,(portrait.naturalWidth-size)/2,(portrait.naturalHeight-size)/2,size,size,point.x-14,point.y-14,28,28);context.restore();
   }else{
    context.fillStyle=player.health>0?color:'#75869d';context.font='600 12px "IBM Plex Sans", sans-serif';context.textAlign='center';context.fillText(label.initials,point.x,point.y+4);
   }
   context.beginPath();context.arc(point.x,point.y,16,0,Math.PI*2);context.strokeStyle='#39495e';context.lineWidth=2;context.stroke();
   context.beginPath();context.arc(point.x,point.y,16,-Math.PI/2,-Math.PI/2+Math.PI*2*hp);context.strokeStyle=hp>.5?'#a8dbaa':hp>.25?'#f3cc73':'#ef8a83';context.stroke();
   const name=label.name;context.font='500 12px "IBM Plex Sans", sans-serif';const labelWidth=label.width??=(context.measureText(name).width+12);
   for(const offset of [{x:23,y:-10},{x:23,y:10},{x:-labelWidth-23,y:-10},{x:-labelWidth-23,y:10}]){
    const box={x:Math.max(3,Math.min(width-labelWidth-3,point.x+offset.x)),y:Math.max(3,Math.min(height-35,point.y+offset.y-8)),w:labelWidth,h:20};
    if(labels.some(p=>box.x<p.x+p.w+3&&box.x+box.w+3>p.x&&box.y<p.y+p.h+3&&box.y+box.h+3>p.y))continue;
    labels.push(box);context.fillStyle='#081c37e8';context.fillRect(box.x,box.y,box.w,box.h);context.fillStyle='#eef4fb';context.textAlign='left';context.fillText(name,box.x+6,box.y+14);break;
   }
  }
 }
 function frame(time){
  raf=0;if(!visible||!context)return;if(time-lastFrame<32){request();return;}lastFrame=time;projections.clear();context.clearRect(0,0,width,height);
  if(!targetView)return;
  if(!view)view={...targetView};else for(const key of ['latitude','longitude','metresPerPixel'])view[key]+=(targetView[key]-view[key])*.18;
  if(tiles.ready)tiles.follow(view,view.metresPerPixel*Math.min(width,height)/2,Math.min(width,height)/2,null);
  else{context.strokeStyle='#203653';context.lineWidth=1;for(let x=0;x<width;x+=40){context.beginPath();context.moveTo(x,0);context.lineTo(x,height);context.stroke();}for(let y=0;y<height;y+=40){context.beginPath();context.moveTo(0,y);context.lineTo(width,y);context.stroke();}}
  const now=clock();for(const [id,cast] of casts){if(now-cast.at>duration(cast)+1000){casts.delete(id);continue;}drawCast(cast,now);}drawPlayers();
  if(casts.size||time<animateUntil)request();
 }
 function update(data={},serverTime=Date.now()){
  if(destroyed)return;
  if(Number.isFinite(serverTime)){anchorServer=serverTime;anchorLocal=performance.now();}
  players=(data.players||[]).filter(p=>valid(p.location)&&Number.isFinite(p.location.at)&&serverTime-p.location.at>=-1000&&serverTime-p.location.at<=FRESH_MS);
  portraits.sync(players);
  const ids=new Set(players.map(p=>p.id));for(const id of labelsByPlayer.keys())if(!ids.has(id))labelsByPlayer.delete(id);for(const id of positions.keys())if(!ids.has(id))positions.delete(id);for(const p of players)if(!positions.has(p.id))positions.set(p.id,{...p.location});
  for(const cast of data.casts||[])if(cast.id!==undefined&&Number.isFinite(cast.at)&&serverTime-cast.at<12000)casts.set(cast.id,cast);
  targetView=fitLiveView(players.map(p=>p.location),width,height);empty.hidden=players.length>0;onCount(players.length);host.setAttribute('aria-label',`GPS map with ${players.length} players. Spell positions are estimates.`);
  if(players.length&&!loading){loading=true;void tiles.load().then(()=>{resize();},()=>{loading=false;});}
  animateUntil=performance.now()+450;request();
 }
 const observer=new ResizeObserver(resize);observer.observe(host);resize();
 return{update,setVisible(on){if(destroyed)return;visible=on;if(!visible){cancelAnimationFrame(raf);raf=0;}else{resize();request();}},destroy(){destroyed=true;visible=false;document.fonts?.removeEventListener('loadingdone',fontsChanged);labelsByPlayer.clear();projections.clear();cancelAnimationFrame(raf);observer.disconnect();portraits.clear();host.replaceChildren();}};
}
