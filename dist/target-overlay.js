import {killReward} from './economy.js';
import {createBoxMotion} from './box-motion.js';
import {healthColor} from './health-hud.js?v=1';
export function targetLabelPosition(box,viewport,label,safeTop=180){
 const margin=8,half=Math.min(label.width/2,Math.max(0,viewport.width/2-margin));
 return{center:Math.max(margin+half,Math.min(viewport.width-margin-half,box.x+box.width/2)),bottom:Math.min(viewport.height-margin,Math.max(label.height+margin,safeTop,box.y-7))};
}
// One persistent overlay follows the same normalized target used for aim and
// projectiles. It never swaps a face/body box into the aiming geometry.
export function createTargetOverlay(arena,container){
 const frame=document.createElement('div'),label=document.createElement('div'),title=document.createElement('b'),meter=document.createElement('meter'),info=document.createElement('small');
 const titleText=document.createElement('span'),reward=document.createElement('span'),rewardText=document.createElement('span'),coin=document.createElement('img');reward.className='target-reward';coin.src='/media/coin.svg';coin.alt='gold coins';coin.width=14;coin.height=18;coin.style.verticalAlign='middle';coin.style.marginLeft='4px';title.append(titleText);reward.append(rewardText,coin);
 frame.className='person-box band-target';label.className='person-label band-target-label';meter.min=0;meter.max=70;meter.low=20;meter.high=45;meter.optimum=70;meter.setAttribute('aria-label','Opponent health');label.append(title,reward,meter,info);container.append(frame,label);
 const motion=createBoxMotion();
 let width=0,height=0,safeTop=180,labelKey='',labelWidth=152,labelHeight=80;const observer=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(rect){width=rect.width;height=rect.height;}}):null;observer?.observe(arena);
 const text=(element,value)=>{if(element.textContent!==value)element.textContent=value;};
 function size(){if(!width||!height||!observer){const rect=arena.getBoundingClientRect();width=rect.width;height=rect.height;}return{width,height};}
 function hide(){motion.reset();frame.hidden=true;label.hidden=true;}
 function update(target,player,{crowned=false,shielded=false,simulated=false,poisoned=false,healed=false,accent='',piercer='Lightning'}={}){
  if(!target||!player||player.health<=0){hide();return;}
  const viewport=size(),box=motion.sample(target.box,target.key??target.id??player.id??player.name,performance.now()),x=box.x*viewport.width,y=box.y*viewport.height,w=box.width*viewport.width,h=box.height*viewport.height;
  frame.hidden=false;label.hidden=false;
  frame.classList.toggle('matched',!!target.confirmed);frame.classList.toggle('shielded',shielded);frame.classList.toggle('poisoned',poisoned);frame.classList.toggle('healed',healed);frame.classList.toggle('tracking-gap',!target.fresh);if(frame.dataset.accent!==accent){frame.dataset.accent=accent;frame.style.setProperty('--persona-accent',accent||'#a8d9ff');}
  frame.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;frame.style.width=w.toFixed(2)+'px';frame.style.height=h.toFixed(2)+'px';
  label.classList.toggle('crowned',crowned);label.classList.toggle('shielded',shielded);label.classList.toggle('tracking-gap',!target.fresh);
  text(titleText,player.name||'Target');text(rewardText,`Reward: ${killReward(player.score?.currentStreak??0)}`);if(meter.value!==player.health){meter.value=player.health;meter.style.setProperty('--health-color',healthColor(player.health));}meter.hidden=!!target.pending;
  text(info,shielded?`◇ Shield · ${piercer} pierces`:poisoned?'☣ Poisoned':simulated?'Simulated':target.pending?'Hold steady':target.source==='body'?'Following · face hidden':target.confirmed?(target.fresh?'Face locked':'Tracking…'):'Identifying…');
  const key=[titleText.textContent,rewardText.textContent,info.textContent,crowned,meter.hidden,viewport.width,viewport.height].join('|');
  if(key!==labelKey){labelKey=key;label.style.maxWidth=Math.max(1,Math.min(240,viewport.width-16))+'px';labelWidth=label.offsetWidth||152;labelHeight=label.offsetHeight||80;}
  const placed=targetLabelPosition({x,y,width:w,height:h},viewport,{width:labelWidth,height:labelHeight},safeTop);
  label.style.transform=`translate3d(${placed.center.toFixed(2)}px,${placed.bottom.toFixed(2)}px,0) translate(-50%,-100%)`;

 }
 hide();return{update,hide,size,setSafeTop(value){safeTop=value;},dispose(){observer?.disconnect();frame.remove();label.remove();}};
}
