const ORIGINAL_WORDS={fireball:['fire ball'],lightning:['lightning'],shield:['shield'],heal:['heal']};
// `words` maps a spell id to its spoken forms. Only the supplied deck can cast, which also cuts misfires.
export function spellsFromText(text,words=ORIGINAL_WORDS){
 const spoken=new Map(),forms=[];
 for(const [id,list] of Object.entries(words))for(const word of list){const parts=word.toLowerCase().trim().split(/\s+/);spoken.set(parts.join(''),id);forms.push(parts);}
 if(!forms.length)return [];
 // Longest first so “skeleton army” is one command rather than “skeleton” plus noise.
 forms.sort((a,b)=>b.join('').length-a.join('').length);
 const pattern=new RegExp(`\\b(?:${forms.map(parts=>parts.join('\\s*')).join('|')})\\b`,'g');
 return [...text.toLowerCase().matchAll(pattern)].map(m=>spoken.get(m[0].replace(/\s/g,'')));
}
export function spellFromText(text,words){return spellsFromText(text,words)[0]||null;}
const messages={
 'not-allowed':'Microphone or speech access was denied. Allow it in Safari’s website settings.',
 'service-not-allowed':'This browser cannot use speech recognition. Open the game in Safari and enable Siri.',
 'audio-capture':'No microphone is available. Check your microphone access.',
 'network':'The browser’s speech service could not connect. Check your internet connection and Siri settings.',
 'language-not-supported':'English speech recognition is unavailable on this device.',
 'no-speech':'No speech heard yet. Say one of your spells.'
};
export function setupVoice({Recognition,button,status,onSpell,getWords=()=>undefined,describe=()=>'Fireball, Lightning, Shield or Heal'}){
 let active=false,recognition=null,restartTimer,startTimer;
 const show=text=>status.textContent=text;
 function stop(){active=false;clearTimeout(restartTimer);clearTimeout(startTimer);recognition?.abort();button.classList.remove('listening');button.textContent='◎ Enable voice';}
 function start(){
  if(!active)return;
  const session=new Recognition(),handled=new Map();recognition=session;
  session.lang='en-US';session.interimResults=true;session.continuous=true;
  session.onstart=()=>{if(!active||recognition!==session)return;clearTimeout(startTimer);button.textContent='◉ Voice on · tap to stop';button.classList.add('listening');show(`Fast casting: listening for ${describe()}…`);};
  session.onresult=e=>{
   if(!active||recognition!==session)return;
   for(let i=e.resultIndex;i<e.results.length;i++){
    const result=e.results[i],text=result[0].transcript,spells=spellsFromText(text,getWords());
    const previous=handled.get(i)||0;
    // A command slot is consumed on its first hypothesis. Revisions and the final
    // result must not cast it again, even if the recognizer changes the spell name.
    handled.set(i,Math.max(previous,spells.length));
    const fresh=spells.slice(previous);
    show(`Heard: “${text}”${fresh.length&&!result.isFinal?' · casting early':result.isFinal?'':'…'}`);
    for(const spell of fresh)onSpell(spell);
    if(result.isFinal&&!spells.length)show(`Heard “${text}”. Try ${describe()}.`);
   }
  };
  session.onerror=e=>{if(!active||recognition!==session||e.error==='aborted')return;const message=messages[e.error]||`Speech stopped (${e.error}). Try again or use spell buttons.`;if(e.error!=='no-speech')stop();show(message);};
  session.onend=()=>{if(recognition!==session)return;clearTimeout(startTimer);if(active)restartTimer=setTimeout(start,350);};
  try{recognition.start();startTimer=setTimeout(()=>{stop();show('Speech did not start. Open this link in Safari or Chrome, allow the microphone, then try again.');},7000);}catch{stop();show('Speech is unavailable here. Open the game in Safari or Chrome.');}
 }
 if(!Recognition){button.disabled=true;button.textContent='Voice unavailable';show('This browser has no speech recognition. Open in Safari or Chrome, or use the spell buttons.');}
 else button.onclick=()=>{if(active){stop();show('Voice off. Tap Enable voice to listen again.');}else{active=true;button.textContent='Starting microphone…';show('Allow microphone and speech access if asked.');start();}};
 return{stop,isActive:()=>active};
}
