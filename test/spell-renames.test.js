import test from 'node:test';
import assert from 'node:assert/strict';
import {ATTACKS,freshLoadout,skillName,wordsFor} from '../dist/economy.js';
import {spellsFromText,setupVoice} from '../dist/voice.js';
import {SPELL_INFO,deckWords} from '../dist/personas.js';
import {spawnPlayer} from '../dist/respawn.js';
import {launchProjectile} from '../dist/rules.js';
function witch(level=2){return{persona:'witch',loadout:{...freshLoadout(),skills:{poison:1,skeletonArmy:level,soulReaper:level}}};}

test('new attack names preserve existing skill IDs, levels and payload names',()=>{
 const base=witch(1),upgraded=witch(2);
 assert.equal(ATTACKS.skeletonArmy.upgrade,'Super Skeleton');
 assert.equal(skillName(base,'soulReaper'),'Reaper');assert.equal(skillName(upgraded,'soulReaper'),'Soul Reaper');
 assert.equal(skillName(upgraded,'skeletonArmy'),'Super Skeleton');assert.equal(SPELL_INFO.soulReaper.label,'Reaper');
 assert.deepEqual(Object.keys(upgraded.loadout.skills),['poison','skeletonArmy','soulReaper']);
 for(const [level,id,name]of [[1,'soulReaper','Reaper'],[2,'soulReaper','Soul Reaper'],[2,'skeletonArmy','Super Skeleton']]){
  const actor={...witch(level),id:'a',name:'Caster',economy:true,connected:true,faceReady:true},target={...witch(1),id:'b',economy:true,connected:true,faceReady:true};spawnPlayer(actor,1000);spawnPlayer(target,1000);
  const event=launchProjectile({economy:true,continuous:true,phase:'playing',players:[actor,target],shots:[]},'a',id,'b',id,1000);
  assert.equal(event.error,undefined);assert.equal(event.spell,id);assert.equal(event.attackName,name);
 }
});

test('new phrases, joined words and common speech errors map to one owned spell',()=>{
 const words=wordsFor(witch());
 for(const text of ['Super Skeleton','super skeletons','superskeleton','super skelton','supper skeleton','super skeleton army','super skellton'])assert.deepEqual(spellsFromText(text,words),['skeletonArmy'],text);
 for(const text of ['Reaper','reeper','ripper','Soul Reaper','soulreaper','sole reaper','soul reeper','soul ripper'])assert.deepEqual(spellsFromText(text,words),['soulReaper'],text);
 assert.deepEqual(spellsFromText('super skeleton soul reaper reaper',words),['skeletonArmy','soulReaper','soulReaper']);
 assert.deepEqual(spellsFromText('bone legion grim reaper',words),['skeletonArmy','soulReaper'],'old spoken names still use the saved skill');
 for(const text of ['super skeleton','soul reaper','reaper'])assert.deepEqual(spellsFromText(text,wordsFor({persona:'witch',loadout:freshLoadout()})),[],text+' remains locked');
 const legacy=deckWords(['skeletonArmy','soulReaper']);assert.deepEqual(spellsFromText('super skeleton reaper soul reaper',legacy),['skeletonArmy','soulReaper','soulReaper']);
});

test('interim revisions of Super Skeleton and Soul Reaper do not cause duplicate casts',()=>{
 let session;const casts=[];
 class Recognition{constructor(){session=this;}start(){}abort(){}}
 const voice=setupVoice({Recognition,status:{textContent:''},onSpell:id=>casts.push(id),getWords:()=>wordsFor(witch())});
 const result=(text,index,final=false)=>{const item=[{transcript:text}];item.isFinal=final;session.onresult({resultIndex:index,results:Object.assign(Array(index+1),{[index]:item})});};
 try{
  voice.enable();session.onstart();result('super skeleton',0);result('Super Skeleton',0,true);result('reaper',1);result('soul reaper',1,true);
  assert.deepEqual(casts,['skeletonArmy','soulReaper']);
 }finally{voice.stop();}
});
