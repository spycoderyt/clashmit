import {inOrbitalZone,ORBITAL} from './orbital-rules.js';
// Cosmetic effects consume confirmed server events; they never grant money or deal damage.
export function createCoinEffects(container,{audio,destination}){
 const seen=new Set(),rewards=document.createElement('div');rewards.className='coin-rewards';rewards.setAttribute('aria-live','polite');container.append(rewards);
 return{collect(point,amount=30,id,victim='an opponent'){if(id&&seen.has(id))return;if(id){seen.add(id);if(seen.size>100)seen.delete(seen.values().next().value);}const bounds=container.getBoundingClientRect(),dest=destination(),from={x:(point?.x??.5)*bounds.width,y:(point?.y??.4)*bounds.height},to={x:dest.left-bounds.left+dest.width/2,y:dest.top-bounds.top+dest.height/2};
 for(let i=0;i<9;i++){const coin=document.createElement('img');coin.src='/media/coin.svg';coin.className='flying-coin';coin.alt='';container.append(coin);const arc=(Math.random()-.5)*100,animation=coin.animate([{transform:`translate(${from.x}px,${from.y}px) scale(1.4)`,opacity:1},{transform:`translate(${from.x+arc}px,${from.y-70-Math.random()*70}px) scale(1.4)`,opacity:1,offset:.3},{transform:`translate(${to.x}px,${to.y}px) scale(.6)`,opacity:0}],{duration:800+i*45,delay:i*35,fill:'both',easing:'cubic-bezier(.2,.7,.4,1)'});animation.onfinish=()=>coin.remove();}
 const label=document.createElement('div'),value=document.createElement('b'),who=document.createElement('span');label.className='coin-reward';value.textContent=`+${amount} coins`;who.textContent=`for killing ${victim}`;label.append(value,who);rewards.append(label);while(rewards.children.length>3)rewards.firstChild.remove();setTimeout(()=>label.remove(),2400);audio.play('coins');
 }};
}
export function createOrbitalView(container,{now=Date.now,audio,getAvatar=()=>null,getLocation=()=>null,onLaunchView=()=>{},getMapPoint=()=>({x:.5,y:.55})}){
 const root=document.createElement('div');root.className='orbital-cinematic';root.hidden=true;root.setAttribute('role','alert');root.innerHTML='<div class="orbital-warning"><strong></strong><p></p><small></small></div><div class="orbital-white"></div>';container.append(root);
 const shown=new Set();let running=null,frame=0,hideTimer=0,graphics=null,myPlayer=null,escaped=false;
 let modulePromise=null,prepared=null;
 const warm=()=>modulePromise??=import('./orbital-renderer.js').then(async m=>{await m.preloadRocket();return m;}).catch(()=>{modulePromise=null;return null;});
 const prepare=()=>prepared??=warm().then(m=>m?.createOrbitalRenderer(root)).then(g=>{if(!g){prepared=null;return;}graphics=g;if(running)g.face(running.avatar||getAvatar(running.actorId),running.name);return g;}).catch(()=>{prepared=null;root.dataset.graphics='unavailable';});

 function animate(){if(!running)return;const t=Math.max(0,Math.min(1,(now()-running.startsAt)/(running.endsAt-running.startsAt))),caster=running.actorId===myPlayer,loc=getLocation();
  const fresh=!!loc&&now()-loc.at<=ORBITAL.freshMs;escaped=!caster&&fresh&&!inOrbitalZone(running,loc,now());
  root.classList.toggle('escaped',escaped);root.classList.toggle('detonate',t>=1&&!escaped);root.querySelector('strong').textContent=caster?'Orbital airstrike launched':escaped?'Outside the blast zone':'Incoming orbital airstrike';
  root.querySelector('p').textContent=caster?`${running.name} · 10 m blast zone`:escaped?'Stay outside until impact.':'Get out of the 10 m radius!';
  root.querySelector('small').textContent=t<1?`${Math.max(1,Math.ceil((running.endsAt-now())/1000))}`:escaped?'Safe':'Impact';const target=getMapPoint(running.point);root.style.setProperty('--impact-x',`${target.x*100}%`);root.style.setProperty('--impact-y',`${target.y*100}%`);graphics?.render(t,{caster,target});
  if(t<1)frame=requestAnimationFrame(animate);else hideTimer=setTimeout(()=>{root.hidden=true;running=null;},450);
 }
 return{warm,sync(strikes,myId){myPlayer=myId;if(running)return;const loc=getLocation(),s=strikes.find(s=>!shown.has(s.id)&&s.endsAt>now()&&(s.actorId===myId||s.victims.some(v=>v.id===myId)||loc&&inOrbitalZone(s,loc,now())));if(!s)return;shown.add(s.id);if(shown.size>100)shown.delete(shown.values().next().value);running=s;root.classList.toggle('caster',s.actorId===myId);if(s.actorId===myId)onLaunchView(s);void prepare();graphics?.face(s.avatar||getAvatar(s.actorId),s.name);root.hidden=false;root.classList.remove('detonate');audio.play('orbital');cancelAnimationFrame(frame);animate();},clear(){cancelAnimationFrame(frame);clearTimeout(hideTimer);running=null;root.hidden=true;}};
}
