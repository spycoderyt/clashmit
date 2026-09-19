export function spellFromText(text){const s=text.toLowerCase();return /\bfire\s?ball\b/.test(s)?'fireball':/\bshield\b/.test(s)?'shield':/\bheal\b/.test(s)?'heal':null;}
const messages={
 'not-allowed':'Microphone or speech access was denied. Allow it in Safari’s website settings.',
 'service-not-allowed':'This browser cannot use speech recognition. Open the game in Safari and enable Siri.',
 'audio-capture':'No microphone is available. Check your microphone access.',
 'network':'The browser’s speech service could not connect. Check your internet connection and Siri settings.',
 'language-not-supported':'English speech recognition is unavailable on this device.',
 'no-speech':'No speech heard yet. Say “Fireball”, “Shield” or “Heal”.'
};
export function setupVoice({Recognition,button,status,onSpell}){
 let active=false,recognition=null,restartTimer,startTimer;
 const show=text=>status.textContent=text;
 function stop(){active=false;clearTimeout(restartTimer);clearTimeout(startTimer);recognition?.abort();button.classList.remove('listening');button.textContent='◎ Enable voice';}
 function start(){
  if(!active)return;
  recognition=new Recognition();recognition.lang='en-US';recognition.interimResults=true;recognition.continuous=true;
  recognition.onstart=()=>{clearTimeout(startTimer);button.textContent='◉ Voice on · tap to stop';button.classList.add('listening');show('Listening for Fireball, Shield or Heal…');};
  recognition.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++){const result=e.results[i],text=result[0].transcript;show(`Heard: “${text}”${result.isFinal?'':'…'}`);if(result.isFinal){const spell=spellFromText(text);if(spell)onSpell(spell);else show(`Heard “${text}”. Try Fireball, Shield or Heal.`);}}};
  recognition.onerror=e=>{if(e.error==='aborted')return;const message=messages[e.error]||`Speech stopped (${e.error}). Try again or use spell buttons.`;if(e.error!=='no-speech')stop();show(message);};
  recognition.onend=()=>{clearTimeout(startTimer);if(active)restartTimer=setTimeout(start,350);};
  try{recognition.start();startTimer=setTimeout(()=>{stop();show('Speech did not start. Open this link in Safari or Chrome, allow the microphone, then try again.');},7000);}catch{stop();show('Speech is unavailable here. Open the game in Safari or Chrome.');}
 }
 if(!Recognition){button.disabled=true;button.textContent='Voice unavailable';show('This browser has no speech recognition. Open in Safari or Chrome, or use the spell buttons.');}
 else button.onclick=()=>{if(active){stop();show('Voice off. Tap Enable voice to listen again.');}else{active=true;button.textContent='Starting microphone…';show('Allow microphone and speech access if asked.');start();}};
 return{stop,isActive:()=>active};
}
