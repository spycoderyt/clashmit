const ORIGINAL_WORDS={fireball:['fire ball'],lightning:['lightning'],shield:['shield'],heal:['heal','heel']};
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
// enable() is called by Join, pause/resume suspend speech during scans and backgrounding.
export function setupVoice({Recognition,button,status,onSpell,onActive=()=>{},getWords=()=>undefined,describe=()=>'Fireball, Lightning, Shield or Heal'}){
 let active=false,wanted=false,paused=false,recognition=null,restartTimer,startTimer,failures=0;
 const show=text=>status.textContent=text;
 function halt(){
  active=false;clearTimeout(restartTimer);clearTimeout(startTimer);
  const previous=recognition;recognition=null;previous?.abort();
  button?.classList.remove('listening');if(button)button.textContent='◎ Enable voice';onActive(false);
 }
 function stop(){wanted=false;paused=false;halt();}
 function fail(message){stop();show(message);}
 function start(){
  if(!wanted||paused||!Recognition||recognition)return;
  active=true;const session=new Recognition(),handled=new Map();recognition=session;
  session.lang='en-US';session.interimResults=true;session.continuous=true;
  session.onstart=()=>{if(!active||recognition!==session)return;clearTimeout(startTimer);button?.classList.add('listening');if(button)button.textContent='◉ Voice on';onActive(true);show(`Listening · say ${describe()}`);};
  session.onresult=e=>{
   if(!active||recognition!==session)return;failures=0;
   for(let i=e.resultIndex;i<e.results.length;i++){
    const result=e.results[i],text=result[0].transcript,spells=spellsFromText(text,getWords()),previous=handled.get(i)||0;
    // Interim revisions and final results must not cast an already-consumed command slot again.
    handled.set(i,Math.max(previous,spells.length));const fresh=spells.slice(previous);
    show(`Heard: “${text}”${fresh.length&&!result.isFinal?' · casting early':result.isFinal?'':'…'}`);
    for(const spell of fresh)onSpell(spell);
    if(result.isFinal&&!spells.length)show(`Heard “${text}”. Say ${describe()}.`);
   }
  };
  session.onerror=e=>{
   if(!active||recognition!==session||e.error==='aborted')return;
   if(e.error==='no-speech'){show('Listening · say a spell');return;}
   if(['network','audio-capture'].includes(e.error)&&++failures<=3){
    halt();show('Reconnecting voice…');restartTimer=setTimeout(start,1000*failures);return;
   }
   fail(messages[e.error]||`Voice stopped (${e.error}). Rejoin to retry.`);
  };
  session.onend=()=>{
   if(recognition!==session)return;recognition=null;clearTimeout(startTimer);onActive(false);
   if(wanted&&!paused)restartTimer=setTimeout(start,350);
  };
  startTimer=setTimeout(()=>fail('Voice did not start. Allow microphone and speech access, then rejoin in Safari or Chrome.'),7000);
  try{session.start();}catch{fail('Speech is unavailable here. Rejoin in Safari or Chrome with microphone access allowed.');}
 }
 function enable(){
  if(!Recognition){show('Voice unavailable. Open in Safari or Chrome with speech recognition enabled.');return;}
  if(wanted&&!paused)return;wanted=true;paused=false;failures=0;show('Starting voice… allow microphone and speech access if asked.');start();
 }
 function pause(){if(!wanted)return;paused=true;halt();show('Voice paused');}
 function resume(){if(!wanted)return;paused=false;start();}
 if(!Recognition){if(button){button.disabled=true;button.textContent='Voice unavailable';}show('Voice unavailable. Open in Safari or Chrome with speech recognition enabled.');}
 else if(button)button.onclick=()=>{if(wanted){stop();show('Voice off.');}else enable();};
 return{enable,pause,resume,stop,isActive:()=>active};
}
