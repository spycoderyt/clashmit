// One persistent overlay follows the same normalized target used for aim and
// projectiles. It never swaps a face/body box into the aiming geometry.
export function createTargetOverlay(arena,container){
 const frame=document.createElement('div'),label=document.createElement('div'),title=document.createElement('b'),meter=document.createElement('meter'),info=document.createElement('small');
 frame.className='person-box band-target';label.className='person-label band-target-label';meter.min=0;meter.max=100;meter.setAttribute('aria-label','Opponent health');label.append(title,meter,info);container.append(frame,label);
 let width=0,height=0;const observer=typeof ResizeObserver==='function'?new ResizeObserver(entries=>{const rect=entries[0]?.contentRect;if(rect){width=rect.width;height=rect.height;}}):null;observer?.observe(arena);
 const text=(element,value)=>{if(element.textContent!==value)element.textContent=value;};
 function size(){if(!width||!height||!observer){const rect=arena.getBoundingClientRect();width=rect.width;height=rect.height;}return{width,height};}
 function hide(){frame.hidden=true;label.hidden=true;}
 function update(target,player,{shielded=false,simulated=false}={}){
  if(!target||!player||player.health<=0){hide();return;}
  const viewport=size(),box=target.box,x=box.x*viewport.width,y=box.y*viewport.height,w=box.width*viewport.width,h=box.height*viewport.height;
  frame.hidden=false;label.hidden=false;
  frame.classList.toggle('matched',!!target.confirmed);frame.classList.toggle('shielded',shielded);frame.classList.toggle('tracking-gap',!target.fresh);
  frame.style.transform=`translate3d(${x.toFixed(2)}px,${y.toFixed(2)}px,0)`;frame.style.width=w.toFixed(2)+'px';frame.style.height=h.toFixed(2)+'px';
  label.classList.toggle('shielded',shielded);label.classList.toggle('tracking-gap',!target.fresh);
  const center=Math.max(76,Math.min(viewport.width-76,x+w/2)),top=Math.max(116,y-7);
  label.style.transform=`translate3d(${center.toFixed(2)}px,${top.toFixed(2)}px,0) translate(-50%,-100%)`;
  text(title,(player.score?`#${player.score.rank} `:'')+(player.name||'Target'));if(meter.value!==player.health)meter.value=player.health;meter.hidden=!!target.pending;
  text(info,shielded?'◇ Shield · lightning pierces':simulated?'Simulated':target.pending?'Hold steady':target.source==='body'?'Following · face hidden':target.confirmed?(target.fresh?'Face locked':'Tracking…'):'Identifying…');
 }
 hide();return{update,hide,size,dispose(){observer?.disconnect();frame.remove();label.remove();}};
}
