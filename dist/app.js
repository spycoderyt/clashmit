import {setupLobbyVideo} from './lobby-video.js?v=2';
import {createGameConnection} from './connection.js?v=hosting1';
import {createTargetOverlay} from './target-overlay.js?v=persona1';
import {piercerOf,SPELLS,MANA,manaAt,castSpell,launchProjectile,impactProjectile,FLIGHT_MS,PERSONAS,DEFAULT_PERSONA,personaOf,settleRoom} from './rules.js?v=persona1';
import {PERSONA_INFO,SPELL_INFO,deckWords,labelOf} from './personas.js?v=persona1';
import {createSkeletonArmy,feetOf} from './skeleton-army.js?v=persona1';
import {createServerClock} from './server-clock.js?v=combat1';
import {createSpellAudio} from './sound.js?v=persona1';
import {createIncomingFireballs} from './incoming-fireball.js?v=persona1';
import {setupVoice} from './voice.js?v=persona1';
import {coverRect} from './shirt.js?v=face1';
import {aimContains} from './target-track.js?v=face1';
import {createFlight} from './projectile-flight.js?v=face1';
import {createFaceTracker} from './face-tracker.js?v=face11';
import {setupFaceScan} from './face-scan.js?v=face11';
import {encodeDescriptor,decodeDescriptor} from './face-id.js?v=face11';
import {createMinimap} from './minimap.js?v=map3';
import {createHaptics} from './haptics.js?v=haptic4';
import {requestAllPermissions} from './permissions.js?v=perm1';
import {createRoundOverlay} from './round-overlay.js?v=round1';
const $=id=>document.getElementById(id);
setupLobbyVideo({video:$('lobby-background'),lobby:$('lobby'),button:$('background-toggle'),headline:$('lobby-headline')});
const targetOverlay=createTargetOverlay($('arena'),$('boxes'));
const audio=createSpellAudio();document.addEventListener('pointerdown',()=>{void audio.unlock();},{passive:true});
$('sound-toggle').onclick=()=>{const muted=audio.toggle();$('sound-toggle').textContent=muted?'Sound off':'Sound on';$('sound-toggle').setAttribute('aria-pressed',String(muted));$('sound-toggle').setAttribute('aria-label',muted?'Enable spell sounds':'Mute spell sounds');};
const safeRead=key=>{try{return localStorage.getItem(key)||'';}catch{return '';}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
let room,myId,practice=false,trackingPractice=false,joined=false;
let stream,selected=null,rosterSignature='',toastTimer,lockSince=0,lockId=null;
let detection={people:[],width:0,height:0,at:0},trackingStatus='Camera off',fireScene,graphicsLoading,effectTimer,cameraStarting=false,cameraEpoch=0;
const simulated=()=>practice&&!trackingPractice;
const serverClock=createServerClock();
const now=()=>practice?Date.now():serverClock.now(),me=()=>room?.players.find(p=>p.id===myId),opponent=()=>room?.players.find(p=>p.id===focusId&&p.id!==myId)||room?.players.find(p=>p.id!==myId);
// Face lock: decoded face signatures by player id, the player the camera is on, and the solo test's own face.
const faces=new Map();let focusId=null,localFace=null,autoScanOffered=false,mySamples=null,faceResent=false,permissionsReady=Promise.resolve();
const gallery=()=>trackingPractice?(localFace?[{id:'dummy',name:'You',...localFace}]:[]):(room?.players||[]).filter(p=>p.id!==myId&&p.connected&&faces.has(p.id)).map(p=>({id:p.id,name:p.name,...faces.get(p.id)}));
$('name').value=safeRead('fieldspell-name');
let persona=Object.hasOwn(PERSONAS,safeRead('fieldspell-persona'))?safeRead('fieldspell-persona'):DEFAULT_PERSONA;
// In a live game the server's record wins; the lobby choice only matters until the welcome arrives.
const myPersona=()=>me()?personaOf(me()):persona,myDeck=()=>PERSONAS[myPersona()],isThrown=spell=>!!SPELLS[spell]?.flightMs;
const active=(effect,at)=>!!effect&&effect.until>at;
$('persona-picker').append(...Object.entries(PERSONA_INFO).map(([id,info])=>{
 const card=document.createElement('label'),input=document.createElement('input'),symbol=document.createElement('span'),name=document.createElement('b'),blurb=document.createElement('small'),deck=document.createElement('small');
 card.className='persona-card';card.style.setProperty('--persona-accent',info.accent);input.type='radio';input.name='persona';input.value=id;input.checked=id===persona;
 input.onchange=()=>{persona=id;safeWrite('fieldspell-persona',id);};symbol.className='persona-symbol';symbol.textContent=info.symbol;name.textContent=info.name;blurb.textContent=info.blurb;deck.textContent=PERSONAS[id].slice(0,2).map(labelOf).join(' · ');
 card.append(input,symbol,name,blurb,deck);return card;
}));
const notify=text=>{$('toast').textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').textContent='',4000);};
function send(message){return connection.send(message);}
const minimap=createMinimap({container:$('arena'),send,notify});$('leave').addEventListener('click',()=>minimap.stop());window.addEventListener('pagehide',()=>minimap.stop());
$('leave').addEventListener('click',()=>{faces.clear();focusId=null;localFace=null;autoScanOffered=false;mySamples=null;});
const haptics=createHaptics({isMuted:()=>audio.muted,stage:$('arena'),shakeTarget:$('camera')});if(new URLSearchParams(location.search).get('test')==='haptics')haptics.showTestPanel();
// Synchronised 5-4-3-2-1 before every round and the leaderboard after it; a tick is felt on each second.
const roundOverlay=createRoundOverlay({container:$('arena'),now:()=>serverClock.now(),onTick:second=>haptics.play(second?'tap':'hit')});$('leave').addEventListener('click',()=>roundOverlay.hide());
const flights=new Map(),completedShots=new Set();let dummyTimer,dummyShots=0;
const army=createSkeletonArmy($('arena'));
const describeIncoming=spell=>{const info=SPELL_INFO[spell]||SPELL_INFO.fireball;return{label:info.label.toLowerCase(),rgb:info.rgb,bolt:!!info.bolt,thrown:spell!=='skeletonArmy',hit:spell==='skeletonArmy'?'Skeletons on you':undefined};};
const incoming=createIncomingFireballs({container:$('arena'),renderer:()=>fireScene,describe:describeIncoming,getAttacker:id=>{if(simulated())return{x:.5,y:.4};const p=matchedPerson(id);return p?.fresh?{x:p.x,y:p.y}:null;},now});
const faceTracker=createFaceTracker($('camera'),{getGallery:gallery,onStatus:status=>{trackingStatus=status;}});
function loadGraphics(){graphicsLoading??=import('./fireball.js?v=persona1').then(m=>{fireScene=m.createFireballRenderer($('arena'));}).catch(()=>{fireScene=null;});return graphicsLoading;}
// Camera tracks mapped to the screen. `named` keeps only recognised, living players.
function visibleTracks(named=true){
 if(document.hidden||!stream?.active||!room||Date.now()-faceTracker.lastFrameAt()>1000)return[];
 const size=faceTracker.size(),rect=targetOverlay.size(),alive=new Set(room.players.filter(p=>p.id!==myId&&p.connected&&p.health>0).map(p=>p.id)),rows=[];
 for(const track of faceTracker.targets()){
  if(named?!alive.has(track.id):!!track.id)continue;
  const box=coverRect(track.box,size.width,size.height,rect.width,rect.height),x=box.x+box.width/2,y=box.y+box.height/2;
  if(x>=0&&x<=1&&y>=0&&y<=1)rows.push({...track,box,x,y,reticle:Math.hypot(x-.5,y-.4)});
 }
 return rows.sort((a,b)=>a.reticle-b.reticle);
}
// With an id: that player's lock, wherever they are on screen. Without: the recognised player nearest the reticle.
function matchedPerson(id){
 const rows=visibleTracks();if(id)return rows.find(t=>t.id===id)||null;
 if(rows[0])focusId=rows[0].id;return rows[0]||null;
}
function targetPoint(id){if(simulated())return{x:.5,y:.4};const target=matchedPerson(id);return target?{x:target.x,y:target.y}:null;}
function finishShot(shot,tracked){if(!room)return;if(practice){const event=impactProjectile(room,myId,shot.shotId,tracked);if(!event.error)handleImpact(event);if(opponent().health<=0){room.phase='finished';room.winners=[myId];}renderState();}else send({type:'impact',shotId:shot.shotId,tracked});}
function clearFlights(){clearInterval(dummyTimer);for(const timer of flights.values())clearInterval(timer);flights.clear();incoming.clear();fireScene?.clear();army.clear();}
function lightningEffect(target,spell){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('lightning-bolt');if(spell==='zap')svg.classList.add('zap');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');
 const path=document.createElementNS(svg.namespaceURI,'polyline'),tx=target.x*100,ty=target.y*100,points=[];
 for(let i=0;i<=9;i++){const f=i/9;points.push(`${50+(tx-50)*f+(i===0||i===9?0:(i%2?4:-4))},${93+(ty-93)*f}`);}path.setAttribute('points',points.join(' '));svg.append(path);$('fx').append(svg);
}
function effect(spell,{shot,projectile=true}={}){
 if(projectile&&shot?.shotId&&(flights.has(shot.shotId)||completedShots.has(shot.shotId)))return;
 haptics.play(SPELL_INFO[spell]?.bolt?'lightning':isThrown(spell)?'fireball':spell); // new spells borrow the nearest existing pattern
 audio.play(spell);clearTimeout(effectTimer);const layer=$('fx');layer.className='';layer.replaceChildren();const burst=document.createElement('div');burst.className='spell-burst';
 for(const cls of ['spell-core','spell-ring','spell-feedback']){const el=document.createElement('div');el.className=cls;if(cls==='spell-feedback')el.textContent=labelOf(spell).toUpperCase();burst.append(el);}layer.append(burst);
 const target=targetPoint(shot?.targetId)||{x:.5,y:.4};let depth=false;
 if(isThrown(spell)&&projectile&&shot?.shotId){
  const flightMs=shot.flightMs||FLIGHT_MS,elapsedMs=Math.max(0,flightMs-((shot.impactAt??((shot.at||now())+flightMs))-now())),startedAt=performance.now()-elapsedMs,roundEndsAt=room.endsAt,actor=myId,flight=createFlight({startedAt,flightMs});
  const timer=setInterval(()=>{const active=!!room&&room.endsAt===roundEndsAt&&myId===actor&&!document.hidden;const result=flight.step(performance.now(),simulated()||!!matchedPerson(shot.targetId)?.fresh,active);if(result){clearInterval(timer);flights.delete(shot.shotId);if(!result.cancelled)completedShots.add(shot.shotId);if(!result.cancelled)finishShot(shot,result.tracked);}},25);flights.set(shot.shotId,timer);
  // Bolts are streaks, the army walks on its own ground layer, and everything else is thrown in the 3D scene.
  if(SPELL_INFO[spell]?.bolt)lightningEffect(target,spell);
  else if(spell!=='skeletonArmy'){try{depth=!!fireScene?.fire({...target,style:spell,getTarget:()=>targetPoint(shot.targetId),flightMs,elapsedMs});}catch(e){console.warn('Spell graphics fallback',e);}}
  notify(spell==='skeletonArmy'?'Skeletons marching · keep them in view':`${labelOf(spell)} launched${SPELLS[spell].bypassShield?' · pierces shields':''}${shot.clearedSwarm?' · skeletons cleared':''}`);
 }else if(shot?.clearedSwarm)notify('Skeletons cleared');
 layer.className='cast-effect '+spell+(depth?' has-depth':'');effectTimer=setTimeout(()=>{layer.className='';layer.replaceChildren();},SPELL_INFO[spell]?.bolt?450:2200);
}
function handleImpact(m){
 const shown=incoming.resolve(m);completedShots.add(m.shotId);if(m.targetId===myId&&!shown&&!m.missed){$('arena').classList.add('incoming-hit-fallback');setTimeout(()=>$('arena').classList.remove('incoming-hit-fallback'),250);}const spell=m.spell||'fireball',name=labelOf(spell),rule=SPELLS[spell]||SPELLS.fireball,damage=rule.damage,linger=rule.dot||rule.swarm,after=linger?linger.perSecond*linger.duration/1000:0;
 const dealt=[damage?`${damage} damage`:'',after?`${after} more over ${linger.duration/1000}s`:'',rule.stun?'stunned':''].filter(Boolean).join(' · '),taken=[damage?`−${damage} HP`:'',rule.dot?'poisoned':'',rule.swarm?'say a splash spell to clear them':'',rule.stun?'stunned':''].filter(Boolean).join(' · ');
 // The impact event arrives before the state that applies it, so a lethal hit is predicted from current health.
 if(!m.missed){if(m.targetId===myId)haptics.play(m.blocked?'shielded':(me()?.health??100)-damage<=0?'death':SPELL_INFO[spell]?.bolt?'hurtLightning':'hurt');else if(m.actorId===myId)haptics.play(m.blocked?'deflected':'hit');}
 if(m.actorId===myId||m.targetId===myId)audio.play(spell,m.missed?'miss':m.blocked?'block':'impact');
 if(m.actorId===myId)notify(m.missed?`Target lost · ${name} missed`:m.blocked?`${name} blocked`:`${name} ${rule.swarm?'landed':'hit'} · ${dealt}`);
 if(m.targetId===myId&&!m.missed)notify(m.blocked?`Your shield blocked ${name}`:`${rule.swarm?'Skeletons on you':'Hit by '+name} · ${taken}`);
}
function showArena(){loadGraphics();$('lobby').hidden=true;$('arena').hidden=false;$('shirt-open').hidden=simulated();$('tracking-retry').hidden=simulated();$('camera-instructions').textContent=trackingPractice?'Scan your face, then step back and see how far the lock holds.':practice?'Practice a 3D fireball over your camera with a simulated target.':'Scan your face once, then point the camera at another player.';$('camera-privacy').textContent='Camera video stays on your phone.';$('camera-prompt').hidden=!!stream?.active;}
function setError(text){$('join-status').textContent=text;$('join').disabled=false;notify(text);}
function endpoint(){const url=new URL(location.hostname.endsWith('.chatgpt.site')?'https://clashmit-production.up.railway.app':location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/ws';url.search='';url.hash='';return url.href;}
const connection=createGameConnection({
 url:endpoint,
 join:()=>({type:'join',name:$('name').value.trim(),persona,token:sessionStorage.getItem('fieldspell-token')}),
 onStatus:status=>{$('connection').textContent=status==='connected'?'Connected':status==='connecting'?'Connecting…':'Reconnecting · casting paused';if(!$('lobby').hidden)$('join-status').textContent=status==='connected'?'Joined':status==='connecting'?'Joining the game…':'Trying to reconnect…';},
 onDisconnect:()=>{selected=null;lockId=null;castPending=false;clearFlights();},
 onError:message=>{setError(message);$('connection').textContent='Disconnected · rejoin the arena';},
 onMessage:m=>{
  if(m.type==='welcome'){if(myId&&myId!==m.id){clearFlights();completedShots.clear();faceTracker.reset();room=null;rosterSignature='';notify('The arena restarted. Rejoining with your face scan.');}serverClock.reset();joined=true;myId=m.id;sessionStorage.setItem('fieldspell-token',m.token);showArena();$('join').disabled=false;}
  if(m.type==='state'){if(room&&room.endsAt!==m.room.endsAt)clearFlights();room=m.room;serverClock.bootstrap(room.serverTime);incoming.sync((room.shots||[]).filter(s=>s.targetId===myId));for(const shot of room.shots||[])if(shot.actorId===myId&&room.phase==='playing'&&now()<(shot.expiresAt??Infinity))effect(shot.spell||'fireball',{shot});renderState();}
  if(m.type==='state')minimap.update(m.room,myId);
  if(m.type==='state'){roundOverlay.update(m.room,myId);if(m.room.phase==='countdown')$('phase').textContent='Round starting…';}
  // Each player's scan: whole-face samples plus upper-face ones for when a phone hides their nose and mouth.
  if(m.type==='faces')for(const [id,scan] of Object.entries(m.faces||{})){const decode=list=>(list||[]).map(decodeDescriptor).filter(Boolean),samples=decode(scan?.samples);if(samples.length)faces.set(id,{samples,upper:decode(scan.upper)});else faces.delete(id);}
  // First thing a new player sees after the permission prompts: the face scan, without having to find a button.
  // A player who already scanned (the server restarted, or they rejoined) silently sends the same signature again.
  if(m.type==='welcome')faceResent=false;
  if(m.type==='state'&&joined&&me()&&!me().faceReady&&room.phase!=='playing'){if(mySamples){if(!faceResent){faceResent=true;send({type:'face',...mySamples});}}else if(!autoScanOffered){autoScanOffered=true;void permissionsReady.then(()=>{if(joined&&!practice&&!$('arena').hidden&&!me()?.faceReady&&!faceScan.isOpen)faceScan.open();});}}
  if(m.type==='spell'){if(m.actorId===myId){castPending=false;effect(m.spell,{shot:m});}else if(m.targetId===myId&&m.shotId){incoming.launch(m);audio.play(m.spell);}else if(m.spell==='shield')notify(`Opponent shield active · ${labelOf(piercerOf(myDeck()))} pierces it`);else if(m.spell==='heal'){healed.set(m.actorId,Date.now()+900);notify(`${room?.players.find(p=>p.id===m.actorId)?.name||'Opponent'} healed +20`);}else if(m.clearedSwarm)notify('Your skeletons were cleared');}
  if(m.type==='impact')handleImpact(m);
  if(m.type==='round-start')notify('Round started. Keep your opponent in view.');
  if(m.type==='error'){castPending=false;setError(m.message);}
  if(m.type==='pong'){const receivedAt=Date.now();serverClock.pong(m.serverTime,m.at,receivedAt);$('connection').textContent=`Live · ${receivedAt-m.at}ms`;}
 }
});
function connect(){connection.start();}
// Every permission is requested from this one tap: motion, camera and microphone, then location. The face scan
// waits for the first three; the minimap starts sharing as soon as location is allowed.
$('join-form').addEventListener('submit',()=>{if(!$('name').value.trim())return;const asked=requestAllPermissions({onLocation:allowed=>{if(allowed&&joined&&!practice)minimap.enable({compassGranted:asked.result.motion==='granted'});}});permissionsReady=asked.ready.catch(()=>{});});
$('join-form').onsubmit=e=>{e.preventDefault();if(!$('name').value.trim())return;practice=false;trackingPractice=false;joined=false;$('join').disabled=true;safeWrite('fieldspell-name',$('name').value.trim());connect();};
function beginPractice(realTracking=false){clearFlights();trackingPractice=realTracking;practice=true;connection.stop();myId='self';const make=(id,name,who=persona)=>({id,name,persona:who,health:100,mana:MANA.max,manaUpdatedAt:Date.now(),shieldUntil:0,cooldowns:{},connected:true});room={phase:'playing',hostId:myId,endsAt:Date.now()+180000,winners:[],players:[make(myId,$('name').value.trim()||'You'),make('dummy','Practice target',practiceFoe())]};showArena();$('connection').textContent=trackingPractice?'Local face test · no server':'Solo · simulated target';renderState();if(trackingPractice){room.players[1].name='You';faceScan.open();}else{startCamera();dummyTimer=setInterval(dummyTurn,3500);}}
// ?test=solo&vs=witch: a simulated opponent that casts its deck back, so every persona's incoming effects, status chips and clears can be seen on one device.
function practiceFoe(){const vs=new URLSearchParams(location.search).get('vs');return Object.hasOwn(PERSONAS,vs)?vs:'witch';}
function dummyTurn(){
 if(!simulated()||room?.phase!=='playing'||document.hidden)return;const foe=opponent(),attacks=PERSONAS[personaOf(foe)].filter(isThrown),shot=launchProjectile(room,foe.id,attacks[dummyShots++%attacks.length],myId,crypto.randomUUID());if(shot.error)return;
 incoming.launch(shot);audio.play(shot.spell);const round=room.endsAt;
 setTimeout(()=>{if(!simulated()||room?.endsAt!==round)return;const hit=impactProjectile(room,foe.id,shot.shotId,true);if(hit.error)return;handleImpact(hit);if(me().health<=0){room.phase='finished';room.winners=[foe.id];}renderState();},shot.flightMs);
}
function stopCamera(){cameraEpoch++;faceTracker.stop();stream?.getTracks().forEach(t=>t.stop());stream=null;$('camera').srcObject=null;trackingStatus='Camera off';selected=null;lockId=null;targetOverlay.hide();}
function stopSensors(){clearFlights();stopCamera();faceScan.stop();fireScene?.clear();clearTimeout(effectTimer);$('fx').className='';$('fx').replaceChildren();voice.stop();}
$('leave').onclick=()=>{if(!practice)send({type:'leave'});connection.stop();sessionStorage.removeItem('fieldspell-token');$('arena').hidden=true;stopSensors();completedShots.clear();serverClock.reset();deckSignature='';healed.clear();room=null;myId=null;practice=false;trackingPractice=false;joined=false;rosterSignature='';$('lobby').hidden=false;$('camera-prompt').hidden=false;targetOverlay.hide();$('join-status').textContent='Everyone joins the same game.';};
async function startCamera(){
 if(cameraStarting||stream?.active)return;if(!navigator.mediaDevices?.getUserMedia){notify('Camera requires Safari or Chrome over HTTPS.');return;}
 cameraStarting=true;const epoch=cameraEpoch;$('camera-start').disabled=true;
 try{const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:trackingPractice?'user':'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});if($('arena').hidden||epoch!==cameraEpoch||faceScan.isOpen){next.getTracks().forEach(t=>t.stop());return;}stream=next;$('camera').srcObject=stream;await $('camera').play();$('camera-prompt').hidden=true;if(!simulated())faceTracker.start();}
 catch(e){stopCamera();$('camera-prompt').hidden=false;notify(e.name==='NotAllowedError'?'Allow camera access in browser settings, then retry.':'Could not open camera. Close other camera apps and retry.');}finally{cameraStarting=false;$('camera-start').disabled=false;}
}
const faceScan=setupFaceScan({beforeOpen:()=>{voice.stop();stopCamera();fireScene?.clear();},onSample:()=>haptics.play('tap'),onSave:(samples,upper)=>{if(trackingPractice){localFace={samples,upper};renderState();notify('Face saved. Step back and watch the lock follow you.');}else{mySamples={samples:samples.map(encodeDescriptor),upper:upper.map(encodeDescriptor)};send({type:'face',...mySamples});notify('Face saved. Point your camera at another player.');}},onClose:()=>{if(!$('arena').hidden)startCamera();}});
$('shirt-open').onclick=()=>{if(!practice&&room?.phase==='playing'){notify('Wait until the round ends to rescan your face.');return;}faceScan.open();};
$('camera-start').onclick=()=>{if((trackingPractice&&!localFace)||(!practice&&!me()?.faceReady))faceScan.open();else startCamera();};
$('tracking-retry').onclick=()=>{if(stream?.active)faceTracker.start();else startCamera();};
function renderState(){if(!me())return;renderDeck();$('arena').classList.toggle('round-live',room.phase==='playing');const p=me(),displayHealth=trackingPractice?opponent()?.health:p.health;$('health-title').textContent=trackingPractice?'TARGET HEALTH':'YOUR HEALTH';$('health-value').innerHTML=`${displayHealth} <small>/ 100</small>`;$('health-fill').style.width=displayHealth+'%';$('room-label').textContent=trackingPractice?'ONE PERSON FACE TEST':practice?'SOLO PRACTICE':'MULTIPLAYER ARENA';$('start-round').hidden=room.hostId!==myId;$('start-round').disabled=!trackingPractice&&room.phase==='playing';$('start-round').textContent=trackingPractice?'Reset target':room.phase==='finished'?'New round':'Start round';$('shirt-open').textContent=(trackingPractice?localFace:p.faceReady)?'Rescan face':'Scan face';$('shirt-open').disabled=!practice&&room.phase==='playing';
 const signature=JSON.stringify(room.players.map(p=>[p.id,p.name,p.persona,p.health,p.connected,!!p.faceReady]));if(signature!==rosterSignature){rosterSignature=signature;$('players').replaceChildren(...room.players.filter(p=>p.id!==myId).map(p=>{const el=document.createElement('div');el.className='player'+(p.health<=0?' dead':'');const name=document.createElement('b'),info=PERSONA_INFO[personaOf(p)],tag=document.createElement('span');tag.className='persona-tag';tag.textContent=info.symbol;tag.title=info.name;el.style.setProperty('--persona-accent',info.accent);name.append(tag,p.name);const status=document.createElement('small');status.textContent=!p.connected?'Reconnecting…':`${info.name} · ${p.health} HP · ${practice?'simulated':p.faceReady?'face scanned':'needs face scan'}`;el.append(name,status);return el;}));}
 if(room.phase==='finished'){const winners=room.players.filter(p=>room.winners.includes(p.id)).map(p=>p.name);$('phase').textContent=winners.length===1?`${winners[0]} wins`:winners.length?'Round tied':'Round ended';}else if(room.phase==='lobby')$('phase').textContent=room.hostId===myId?`${room.players.length}${room.maxPlayers?`/${room.maxPlayers}`:''} joined · you control the arena`:'Waiting for the host';
}
function renderAim(){
 if(!room)return;const match=simulated()?{id:'dummy',x:.5,y:.4,confirmed:true,fresh:true,box:{x:.36,y:.23,width:.28,height:.34}}:matchedPerson();
 const liveOpponent=!!match&&opponent()?.id===match.id&&opponent().connected&&opponent().health>0;selected=liveOpponent&&match.confirmed&&aimContains(match.box)?match.id:null;
 // A face near the reticle that has not been named yet, so the player knows to hold still rather than give up.
 const pending=!match&&!simulated()?visibleTracks(false).find(t=>t.reticle<.2):null;
 if(!practice&&!connection.ready)selected=null;
 if(selected!==lockId){lockSince=Date.now();lockId=selected;}const locked=selected&&match?.fresh&&Date.now()-lockSince>200;
 $('reticle').classList.toggle('locked',!!locked);
 const aimText=simulated()?'Simulated target':!(trackingPractice?localFace:me()?.faceReady)?'Tap Scan face to get ready.':!gallery().length?'Waiting for other players to scan their faces.':!stream?.active?'Enable your camera.':match?(locked?`${opponent().name} locked · cast a spell`:match.source==='body'?`Following ${opponent().name} · aim at them`:`Aim the reticle at ${trackingPractice?'your face':opponent().name}`):pending?(pending.match?.tooSmall?'Too far to recognise · move closer':'Identifying… hold steady'):trackingPractice?'Show your face to the camera.':'Point at another player’s face · works best within a few metres';
 if($('target-status').textContent!==aimText)$('target-status').textContent=aimText;
 const visionText=simulated()?'Simulated tracking':trackingStatus;if($('vision-status').textContent!==visionText)$('vision-status').textContent=visionText;
 targetOverlay.update(liveOpponent?match:pending?{...pending,pending:true}:null,liveOpponent?opponent():{name:'Identifying…',health:100},{shielded:liveOpponent&&opponent().shieldUntil>now(),poisoned:liveOpponent&&active(opponent().poison,now()),healed:liveOpponent&&(healed.get(opponent().id)||0)>Date.now(),accent:liveOpponent?PERSONA_INFO[personaOf(opponent())].accent:'',piercer:labelOf(piercerOf(myDeck())),simulated:simulated()});
 for(const spell of myDeck())if(isThrown(spell))$(spell)?.classList.toggle('target-ready',!!locked);
 renderArmy();
}
let castPending=false,castRequest=0,wasStunned=false,lastBeat=0,deckSignature='';const healed=new Map();
function cast(spell){void audio.unlock();if(!room||!myDeck().includes(spell))return;if(room.phase!=='playing'){notify('The host needs to start the round first.');return;}renderAim();if((me().stunUntil||0)>now()){notify('You’re stunned.');return;}
 // Skeletons are on you, not across the field: a splash spell may be spent on them with nobody locked.
 const clearing=!!SPELLS[spell].splash&&active(me().swarm,now());
 if(isThrown(spell)&&!clearing&&(!selected||Date.now()-lockSince<200||(!simulated()&&!matchedPerson()?.fresh))){notify('Aim at another player until their face locks.');return;}if(practice){const event=isThrown(spell)?launchProjectile(room,myId,spell,selected,crypto.randomUUID()):castSpell(room,myId,spell,selected);if(event.error){notify(event.error);return;}effect(spell,{shot:event});renderState();}else if(connection.ready){if(castPending)return;castPending=true;const request=++castRequest;send({type:'cast',spell,targetId:selected});notify('Casting '+labelOf(spell)+'…');setTimeout(()=>{if(castPending&&request===castRequest){castPending=false;notify('Cast not confirmed. Check the connection.');}},2500);}else notify('Reconnecting. Casting is paused.');}
// The spell bar is drawn from the deck, so a persona is exactly its four buttons.
function renderDeck(){
 const deck=myDeck(),signature=myPersona();if(signature===deckSignature)return;deckSignature=signature;
 $('arena').style.setProperty('--persona-accent',PERSONA_INFO[signature].accent);
 $('spells').replaceChildren(...deck.map(spell=>{
  const info=SPELL_INFO[spell],button=document.createElement('button');button.id=spell;button.className='spell '+info.css;button.type='button';
  for(const [tag,cls,value] of [['span','spell-symbol',info.symbol],['b','',info.label],['span','mana-cost',SPELLS[spell].manaCost],['small','',info.blurb],['span','cooldown','']]){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=value;button.append(el);}
  button.onclick=()=>cast(spell);return button;
 }));
 for(const button of $('spells').children)haptics.attachTap(button);
 $('voice-status').textContent=`Enable voice once, then say one word: ${deck.map(labelOf).join(', ')}.`;
}
// Where a player stands on the ground, from their face lock; null while they are out of sight.
function feetFor(id){
 const rect=targetOverlay.size();if(simulated())return{x:.5,y:.57,size:.075}; // the simulated target box is a whole body
 const track=matchedPerson(id);return track?feetOf(track.box,rect.width/rect.height):null;
}
// The army is drawn from shared state every frame, so every phone shows the same marches and the same mobs.
function renderArmy(){
 const at=now(),rect=targetOverlay.size(),hud=document.querySelector('.bottom-hud').getBoundingClientRect(),top=$('arena').getBoundingClientRect().top,live=room.phase==='playing';
 const progress=s=>Math.max(0,Math.min(1,1-(s.impactAt-at)/s.flightMs)),marches=(room.shots||[]).filter(s=>s.spell==='skeletonArmy');
 army.update({
  outgoing:marches.filter(s=>s.actorId===myId).map(s=>({id:s.shotId,who:s.targetId,progress:progress(s),feet:feetFor(s.targetId)})),
  incoming:marches.filter(s=>s.targetId===myId).map(s=>({id:s.shotId,who:s.actorId,progress:progress(s),feet:feetFor(s.actorId)})),
  mobbed:live?room.players.filter(p=>p.id!==myId&&p.health>0&&active(p.swarm,at)).map(p=>({who:p.id,feet:feetFor(p.id)})):[],
  onMe:live&&!trackingPractice&&active(me()?.swarm,at),ground:rect.height?(hud.top-top)/rect.height:.62});
}
$('start-round').onclick=()=>{if(practice){clearFlights();if(trackingPractice){opponent().health=100;room.phase='playing';room.endsAt=Date.now()+180000;room.winners=[];room.shots=[];me().cooldowns={};me().mana=MANA.max;me().manaUpdatedAt=Date.now();me().shieldUntil=0;for(const p of room.players){p.poison=null;p.swarm=null;p.stunUntil=0;}renderState();}else beginPractice(false);return;}send({type:'start'});};
const voice=setupVoice({Recognition:window.SpeechRecognition||window.webkitSpeechRecognition,button:$('voice'),status:$('voice-status'),onSpell:cast,getWords:()=>deckWords(myDeck()),describe:()=>myDeck().map(labelOf).join(', ')});
function renderCombat(){
 const p=me();if(!p)return;const at=now(),mana=Math.min(MANA.max,Math.max(0,manaAt(p,at))),shieldRemaining=Math.max(0,p.shieldUntil-at);
 $('mana-fill').style.width=100*mana/MANA.max+'%';$('mana-value').textContent=`${Math.floor(mana)} / ${MANA.max}`;$('mana-track').setAttribute('aria-valuenow',mana.toFixed(1));
 $('own-shield').classList.toggle('active',shieldRemaining>0);$('shield-status').hidden=!shieldRemaining;$('shield-status').textContent=`◇ Shield ${(shieldRemaining/1000).toFixed(1)}s · Lightning, Skeletons, Zap pierce`;
 const poisoned=active(p.poison,at),swarmed=active(p.swarm,at),stunned=(p.stunUntil||0)>at,live=room.phase==='playing';
 // Re-trigger the flash on each new stun, not on every frame of it.
 if(stunned&&!wasStunned){$('arena').classList.remove('stunned');void $('arena').offsetWidth;$('arena').classList.add('stunned');}wasStunned=stunned;
 $('arena').classList.toggle('poisoned',live&&poisoned&&!trackingPractice);
 // One quiet beat a second while damage lingers on me or on the player I am facing, so it can be heard without looking.
 const beat=Math.floor(at/1000);if(live&&beat!==lastBeat){lastBeat=beat;const foe=opponent();for(const [effect,spell] of [['poison','poison'],['swarm','skeletonArmy']])if(active(p[effect],at)||active(foe?.[effect],at))audio.play(spell,'tick');}
 const chips=[];if(live&&poisoned)chips.push(['poison',`☣ Poisoned ${Math.ceil((p.poison.until-at)/1000)}s`]);if(live&&swarmed)chips.push(['swarm',`☠ Skeletons on you — say ${myDeck().filter(s=>SPELLS[s].splash).map(labelOf).join(' or ')}`]);if(live&&stunned)chips.push(['stun','⚡ Stunned']);
 const chipText=chips.map(c=>c[1]).join('|');if($('status-chips').dataset.text!==chipText){$('status-chips').dataset.text=chipText;$('status-chips').replaceChildren(...chips.map(([cls,text])=>{const el=document.createElement('div');el.className='status-chip '+cls;el.textContent=text;return el;}));}
 for(const spell of myDeck()){
  const rule=SPELLS[spell],remaining=Math.max(0,(p.cooldowns[spell]||0)-at),button=$(spell);if(!button)continue;const cover=button.querySelector('.cooldown');cover.style.display=remaining?'flex':'none';cover.textContent=(remaining/1000).toFixed(1);
  button.querySelector('.mana-cost').textContent=rule.manaCost;button.title=`${labelOf(spell)}: ${rule.manaCost} mana · ${SPELL_INFO[spell].blurb}`;
  button.classList.toggle('clears-swarm',live&&swarmed&&!!rule.splash&&!remaining);
  button.disabled=room.phase!=='playing'||p.health<=0||stunned||castPending||remaining>0||mana+1e-6<rule.manaCost||(!practice&&!connection.ready);button.classList.toggle('needs-mana',mana<rule.manaCost);
 }
}
function renderAimFrame(){if(room&&!document.hidden&&!$('arena').hidden)renderAim();requestAnimationFrame(renderAimFrame);}
requestAnimationFrame(renderAimFrame);
setInterval(()=>{if(!room)return;if(practice){const before=room.players.map(p=>p.health).join();settleRoom(room,Date.now());if(room.phase==='playing'&&opponent()?.health<=0){room.phase='finished';room.winners=[myId];}if(before!==room.players.map(p=>p.health).join()||room.phase==='finished')renderState();}renderCombat();
 if(room.phase==='playing'&&trackingPractice){$('phase').textContent='Real face tracking · local test';}else if(room.phase==='playing'){const seconds=Math.max(0,Math.ceil((room.endsAt-now())/1000));$('phase').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`;if(practice&&seconds===0){room.phase='finished';room.winners=[];renderState();}}
},100);
document.addEventListener('visibilitychange',()=>{if(document.hidden){voice.stop();faceTracker.reset();}else if(joined&&!practice){connection.check();notify('Find your opponent again before casting.');}});
window.addEventListener('online',()=>{if(joined&&!practice)connection.check();});
window.addEventListener('pageshow',event=>{if(event.persisted&&joined&&!practice)connect();});
window.addEventListener('pagehide',()=>{$('arena').hidden=true;stopSensors();connection.stop();});

if(new URLSearchParams(location.search).get('test')==='face')beginPractice(true);
else if(new URLSearchParams(location.search).get('test')==='solo')beginPractice(false);
