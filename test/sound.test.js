import test from 'node:test';import assert from 'node:assert/strict';
import {createSpellAudio} from '../dist/sound.js';
import {SPELLS,PERSONAS} from '../dist/rules.js';

// Records what a recipe synthesises: each oscillator's wave, start pitch and start time, and each noise burst's cutoff.
function fakeContext(log){
 const param=kind=>({setValueAtTime(v,t){if(kind)log.push([kind,Math.round(v),+t.toFixed(3)]);},exponentialRampToValueAtTime(){},linearRampToValueAtTime(){}});
 const node=()=>({connect(next){return next;}});
 return class{constructor(){this.state='running';this.currentTime=0;this.sampleRate=8000;this.destination=node();}
  resume(){}createGain(){return{...node(),gain:param()};}
  createOscillator(){const o={...node(),frequency:param('tone'),start(){},stop(){}};Object.defineProperty(o,'type',{set(v){log.push(['wave',v]);}});return o;}
  createBuffer(_,count){return{getChannelData:()=>new Float32Array(count)};}
  createBufferSource(){return{...node(),start(t){log.push(['noiseAt',+t.toFixed(3)]);},stop(){}};}
  createBiquadFilter(){return{...node(),frequency:param('cutoff')};}};
}
async function recorder(){const log=[];globalThis.window={AudioContext:fakeContext(log)};const audio=createSpellAudio();await audio.unlock();delete globalThis.window;
 return{audio,heard(spell,kind){log.length=0;audio.play(spell,kind);return JSON.stringify(log);}};}
const attacks=Object.keys(SPELLS).filter(s=>SPELLS[s].flightMs);

test('every attack has its own hit sound, unlike any other and unlike the generic thud',async()=>{
 const{heard}=await recorder(),generic=heard('no-such-spell','impact');assert.notEqual(generic,'[]','an unknown spell still thuds');
 const sounds=new Map(attacks.map(s=>[s,heard(s,'impact')]));
 assert.deepEqual([...sounds.keys()].sort(),['arrows','fireball','lightning','poison','skeletonArmy','zap']);
 for(const [spell,sound] of sounds){assert.notEqual(sound,'[]',spell+' is silent');assert.notEqual(sound,generic,spell+' still uses the generic thud');assert.notEqual(sound,heard(spell,'cast'),spell+' hit must not just replay its cast');}
 assert.equal(new Set(sounds.values()).size,attacks.length,'two attacks share a hit sound');
});
test('every spell in every deck can be heard when cast',async()=>{
 const{heard}=await recorder();for(const deck of Object.values(PERSONAS))for(const spell of deck)assert.notEqual(heard(spell,'cast'),'[]',spell);
});
test('arrows land as three separate thunks and the skeletons as a run of bony clicks',async()=>{
 const{heard}=await recorder(),times=kind=>[...new Set(JSON.parse(kind).filter(e=>e[0]==='noiseAt'||e[0]==='tone').map(e=>e[e.length-1]))];
 assert.ok(times(heard('arrows','impact')).length>=3,'three arrows, three moments');
 assert.ok(JSON.parse(heard('skeletonArmy','impact')).filter(e=>e[0]==='tone').length>=8,'a clatter, not a single note');
});
test('lingering damage ticks quietly for poison and skeletons only',async()=>{
 const{heard}=await recorder();assert.notEqual(heard('poison','tick'),'[]');assert.notEqual(heard('skeletonArmy','tick'),'[]');assert.notEqual(heard('poison','tick'),heard('skeletonArmy','tick'));
 assert.equal(heard('fireball','tick'),'[]');assert.equal(heard('constructor','tick'),'[]');
});
test('muting silences everything; blocks and misses are unchanged',async()=>{
 const{audio,heard}=await recorder();assert.notEqual(heard('zap','block'),'[]');assert.notEqual(heard('zap','miss'),'[]');
 audio.toggle();for(const kind of ['cast','impact','tick','block','miss'])assert.equal(heard('poison',kind),'[]',kind);
});
