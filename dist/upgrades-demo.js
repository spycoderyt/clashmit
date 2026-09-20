import {createReaperEffect} from './reaper-effect.js';
import {createHealFeedback,healMessage} from './heal-effect.js';
import {ATTACKS,CLASS_ATTACKS,CONSUMABLES,ruleFor,totalDamage} from './economy.js';
import {createFireballRenderer} from './fireball.js';
import {createUpgradeEffects} from './upgrade-effects.js';
import {createSkeletonArmy} from './skeleton-army.js';
import {createSpellAudio} from './sound.js';
const $=id=>document.getElementById(id),stage=$('stage'),effects=createUpgradeEffects(stage),army=createSkeletonArmy(stage),audio=createSpellAudio();
const reaperEffect=createReaperEffect(stage),healFeedback=createHealFeedback(stage);
const points=[{x:.5,y:.4},{x:.23,y:.44},{x:.77,y:.44}],targets=[...stage.querySelectorAll('.target')];
let scene,epoch=0,frame=0,timers=new Set(),animations=[];
try{scene=createFireballRenderer(stage);}catch{ $('audio-status').textContent='3D is unavailable. Impact effects are still shown.'; }
function later(fn,ms){const id=setTimeout(()=>{timers.delete(id);fn();},ms);timers.add(id);}
function hearts(health){$('health').replaceChildren(...Array.from({length:7},(_,i)=>{const img=document.createElement('img');img.src=`/media/heart-${health>=10*(i+1)?'full':health>10*i?'half':'empty'}.svg`;img.alt='';return img;}));$('health').setAttribute('aria-label',`${health/10} hearts`);}
function reset(){epoch++;cancelAnimationFrame(frame);for(const id of timers)clearTimeout(id);timers.clear();for(const a of animations)a.cancel();animations=[];scene?.clear();reaperEffect.clear();healFeedback.clear();effects.clear();army.clear();audio.stop();for(const el of targets)el.classList.remove('hit','active');for(const el of document.querySelectorAll('[aria-pressed]'))el.setAttribute('aria-pressed','false');for(const id of ['flash','shield','heal'])$(id).style.opacity='0';$('timer').textContent='';$('audio-status').textContent='';stage.dataset.phase='idle';hearts(70);}
function animate(el,frames,options){const a=el.animate(frames,options);animations.push(a);return a;}
function sound(id,upgraded,run){void audio.unlock().then(()=>{if(run!==epoch)return;return audio.play(id,upgraded?'super':'cast');}).then(ok=>{if(run===epoch)$('audio-status').textContent=ok?'Sound played':'Sound unavailable. Tap again to retry.';}).catch(()=>{if(run===epoch)$('audio-status').textContent='Sound unavailable. Tap again to retry.';});}
function countdown(duration,label,run){const end=performance.now()+duration;function tick(){if(run!==epoch)return;const remaining=end-performance.now();$('timer').textContent=remaining>0?`${label} ${Math.ceil(remaining/1000)}s`:'Ready';if(remaining>0)later(tick,100);}tick();}
function playAttack(id,upgraded,button){
 reset();button.setAttribute('aria-pressed','true');const run=epoch,rule=ruleFor({loadout:{skills:{[id]:upgraded?2:1}}},id),name=upgraded?rule.upgrade:rule.name,multi=!!rule.multiHit;
 $('effect-name').textContent=name;$('detail').textContent=`${totalDamage(rule)/10} hearts · ${rule.manaCost} mana · ${rule.cooldown/1000}s cooldown${multi?' · Up to 2 nearby targets take half damage.':id==='fireball'&&upgraded?' · Ground fire is visual only.':''}`;$('status').textContent='Casting';stage.dataset.phase='cast';stage.dataset.spell=id;stage.dataset.upgraded=String(upgraded);sound(id,upgraded,run);
 if(multi)for(const el of targets.slice(1))el.classList.add('active');
 const impact=()=>{if(run!==epoch)return;stage.dataset.phase='impact';$('status').textContent=multi?'Hit target and 2 nearby players':'Hit target';for(const el of multi?targets:[targets[0]])el.classList.add('hit');if(upgraded||!scene)effects.impact({spell:id,from:points[0],targets:multi?points:points.slice(0,1),ground:{x:.5,y:.68}});if(id==='fireball'&&upgraded)void audio.play(id,'upgrade-impact');};
 if(id==='lightning'){effects.impact({spell:id,from:{x:.5,y:.94},targets:[points[0]]});later(impact,rule.flightMs);}
 else if(id==='skeletonArmy'){
  const start=performance.now(),feet={x:.5,y:.68,size:.065};function march(at){if(run!==epoch)return;const age=at-start;if(age<rule.flightMs)army.update({outgoing:[{id:'demo',who:'target',progress:age/rule.flightMs,feet,super:upgraded}],ground:.92});else if(age<rule.flightMs+rule.swarm.duration)army.update({mobbed:[{who:'target',feet,super:upgraded}],ground:.92});else{army.clear();return;}frame=requestAnimationFrame(march);}frame=requestAnimationFrame(march);later(impact,rule.flightMs);
 }else if(id==='soulReaper'){reaperEffect.fire({...points[0],getTarget:()=>points[0],flightMs:rule.flightMs,upgraded});later(impact,rule.flightMs);}
 else{scene?.fire({...points[0],style:id,super:upgraded||rule.ultimate,upgraded,flightMs:rule.flightMs,distance:12,getTarget:()=>points[0]});later(impact,rule.flightMs);}
 later(()=>{if(run===epoch){stage.dataset.phase='complete';$('status').textContent='Done. Choose another effect.';}},rule.flightMs+(rule.swarm?.duration||(id==='fireball'&&upgraded?3200:1000)));
}
function playItem(id,button){reset();button.setAttribute('aria-pressed','true');const run=epoch,item=CONSUMABLES[id];$('effect-name').textContent=item.name;stage.dataset.spell=id;stage.dataset.phase='active';sound(id,false,run);
 const duration=id==='heal'?900:item.duration;countdown(duration,id==='shield'?'Shield':id==='flashbang'?'Blinded':'Heal',run);
 if(id==='shield'){$('detail').textContent='Blocks attacks for 7 seconds. Lightning pierces it.';$('status').textContent='Shield active';$('shield').style.opacity='1';}
 if(id==='heal'){$('detail').textContent='Restores 5 hearts, up to 7 hearts.';$('status').textContent=healMessage(50);hearts(20);healFeedback.show(50);later(()=>hearts(70),350);}
 if(id==='flashbang'){$('detail').textContent='Victim view: whiteout for 3 seconds. Range: 10 m. Shields block it.';$('status').textContent='Flashbang active';$('flash').style.opacity='1';}
 later(()=>{if(run!==epoch)return;for(const key of ['flash','shield','heal'])$(key).style.opacity='0';stage.dataset.phase='complete';$('status').textContent='Effect ended';},duration);
}
for(const [persona,ids]of Object.entries(CLASS_ATTACKS)){const section=document.createElement('section');section.className='class-section';const h=document.createElement('h2');h.textContent=persona[0].toUpperCase()+persona.slice(1);section.append(h);for(const id of ids){const row=document.createElement('div');row.className='attack-row';for(const upgraded of [false,true]){const button=document.createElement('button'),label=document.createElement('span'),hint=document.createElement('small');label.textContent=upgraded?ATTACKS[id].upgrade:ATTACKS[id].name;hint.textContent=upgraded?'Upgraded':'Base';button.setAttribute('aria-label',`Play ${label.textContent}`);button.setAttribute('aria-pressed','false');if(upgraded)button.className='upgrade';button.append(label,hint);button.onclick=()=>playAttack(id,upgraded,button);row.append(button);}section.append(row);}$('attacks').append(section);}
for(const [id,item]of Object.entries(CONSUMABLES)){const button=document.createElement('button'),img=document.createElement('img');img.src=`/media/ui/item-${id}.svg`;img.alt='';button.append(img,item.name);button.setAttribute('aria-label',`Test ${item.name}`);button.setAttribute('aria-pressed','false');button.onclick=()=>playItem(id,button);$('consumables').append(button);}
$('volume').oninput=e=>audio.setVolume(Number(e.target.value)/100);$('stop').onclick=()=>{reset();$('status').textContent='Stopped';};document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});hearts(70);
