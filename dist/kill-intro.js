// A short, one-shot portrait interlude. The server's respawn countdown continues underneath.
export function createKillIntro(container,{getMyId,getAvatar=()=>null,now=Date.now,duration=2200}){
 const root=document.createElement('section');root.className='kill-intro';root.hidden=true;root.setAttribute('role','alert');
 const portrait=document.createElement('div'),caption=document.createElement('p'),name=document.createElement('h2'),attack=document.createElement('p');portrait.className='kill-intro-portrait';caption.textContent='You got killed by';attack.className='kill-intro-attack';root.append(portrait,caption,name,attack);container.append(root);
 let timer;const seen=new Set();
 function clear(){clearTimeout(timer);root.hidden=true;container.classList.remove('kill-intro-active');}
 function receive(event){
  if(event?.kind!=='kill'||event.targetId!==getMyId()||!event.id||seen.has(event.id)||Number.isFinite(event.at)&&now()-event.at>8000)return false;
  seen.add(event.id);if(seen.size>100)seen.delete(seen.values().next().value);clearTimeout(timer);
  const killer=event.killer||'Another player',avatar=event.killerAvatar||getAvatar(event.actorId);portrait.replaceChildren();
  if(typeof avatar==='string'&&avatar.startsWith('data:image/jpeg;base64,')){const img=document.createElement('img');img.src=avatar;img.alt=`${killer}'s face`;portrait.append(img);}else{const initial=document.createElement('span');initial.textContent=killer.slice(0,1);portrait.append(initial);}
  name.textContent=killer;attack.textContent=`using ${event.attackName||event.spell||'an attack'}`;
  root.hidden=false;container.classList.add('kill-intro-active');timer=setTimeout(clear,duration);return true;
 }
 return{receive,clear};
}
