// A shared shot clock, rendered in the receiving phone's own camera view.
export function shotTiming(shot,serverNow,localNow){
 const duration=Math.max(1,Number(shot.flightMs)||(shot.spell==='lightning'?250:1400));
 const launched=Number.isFinite(shot.launchedAt)?shot.launchedAt:Number.isFinite(shot.at)?shot.at:serverNow;
 const impact=Number.isFinite(shot.impactAt)?shot.impactAt:launched+duration;
 return{duration,deadline:localNow+impact-serverNow,expires:localNow+(Number.isFinite(shot.expiresAt)?shot.expiresAt:impact+2500)-serverNow};
}
// How an incoming spell reads on the receiving phone. `bolt` spells draw a streak instead of a thrown
// object; `thrown:false` spells are drawn elsewhere (the skeleton army walks in on its own layer).
const describeOriginal=spell=>spell==='lightning'?{label:'lightning',rgb:'146,180,255',bolt:true}:{label:'fireball',rgb:'255,113,32'};
export function createIncomingFireballs({container,renderer,describe=describeOriginal,getAttacker=()=>null,now=()=>Date.now(),clock=()=>performance.now(),schedule=cb=>requestAnimationFrame(cb),unschedule=id=>cancelAnimationFrame(id)}){
 const active=new Map(),retired=new Set();let frame=0,outcomeUntil=0,disposed=false;
 const layer=document.createElement('div'),label=document.createElement('div'),bolt=document.createElement('div');
 layer.className='incoming-spell-warning';layer.dataset.phase='idle';layer.setAttribute('aria-hidden','true');
 Object.assign(layer.style,{position:'absolute',inset:'0',zIndex:'8',pointerEvents:'none',opacity:'0',borderRadius:'inherit',transition:'opacity 100ms linear',overflow:'hidden'});
 Object.assign(label.style,{position:'absolute',top:'max(90px, 15%)',left:'50%',transform:'translateX(-50%)',whiteSpace:'nowrap',font:'700 14px system-ui',padding:'8px 13px',borderRadius:'99px',color:'#fff',background:'rgba(18,12,8,.7)',textShadow:'0 1px 4px #000'});
 Object.assign(bolt.style,{position:'absolute',height:'5px',transformOrigin:'0 50%',background:'#eaffff',boxShadow:'0 0 10px 4px #81beff,0 0 28px 8px #956aff',display:'none'});
 layer.append(label,bolt);container.append(layer);
 const graphics=()=>typeof renderer==='function'?renderer():renderer;
 const remember=id=>{retired.add(id);if(retired.size>256)retired.delete(retired.values().next().value);};
 function remove(id,retire=false){graphics()?.cancelIncoming?.(id);active.delete(id);if(retire)remember(id);}
 function ensureFrame(){if(!disposed&&!frame)frame=schedule(tick);}
 function sourceFor(shot){const p=getAttacker(shot.actorId);return p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1?p:null;}
 function tick(){
  frame=0;if(disposed)return;const time=clock();let strongest=null;
  for(const [id,entry]of active){
   if(time>entry.expires){remove(id,true);continue;}
   const progress=Math.max(0,Math.min(1,1-(entry.deadline-time)/entry.duration)),source=sourceFor(entry.shot);
   const look=describe(entry.shot.spell);
   if(!entry.started&&source&&progress<.8&&!look.bolt&&look.thrown!==false){
    try{entry.started=!!graphics()?.incoming?.({shotId:id,style:look.style||entry.shot.spell,super:entry.shot.super||entry.shot.upgraded||look.ultimate,...source,getSource:()=>sourceFor(entry.shot),flightMs:entry.duration,elapsedMs:progress*entry.duration});}catch{entry.started=false;}
   }
   if(!strongest||progress>strongest.progress)strongest={...entry,progress,source};
  }
  if(outcomeUntil>time){ensureFrame();return;}
  bolt.style.display='none';
  if(strongest){
   const look=describe(strongest.shot.spell),lightning=!!look.bolt,rgb=look.rgb,intensity=.2+.65*strongest.progress**2;
   layer.style.opacity='1';layer.style.boxShadow=`inset 0 0 ${25+strongest.progress*55}px ${5+strongest.progress*15}px rgba(${rgb},${intensity})`;
   layer.style.background=`radial-gradient(ellipse at center,transparent 48%,rgba(${rgb},${intensity*.3}) 100%)`;
   layer.dataset.phase=strongest.progress<1?'incoming':'awaiting-impact';
   label.textContent='Incoming '+look.label;
   if(lightning&&strongest.source&&strongest.progress<1&&!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches){
    const rect=container.getBoundingClientRect(),x=strongest.source.x*rect.width,y=strongest.source.y*rect.height,dx=rect.width*.5-x,dy=rect.height*.53-y;
    Object.assign(bolt.style,{boxShadow:`0 0 10px 4px rgba(${rgb},.9),0 0 28px 8px rgba(${rgb},.55)`,display:'block',left:x+'px',top:y+'px',width:Math.hypot(dx,dy)*strongest.progress+'px',transform:`rotate(${Math.atan2(dy,dx)}rad)`});
   }
  }else{layer.style.opacity='0';layer.dataset.phase='idle';}
  if(active.size)ensureFrame();
 }
 function launch(shot){
  if(disposed||document.hidden||!shot?.shotId||active.has(shot.shotId)||retired.has(shot.shotId))return false;
  const local=clock(),timing=shotTiming(shot,now(),local);
  if(timing.expires<=local||timing.deadline<local-1000)return false;
  active.set(shot.shotId,{shot:{...shot},...timing,started:false});ensureFrame();return true;
 }
 function resolve(event){
  if(disposed||!event?.shotId||retired.has(event.shotId))return false;
  const entry=active.get(event.shotId);if(!entry)return false;remove(event.shotId,true);
  const missed=event.missed||event.outcome==='missed',blocked=event.blocked||event.outcome==='blocked';
  const look=describe(entry.shot.spell),rgb=blocked?'107,210,255':missed?'165,170,180':look.rgb;
  layer.style.opacity='1';layer.style.boxShadow=`inset 0 0 75px 22px rgba(${rgb},.85)`;layer.style.background=`rgba(${rgb},${missed ? .04 : .15})`;
  layer.dataset.phase=missed?'missed':blocked?'blocked':'hit';bolt.style.display='none';
  label.textContent=missed?'Spell fizzled':blocked?'Shield blocked it':look.hit||look.label[0].toUpperCase()+look.label.slice(1)+' hit';outcomeUntil=clock()+(missed?350:600);ensureFrame();return true;
 }
 function sync(shots=[]){
  const ids=new Set(shots.map(s=>s.shotId));for(const id of active.keys())if(!ids.has(id))remove(id,true);
  for(const shot of shots)if((shot.impactAt??shot.at+(shot.flightMs||1400))>now())launch(shot);
  ensureFrame();
 }
 function clear(){for(const id of active.keys())remove(id);retired.clear();unschedule(frame);frame=0;outcomeUntil=0;layer.style.opacity='0';layer.dataset.phase='idle';bolt.style.display='none';}
 const visibility=()=>{if(document.hidden)clear();};document.addEventListener('visibilitychange',visibility);
 function dispose(){clear();disposed=true;document.removeEventListener('visibilitychange',visibility);layer.remove();}
 return{launch,resolve,sync,clear,dispose};
}
