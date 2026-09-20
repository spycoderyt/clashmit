export function createArenaEvents(container,{audio,getMyId,now=Date.now}){
 const banner=document.createElement('div'),world=document.createElement('div');banner.className='arena-announcement';banner.setAttribute('role','status');world.className='super-world';world.setAttribute('aria-hidden','true');container.append(world,banner);
 const seen=new Set();let timeout,effectTimeout,queue=[],busy=false;
 function next(){if(busy||!queue.length)return;busy=true;const event=queue.shift();banner.textContent=event.text;banner.classList.add('show');if(!['kill','super','parry'].includes(event.kind))audio.play('heal','announcement');timeout=setTimeout(()=>{banner.classList.remove('show');busy=false;next();},event.kind==='round-start'||event.kind==='round-end'?4500:2600);}
 function receive(event){if(!event?.id||seen.has(event.id))return;seen.add(event.id);if(seen.size>200)seen.delete(seen.values().next().value);if(now()-event.at>8000)return;
  if(event.kind==='super'){clearTimeout(effectTimeout);world.className='super-world active '+event.spell;world.replaceChildren(...Array.from({length:event.spell==='arrows'?18:12},(_,i)=>{const spark=document.createElement('i');spark.style.setProperty('--n',i);spark.style.setProperty('--delay',`${i*.07}s`);return spark;}));audio.play(event.spell,'super');effectTimeout=setTimeout(()=>{world.className='super-world';world.replaceChildren();},3500);}
  if(event.kind==='parry')audio.play('shield','parry');
  if(event.kind==='kill'&&event.targetId===getMyId())event={...event,text:`${event.killer} killed you using ${event.attackName||event.spell||'an attack'}`};
  if(event.kind==='round-start'||event.kind==='round-end')queue.unshift(event);else queue.push(event);if(queue.length>5)queue.shift();next();
 }
 return{receive,sync(events=[]){for(const event of [...events].reverse())receive(event);},clear(){clearTimeout(timeout);clearTimeout(effectTimeout);queue=[];busy=false;seen.clear();banner.classList.remove('show');world.className='super-world';world.replaceChildren();}};
}
