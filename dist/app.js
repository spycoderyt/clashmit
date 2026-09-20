import {setupLeaderboard} from './leaderboard.js?v=scores1';
import {setupLobbyVideo} from './lobby-video.js?v=2';
import {createGameConnection} from './connection.js?v=hosting1';
import {createTargetOverlay} from './target-overlay.js?v=scores1';
import {SPELLS,MANA,manaAt,castSpell,launchProjectile,impactProjectile,FLIGHT_MS} from './rules.js?v=combat1';
import {createServerClock} from './server-clock.js?v=combat1';
import {createSpellAudio} from './sound.js?v=combat1';
import {createIncomingFireballs} from './incoming-fireball.js?v=combat1';
import {setupVoice} from './voice.js?v=combat1';
import {coverRect} from './shirt.js?v=face1';
import {aimContains} from './target-track.js?v=face1';
import {createFlight} from './projectile-flight.js?v=face1';
import {createFaceTracker} from './face-tracker.js?v=face13';
import {setupFaceScan} from './face-scan.js?v=face13';
import {encodeDescriptor,decodeDescriptor} from './face-id.js?v=face13';
import {createMinimap} from './minimap.js?v=map7';
import {createHaptics} from './haptics.js?v=haptic4';
import {requestAllPermissions} from './permissions.js?v=perm1';
import {createRoundOverlay} from './round-overlay.js?v=scores2';
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
// avatars: each player's small face photo from their scan, used as their marker on the minimap.
const faces=new Map(),avatars=new Map();let myAvatar=null,focusId=null,localFace=null,autoScanOffered=false,mySamples=null,faceResent=false,permissionsReady=Promise.resolve();
const gallery=()=>trackingPractice?(localFace?[{id:'dummy',name:'You',...localFace}]:[]):(room?.players||[]).filter(p=>p.id!==myId&&p.connected&&faces.has(p.id)).map(p=>({id:p.id,name:p.name,...faces.get(p.id)}));
$('name').value=safeRead('fieldspell-name');
const notify=text=>{$('toast').textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').textContent='',4000);};
function send(message){return connection.send(message);}
const minimap=createMinimap({container:$('arena'),send,notify});$('leave').addEventListener('click',()=>minimap.stop());window.addEventListener('pagehide',()=>minimap.stop());
$('leave').addEventListener('click',()=>{faces.clear();avatars.clear();minimap.setAvatars(avatars);myAvatar=null;focusId=null;localFace=null;autoScanOffered=false;mySamples=null;});
const haptics=createHaptics({isMuted:()=>audio.muted,stage:$('arena'),shakeTarget:$('camera')});document.querySelectorAll('.spell').forEach(button=>haptics.attachTap(button));if(new URLSearchParams(location.search).get('test')==='haptics')haptics.showTestPanel();
// Synchronised 5-4-3-2-1 before every round and the leaderboard after it; a tick is felt on each second.
const roundOverlay=createRoundOverlay({container:$('arena'),now:()=>serverClock.now(),onTick:second=>haptics.play(second?'tap':'hit'),onOut:(player,mine)=>{if(!mine)haptics.play('hit');}});$('leave').addEventListener('click',()=>roundOverlay.hide());
const flights=new Map(),completedShots=new Set();
const incoming=createIncomingFireballs({container:$('arena'),renderer:()=>fireScene,getAttacker:id=>{const p=matchedPerson(id);return p?.fresh?{x:p.x,y:p.y}:null;},now});
const faceTracker=createFaceTracker($('camera'),{getGallery:gallery,onStatus:status=>{trackingStatus=status;}});
function loadGraphics(){graphicsLoading??=import('./fireball.js?v=combat1').then(m=>{fireScene=m.createFireballRenderer($('arena'));}).catch(()=>{fireScene=null;});return graphicsLoading;}
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
function clearFlights(){for(const timer of flights.values())clearInterval(timer);flights.clear();incoming.clear();fireScene?.clear();}
function lightningEffect(target){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('lightning-bolt');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');
 const path=document.createElementNS(svg.namespaceURI,'polyline'),tx=target.x*100,ty=target.y*100,points=[];
 for(let i=0;i<=9;i++){const f=i/9;points.push(`${50+(tx-50)*f+(i===0||i===9?0:(i%2?4:-4))},${93+(ty-93)*f}`);}path.setAttribute('points',points.join(' '));svg.append(path);$('fx').append(svg);
}
function effect(spell,{shot,projectile=true}={}){
 if(projectile&&shot?.shotId&&(flights.has(shot.shotId)||completedShots.has(shot.shotId)))return;
 haptics.play(spell);
 audio.play(spell);clearTimeout(effectTimer);const layer=$('fx');layer.className='';layer.replaceChildren();const burst=document.createElement('div');burst.className='spell-burst';
 for(const cls of ['spell-core','spell-ring','spell-feedback']){const el=document.createElement('div');el.className=cls;if(cls==='spell-feedback')el.textContent=spell.toUpperCase();burst.append(el);}layer.append(burst);
 const target=targetPoint(shot?.targetId)||{x:.5,y:.4};let depth=false;
 if(['fireball','lightning'].includes(spell)&&projectile&&shot){
  const flightMs=shot.flightMs||FLIGHT_MS,elapsedMs=Math.max(0,flightMs-((shot.impactAt??((shot.at||now())+flightMs))-now())),startedAt=performance.now()-elapsedMs,roundEndsAt=room.endsAt,actor=myId,flight=createFlight({startedAt,flightMs});
  const timer=setInterval(()=>{const active=!!room&&room.endsAt===roundEndsAt&&myId===actor&&!document.hidden;const result=flight.step(performance.now(),simulated()||!!matchedPerson(shot.targetId)?.fresh,active);if(result){clearInterval(timer);flights.delete(shot.shotId);if(!result.cancelled)completedShots.add(shot.shotId);if(!result.cancelled)finishShot(shot,result.tracked);}},25);flights.set(shot.shotId,timer);
  if(spell==='fireball'){try{depth=!!fireScene?.fire({...target,getTarget:()=>targetPoint(shot.targetId),flightMs,elapsedMs});}catch(e){console.warn('Fireball graphics fallback',e);}}
  else lightningEffect(target);
  notify(spell==='lightning'?'Lightning launched · pierces shields':'Fireball launched');
 }
 layer.className='cast-effect '+spell+(depth?' has-depth':'');effectTimer=setTimeout(()=>{layer.className='';layer.replaceChildren();},spell==='lightning'?450:2200);
}
function handleImpact(m){
 const shown=incoming.resolve(m);completedShots.add(m.shotId);if(m.targetId===myId&&!shown&&!m.missed){$('arena').classList.add('incoming-hit-fallback');setTimeout(()=>$('arena').classList.remove('incoming-hit-fallback'),250);}const spell=m.spell||'fireball',name=spell==='lightning'?'Lightning':'Fireball',damage=SPELLS[spell]?.damage||25;
 // The impact event arrives before the state that applies it, so a lethal hit is predicted from current health.
 if(!m.missed){if(m.targetId===myId)haptics.play(m.blocked?'shielded':(me()?.health??100)-damage<=0?'death':spell==='lightning'?'hurtLightning':'hurt');else if(m.actorId===myId)haptics.play(m.blocked?'deflected':'hit');}
 if(m.actorId===myId||m.targetId===myId)audio.play(spell,m.missed?'miss':m.blocked?'block':'impact');
 if(m.actorId===myId)notify(m.missed?`Target lost · ${spell} missed`:m.blocked?`${name} blocked`:`${name} hit · ${damage} damage`);
 if(m.targetId===myId&&!m.missed)notify(m.blocked?`Your shield blocked the ${spell}`:`Hit by ${spell} · −${damage} HP`);
}
function showArena(){loadGraphics();$('lobby').hidden=true;$('arena').hidden=false;$('shirt-open').hidden=simulated();$('tracking-retry').hidden=simulated();$('camera-instructions').textContent=trackingPractice?'Scan your face, then step back and see how far the lock holds.':practice?'Practice a 3D fireball over your camera with a simulated target.':'Scan your face once, then point the camera at another player.';$('camera-privacy').textContent='Camera video stays on your phone.';$('camera-prompt').hidden=!!stream?.active;}
function setError(text){$('join-status').textContent=text;$('join').disabled=false;notify(text);}
function endpoint(){const url=new URL(location.hostname.endsWith('.chatgpt.site')?'https://clashmit-production.up.railway.app':location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/ws';url.search='';url.hash='';return url.href;}
const leaderboard=setupLeaderboard({root:$('leaderboard'),lobby:$('lobby'),url:()=>{const u=new URL(endpoint());u.protocol=u.protocol==='wss:'?'https:':'http:';u.pathname='/api/leaderboard';return u.href;},getMyId:()=>safeRead('clashmit-player-id')});
const connection=createGameConnection({
 url:endpoint,
 join:()=>({type:'join',name:$('name').value.trim(),token:safeRead('clashmit-player-token')||sessionStorage.getItem('fieldspell-token')}),
 onStatus:status=>{$('connection').textContent=status==='connected'?'Connected':status==='connecting'?'Connecting…':'Reconnecting · casting paused';if(!$('lobby').hidden)$('join-status').textContent=status==='connected'?'Joined':status==='connecting'?'Joining the game…':'Trying to reconnect…';},
 onDisconnect:()=>{selected=null;lockId=null;castPending=false;clearFlights();},
 onError:message=>{setError(message);$('connection').textContent='Disconnected · rejoin the arena';},
 onMessage:m=>{
  if(m.type==='welcome'){if(myId&&myId!==m.id){clearFlights();completedShots.clear();faceTracker.reset();room=null;rosterSignature='';notify('The arena restarted. Rejoining with your face scan.');}serverClock.reset();joined=true;myId=m.id;sessionStorage.setItem('fieldspell-token',m.token);safeWrite('clashmit-player-token',m.token);safeWrite('clashmit-player-id',m.id);showArena();$('join').disabled=false;}
  if(m.type==='state'){if(room&&room.endsAt!==m.room.endsAt)clearFlights();room=m.room;serverClock.bootstrap(room.serverTime);incoming.sync((room.shots||[]).filter(s=>s.targetId===myId));for(const shot of room.shots||[])if(shot.actorId===myId&&room.phase==='playing'&&now()<(shot.expiresAt??Infinity))effect(shot.spell||'fireball',{shot});renderState();}
  if(m.type==='state')minimap.update(m.room,myId);
  if(m.type==='impact')roundOverlay.impact(m);
  if(m.type==='state'){roundOverlay.update(m.room,myId);if(m.room.phase==='countdown')$('phase').textContent='Round starting…';}
  // Each player's scan: whole-face samples plus upper-face ones for when a phone hides their nose and mouth.
  if(m.type==='faces')for(const [id,scan] of Object.entries(m.faces||{})){const decode=list=>(list||[]).map(decodeDescriptor).filter(Boolean),samples=decode(scan?.samples);if(samples.length)faces.set(id,{samples,upper:decode(scan.upper)});else faces.delete(id);}
  if(m.type==='avatars'){for(const [id,image] of Object.entries(m.avatars||{})){if(typeof image==='string'&&image.startsWith('data:image/jpeg;base64,'))avatars.set(id,image);else avatars.delete(id);}minimap.setAvatars(avatars);}
  // First thing a new player sees after the permission prompts: the face scan, without having to find a button.
  // A player who already scanned (the server restarted, or they rejoined) silently sends the same signature again.
  if(m.type==='welcome')faceResent=false;
  if(m.type==='state'&&joined&&me()&&!me().faceReady&&room.phase!=='playing'){if(mySamples){if(!faceResent){faceResent=true;send({type:'face',...mySamples});if(myAvatar)send({type:'avatar',image:myAvatar});}}else if(!autoScanOffered){autoScanOffered=true;void permissionsReady.then(()=>{if(joined&&!practice&&!$('arena').hidden&&!me()?.faceReady&&!faceScan.isOpen)faceScan.open();});}}
  if(m.type==='spell'){if(m.actorId===myId){castPending=false;effect(m.spell,{shot:m});}else if(m.targetId===myId&&m.shotId){incoming.launch(m);audio.play(m.spell);}else if(m.spell==='shield')notify('Opponent shield active · lightning pierces it');}
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
function beginPractice(realTracking=false){clearFlights();trackingPractice=realTracking;practice=true;connection.stop();myId='self';const make=(id,name)=>({id,name,health:100,mana:MANA.max,manaUpdatedAt:Date.now(),shieldUntil:0,cooldowns:{},connected:true});room={phase:'playing',hostId:myId,endsAt:Date.now()+180000,winners:[],players:[make(myId,$('name').value.trim()||'You'),make('dummy','Practice target')]};showArena();$('connection').textContent=trackingPractice?'Local face test · no server':'Solo · simulated target';renderState();if(trackingPractice){room.players[1].name='You';faceScan.open();}else startCamera();}

function stopCamera(){cameraEpoch++;faceTracker.stop();stream?.getTracks().forEach(t=>t.stop());stream=null;$('camera').srcObject=null;trackingStatus='Camera off';selected=null;lockId=null;targetOverlay.hide();}
function stopSensors(){clearFlights();stopCamera();faceScan.stop();fireScene?.clear();clearTimeout(effectTimer);$('fx').className='';$('fx').replaceChildren();voice.stop();}
$('leave').onclick=()=>{if(!practice)send({type:'leave'});connection.stop();sessionStorage.removeItem('fieldspell-token');$('arena').hidden=true;stopSensors();completedShots.clear();serverClock.reset();room=null;myId=null;practice=false;trackingPractice=false;joined=false;rosterSignature='';$('lobby').hidden=false;$('camera-prompt').hidden=false;targetOverlay.hide();$('join-status').textContent='Everyone joins the same game.';};
async function startCamera(){
 if(cameraStarting||stream?.active)return;if(!navigator.mediaDevices?.getUserMedia){notify('Camera requires Safari or Chrome over HTTPS.');return;}
 cameraStarting=true;const epoch=cameraEpoch;$('camera-start').disabled=true;
 try{const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:trackingPractice?'user':'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});if($('arena').hidden||epoch!==cameraEpoch||faceScan.isOpen){next.getTracks().forEach(t=>t.stop());return;}stream=next;$('camera').srcObject=stream;await $('camera').play();$('camera-prompt').hidden=true;if(!simulated())faceTracker.start();}
 catch(e){stopCamera();$('camera-prompt').hidden=false;notify(e.name==='NotAllowedError'?'Allow camera access in browser settings, then retry.':'Could not open camera. Close other camera apps and retry.');}finally{cameraStarting=false;$('camera-start').disabled=false;}
}
const faceScan=setupFaceScan({beforeOpen:()=>{voice.stop();stopCamera();fireScene?.clear();},onSample:()=>haptics.play('tap'),onSave:(samples,upper,avatar)=>{if(trackingPractice){localFace={samples,upper};renderState();notify('Face saved. Step back and watch the lock follow you.');}else{mySamples={samples:samples.map(encodeDescriptor),upper:upper.map(encodeDescriptor)};send({type:'face',...mySamples});myAvatar=avatar;if(avatar)send({type:'avatar',image:avatar});notify('Face saved. Point your camera at another player.');}},onClose:()=>{if(!$('arena').hidden)startCamera();}});
$('shirt-open').onclick=()=>{if(!practice&&room?.phase==='playing'){notify('Wait until the round ends to rescan your face.');return;}faceScan.open();};
$('camera-start').onclick=()=>{if((trackingPractice&&!localFace)||(!practice&&!me()?.faceReady))faceScan.open();else startCamera();};
$('tracking-retry').onclick=()=>{if(stream?.active)faceTracker.start();else startCamera();};
function renderState(){if(!me())return;$('arena').classList.toggle('round-live',room.phase==='playing');const p=me(),displayHealth=trackingPractice?opponent()?.health:p.health;$('health-title').textContent=trackingPractice?'TARGET HEALTH':'YOUR HEALTH';$('health-value').innerHTML=`${displayHealth} <small>/ 100</small>`;$('health-fill').style.width=displayHealth+'%';$('room-label').textContent=trackingPractice?'ONE PERSON FACE TEST':practice?'SOLO PRACTICE':'MULTIPLAYER ARENA';$('start-round').hidden=room.hostId!==myId;$('start-round').disabled=!trackingPractice&&room.phase==='playing';$('start-round').textContent=trackingPractice?'Reset target':room.phase==='finished'?'New round':'Start round';$('shirt-open').textContent=(trackingPractice?localFace:p.faceReady)?'Rescan face':'Scan face';$('shirt-open').disabled=!practice&&room.phase==='playing';
 $('player-score').hidden=practice||!p.score;$('player-score').textContent=p.score?`Overall #${p.score.rank} · ${p.score.points} pts · ${p.score.wins} wins${room.phase==='playing'?` · +${p.roundPoints||0} this round`:''}`:'';
 const signature=JSON.stringify(room.players.map(p=>[p.id,p.name,p.health,p.connected,!!p.faceReady,p.score]));if(signature!==rosterSignature){rosterSignature=signature;$('players').replaceChildren(...room.players.filter(p=>p.id!==myId).map(p=>{const el=document.createElement('div');el.className='player'+(p.health<=0?' dead':'');const name=document.createElement('b');name.textContent=(p.score?`#${p.score.rank} `:'')+p.name;const status=document.createElement('small');status.textContent=!p.connected?'Reconnecting…':`${p.health} HP · ${practice?'simulated':p.faceReady?'face scanned':'needs face scan'}`;el.append(name,status);return el;}));}
 if(room.phase==='finished'){const winners=room.players.filter(p=>room.winners.includes(p.id)).map(p=>p.name);$('phase').textContent=room.results?(room.results.winnerId?`${room.results.players.find(p=>p.id===room.results.winnerId)?.name} wins`:'Time up · no last-standing win'):(winners.length===1?`${winners[0]} wins`:winners.length?'Round tied':'Round ended');}else if(room.phase==='lobby')$('phase').textContent=room.hostId===myId?`${room.players.length}${room.maxPlayers?`/${room.maxPlayers}`:''} joined · you control the arena`:'Waiting for the host';
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
 targetOverlay.update(liveOpponent?match:pending?{...pending,pending:true}:null,liveOpponent?opponent():{name:'Identifying…',health:100},{shielded:liveOpponent&&opponent().shieldUntil>now(),simulated:simulated()});
 for(const spell of ['fireball','lightning'])$(spell).classList.toggle('target-ready',!!locked);
}
let castPending=false,castRequest=0;
function cast(spell){void audio.unlock();if(!room)return;if(room.phase!=='playing'){notify('The host needs to start the round first.');return;}renderAim();if(['fireball','lightning'].includes(spell)&&(!selected||Date.now()-lockSince<200||(!simulated()&&!matchedPerson()?.fresh))){notify('Aim at another player until their face locks.');return;}if(practice){const event=['fireball','lightning'].includes(spell)?launchProjectile(room,myId,spell,selected,crypto.randomUUID()):castSpell(room,myId,spell,selected);if(event.error){notify(event.error);return;}effect(spell,{shot:event});renderState();}else if(connection.ready){if(castPending)return;castPending=true;const request=++castRequest;send({type:'cast',spell,targetId:selected});notify('Casting '+spell+'…');setTimeout(()=>{if(castPending&&request===castRequest){castPending=false;notify('Cast not confirmed. Check the connection.');}},2500);}else notify('Reconnecting. Casting is paused.');}
for(const spell of Object.keys(SPELLS))$(spell).onclick=()=>cast(spell);
$('start-round').onclick=()=>{if(practice){clearFlights();if(trackingPractice){opponent().health=100;room.phase='playing';room.endsAt=Date.now()+180000;room.winners=[];room.shots=[];me().cooldowns={};me().mana=MANA.max;me().manaUpdatedAt=Date.now();me().shieldUntil=0;renderState();}else beginPractice(false);return;}send({type:'start'});};
const voice=setupVoice({Recognition:window.SpeechRecognition||window.webkitSpeechRecognition,button:$('voice'),status:$('voice-status'),onSpell:cast});
function renderCombat(){
 const p=me();if(!p)return;const at=now(),mana=Math.min(MANA.max,Math.max(0,manaAt(p,at))),shieldRemaining=Math.max(0,p.shieldUntil-at);
 $('mana-fill').style.width=100*mana/MANA.max+'%';$('mana-value').textContent=`${Math.floor(mana)} / ${MANA.max}`;$('mana-track').setAttribute('aria-valuenow',mana.toFixed(1));
 $('own-shield').classList.toggle('active',shieldRemaining>0);$('shield-status').hidden=!shieldRemaining;$('shield-status').textContent=`◇ Shield ${(shieldRemaining/1000).toFixed(1)}s · lightning pierces`;
 for(const [spell,rule] of Object.entries(SPELLS)){
  const remaining=Math.max(0,(p.cooldowns[spell]||0)-at),button=$(spell),cover=button.querySelector('.cooldown');cover.style.display=remaining?'flex':'none';cover.textContent=(remaining/1000).toFixed(1);
  button.querySelector('.mana-cost').textContent=rule.manaCost;button.title=`${spell}: ${rule.manaCost} mana${spell==='lightning'?' · ignores shields':''}`;
  button.disabled=room.phase!=='playing'||p.health<=0||castPending||remaining>0||mana+1e-6<rule.manaCost||(!practice&&!connection.ready);button.classList.toggle('needs-mana',mana<rule.manaCost);
 }
}
function renderAimFrame(){if(room&&!document.hidden&&!$('arena').hidden)renderAim();requestAnimationFrame(renderAimFrame);}
requestAnimationFrame(renderAimFrame);
setInterval(()=>{if(!room)return;renderCombat();
 if(room.phase==='playing'&&trackingPractice){$('phase').textContent='Real face tracking · local test';}else if(room.phase==='playing'){const seconds=Math.max(0,Math.ceil((room.endsAt-now())/1000));$('phase').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`;if(practice&&seconds===0){room.phase='finished';room.winners=[];renderState();}}
},100);
document.addEventListener('visibilitychange',()=>{if(document.hidden){voice.stop();faceTracker.reset();}else if(joined&&!practice){connection.check();notify('Find your opponent again before casting.');}});
window.addEventListener('online',()=>{if(joined&&!practice)connection.check();});
window.addEventListener('pageshow',event=>{if(event.persisted&&joined&&!practice)connect();});
window.addEventListener('pagehide',()=>{$('arena').hidden=true;stopSensors();connection.stop();});

if(new URLSearchParams(location.search).get('test')==='face')beginPractice(true);
