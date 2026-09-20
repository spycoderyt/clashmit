import {MEME_CLIPS,SPELL_MEMES} from './meme-sounds.js';
import {createSpellAudio} from './sound.js?v=memes1';
import {SPELL_INFO} from './personas.js';
import {ATTACKS} from './economy.js';
const audio=createSpellAudio(),status=document.getElementById('playing');let request=0;
async function play(spell,kind,label){const current=++request;audio.stop();status.textContent='Loading…';await audio.unlock();if(current!==request)return;const played=await audio.play(spell,kind);if(current===request)status.textContent=played?label:'Could not play this clip. Tap again to retry.';}
for(const [id,info] of Object.entries({...SPELL_INFO,coins:{label:'Coin collection'},orbital:{label:'Orbital Airstrike'}}).filter(([id])=>id!=='zap')){
 const article=document.createElement('article'),title=document.createElement('h2'),name=document.createElement('p'),buttons=document.createElement('div');title.textContent=info.label;const clip=MEME_CLIPS[SPELL_MEMES[id]];name.textContent=clip.name;
 const sounds=[['Cast','cast'],...(ATTACKS[id]?[['Upgraded cast','super']]:[]),...(id==='shield'?[['Block','block']]:id==='heal'?[]:[['Impact','impact']])];
 for(const [label,kind] of sounds){const button=document.createElement('button');button.textContent=label;button.onclick=()=>play(id,kind,`${info.label} · ${label}`);buttons.append(button);}
 article.append(title,name,buttons);document.getElementById('cards').append(article);
}
document.getElementById('volume').oninput=e=>audio.setVolume(e.target.value/100);
document.getElementById('stop').onclick=()=>{request++;audio.stop();status.textContent='Stopped';};
document.getElementById('parry').onclick=()=>play('shield','parry','Parry');document.getElementById('announcement').onclick=()=>play('heal','announcement','Announcement');
document.addEventListener('visibilitychange',()=>{if(document.hidden){request++;audio.stop();}});

const credits=document.createElement('p');for(const clip of Object.values(MEME_CLIPS)){const link=document.createElement('a');link.href=clip.source;link.target='_blank';link.rel='noopener';link.textContent=`${clip.name} by ${clip.author} (${clip.license})`;credits.append(link,document.createElement('br'));}document.body.append(credits);
