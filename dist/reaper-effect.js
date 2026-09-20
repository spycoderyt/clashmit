// A visual-only reaper sweep. The server still owns the hit and its timing.
const CSS=`
.reaper-effect{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:6;--reaper-rim:#91e6df}
.reaper-effect.upgraded{--reaper-rim:#c5a1ff}
.reaper-sprite{position:absolute;left:0;top:0;height:auto;max-width:none;pointer-events:none;filter:drop-shadow(1px 0 1px var(--reaper-rim)) drop-shadow(-1px 0 1px var(--reaper-rim));will-change:transform,opacity}
.reaper-echo{filter:drop-shadow(0 0 5px #c5a1ff) drop-shadow(1px 0 1px #efe2ff)}
.reaper-scythe-cut,.reaper-burst,.reaper-spark{position:absolute;left:0;top:0;pointer-events:none;opacity:0;will-change:transform,opacity}
.reaper-scythe-cut{height:68px;border-top:6px solid #fff6ff;border-right:3px solid #c5a1ff;border-radius:50%;filter:drop-shadow(0 0 4px #aa74ff)}
.reaper-burst{width:52px;height:52px;border:2px solid #d4b7ff;border-radius:50%;box-shadow:inset 0 0 10px #b991ff55}
.reaper-spark{width:14px;height:2px;background:#f8f0ff;border-left:5px solid #b88bff;transform-origin:left center}
.reaper-cut{position:absolute;left:0;top:0;height:4px;background:#f5f1ff;border-left:3px solid var(--reaper-rim);box-shadow:0 0 5px var(--reaper-rim);opacity:0;transform-origin:center;pointer-events:none}
`;
const clamp=value=>Math.max(0,Math.min(1,value));
const lerp=(a,b,t)=>a+(b-a)*t;
const curve=(a,b,c,t)=>({x:(1-t)**2*a.x+2*(1-t)*t*b.x+t*t*c.x,y:(1-t)**2*a.y+2*(1-t)*t*b.y+t*t*c.y});
function path(progress,target){
 const u=clamp(progress);
 if(u<.32)return curve({x:1.08,y:.8},{x:.72,y:-.22},{x:.15,y:.3},u/.32);
 if(u<.64)return curve({x:.15,y:.3},{x:-.05,y:.86},{x:.78,y:.21},(u-.32)/.32);
 return curve({x:.78,y:.21},{x:target.x+.22,y:target.y-.35},target,(u-.64)/.36);
}
function spectralPath(progress,target,index){
 const starts=[{x:-.12,y:.82},{x:1.12,y:.12},{x:.42,y:-.22}],bends=[{x:.87,y:-.12},{x:.03,y:.88},{x:1.02,y:.62}];
 const t=clamp((progress-index*.045)/(.86-index*.045));
 return{...curve(starts[index],bends[index],target,t),progress:t};
}
export function createReaperEffect(container){
 if(!document.querySelector('style[data-reaper-effect]')){const style=document.createElement('style');style.dataset.reaperEffect='';style.textContent=CSS;document.head.append(style);}
 const active=[];let frame=0;
 function remove(effect){for(const timer of effect.timers)clearTimeout(timer);effect.root.remove();const index=active.indexOf(effect);if(index>=0)active.splice(index,1);}
 function clear(){cancelAnimationFrame(frame);frame=0;for(const effect of [...active])remove(effect);}
 function readTarget(effect){
  let next;try{next=effect.getTarget?.();}catch{/* Keep the last visible target. */}
  if(Number.isFinite(next?.x)&&Number.isFinite(next?.y))effect.target={x:clamp(next.x),y:clamp(next.y)};
  return effect.target;
 }
 function paint(effect,time){
  const age=time-effect.started,u=clamp(age/effect.flight),impact=age-effect.flight,target=readTarget(effect);
  if(impact>=320){remove(effect);return;}
  const fade=impact<0?1:1-clamp(impact/320);
  effect.images.forEach((image,index)=>{
   const trail=effect.images.length-1-index,echo=effect.upgraded&&trail>0,at=effect.upgraded?u:Math.max(0,u-trail*.055),point=echo?spectralPath(u,target,index):path(at,target);
   const sweep=echo?lerp(index%2?-65:65,index%2?40:-40,point.progress):at<.32?lerp(-25,28,at/.32):at<.64?lerp(28,-32,(at-.32)/.32):lerp(-32,48,(at-.64)/.36);
   const size=echo?lerp(.62,.92,point.progress):lerp(.72,1.02,at)*(effect.upgraded?1.15:1);
   image.style.transform=`translate3d(${point.x*effect.width}px,${point.y*effect.height}px,0) translate(-65%,-42%) rotate(${sweep}deg) scale(${size})`;
   const opacity=echo?Math.pow(Math.max(0,Math.sin(point.progress*Math.PI)),.65)*.42:trail?.14/trail:1;
   image.style.opacity=String(fade*opacity*(trail&&impact>=0?0:1));
  });
  if(impact>=0){
   effect.cut.style.opacity=String(fade);effect.cut.style.transform=`translate3d(${target.x*effect.width}px,${target.y*effect.height}px,0) translate(-50%,-50%) rotate(-48deg) scaleX(${1+clamp(impact/160)*.65})`;
   if(effect.upgraded){
    const at=clamp(impact/320),position=`translate3d(${target.x*effect.width}px,${target.y*effect.height}px,0)`;
    effect.arc.style.opacity=String(fade);effect.arc.style.transform=`${position} translate(-50%,-50%) rotate(${-65+at*35}deg) scale(${.72+at*.65})`;
    effect.burst.style.opacity=String(fade*.8);effect.burst.style.transform=`${position} translate(-50%,-50%) scale(${.35+at*2.8})`;
    effect.sparks.forEach((spark,index)=>{spark.style.opacity=String(fade);spark.style.transform=`${position} rotate(${index*60+18}deg) translateX(${16+at*(48+(index%2)*20)}px) scaleX(${1-at*.65})`;});
   }
  }
 }
 function tick(time){
  frame=0;if(document.hidden){clear();return;}
  for(const effect of [...active])if(!effect.reduced)paint(effect,time);
  if(active.some(effect=>!effect.reduced))frame=requestAnimationFrame(tick);
 }
 function fire({x=.5,y=.4,getTarget,flightMs=1800,elapsedMs=0,upgraded=false}={}){
  flightMs=Number.isFinite(flightMs)?Math.max(1,flightMs):1800;elapsedMs=Number.isFinite(elapsedMs)?Math.max(0,elapsedMs):0;
  if(document.hidden||elapsedMs>=flightMs+320)return false;
  const bounds=container.getBoundingClientRect();if(!bounds.width||!bounds.height)return false;
  while(active.length>=2)remove(active[0]);
  const root=document.createElement('div');root.className='reaper-effect'+(upgraded?' upgraded':'');root.setAttribute('aria-hidden','true');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const images=Array.from({length:reduced?1:upgraded?4:3},(_,index)=>{const image=document.createElement('img');image.className='reaper-sprite'+(upgraded&&!reduced&&index<3?' reaper-echo':'');image.src='/media/soul-reaper.png';image.alt='';image.draggable=false;image.style.width=`${Math.max(128,Math.min(250,bounds.width*.42))}px`;image.style.opacity='0';root.append(image);return image;});
  const cut=document.createElement('span');cut.className='reaper-cut';cut.style.width=`${Math.min(150,bounds.width*.3)}px`;root.append(cut);
  const makePart=className=>{const part=document.createElement('span');part.className=className;root.append(part);return part;};
  const arc=upgraded?makePart('reaper-scythe-cut'):null,burst=upgraded?makePart('reaper-burst'):null;
  if(arc)arc.style.width=`${Math.min(210,bounds.width*.48)}px`;
  const sparks=upgraded&&!reduced?Array.from({length:6},()=>makePart('reaper-spark')):[];
  container.append(root);
  const effect={root,images,cut,arc,burst,sparks,target:{x:clamp(x),y:clamp(y)},getTarget,upgraded,reduced,width:bounds.width,height:bounds.height,flight:Math.max(1,flightMs),started:performance.now()-Math.max(0,elapsedMs),timers:[]};active.push(effect);
  if(reduced){
   const remaining=Math.max(0,effect.flight-Math.max(0,elapsedMs));
   effect.timers.push(setTimeout(()=>{
    if(!active.includes(effect)||document.hidden){remove(effect);return;}
    const target=readTarget(effect),image=images[0];image.style.transform=`translate3d(${target.x*effect.width}px,${target.y*effect.height}px,0) translate(-65%,-42%) scale(.75)`;image.style.opacity='1';
    if(upgraded){const position=`translate3d(${target.x*effect.width}px,${target.y*effect.height}px,0)`;arc.style.transform=`${position} translate(-50%,-50%) rotate(-48deg)`;arc.style.opacity='.8';burst.style.transform=`${position} translate(-50%,-50%)`;burst.style.opacity='.5';}
    effect.timers.push(setTimeout(()=>remove(effect),Math.min(200,Math.max(0,effect.flight+320-(performance.now()-effect.started)))));
   },remaining));
  }else{paint(effect,performance.now());if(active.includes(effect)&&!frame)frame=requestAnimationFrame(tick);}
  return true;
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
 const resize=()=>{const bounds=container.getBoundingClientRect();for(const effect of active){effect.width=bounds.width;effect.height=bounds.height;}};
 window.addEventListener('resize',resize);
 return{fire,clear};
}
