// Synthesized locally: no audio downloads, uploads, or microphone recording.
export function createSpellAudio(){
 let context,muted=false;
 async function unlock(){try{context??=new (window.AudioContext||window.webkitAudioContext)();if(context.state==='suspended')await context.resume();}catch{}}
 function tone(frequency,end,duration,volume=.12,type='sine',delay=0){
  if(muted||context?.state!=='running')return;
  const t=context.currentTime+delay,osc=context.createOscillator(),gain=context.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.015);gain.gain.exponentialRampToValueAtTime(.001,t+duration);osc.connect(gain).connect(context.destination);osc.start(t);osc.stop(t+duration+.02);
 }
 function noise(duration,frequency,volume=.2,delay=0){
  if(muted||context?.state!=='running')return;
  const count=Math.ceil(context.sampleRate*duration),buffer=context.createBuffer(1,count,context.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<count;i++)samples[i]=Math.random()*2-1;
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),t=context.currentTime+delay;source.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(frequency,t);filter.frequency.exponentialRampToValueAtTime(160,t+duration);gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(volume,t+.035);gain.gain.exponentialRampToValueAtTime(.001,t+duration);source.connect(filter).connect(gain).connect(context.destination);source.start(t);source.stop(t+duration);
 }
 // One cast recipe per spell id, built from the two generators above.
 const recipes={
  fireball(){noise(.65,3200,.12);tone(100,260,.45,.06,'triangle');},
  lightning(){noise(.16,10000,.17);tone(1600,70,.18,.06,'sawtooth');},
  // A dry rattle: short clicks at uneven pitches, like bones knocking.
  skeletonArmy(){for(let i=0;i<9;i++)tone(700+((i*37)%5)*160,240,.05,.07,'square',i*.085);tone(90,60,.8,.05,'triangle');},
  poison(){noise(.5,900,.1);for(let i=0;i<4;i++)tone(180+i*45,120,.14,.06,'sine',i*.11);},
  arrows(){for(let i=0;i<3;i++){noise(.09,6000,.1);tone(1300,500,.09,.04,'triangle',i*.05);}},
  zap(){noise(.07,12000,.16);tone(2400,300,.08,.07,'square');},
  shield(){tone(260,700,.4,.09);tone(390,1050,.45,.05);},
  heal(){tone(440,660,.25,.08);tone(660,880,.35,.07,'sine',.12);}
 };
 // What each attack sounds like when it lands, heard by both the caster and the player it hits.
 const impacts={
  // A detonation: a wide burst of fire over a falling sub-bass thump, then embers crackling out.
  fireball(){noise(.5,2600,.26);tone(150,28,.55,.2);tone(75,30,.7,.1,'triangle',.02);for(let i=0;i<5;i++)noise(.04,7000,.06,.18+i*.07);},
  // A thunderclap: a blinding crack, the bolt tearing downward, then thunder rolling away underneath.
  lightning(){noise(.07,14000,.3);tone(2600,55,.2,.12,'sawtooth');noise(.9,380,.16,.05);tone(85,32,.85,.09,'sine',.05);},
  // Bones, not steel: a dry xylophone run tumbling down as the army piles in, over the stamp of feet.
  skeletonArmy(){const bones=[1568,1319,1760,1175,1480,988,1319,880,1109,784,932,659];bones.forEach((pitch,i)=>tone(pitch,pitch*.92,.07,.085,'triangle',i*.042));noise(.22,260,.2);noise(.18,240,.14,.26);tone(95,45,.3,.1,'sine',.02);},
  // A wet splash that turns sour: a splat, a slow hiss, two notes grinding a semitone apart, bubbles rising through it.
  poison(){noise(.22,1100,.2);noise(1.1,5200,.045,.12);tone(311,165,1.0,.055);tone(330,175,1.0,.055);for(let i=0;i<6;i++)tone(240+i*70,420+i*70,.09,.05,'sine',.22+i*.13);},
  // Three arrows, three hits: each a woody thunk a beat apart, the last shaft left humming.
  arrows(){for(let i=0;i<3;i++){noise(.05,1700,.2,i*.075);tone(210-i*18,95,.1,.13,'triangle',i*.075);}tone(640,600,.3,.03,'sine',.21);tone(655,612,.3,.03,'sine',.21);},
  // A snap and a jolt: a static pop, a chirp skidding down, then the buzz of current holding the target still.
  zap(){noise(.04,15000,.26);tone(3200,420,.09,.09,'square');tone(118,112,.26,.08,'sawtooth',.03);tone(236,224,.26,.04,'sawtooth',.03);tone(1500,1460,.4,.025,'sine',.1);}
 };
 // Damage that keeps coming: one quiet beat a second, so a player can hear it without looking.
 const ticks={
  poison(){tone(200,330,.11,.04);tone(260,410,.09,.03,'sine',.07);},
  skeletonArmy(){for(let i=0;i<3;i++)tone(1250-i*210,1100-i*200,.045,.05,'triangle',i*.05);}
 };
 function play(spell,kind='cast'){
  if(kind==='miss'){noise(.15,500,.07);return;}
  if(kind==='block'){tone(550,180,.35,.12,'triangle');tone(900,400,.4,.08);return;}
  if(kind==='impact'){if(Object.hasOwn(impacts,spell))impacts[spell]();else{noise(.3,2200,.2);tone(110,35,.35,.14);}return;}
  if(kind==='tick'){if(Object.hasOwn(ticks,spell))ticks[spell]();return;}
  if(Object.hasOwn(recipes,spell))recipes[spell]();
 }
 return{unlock,play,toggle(){muted=!muted;return muted;},get muted(){return muted;}};
}
