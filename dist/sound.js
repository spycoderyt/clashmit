import {MEME_CLIPS,soundCues} from './meme-sounds.js';
export function createSpellAudio({Context=()=>globalThis.AudioContext||globalThis.webkitAudioContext,fetchAudio=(...args)=>fetch(...args),random=Math.random}={}){
 let context,master,volume=.6,muted=false,epoch=0;const buffers=new Map(),playing=new Set();
 async function load(clip){if(buffers.has(clip))return buffers.get(clip);const pending=(async()=>{const response=await fetchAudio(new URL(`./media/memes/${clip}.mp3`,import.meta.url));if(!response.ok)throw Error('Sound unavailable');const buffer=await context.decodeAudioData(await response.arrayBuffer());
  // Remove quiet lead-in and level the recordings without amplifying silent clips.
  let peak=0,first=buffer.length;for(let channel=0;channel<buffer.numberOfChannels;channel++){const samples=buffer.getChannelData(channel);for(let i=0;i<samples.length;i++){const a=Math.abs(samples[i]);peak=Math.max(peak,a);if(a>.035)first=Math.min(first,i);}}
  return{buffer,offset:Math.max(0,first/buffer.sampleRate-.015),gain:Math.min(2,.65/Math.max(.1,peak))};})();buffers.set(clip,pending);pending.catch(()=>buffers.delete(clip));return pending;}
 async function unlock(){try{if(!context){const AudioContext=Context();context=new AudioContext();master=context.createGain();master.gain.value=muted?0:volume;master.connect(context.destination);}if(context.state==='suspended')await context.resume();for(const clip of Object.keys(MEME_CLIPS))void load(clip).catch(()=>{});return context.state==='running';}catch{return false;}}
 async function play(spell,kind='cast'){
  if(muted||context?.state!=='running')return false;const cues=soundCues(spell,kind),generation=epoch,started=Date.now();if(!cues.length)return false;
  try{const loaded=await Promise.all(cues.map(c=>load(c.clip)));if(muted||generation!==epoch||context.state!=='running'||Date.now()-started>900)return false;
   const jitter=kind==='cast'?.96+random()*.08:1;for(let i=0;i<cues.length;i++){while(playing.size>=12){const oldest=playing.values().next().value;oldest.stop();playing.delete(oldest);}const c=cues[i],record=loaded[i],source=context.createBufferSource(),gain=context.createGain();source.buffer=record.buffer;source.playbackRate.value=c.rate*jitter;gain.gain.value=c.gain*record.gain;source.connect(gain).connect(master);playing.add(source);source.onended=()=>{playing.delete(source);source.disconnect();gain.disconnect();};source.start(context.currentTime+c.delay,record.offset,Math.min(c.length,Math.max(.01,record.buffer.duration-record.offset)));}return true;
  }catch{return false;}
 }
 function stop(){epoch++;for(const source of playing){try{source.stop();}catch{}}playing.clear();}
 return{unlock,play,stop,setVolume(value){volume=Math.max(0,Math.min(1,Number(value)||0));if(master)master.gain.value=muted?0:volume;},toggle(){muted=!muted;if(muted)stop();if(master)master.gain.value=muted?0:volume;return muted;},get muted(){return muted;}};
}
