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
test('automatic enable is idempotent; scans pause and resume without an extra tap',()=>{
 const sessions=[];class Speech{constructor(){sessions.push(this);}start(){}abort(){this.onend?.();}}
 const spells=[],voice=setupVoice({Recognition:Speech,status:{},onSpell:s=>spells.push(s)});
 voice.enable();voice.enable();assert.equal(sessions.length,1);
 sessions[0].onstart();voice.pause();assert.equal(voice.isActive(),false);
 sessions[0].onresult({resultIndex:0,results:[Object.assign([{transcript:'fireball'}],{isFinal:true})]});assert.deepEqual(spells,[]);
 voice.resume();voice.resume();assert.equal(sessions.length,2);assert.equal(voice.isActive(),true);
 voice.stop();voice.resume();assert.equal(sessions.length,2,'leaving must not restart the mic');
});
test('speech end restarts automatically, but background pause cancels that restart',t=>{
 t.mock.timers.enable({apis:['setTimeout']});
 const sessions=[];class Speech{constructor(){sessions.push(this);}start(){}abort(){this.onend?.();}}
 const voice=setupVoice({Recognition:Speech,status:{},onSpell:()=>{}});voice.enable();sessions[0].onstart();sessions[0].onend();
 t.mock.timers.tick(350);assert.equal(sessions.length,2);sessions[1].onstart();sessions[1].onend();voice.pause();t.mock.timers.tick(10000);assert.equal(sessions.length,2);
 voice.resume();assert.equal(sessions.length,3);voice.stop();
});
test('denied speech does not repeatedly request access on resume',()=>{
 let session,started=0;class Speech{constructor(){session=this;}start(){started++;}abort(){}}
 const status={},voice=setupVoice({Recognition:Speech,status,onSpell:()=>{}});voice.enable();session.onerror({error:'not-allowed'});voice.resume();
 assert.equal(started,1);assert.equal(voice.isActive(),false);assert.match(status.textContent,/denied/);
});
