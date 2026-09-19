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
test('interim speech is displayed but only finalized spells cast',()=>{
 let instance;class Speech{constructor(){instance=this;}start(){}abort(){}}
 const button={classList:{add(){},remove(){}}},status={},spells=[];
 const voice=setupVoice({Recognition:Speech,button,status,onSpell:s=>spells.push(s)});button.onclick();instance.onstart();
 const interim=Object.assign([{transcript:'fire ball'}],{isFinal:false});instance.onresult({resultIndex:0,results:[interim]});assert.deepEqual(spells,[]);assert.match(status.textContent,/fire ball/);
 instance.onresult({resultIndex:0,results:[Object.assign([{transcript:'Fireball'}],{isFinal:true})]});assert.deepEqual(spells,['fireball']);
 assert.equal(spellFromText('shield'),'shield');assert.equal(spellFromText('healing'),null);voice.stop();
});
