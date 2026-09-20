// A separate media channel: admin music never changes spell/effect audio volume.
const SILENCE='data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
export function musicPosition(state,duration,at){
 const elapsed=Math.max(0,(at-state.startedAt)/1000);
 if(!Number.isFinite(duration)||duration<=0)return elapsed;
 return state.loop?elapsed%duration:Math.min(elapsed,duration);
}
export function createSharedMusic({now=Date.now,getBaseUrl=()=>globalThis.location?.href,audioFactory=()=>new Audio(),AudioContextCtor=globalThis.AudioContext||globalThis.webkitAudioContext,document:doc=globalThis.document}={}){
 const audio=audioFactory();audio.preload='metadata';audio.playsInline=true;audio.crossOrigin='anonymous';
 let state=null,unlocked=false,disposed=false,context,source,gain,epoch=0,playPending=false,lastSeekAt=-Infinity;
 function volume(){const level=Math.max(0,Math.min(.3,Number(state?.volume)||0));if(gain){gain.gain.value=level;audio.volume=1;}else audio.volume=level;}
 function pause(){epoch++;playPending=false;audio.pause();}
 function align(force=false){
  if(!state?.playing||!Number.isFinite(audio.duration)||audio.duration<=0)return;
  const expected=musicPosition(state,audio.duration,now());
  if(Math.abs(audio.currentTime-expected)>(force ? .08 : .45)){try{audio.currentTime=expected;lastSeekAt=now();}catch{}}
 }
 function apply(force=false){
  if(disposed||!state)return;
  volume();audio.loop=!!state.loop;
  if(!state.playing||!state.trackId||!unlocked||doc?.hidden){pause();return;}
  if(Number.isFinite(audio.duration)&&!state.loop&&musicPosition(state,audio.duration,now())>=audio.duration){pause();return;}
  align(force);
  if(audio.paused&&!playPending){
   const version=epoch;playPending=true;
   try{Promise.resolve(audio.play()).then(()=>{if(disposed||doc?.hidden||!state?.playing)audio.pause();}).catch(()=>{if(version===epoch)unlocked=false;}).finally(()=>{if(version===epoch)playPending=false;});}catch{playPending=false;unlocked=false;}
  }
 }
 function sync(next){
  if(disposed||!next)return;
  const changed=next.trackId!==state?.trackId||next.url!==state?.url,restarted=changed||next.startedAt!==state?.startedAt;
  // Only the server's local track route can become a media source.
  const allowed=!next.trackId||(/^\/api\/music\/[a-f0-9-]{36}\.mp3$/.test(next.url||'')&&next.url===`/api/music/${next.trackId}.mp3`);
  if(!allowed)return;
  state={...next};
  if(changed){pause();if(next.url){const base=getBaseUrl();audio.src=base?new URL(next.url,base).href:next.url;audio.load();}else{audio.removeAttribute?.('src');audio.load();}}
  apply(restarted);
 }
 async function unlock(){
  if(disposed)return false;
  unlocked=true;
  // Web Audio gain supplies real quiet playback on iOS, where media.volume may be ignored.
  try{if(!context&&AudioContextCtor){context=new AudioContextCtor();source=context.createMediaElementSource(audio);gain=context.createGain();source.connect(gain);gain.connect(context.destination);}if(context?.state==='suspended')void context.resume().catch(()=>{});}catch{}
  volume();
  if(!state?.trackId){
   const priming=epoch;try{audio.src=SILENCE;await audio.play();if(priming===epoch&&!state?.trackId)audio.pause();}catch{}
   return true;
  }
  apply(true);return true;
 }
 function stop(){state=null;pause();}
 const metadata=()=>apply(true),visibility=()=>{if(doc?.hidden)pause();else apply(true);};
 audio.addEventListener('loadedmetadata',metadata);audio.addEventListener('canplay',metadata);doc?.addEventListener('visibilitychange',visibility);
 // Snapshots also align playback; this covers long quiet periods with no network traffic.
 const timer=setInterval(()=>{if(now()-lastSeekAt>1500)apply(false);},2500);timer.unref?.();
 function dispose(){if(disposed)return;disposed=true;stop();clearInterval(timer);audio.removeEventListener('loadedmetadata',metadata);audio.removeEventListener('canplay',metadata);doc?.removeEventListener('visibilitychange',visibility);source?.disconnect();gain?.disconnect();void context?.close?.().catch(()=>{});audio.removeAttribute?.('src');audio.load();}
 return{unlock,sync,stop,dispose};
}
