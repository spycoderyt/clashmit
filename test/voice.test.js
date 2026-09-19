import test from 'node:test';
import assert from 'node:assert/strict';
import {setupVoice,spellFromText} from '../dist/voice.js';
test('voice handles a browser service denial and permits a clean retry',()=>{
 let instance;class Speech{constructor(){instance=this;}start(){}abort(){this.onend?.();}}
 const button={classList:{add(){},remove(){}},textContent:''},status={textContent:''};
 const voice=setupVoice({Recognition:Speech,button,status,onSpell:()=>{}});
 button.onclick();assert.equal(voice.isActive(),true);
 instance.onerror({error:'service-not-allowed'});assert.equal(voice.isActive(),false);assert.match(status.textContent,/Safari/);assert.match(button.textContent,/Enable voice/);
 button.onclick();assert.equal(voice.isActive(),true);voice.stop();
});
test('a complete interim spell casts immediately and final results do not double-cast',()=>{
 let instance;class Speech{constructor(){instance=this;}start(){}abort(){}}
 const button={classList:{add(){},remove(){}}},status={},spells=[];
 const voice=setupVoice({Recognition:Speech,button,status,onSpell:s=>spells.push(s)});button.onclick();instance.onstart();
 const partial=Object.assign([{transcript:'fire'}],{isFinal:false});instance.onresult({resultIndex:0,results:[partial]});assert.deepEqual(spells,[]);
 const interim=Object.assign([{transcript:'fire ball'}],{isFinal:false});instance.onresult({resultIndex:0,results:[interim]});assert.deepEqual(spells,['fireball']);assert.match(status.textContent,/casting early/);
 instance.onresult({resultIndex:0,results:[interim]});assert.deepEqual(spells,['fireball']);
 instance.onresult({resultIndex:0,results:[Object.assign([{transcript:'Fireball'}],{isFinal:true})]});assert.deepEqual(spells,['fireball']);
 assert.equal(spellFromText('shield'),'shield');assert.equal(spellFromText('cast lightning'),'lightning');assert.equal(spellFromText('lightningbolt'),null);assert.equal(spellFromText('healing'),null);voice.stop();
});
test('revisions do not double-cast; later commands and utterances can still cast',()=>{
 let instance;class Speech{constructor(){instance=this;}start(){}abort(){}}
 const button={classList:{add(){},remove(){}}},status={},spells=[];
 const voice=setupVoice({Recognition:Speech,button,status,onSpell:s=>spells.push(s)});button.onclick();
 const result=(text,final=false)=>Object.assign([{transcript:text}],{isFinal:final});
 instance.onresult({resultIndex:0,results:[result('heal')]});
 instance.onresult({resultIndex:0,results:[result('shield')]});assert.deepEqual(spells,['heal']);
 instance.onresult({resultIndex:0,results:[result('shield fire ball')]});assert.deepEqual(spells,['heal','fireball']);
 instance.onresult({resultIndex:0,results:[result('shield fireball',true)]});assert.deepEqual(spells,['heal','fireball']);
 instance.onresult({resultIndex:1,results:[result('shield fireball',true),result('fireball')]});assert.deepEqual(spells,['heal','fireball','fireball']);
 voice.stop();instance.onresult({resultIndex:2,results:[result('shield fireball',true),result('fireball',true),result('heal')]});assert.equal(spells.length,3);
 const old=instance;button.onclick();old.onresult({resultIndex:3,results:[result('a'),result('b'),result('c'),result('shield')]});assert.equal(spells.length,3);
 instance.onresult({resultIndex:0,results:[result('shield')]});assert.equal(spells.at(-1),'shield');voice.stop();
});
