import test from 'node:test';
import assert from 'node:assert/strict';
import {createSharedMusic,musicPosition} from '../dist/music.js';
const id='12345678-1234-1234-1234-123456789abc';
const song=(extra={})=>({trackId:id,url:`/api/music/${id}.mp3`,title:'Song',playing:true,startedAt:1000,volume:.12,loop:true,...extra});
class FakeAudio extends EventTarget{paused=true;duration=10;currentTime=0;volume=1;src='';plays=0;loads=0;load(){this.loads++;}play(){this.plays++;if(this.deny)return Promise.reject(Error('Autoplay denied'));this.paused=false;return Promise.resolve();}pause(){this.paused=true;}removeAttribute(name){if(name==='src')this.src='';}}
const settle=async()=>{await Promise.resolve();await Promise.resolve();};
function harness(t,{at=3500,context}={}){const audio=new FakeAudio(),doc=new EventTarget();doc.hidden=false;let clock=at;const player=createSharedMusic({now:()=>clock,audioFactory:()=>audio,AudioContextCtor:context,document:doc});t.after(()=>player.dispose());return{audio,doc,player,setTime:value=>clock=value};}

test('shared music never autoplays before the player gesture, then seeks to the server position',async t=>{
 const {audio,player}=harness(t);player.sync(song());assert.equal(audio.plays,0);await player.unlock();await settle();assert.equal(audio.paused,false);assert.equal(audio.currentTime,2.5);assert.equal(audio.volume,.12);assert.equal(audio.loop,true);
});
test('late joins wrap loops, nonloop tracks stop at their end, and small clock jitter does not seek',async t=>{
 const {audio,player,setTime}=harness(t,{at:24500});player.sync(song());await player.unlock();await settle();assert.equal(audio.currentTime,3.5);
 audio.currentTime=3.7;player.sync(song());assert.equal(audio.currentTime,3.7);
 setTime(6000);player.sync(song());assert.equal(audio.currentTime,5);
 setTime(24500);player.sync(song({loop:false}));assert.equal(audio.paused,true);
 assert.equal(musicPosition(song(),10,24500),3.5);assert.equal(musicPosition(song({loop:false}),10,24500),10);
});
test('hidden pages pause; returning to the game resynchronizes instead of resuming stale audio',async t=>{
 const {audio,doc,player,setTime}=harness(t);player.sync(song());await player.unlock();await settle();doc.hidden=true;doc.dispatchEvent(new Event('visibilitychange'));assert.equal(audio.paused,true);
 setTime(8500);doc.hidden=false;doc.dispatchEvent(new Event('visibilitychange'));await settle();assert.equal(audio.currentTime,7.5);assert.equal(audio.paused,false);
 player.stop();doc.dispatchEvent(new Event('visibilitychange'));assert.equal(audio.paused,true,'leaving the game cannot restart music');
});
test('admin volume and stop apply independently, and arbitrary URLs never become audio sources',async t=>{
 const {audio,player}=harness(t);player.sync(song());await player.unlock();await settle();const src=audio.src;
 player.sync(song({url:'https://example.com/audio.mp3'}));assert.equal(audio.src,src);
 player.sync(song({volume:.04}));assert.equal(audio.volume,.04);player.sync(song({playing:false}));assert.equal(audio.paused,true);
});
test('autoplay failures are contained and the next real gesture retries successfully',async t=>{
 const {audio,player}=harness(t);audio.deny=true;player.sync(song());await player.unlock();await settle();assert.equal(audio.paused,true);
 const tried=audio.plays;player.sync(song());assert.equal(audio.plays,tried);audio.deny=false;await player.unlock();await settle();assert.equal(audio.paused,false);
});
test('Web Audio gain enforces quiet music on iOS without touching spell audio',async t=>{
 let gain;class Context{state='running';destination={};createMediaElementSource(){return{connect(){},disconnect(){}};}createGain(){return gain={gain:{value:1},connect(){},disconnect(){}};}close(){return Promise.resolve();}}
 const {audio,player}=harness(t,{context:Context});player.sync(song());await player.unlock();await settle();assert.equal(audio.volume,1);assert.equal(gain.gain.value,.12);player.sync(song({volume:.05}));assert.equal(gain.gain.value,.05);
});

test('finishing a silent unlock cannot pause a song that arrived during the gesture',async t=>{
 const audio=new FakeAudio();let finishPrime,calls=0;
 audio.play=()=>{audio.paused=false;audio.plays++;return ++calls===1?new Promise(resolve=>finishPrime=resolve):Promise.resolve();};
 const player=createSharedMusic({now:()=>3500,audioFactory:()=>audio,document:new EventTarget()});t.after(()=>player.dispose());
 const unlocking=player.unlock();assert.match(audio.src,/^data:audio\/wav;base64,/);
 const wav=Buffer.from(audio.src.split(',')[1],'base64');assert.equal(wav.readUInt32LE(40),80,'nonempty 10ms silent audio data');
 player.sync(song());await settle();finishPrime();await unlocking;await settle();assert.equal(audio.paused,false);assert.equal(audio.currentTime,2.5);
});
test('a separate game server supplies the media origin while route validation remains strict',async t=>{
 const audio=new FakeAudio(),player=createSharedMusic({now:()=>3500,audioFactory:()=>audio,getBaseUrl:()=> 'https://game.example/ws',document:new EventTarget()});t.after(()=>player.dispose());
 player.sync(song());assert.equal(audio.src,`https://game.example/api/music/${id}.mp3`);assert.equal(audio.crossOrigin,'anonymous');
 player.sync(song({url:'https://evil.example/file.mp3'}));assert.equal(audio.src,`https://game.example/api/music/${id}.mp3`);
});

test('an old pending play promise cannot pause a newer song after a track switch',async t=>{
 const audio=new FakeAudio(),pending=[];audio.play=()=>{audio.paused=false;audio.plays++;return new Promise(resolve=>pending.push(resolve));};
 const player=createSharedMusic({now:()=>3500,audioFactory:()=>audio,document:new EventTarget()});t.after(()=>player.dispose());
 player.sync(song());await player.unlock();assert.equal(pending.length,1);
 const nextId='22345678-1234-1234-1234-123456789abc';player.sync(song({trackId:nextId,url:`/api/music/${nextId}.mp3`,startedAt:3000}));assert.equal(pending.length,2);
 pending[1]();await settle();assert.equal(audio.paused,false);pending[0]();await settle();assert.equal(audio.paused,false,'obsolete track promise must not pause the newer track');
 player.stop();assert.equal(audio.paused,true);
});
