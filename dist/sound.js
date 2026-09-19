// Synthesized locally: no audio downloads, uploads, or microphone recording.
export function createSpellAudio(){
 let context,muted=false;
 async function unlock(){try{context??=new (window.AudioContext||window.webkitAudioContext)();if(context.state==='suspended')await context.resume();}catch{}}
 function tone(frequency,end,duration,volume=.12,type='sine',delay=0){
  if(muted||context?.state!=='running')return;
  const t=context.currentTime+delay,osc=context.createOscillator(),gain=context.createGain();osc.type=type;osc.frequency.setValueAtTime(frequency,t);osc.frequency.exponentialRampToValueAtTime(Math.max(20,end),t+duration);gain.gain.setValueAtTime(.001,t);gain.gain.exponentialRampToValueAtTime(volume,t+.015);gain.gain.exponentialRampToValueAtTime(.001,t+duration);osc.connect(gain).connect(context.destination);osc.start(t);osc.stop(t+duration+.02);
 }
 function noise(duration,frequency,volume=.2){
  if(muted||context?.state!=='running')return;
  const count=Math.ceil(context.sampleRate*duration),buffer=context.createBuffer(1,count,context.sampleRate),samples=buffer.getChannelData(0);for(let i=0;i<count;i++)samples[i]=Math.random()*2-1;
  const source=context.createBufferSource(),filter=context.createBiquadFilter(),gain=context.createGain(),t=context.currentTime;source.buffer=buffer;filter.type='lowpass';filter.frequency.setValueAtTime(frequency,t);filter.frequency.exponentialRampToValueAtTime(160,t+duration);gain.gain.setValueAtTime(.001,t);gain.gain.linearRampToValueAtTime(volume,t+.035);gain.gain.exponentialRampToValueAtTime(.001,t+duration);source.connect(filter).connect(gain).connect(context.destination);source.start(t);source.stop(t+duration);
 }
 function play(spell,kind='cast'){
  if(kind==='miss'){noise(.15,500,.07);return;}
  if(kind==='block'){tone(550,180,.35,.12,'triangle');tone(900,400,.4,.08);return;}
  if(kind==='impact'){noise(.3,2200,.2);tone(110,35,.35,.14);return;}
  if(spell==='fireball'){noise(.65,3200,.12);tone(100,260,.45,.06,'triangle');}
  if(spell==='lightning'){noise(.16,10000,.17);tone(1600,70,.18,.06,'sawtooth');}
  if(spell==='shield'){tone(260,700,.4,.09);tone(390,1050,.45,.05);}
  if(spell==='heal'){tone(440,660,.25,.08);tone(660,880,.35,.07,'sine',.12);}
 }
 return{unlock,play,toggle(){muted=!muted;return muted;},get muted(){return muted;}};
}
