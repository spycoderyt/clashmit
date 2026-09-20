// A visual-only reaper sweep. The server still owns the hit and its timing.
const CSS=`
.reaper-effect{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:6;--reaper-rim:#91e6df}
.reaper-effect.upgraded{--reaper-rim:#c5a1ff}
.reaper-sprite{position:absolute;left:0;top:0;height:auto;max-width:none;pointer-events:none;filter:drop-shadow(1px 0 1px var(--reaper-rim)) drop-shadow(-1px 0 1px var(--reaper-rim));will-change:transform,opacity}
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
   const trail=effect.images.length-1-index,at=Math.max(0,u-trail*.055),point=path(at,target);
   const sweep=at<.32?lerp(-25,28,at/.32):at<.64?lerp(28,-32,(at-.32)/.32):lerp(-32,48,(at-.64)/.36);
   const size=lerp(.72,1.02,at)*(effect.upgraded?1.1:1);
   image.style.transform=`translate3d(${point.x*effect.width}px,${point.y*effect.height}px,0) translate(-65%,-42%) rotate(${sweep}deg) scale(${size})`;
   image.style.opacity=String(fade*(trail ? .14/trail : 1)*(trail&&impact>=0?0:1));
  });
  if(impact>=0){
   effect.cut.style.opacity=String(fade);effect.cut.style.transform=`translate3d(${target.x*effect.width}px,${target.y*effect.height}px,0) translate(-50%,-50%) rotate(-48deg) scaleX(${1+clamp(impact/160)*.65})`;
  }
 }
 function tick(time){
  frame=0;if(document.hidden){clear();return;}
  for(const effect of [...active])if(!effect.reduced)paint(effect,time);
  if(active.some(effect=>!effect.reduced))frame=requestAnimationFrame(tick);
 }
 function fire({x=.5,y=.4,getTarget,flightMs=1800,elapsedMs=0,upgraded=false}={}){
  if(document.hidden||elapsedMs>=Math.max(1,flightMs)+320)return false;
  const bounds=container.getBoundingClientRect();if(!bounds.width||!bounds.height)return false;
  while(active.length>=2)remove(active[0]);
  const root=document.createElement('div');root.className='reaper-effect'+(upgraded?' upgraded':'');root.setAttribute('aria-hidden','true');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const images=Array.from({length:reduced?1:3},()=>{const image=document.createElement('img');image.className='reaper-sprite';image.src='/media/soul-reaper.png';image.alt='';image.draggable=false;image.style.width=`${Math.max(128,Math.min(250,bounds.width*.42))}px`;image.style.opacity='0';root.append(image);return image;});
  const cut=document.createElement('span');cut.className='reaper-cut';cut.style.width=`${Math.min(150,bounds.width*.3)}px`;root.append(cut);container.append(root);
  const effect={root,images,cut,target:{x:clamp(x),y:clamp(y)},getTarget,upgraded,reduced,width:bounds.width,height:bounds.height,flight:Math.max(1,flightMs),started:performance.now()-Math.max(0,elapsedMs),timers:[]};active.push(effect);
  if(reduced){
   const remaining=Math.max(0,effect.flight-Math.max(0,elapsedMs));
   effect.timers.push(setTimeout(()=>{
    if(!active.includes(effect)||document.hidden){remove(effect);return;}
    const target=readTarget(effect),image=images[0];image.style.transform=`translate3d(${target.x*effect.width}px,${target.y*effect.height}px,0) translate(-65%,-42%) scale(.75)`;image.style.opacity='1';
    effect.timers.push(setTimeout(()=>remove(effect),200));
   },remaining));
  }else{paint(effect,performance.now());if(active.includes(effect)&&!frame)frame=requestAnimationFrame(tick);}
  return true;
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
 const resize=()=>{const bounds=container.getBoundingClientRect();for(const effect of active){effect.width=bounds.width;effect.height=bounds.height;}};
 window.addEventListener('resize',resize);
 return{fire,clear};
}
