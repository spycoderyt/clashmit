// Best-effort haptics. Android browsers get real navigator.vibrate patterns.
// iPhone Safari has no vibration API. Its only haptic is the tick a native switch
// control makes when toggled:
//  - iOS 26.5+ ticks only when the player's finger toggles the switch directly, so
//    attachTap() lays an invisible switch over a button: one tick per tap, nothing else.
//    Patterns and feedback for incoming damage are impossible there from a web page.
//  - iOS 18 to 26.4 also ticked when code toggled a hidden switch, so the tick rhythms
//    below still play on phones that have not updated. They are harmless elsewhere.
// Because the Taptic Engine is out of reach, phones without a vibration API also get a
// speaker rumble: a loud low-frequency growl gated by the same on/off rhythm as the
// Android vibration. At a decent volume the chassis buzzes in the hand. It follows the
// game's Sound toggle. Damage additionally shakes and reddens the screen on every phone.
const burst=(count,gap)=>Array(count).fill(gap);
// ticks: milliseconds to wait before each tick (iOS ≤26.4). vibrate: on/off milliseconds, used for
// Android vibration and to gate the speaker rumble. rumble: growl pitch (Hz, sweeping to `end`),
// waveform and loudness. shake: red flash plus camera-feed shake strength in pixels and duration.
// A pattern never interrupts one with a higher priority, so taking damage always wins.
export const PATTERNS={
 tap:{priority:1,ticks:[0],vibrate:[12]},
 fireball:{priority:2,ticks:[0,70],vibrate:[35,40,55],rumble:{frequency:150,end:230,type:'triangle',gain:.35}},
 lightning:{priority:2,ticks:[0,30,30],vibrate:[18,22,18,22,18],rumble:{frequency:320,end:260,type:'square',gain:.22}},
 shield:{priority:2,ticks:[0,110],vibrate:[30,80,30],rumble:{frequency:120,end:180,type:'sine',gain:.4}},
 heal:{priority:2,ticks:[0,160,160],vibrate:[20,120,20,120,20],rumble:{frequency:200,end:300,type:'sine',gain:.3}},
 hit:{priority:3,ticks:[0,120,60],vibrate:[45,60,45,40,90],rumble:{frequency:180,end:120,type:'sawtooth',gain:.5}},
 deflected:{priority:3,ticks:[0,200],vibrate:[20,150,20],rumble:{frequency:260,end:240,type:'triangle',gain:.3}},
 shielded:{priority:4,ticks:[0,...burst(4,25)],vibrate:[160],rumble:{frequency:240,end:200,type:'square',gain:.5},shake:{pixels:3,ms:200}},
 // Slam, second slam, a limping stutter, then a final long slam.
 hurt:{priority:5,ticks:[0,...burst(9,18),120,...burst(6,18),90,30,30,60,22,22,22,95,26,26,26,26,150,...burst(11,16)],vibrate:[260,50,180,40,60,30,60,30,60,40,140,60,420],rumble:{frequency:170,end:70,type:'sawtooth',gain:1},shake:{pixels:8,ms:550}},
 // Jagged crackle that keeps restarting before it settles.
 hurtLightning:{priority:5,ticks:[0,14,14,14,40,14,14,70,14,14,14,14,110,14,14,30,14,14,14,14,14,180,...burst(8,14)],vibrate:[50,20,50,20,120,40,40,20,40,20,40,20,160,60,320],rumble:{frequency:240,end:190,type:'square',gain:1},shake:{pixels:6,ms:450}},
 // Bursts that shrink and drift apart while the growl sinks, ending on two lone beats.
 death:{priority:6,ticks:[0,...burst(14,16),160,...burst(10,18),240,...burst(7,20),340,...burst(4,24),480,140],vibrate:[420,90,340,120,260,160,200,220,140,300,90,400,60],rumble:{frequency:160,end:45,type:'sawtooth',gain:1},shake:{pixels:12,ms:900}},
};
export const tickOffsets=ticks=>{let at=0;return ticks.map(gap=>at+=gap);};
export const patternDuration=pattern=>tickOffsets(pattern.ticks).at(-1);
function createSwitchTicker(doc){
 if(!doc?.createElement)return null;
 const label=doc.createElement('label'),input=doc.createElement('input');input.type='checkbox';input.setAttribute('switch','');label.setAttribute('aria-hidden','true');label.style.display='none';label.append(input);
 return()=>{if(!label.isConnected)doc.head.append(label);label.click();};
}
// Speaker rumble. Runs in its own AudioContext, unlocked by the first touch like the spell sounds.
function createRumble(isMuted){
 const Context=globalThis.AudioContext||globalThis.webkitAudioContext;if(!Context||!globalThis.document)return null;
 let context,playing=[];
 const unlock=()=>{try{context??=new Context();if(context.state==='suspended')void context.resume();}catch{}};
 globalThis.document.addEventListener('pointerdown',unlock,{passive:true});
 function stop(){for(const node of playing)try{node.stop();}catch{}playing=[];}
 function play(pattern){
  stop();if(!pattern.rumble||isMuted()||context?.state!=='running')return false;
  const {frequency,end=frequency,type='sawtooth',gain:level}=pattern.rumble,start=context.currentTime+.01,total=pattern.vibrate.reduce((a,b)=>a+b,0)/1000;
  const gate=context.createGain(),body=context.createOscillator(),sub=context.createOscillator(),subGain=context.createGain();
  body.type=type;body.frequency.setValueAtTime(frequency,start);body.frequency.exponentialRampToValueAtTime(Math.max(30,end),start+total);
  sub.type='sine';sub.frequency.setValueAtTime(frequency/2,start);sub.frequency.exponentialRampToValueAtTime(Math.max(25,end/2),start+total);subGain.gain.value=.6;
  // Gate the growl with the same on/off rhythm as the vibration. 4 ms ramps avoid speaker pops.
  gate.gain.setValueAtTime(0,start);let at=start;
  pattern.vibrate.forEach((ms,i)=>{const until=at+ms/1000;if(i%2===0){gate.gain.setValueAtTime(0,at);gate.gain.linearRampToValueAtTime(level,at+.004);gate.gain.setValueAtTime(level,Math.max(at+.004,until-.004));gate.gain.linearRampToValueAtTime(0,until);}at=until;});
  body.connect(gate);sub.connect(subGain).connect(gate);gate.connect(context.destination);
  for(const node of [body,sub]){node.start(start);node.stop(start+total+.05);}playing=[body,sub];return true;
 }
 return {play,stop};
}
// Damage visuals: a red vignette over `stage`, and a shake applied only to `shakeTarget` (the
// camera feed) so the HUD stays still. The feed is scaled up slightly while it shakes so its
// edges never show. Reduced-motion users get the vignette only.
function createHitVisuals(stage,shakeTarget,doc=globalThis.document){
 if(!stage||!doc?.createElement)return null;
 if(!doc.querySelector('style[data-hit-visuals]')){const style=doc.createElement('style');style.setAttribute('data-hit-visuals','');style.textContent='@keyframes haptic-shake{0%,100%{transform:scale(1)}8%{transform:scale(1.06) translate(calc(var(--shake)*-1),calc(var(--shake)*.5)) rotate(-.4deg)}22%{transform:scale(1.06) translate(var(--shake),calc(var(--shake)*-.6)) rotate(.35deg)}36%{transform:scale(1.06) translate(calc(var(--shake)*-.8),calc(var(--shake)*-.3)) rotate(-.25deg)}52%{transform:scale(1.05) translate(calc(var(--shake)*.6),calc(var(--shake)*.4)) rotate(.2deg)}68%{transform:scale(1.04) translate(calc(var(--shake)*-.35),calc(var(--shake)*.2))}84%{transform:scale(1.02) translate(calc(var(--shake)*.15),calc(var(--shake)*-.1))}}@keyframes haptic-flash{0%{opacity:1}100%{opacity:0}}.haptic-shake{animation:haptic-shake var(--shake-ms) cubic-bezier(.36,.07,.19,.97) both}.haptic-flash{position:absolute;inset:0;z-index:6;pointer-events:none;opacity:0;background:radial-gradient(ellipse at center,#ff1a1a22 30%,#ff1a1ad9 100%)}.haptic-flash.on{animation:haptic-flash var(--flash-ms) ease-out both}@media(prefers-reduced-motion:reduce){.haptic-shake{animation:none}}';doc.head.append(style);}
 const flash=doc.createElement('div');flash.className='haptic-flash';flash.setAttribute('aria-hidden','true');stage.append(flash);
 const restart=(node,name)=>{node.classList.remove(name);void node.offsetWidth;node.classList.add(name);};
 return ({pixels,ms})=>{flash.style.setProperty('--flash-ms',Math.round(ms*1.4)+'ms');restart(flash,'on');if(!shakeTarget)return;shakeTarget.style.setProperty('--shake',pixels+'px');shakeTarget.style.setProperty('--shake-ms',ms+'ms');restart(shakeTarget,'haptic-shake');};
}
const isIOS=()=>/iP(hone|ad|od)/.test(globalThis.navigator?.userAgent||'')||(globalThis.navigator?.platform==='MacIntel'&&globalThis.navigator?.maxTouchPoints>1);
// An invisible switch covering `element`. The finger toggles it directly, which is the one
// interaction iOS still answers with a tick; the click then bubbles to the element as usual.
function overlaySwitch(element,doc){
 if(element.querySelector?.('[data-haptic-trigger]'))return;
 if(!doc.querySelector('style[data-haptic-trigger]')){const style=doc.createElement('style');style.setAttribute('data-haptic-trigger','');style.textContent=':disabled>input[data-haptic-trigger]{display:none}';doc.head.append(style);}
 const input=doc.createElement('input');input.type='checkbox';input.setAttribute('switch','');input.setAttribute('data-haptic-trigger','');input.setAttribute('aria-hidden','true');input.tabIndex=-1;
 Object.assign(input.style,{position:'absolute',inset:'0',width:'100%',height:'100%',margin:'0',opacity:'0',touchAction:'manipulation'});input.style.setProperty('-webkit-tap-highlight-color','transparent');
 if(getComputedStyle(element).position==='static')element.style.position='relative';
 element.append(input);
}
export function createHaptics({vibrate=globalThis.navigator?.vibrate?.bind(globalThis.navigator),ios=isIOS(),tick=createSwitchTicker(globalThis.document),isMuted=()=>false,stage=null,shakeTarget=null,rumble=createRumble(()=>isMuted()),shake=createHitVisuals(stage,shakeTarget),now=()=>performance.now(),setTimer=setTimeout,clearTimer=clearTimeout,isHidden=()=>globalThis.document?.hidden}={}){
 let timers=[],busyUntil=0,busyPriority=0;
 function stop(){for(const timer of timers)clearTimer(timer);timers=[];busyUntil=0;busyPriority=0;rumble?.stop?.();if(vibrate)try{vibrate(0);}catch{}}
 function play(name){
  const pattern=PATTERNS[name];if(!pattern||isHidden()||(!vibrate&&!tick&&!rumble&&!shake))return false;
  if(now()<busyUntil&&pattern.priority<busyPriority)return false;
  stop();busyPriority=pattern.priority;busyUntil=now()+Math.max(patternDuration(pattern),pattern.vibrate.reduce((a,b)=>a+b,0));
  if(pattern.shake)shake?.(pattern.shake);
  if(vibrate){try{return vibrate(pattern.vibrate)!==false;}catch{return false;}}
  rumble?.play(pattern);
  if(tick)for(const at of tickOffsets(pattern.ticks)){if(at===0)tick();else timers.push(setTimer(tick,at));}
  return true;
 }
 // Tap feedback for a button: a vibration on Android, the native switch tick on iPhone.
 function attachTap(element,doc=document){if(!element)return;if(vibrate)element.addEventListener('click',()=>play('tap'));else if(ios)overlaySwitch(element,doc);}
 // Open /?test=haptics on a phone to feel every pattern. "Hands off" fires after a delay with
 // no touch, which shows whether this phone allows haptics for incoming damage.
 function showTestPanel(doc=document){
  const panel=doc.createElement('div');panel.style.cssText='position:fixed;inset:auto 12px 12px 12px;z-index:50;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px;border-radius:12px;background:#0d131cf2;border:1px solid #596170;font:600 .75rem system-ui;color:#f6f4ef';
  const title=doc.createElement('p');title.style.cssText='grid-column:1/-1;margin:0;font-weight:400';const safari=/Version\/([\d.]+)/.exec(navigator.userAgent)?.[1];title.textContent=vibrate?'Haptics test · vibration API: every pattern should play.':ios?`Haptics test · iPhone${safari?` · Safari ${safari}`:''}. Each tap gives one Taptic tick; that is all iOS 26.5+ allows. The rest is a speaker rumble: turn the ringer on and the volume up, and hold the phone near its bottom edge.`:'Haptics test · this browser has no haptics.';panel.append(title);
  const button=(text,action)=>{const b=doc.createElement('button'),label=doc.createElement('span');b.type='button';label.textContent=text;b.append(label);b.setText=next=>{label.textContent=next;};b.style.cssText='min-height:40px;border-radius:8px;border:1px solid #596170;background:#18202b;color:inherit;font:inherit';b.onclick=action;panel.append(b);if(!vibrate)attachTap(b,doc);return b;};
  // The arena is hidden while this panel is used from the lobby, so flash the page itself there.
  // Nothing shakes here: the shake belongs to the live camera feed only.
  const pageFlash=createHitVisuals(doc.body,null,doc),feel=name=>{const played=play(name);if(played&&stage?.hidden!==false&&PATTERNS[name].shake)pageFlash?.(PATTERNS[name].shake);return played;};
  for(const name of Object.keys(PATTERNS))button(name,()=>feel(name));
  const delayed=button('hurt in 3 s · hands off',()=>{delayed.setText('lift your finger…');setTimer(()=>{delayed.setText(feel('hurt')?'fired · did you feel it?':'not supported here');},3000);});delayed.style.gridColumn='1/-1';
  doc.body.append(panel);
 }
 return {play,stop,attachTap,showTestPanel,supported:!!(vibrate||tick||rumble||shake)};
}
