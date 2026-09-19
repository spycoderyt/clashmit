import {SPELLS,MANA,manaAt,castSpell,launchProjectile,impactProjectile,FLIGHT_MS} from './rules.js?v=combat1';
import {createServerClock} from './server-clock.js?v=combat1';
import {createSpellAudio} from './sound.js?v=combat1';
import {createIncomingFireballs} from './incoming-fireball.js?v=combat1';
import {setupVoice} from './voice.js?v=combat1';
import {coverRect} from './shirt.js?v=face1';
import {bandColor} from './headband.js?v=face1';
import {createTargetTrack,aimContains} from './target-track.js?v=face1';
import {createFlight} from './projectile-flight.js?v=face1';
import {createPersonTracker} from './detection.js?v=face1';
import {setupShirtCamera} from './shirt-camera.js?v=face1';
const $=id=>document.getElementById(id);
const audio=createSpellAudio();document.addEventListener('pointerdown',()=>{void audio.unlock();},{passive:true});
$('sound-toggle').onclick=()=>{const muted=audio.toggle();$('sound-toggle').textContent=muted?'Sound off':'Sound on';$('sound-toggle').setAttribute('aria-pressed',String(muted));$('sound-toggle').setAttribute('aria-label',muted?'Enable spell sounds':'Mute spell sounds');};
const safeRead=key=>{try{return localStorage.getItem(key)||'';}catch{return '';}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
let socket,room,myId,practice=false,trackingPractice=false,leaving=false,joined=false,retry=0,reconnectTimer;
let stream,selected=null,lastPing=0,rosterSignature='',toastTimer,lockSince=0,lockId=null;
let detection={people:[],width:0,height:0,at:0},trackingStatus='Camera off',fireScene,graphicsLoading,effectTimer,cameraStarting=false,cameraEpoch=0;
const simulated=()=>practice&&!trackingPractice;
const serverClock=createServerClock();
const now=()=>practice?Date.now():serverClock.now(),me=()=>room?.players.find(p=>p.id===myId),opponent=()=>room?.players.find(p=>p.id!==myId);
$('name').value=safeRead('fieldspell-name');$('server-url').value=safeRead('fieldspell-server');
const notify=text=>{$('toast').textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').textContent='',4000);};
function send(message){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}
const identityTrack=createTargetTrack(),flights=new Map(),completedShots=new Set();
const incoming=createIncomingFireballs({container:$('arena'),renderer:()=>fireScene,getAttacker:id=>{const p=matchedPerson();return p?.id===id&&p.confirmed&&p.fresh?{x:p.x,y:p.y}:null;},now});
const tracker=createPersonTracker($('camera'),(people,width,height,at)=>{detection={people,width,height,at};identityTrack.update(people,opponent()?.shirt,me()?.shirt,at);},status=>{trackingStatus=status;},()=>({opponent:opponent()?.shirt,own:me()?.shirt}));
function loadGraphics(){graphicsLoading??=import('./fireball.js?v=combat1').then(m=>{fireScene=m.createFireballRenderer($('arena'));}).catch(()=>{fireScene=null;});return graphicsLoading;}
function matchedPerson(){
 if(document.hidden||!stream?.active||Date.now()-detection.at>1000||!opponent()?.shirt)return null;
 const match=identityTrack.get();if(!match)return null;
 const rect=$('arena').getBoundingClientRect(),box=coverRect(match.box,detection.width,detection.height,rect.width,rect.height);
 const x=box.x+box.width/2,y=box.y+box.height*.38;
 if(x<0||x>1||y<0||y>1)return null;
 return{...match,box,x,y,id:opponent().id};
}
function targetPoint(id){if(simulated())return{x:.5,y:.4};const target=matchedPerson();return target?.id===id&&target.confirmed?{x:target.x,y:target.y}:null;}
function finishShot(shot,tracked){if(!room)return;if(practice){const event=impactProjectile(room,myId,shot.shotId,tracked);if(!event.error)handleImpact(event);if(opponent().health<=0){room.phase='finished';room.winners=[myId];}renderState();}else send({type:'impact',shotId:shot.shotId,tracked});}
function clearFlights(){for(const timer of flights.values())clearInterval(timer);flights.clear();incoming.clear();fireScene?.clear();}
function lightningEffect(target){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('lightning-bolt');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');
 const path=document.createElementNS(svg.namespaceURI,'polyline'),tx=target.x*100,ty=target.y*100,points=[];
 for(let i=0;i<=9;i++){const f=i/9;points.push(`${50+(tx-50)*f+(i===0||i===9?0:(i%2?4:-4))},${93+(ty-93)*f}`);}path.setAttribute('points',points.join(' '));svg.append(path);$('fx').append(svg);
}
function effect(spell,{shot,projectile=true}={}){
 if(projectile&&shot?.shotId&&(flights.has(shot.shotId)||completedShots.has(shot.shotId)))return;
 audio.play(spell);clearTimeout(effectTimer);const layer=$('fx');layer.className='';layer.replaceChildren();const burst=document.createElement('div');burst.className='spell-burst';
 for(const cls of ['spell-core','spell-ring','spell-feedback']){const el=document.createElement('div');el.className=cls;if(cls==='spell-feedback')el.textContent=spell.toUpperCase();burst.append(el);}layer.append(burst);
 const target=targetPoint(shot?.targetId)||{x:.5,y:.4};let depth=false;
 if(['fireball','lightning'].includes(spell)&&projectile&&shot){
  const flightMs=shot.flightMs||FLIGHT_MS,elapsedMs=Math.max(0,flightMs-((shot.impactAt??((shot.at||now())+flightMs))-now())),startedAt=performance.now()-elapsedMs,roundEndsAt=room.endsAt,actor=myId,flight=createFlight({startedAt,flightMs});
  const timer=setInterval(()=>{const active=!!room&&room.endsAt===roundEndsAt&&myId===actor&&!document.hidden;const result=flight.step(performance.now(),simulated()||!!matchedPerson()?.fresh,active);if(result){clearInterval(timer);flights.delete(shot.shotId);if(!result.cancelled)completedShots.add(shot.shotId);if(!result.cancelled)finishShot(shot,result.tracked);}},25);flights.set(shot.shotId,timer);
  if(spell==='fireball'){try{depth=!!fireScene?.fire({...target,getTarget:()=>targetPoint(shot.targetId),flightMs,elapsedMs});}catch(e){console.warn('Fireball graphics fallback',e);}}
  else lightningEffect(target);
  notify(spell==='lightning'?'Lightning launched · pierces shields':'Fireball launched');
 }
 layer.className='cast-effect '+spell+(depth?' has-depth':'');effectTimer=setTimeout(()=>{layer.className='';layer.replaceChildren();},spell==='lightning'?450:2200);
}
function handleImpact(m){
 const shown=incoming.resolve(m);completedShots.add(m.shotId);if(m.targetId===myId&&!shown&&!m.missed){$('arena').classList.add('incoming-hit-fallback');setTimeout(()=>$('arena').classList.remove('incoming-hit-fallback'),250);}const spell=m.spell||'fireball',name=spell==='lightning'?'Lightning':'Fireball',damage=SPELLS[spell]?.damage||25;
 if(m.actorId===myId||m.targetId===myId)audio.play(spell,m.missed?'miss':m.blocked?'block':'impact');
 if(m.actorId===myId)notify(m.missed?`Target lost · ${spell} missed`:m.blocked?`${name} blocked`:`${name} hit · ${damage} damage`);
 if(m.targetId===myId&&!m.missed)notify(m.blocked?`Your shield blocked the ${spell}`:`Hit by ${spell} · −${damage} HP`);
}
function showArena(){loadGraphics();$('lobby').hidden=true;$('arena').hidden=false;$('shirt-open').hidden=simulated();$('tracking-retry').hidden=simulated();$('camera-instructions').textContent=trackingPractice?'Use the front camera to track your own registered headband.':practice?'Practice a 3D fireball over your camera with a simulated target.':'Scan your headband, then point the camera at your opponent.';$('camera-privacy').textContent='Camera frames stay on your phone. No location permissions needed.';$('camera-prompt').hidden=!!stream?.active;}
function setError(text){$('join-status').textContent=text;$('join').disabled=false;notify(text);}
function endpoint(){const raw=safeRead('fieldspell-server');const fallback=location.hostname.endsWith('.chatgpt.site')?'https://psi-possibly-drain-upgrade.trycloudflare.com':location.origin;const url=new URL(raw||fallback);if(!['https:','http:'].includes(url.protocol))throw Error('Enter an HTTPS game server URL.');if(location.protocol==='https:'&&url.protocol!=='https:')throw Error('The game server needs HTTPS.');url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/ws';url.search='';url.hash='';return url.href;}
function connect(){
 clearTimeout(reconnectTimer);leaving=false;try{socket=new WebSocket(endpoint());}catch(e){setError(e.message);return;}$('connection').textContent='Connecting…';
 const timer=setTimeout(()=>{if(!joined){setError('Game server unavailable. Check Connection settings or try solo practice.');socket.close();}},7000);
 socket.onopen=()=>{retry=0;send({type:'join',name:$('name').value.trim(),token:sessionStorage.getItem('fieldspell-token')});};
 socket.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
  if(m.type==='welcome'){clearTimeout(timer);joined=true;myId=m.id;sessionStorage.setItem('fieldspell-token',m.token);showArena();$('join').disabled=false;$('connection').textContent='Connected';}
  if(m.type==='state'){if(room&&room.endsAt!==m.room.endsAt)clearFlights();room=m.room;serverClock.bootstrap(room.serverTime);incoming.sync((room.shots||[]).filter(s=>s.targetId===myId));for(const shot of room.shots||[])if(shot.actorId===myId&&room.phase==='playing'&&now()<(shot.expiresAt??Infinity))effect(shot.spell||'fireball',{shot});renderState();}
  if(m.type==='spell'){if(m.actorId===myId){castPending=false;effect(m.spell,{shot:m});}else if(m.targetId===myId&&m.shotId){incoming.launch(m);audio.play(m.spell);}else if(m.spell==='shield')notify('Opponent shield active · lightning pierces it');}
  if(m.type==='impact')handleImpact(m);
  if(m.type==='round-start')notify('Round started. Keep your opponent in view.');
  if(m.type==='error'){castPending=false;setError(m.message);if(!joined){clearTimeout(timer);leaving=true;socket.close();}}
  if(m.type==='pong'){const receivedAt=Date.now();serverClock.pong(m.serverTime,m.at,receivedAt);$('connection').textContent=`Live · ${receivedAt-m.at}ms`;}
 };
 socket.onerror=()=>{if(!joined)setError('Cannot reach the game server. Check Connection settings.');};
 socket.onclose=e=>{clearTimeout(timer);if(leaving||practice)return;$('connection').textContent='Disconnected · casting paused';selected=null;clearFlights();if(e.code===4000){notify('This player was opened in another tab.');return;}if(joined)reconnectTimer=setTimeout(connect,Math.min(5000,800*2**retry++));else $('join').disabled=false;};
}
$('join-form').onsubmit=e=>{e.preventDefault();if(!$('name').value.trim())return;practice=false;trackingPractice=false;joined=false;$('join').disabled=true;safeWrite('fieldspell-name',$('name').value.trim());connect();};
$('settings-open').onclick=()=>$('settings').showModal();
$('settings-save').onclick=e=>{const raw=$('server-url').value.trim();if(raw){try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw Error();}catch{e.preventDefault();$('server-url').setCustomValidity('Enter an HTTPS URL.');$('server-url').reportValidity();return;}}safeWrite('fieldspell-server',raw);sessionStorage.removeItem('fieldspell-token');};
$('server-url').oninput=()=>$('server-url').setCustomValidity('');
function beginPractice(realTracking=false){clearFlights();trackingPractice=realTracking;practice=true;leaving=true;socket?.close();myId='self';const make=(id,name)=>({id,name,health:100,mana:MANA.max,manaUpdatedAt:Date.now(),shieldUntil:0,cooldowns:{},connected:true});room={phase:'playing',hostId:myId,endsAt:Date.now()+180000,winners:[],players:[make(myId,$('name').value.trim()||'You'),make('dummy','Practice target')]};showArena();$('connection').textContent=trackingPractice?'Local headband test · no server':'Solo · simulated target';renderState();if(trackingPractice){room.players[1].name='Your headband';shirtCamera.open();}else startCamera();}
$('practice').onclick=()=>beginPractice(false);
$('shirt-test').onclick=()=>beginPractice(true);
function stopCamera(){cameraEpoch++;identityTrack.reset();tracker.stop();stream?.getTracks().forEach(t=>t.stop());stream=null;$('camera').srcObject=null;trackingStatus='Camera off';selected=null;lockId=null;}
function stopSensors(){clearFlights();stopCamera();shirtCamera.stop();fireScene?.clear();clearTimeout(effectTimer);$('fx').className='';$('fx').replaceChildren();voice.stop();}
$('leave').onclick=()=>{leaving=true;clearTimeout(reconnectTimer);if(!practice)send({type:'leave'});socket?.close();sessionStorage.removeItem('fieldspell-token');$('arena').hidden=true;stopSensors();completedShots.clear();serverClock.reset();room=null;myId=null;practice=false;trackingPractice=false;joined=false;rosterSignature='';$('lobby').hidden=false;$('camera-prompt').hidden=false;$('boxes').replaceChildren();$('join-status').textContent='One shared arena · 2 players';};
async function startCamera(){
 if(cameraStarting||stream?.active)return;if(!navigator.mediaDevices?.getUserMedia){notify('Camera requires Safari or Chrome over HTTPS.');return;}
 cameraStarting=true;const epoch=cameraEpoch;$('camera-start').disabled=true;
 try{const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:trackingPractice?'user':'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});if($('arena').hidden||epoch!==cameraEpoch||$('shirt-dialog').open){next.getTracks().forEach(t=>t.stop());return;}stream=next;$('camera').srcObject=stream;await $('camera').play();$('camera-prompt').hidden=true;if(!simulated())tracker.start();}
 catch(e){stopCamera();$('camera-prompt').hidden=false;notify(e.name==='NotAllowedError'?'Allow camera access in browser settings, then retry.':'Could not open camera. Close other camera apps and retry.');}finally{cameraStarting=false;$('camera-start').disabled=false;}
}
const shirtCamera=setupShirtCamera({beforeOpen:()=>{$('shirt-help').textContent=trackingPractice?'This local test recognizes your sampled headband. No second player is needed.':'One red and one blue headband. No photo is saved or uploaded.';voice.stop();stopCamera();fireScene?.clear();},onSave:profile=>{if(trackingPractice){opponent().shirt=profile;identityTrack.reset();renderState();notify('Headband saved. Keep your headband and face in view.');}else send({type:'shirt',profile});},onClose:()=>{if(!$('arena').hidden)startCamera();}});
$('shirt-open').onclick=()=>{if(!practice&&room?.phase==='playing'){notify('Wait until the round ends to change your headband.');return;}shirtCamera.open();};
$('camera-start').onclick=()=>{if((trackingPractice&&!opponent()?.shirt)||(!practice&&!me()?.shirt))shirtCamera.open();else startCamera();};
$('tracking-retry').onclick=()=>{if(stream?.active)tracker.start();else startCamera();};
function renderState(){if(!me())return;$('arena').classList.toggle('round-live',room.phase==='playing');const p=me(),displayHealth=trackingPractice?opponent()?.health:p.health;$('health-title').textContent=trackingPractice?'TARGET HEALTH':'YOUR HEALTH';$('health-value').innerHTML=`${displayHealth} <small>/ 100</small>`;$('health-fill').style.width=displayHealth+'%';$('room-label').textContent=trackingPractice?'ONE PERSON HEADBAND TEST':practice?'SOLO PRACTICE':'TWO PLAYER ARENA';$('start-round').hidden=room.hostId!==myId;$('start-round').disabled=!trackingPractice&&room.phase==='playing';$('start-round').textContent=trackingPractice?'Reset target':room.phase==='finished'?'New round':'Start round';$('shirt-open').textContent=bandColor((trackingPractice?opponent()?.shirt:p.shirt)?.rgb)?'Rescan band':'Scan headband';$('shirt-open').disabled=!practice&&room.phase==='playing';
 const signature=JSON.stringify(room.players.map(p=>[p.id,p.name,p.health,p.connected,!!p.shirt]));if(signature!==rosterSignature){rosterSignature=signature;$('players').replaceChildren(...room.players.filter(p=>p.id!==myId).map(p=>{const el=document.createElement('div');el.className='player'+(p.health<=0?' dead':'');const name=document.createElement('b');name.textContent=p.name;const status=document.createElement('small');status.textContent=!p.connected?'Reconnecting…':`${p.health} HP · ${practice?'simulated':p.shirt?'headband ready':'needs headband'}`;el.append(name,status);return el;}));}
 if(room.phase==='finished'){const winners=room.players.filter(p=>room.winners.includes(p.id)).map(p=>p.name);$('phase').textContent=winners.length===1?`${winners[0]} wins`:winners.length?'Round tied':'Round ended';}else if(room.phase==='lobby')$('phase').textContent=room.hostId===myId?`${room.players.length}/2 joined · you control the arena`:'Waiting for the host';
}
function renderAim(){
 if(!room)return;const match=simulated()?{id:'dummy',x:.5,y:.4,confirmed:true,fresh:true,box:{x:.36,y:.23,width:.28,height:.34}}:matchedPerson();
 const liveOpponent=opponent()?.connected&&opponent()?.health>0;selected=liveOpponent&&match?.confirmed&&aimContains(match.box)?match.id:null;
 if(!practice&&socket?.readyState!==WebSocket.OPEN)selected=null;
 if(selected!==lockId){lockSince=Date.now();lockId=selected;}const locked=selected&&match?.fresh&&Date.now()-lockSince>200;
 $('reticle').classList.toggle('locked',!!locked);
 $('target-status').textContent=simulated()?'Simulated target':!bandColor((trackingPractice?opponent()?.shirt:me()?.shirt)?.rgb)?'Tap Scan headband to get ready.':!opponent()?.shirt?'Waiting for your opponent’s headband sample.':!practice&&bandColor(me().shirt.rgb)===bandColor(opponent().shirt.rgb)?'Headbands too similar · use different colors.':!stream?.active?'Enable your camera.':match?(locked?`${opponent().name} locked · cast a spell`:trackingPractice?'Aim at the person wearing your headband':'Aim the reticle at your opponent'):trackingPractice?'Show your headband and face.':'Find your opponent’s headband · move closer if needed';
 $('vision-status').textContent=simulated()?'Simulated tracking':trackingStatus;
 const rect=$('arena').getBoundingClientRect(),people=simulated()?[match]:Date.now()-detection.at<1000?detection.people:[];
 $('boxes').replaceChildren(...people.map(p=>{const box=simulated()?p.box:coverRect(p.box,detection.width,detection.height,rect.width,rect.height);const isMatch=simulated()||!!match&&p.box===match.rawBox;const el=document.createElement('div');const shielded=isMatch&&opponent()?.shieldUntil>now();el.className='person-box'+(isMatch?' matched':'')+(shielded?' shielded':'');Object.assign(el.style,{left:box.x*100+'%',top:box.y*100+'%',width:box.width*100+'%',height:box.height*100+'%'});const label=document.createElement('div');label.className='person-label';const title=document.createElement('b');title.textContent=isMatch?opponent()?.name||'Target':'Headband candidate';label.append(title);if(isMatch){const meter=document.createElement('meter');meter.min=0;meter.max=100;meter.value=opponent()?.health||0;meter.setAttribute('aria-label','Opponent health');const info=document.createElement('small');info.textContent=shielded?'◇ Shield · lightning pierces':simulated()?'Simulated':'Headband confirmed';label.append(meter,info);}el.append(label);if(p.band){const band=document.createElement('i');band.className='headband-mark';Object.assign(band.style,{left:(p.band.box.originX-p.box.originX)/p.box.width*100+'%',top:(p.band.box.originY-p.box.originY)/p.box.height*100+'%',width:p.band.box.width/p.box.width*100+'%',height:p.band.box.height/p.box.height*100+'%'});el.append(band);}return el;}));
 for(const spell of ['fireball','lightning'])$(spell).classList.toggle('target-ready',!!locked);
}
let castPending=false,castRequest=0;
function cast(spell){void audio.unlock();if(!room)return;if(room.phase!=='playing'){notify('The host needs to start the round first.');return;}renderAim();if(['fireball','lightning'].includes(spell)&&(!selected||Date.now()-lockSince<200||(!simulated()&&!matchedPerson()?.fresh))){notify('Aim at your opponent until their headband locks.');return;}if(practice){const event=['fireball','lightning'].includes(spell)?launchProjectile(room,myId,spell,selected,crypto.randomUUID()):castSpell(room,myId,spell,selected);if(event.error){notify(event.error);return;}effect(spell,{shot:event});renderState();}else if(socket?.readyState===WebSocket.OPEN){if(castPending)return;castPending=true;const request=++castRequest;send({type:'cast',spell,targetId:selected});notify('Casting '+spell+'…');setTimeout(()=>{if(castPending&&request===castRequest){castPending=false;notify('Cast not confirmed. Check the connection.');}},2500);}else notify('Reconnecting. Casting is paused.');}
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
  button.disabled=room.phase!=='playing'||p.health<=0||castPending||remaining>0||mana+1e-6<rule.manaCost||(!practice&&socket?.readyState!==WebSocket.OPEN);button.classList.toggle('needs-mana',mana<rule.manaCost);
 }
}
setInterval(()=>{if(!room)return;renderAim();renderCombat();
 if(room.phase==='playing'&&trackingPractice){$('phase').textContent='Real headband tracking · local test';}else if(room.phase==='playing'){const seconds=Math.max(0,Math.ceil((room.endsAt-now())/1000));$('phase').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`;if(practice&&seconds===0){room.phase='finished';room.winners=[];renderState();}}
 if(!practice&&Date.now()-lastPing>3000){send({type:'ping',at:Date.now()});lastPing=Date.now();}
},100);
document.addEventListener('visibilitychange',()=>{if(document.hidden){voice.stop();detection.at=0;}else if(joined)notify('Find your opponent again before casting.');});
window.addEventListener('pagehide',()=>{leaving=true;$('arena').hidden=true;stopSensors();socket?.close();});

if(['shirt','headband'].includes(new URLSearchParams(location.search).get('test')))beginPractice(true);
