import {SPELLS,castSpell} from './rules.js';
import {setupVoice} from './voice.js';
import {wrap,relativePosition,cameraHeading,chooseTarget} from './geo.js';
const $=id=>document.getElementById(id);
const safeRead=(key)=>{try{return localStorage.getItem(key)||'';}catch{return '';}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
let socket,room,myId,practice=false,leaving=false,joined=false,offset=0,retry=0,reconnectTimer;
let stream,watchId=null,position=null,heading=null,headingAt=0,orientationActive=false,upright=true,selected=null;
let lastPositionSent=0,lastPing=0,rosterSignature='',toastTimer,lockSince=0,lockId=null;
const now=()=>Date.now()+offset;
$('name').value=safeRead('fieldspell-name');$('server-url').value=safeRead('fieldspell-server');
const notify=text=>{$('toast').textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').textContent='',4000);};
function send(message){if(socket?.readyState===WebSocket.OPEN)socket.send(JSON.stringify(message));}
function effect(spell){$('fx').className='';void $('fx').offsetWidth;$('fx').className=spell;}
function showArena(){
 $('lobby').hidden=true;$('arena').hidden=false;
 $('compass').hidden=practice;$('location').hidden=practice;
 $('camera-instructions').textContent=practice?'Practice spells with a simulated target over your camera view.':'Camera + location + compass. Hold your phone upright.';
 $('camera-privacy').textContent=practice?'Camera video stays on your phone. Location and compass are not needed for practice.':'Your location is shared with players in this arena. Camera video is not uploaded.';
 $('camera-prompt').hidden=!!stream?.active;
}
function setError(text){$('join-status').textContent=text;$('join').disabled=false;notify(text);}
function endpoint(){const raw=safeRead('fieldspell-server');const url=new URL(raw||location.origin);if(!['https:','http:'].includes(url.protocol))throw Error('Enter an https:// game server URL.');if(location.protocol==='https:'&&url.protocol!=='https:')throw Error('The game server needs HTTPS.');url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/ws';url.search='';url.hash='';return url.href;}
function connect(){
 clearTimeout(reconnectTimer);leaving=false;
 try{socket=new WebSocket(endpoint());}catch(e){setError(e.message);return;}
 $('connection').textContent='Connecting…';
 const timer=setTimeout(()=>{if(!joined){setError('Game server unavailable. Open Connection settings, or try solo practice.');socket.close();}},7000);
 socket.onopen=()=>{retry=0;send({type:'join',name:$('name').value.trim(),token:sessionStorage.getItem('fieldspell-token')});};
 socket.onmessage=e=>{let m;try{m=JSON.parse(e.data);}catch{return;}
  if(m.type==='welcome'){clearTimeout(timer);joined=true;myId=m.id;sessionStorage.setItem('fieldspell-token',m.token);showArena();$('join').disabled=false;$('connection').textContent='Connected';}
  if(m.type==='state'){room=m.room;offset=room.serverTime-Date.now();renderState();}
  if(m.type==='spell'){effect(m.spell);const actor=room?.players.find(p=>p.id===m.actorId)?.name||'A mage';notify(`${actor}: ${m.spell}${m.blocked?' · blocked':''}`);}
  if(m.type==='round-start')notify('Round started. Spread out and aim.');
  if(m.type==='error'){setError(m.message);if(!joined){clearTimeout(timer);leaving=true;socket.close();}}
  if(m.type==='pong')$('connection').textContent=`Live · ${Date.now()-m.at}ms`;
 };
 socket.onerror=()=>{if(!joined)setError('Cannot reach the game server. Check Connection settings.');};
 socket.onclose=e=>{clearTimeout(timer);if(leaving||practice)return;$('connection').textContent='Disconnected · casting paused';selected=null;
  if(e.code===4000){notify('This player was opened in another tab.');return;}
  if(joined){reconnectTimer=setTimeout(connect,Math.min(5000,800*2**retry++));}else $('join').disabled=false;
 };
}
$('join-form').onsubmit=e=>{e.preventDefault();if(!$('name').value.trim())return;practice=false;joined=false;$('join').disabled=true;safeWrite('fieldspell-name',$('name').value.trim());connect();};
$('settings-open').onclick=()=>$('settings').showModal();
$('settings-save').onclick=e=>{const raw=$('server-url').value.trim();if(raw){try{const u=new URL(raw);if(!['http:','https:'].includes(u.protocol))throw Error();}catch{e.preventDefault();$('server-url').setCustomValidity('Enter an http:// or https:// URL.');$('server-url').reportValidity();return;}}safeWrite('fieldspell-server',raw);sessionStorage.removeItem('fieldspell-token');};
$('server-url').oninput=()=>$('server-url').setCustomValidity('');
$('practice').onclick=()=>{practice=true;leaving=true;socket?.close();myId='self';offset=0;const make=(id,name)=>({id,name,health:100,shieldUntil:0,cooldowns:{},connected:true,location:null});room={phase:'playing',hostId:myId,endsAt:Date.now()+180000,winners:[],players:[make(myId,$('name').value.trim()||'You'),make('dummy','Practice target')]};showArena();$('connection').textContent='Solo practice · simulated target';renderState();if(!stream?.active)startCamera();};
function stopSensors(){stream?.getTracks().forEach(t=>t.stop());stream=null;$('camera').srcObject=null;if(watchId!==null)navigator.geolocation.clearWatch(watchId);watchId=null;position=null;heading=null;headingAt=0;window.removeEventListener('deviceorientation',onOrientation);window.removeEventListener('deviceorientationabsolute',onOrientation);orientationActive=false;voice.stop();}
$('leave').onclick=()=>{leaving=true;clearTimeout(reconnectTimer);if(!practice)send({type:'leave'});socket?.close();sessionStorage.removeItem('fieldspell-token');stopSensors();room=null;myId=null;practice=false;joined=false;selected=null;rosterSignature='';$('arena').hidden=true;$('lobby').hidden=false;$('camera-prompt').hidden=false;$('boxes').replaceChildren();$('location').textContent='Share location';$('join-status').textContent='One shared arena · 2–12 players';};
let cameraStarting=false;
async function startCamera(){
 if(cameraStarting||stream?.active)return;
 if(!navigator.mediaDevices?.getUserMedia){notify('Camera requires Safari or Chrome over HTTPS.');return;}
 cameraStarting=true;$('camera-start').disabled=true;$('camera-start').textContent='Opening camera…';
 try{
  const nextStream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280},height:{ideal:720}},audio:false});
  if($('arena').hidden){nextStream.getTracks().forEach(t=>t.stop());return;}
  stream=nextStream;$('camera').srcObject=stream;await $('camera').play();$('camera-prompt').hidden=true;
 }catch(e){
  stream?.getTracks().forEach(t=>t.stop());stream=null;$('camera').srcObject=null;$('camera-prompt').hidden=false;
  notify(e.name==='NotAllowedError'?'Camera access was denied. Allow it in your browser settings, then tap Enable camera.':'Could not open the camera. Close other camera apps, then tap Enable camera to retry.');
 }finally{cameraStarting=false;$('camera-start').disabled=false;$('camera-start').textContent='Enable camera';}
}
function shareLocation(){if(practice){notify('Practice uses a simulated target. Join the arena for GPS.');return;}if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;position=null;send({type:'location',location:null});$('location').textContent='Share location';return;}if(!navigator.geolocation){notify('Location is unavailable in this browser.');return;}$('location').textContent='Locating…';watchId=navigator.geolocation.watchPosition(p=>{position={latitude:p.coords.latitude,longitude:p.coords.longitude,accuracy:p.coords.accuracy,at:Date.now()};$('location').textContent=`GPS ±${Math.round(position.accuracy)}m · Stop`;sendPosition();},e=>{notify(e.code===1?'Allow location in Safari settings, then try again.':'No fresh GPS fix. Move outdoors and retry.');if(e.code===1){navigator.geolocation.clearWatch(watchId);watchId=null;$('location').textContent='Share location';}},{enableHighAccuracy:true,maximumAge:0,timeout:15000});}
function sendPosition(){if(position&&Date.now()-position.at<10000&&Date.now()-lastPositionSent>1200){send({type:'location',location:position});lastPositionSent=Date.now();}}
function onOrientation(e){const h=cameraHeading(e);upright=e.beta==null||(e.beta>35&&e.beta<145&&Math.abs(e.gamma||0)<45);if(h!==null){heading=heading===null?h:(heading+wrap(h-heading)*.22+360)%360;headingAt=Date.now();}}
async function enableCompass(){try{if(typeof DeviceOrientationEvent==='undefined')throw Error();if(typeof DeviceOrientationEvent.requestPermission==='function'){const granted=await DeviceOrientationEvent.requestPermission();if(granted!=='granted')throw Error();}if(!orientationActive){window.addEventListener('deviceorientation',onOrientation);window.addEventListener('deviceorientationabsolute',onOrientation);orientationActive=true;}notify('Hold your phone upright in portrait. Compass readings can drift.');}catch{notify('Compass unavailable. Allow Motion & Orientation in Safari.');}}
$('camera-start').onclick=()=>{startCamera();if(!practice){enableCompass();if(watchId===null)shareLocation();}};$('compass').onclick=enableCompass;$('location').onclick=shareLocation;
function renderState(){if(!room)return;const me=room.players.find(p=>p.id===myId);if(!me)return;$('health-value').innerHTML=`${me.health} <small>/ 100</small>`;$('health-fill').style.width=me.health+'%';$('room-label').textContent=practice?'SOLO PRACTICE':'SHARED ARENA';$('start-round').hidden=room.hostId!==myId;$('start-round').disabled=room.phase==='playing';$('start-round').textContent=room.phase==='finished'?'New round':'Start round';
 const signature=JSON.stringify(room.players.map(p=>[p.id,p.name,p.health,p.connected,p.location&&Math.round(p.location.accuracy)]));
 if(signature!==rosterSignature){rosterSignature=signature;$('players').replaceChildren(...room.players.filter(p=>p.id!==myId).map(p=>{const el=document.createElement('div');el.className='player'+(p.health<=0?' dead':'');const name=document.createElement('b');name.textContent=p.name;const status=document.createElement('small');status.textContent=!p.connected?'Reconnecting…':`${p.health} HP · ${p.location?'GPS ±'+Math.round(p.location.accuracy)+'m':'No location'}`;el.append(name,status);return el;}));}
 if(room.phase==='finished'){const winners=room.players.filter(p=>room.winners.includes(p.id)).map(p=>p.name);$('phase').textContent=winners.length===1?`${winners[0]} wins`:winners.length?'Round tied':'Round ended';}else if(room.phase==='lobby')$('phase').textContent=room.hostId===myId?`${room.players.length} joined · you control the arena`:'Waiting for the host to start';
}
function candidates(){if(!room)return[];if(practice)return[{...room.players[1],delta:0,distance:30,error:3,accuracy:2,ownAccuracy:2,fresh:true}].filter(p=>p.health>0);if(!position||heading===null||Date.now()-headingAt>2500||!upright)return[];return room.players.filter(p=>p.id!==myId&&p.connected&&p.health>0&&p.location).map(p=>({...p,...relativePosition(position,p.location),delta:wrap(relativePosition(position,p.location).bearing-heading),accuracy:p.location.accuracy,ownAccuracy:position.accuracy,fresh:Date.now()-position.at<10000&&now()-p.location.at<10000}));}
function renderAim(){if(!room)return;const cs=candidates().filter(p=>p.fresh);const result=chooseTarget(cs);selected=result.id;
 if(!practice&&socket?.readyState!==WebSocket.OPEN)selected=null;
 if(selected!==lockId){lockSince=Date.now();lockId=selected;}const locked=selected&&Date.now()-lockSince>350;
 $('reticle').classList.toggle('locked',!!locked);$('target-status').textContent=!practice&&!position?'Share location to see players.':!practice&&!upright?'Hold your phone upright in portrait.':!practice&&(heading===null||Date.now()-headingAt>2500)?'Enable compass to aim.':!cs.length?'Waiting for fresh player locations…':result.reason;
 $('vision-status').textContent=practice?(stream?.active?'Camera on · simulated target':'Camera off · simulated target'):heading===null?'Compass off':`${Math.round(heading)}° · ${position?'GPS ±'+Math.round(position.accuracy)+'m':'GPS off'}`;
 // Fixed-height compass labels: deliberately not presented as tracked head positions.
 const visible=cs.filter(p=>Math.abs(p.delta)<48).sort((a,b)=>a.distance-b.distance);
 $('boxes').replaceChildren(...visible.map((p,i)=>{const el=document.createElement('div');el.className='geo-label'+(locked&&p.id===selected?' aimed':'');el.style.left=(50+p.delta/96*100)+'%';el.style.top=(31+(i%3)*7)+'%';const name=document.createElement('b');name.textContent=p.name;const details=document.createElement('small');details.textContent=`${Math.round(p.distance)}m · ±${Math.round(p.error)}m`;const meter=document.createElement('meter');meter.min=0;meter.max=100;meter.value=p.health;meter.setAttribute('aria-label',p.name+' health');el.append(name,meter,details);return el;}));
 $('fireball').disabled=!locked||room.phase!=='playing'||room.players.find(p=>p.id===myId)?.health<=0;
}
function cast(spell){if(!room)return;if(room.phase!=='playing'){notify('The round has not started. Use solo practice to test spells alone.');return;}if(spell==='fireball'&&(!selected||Date.now()-lockSince<350)){notify('Aim at a separated GPS label first.');return;}if(practice){const event=castSpell(room,myId,spell,selected);if(event.error){notify(event.error);return;}effect(spell);notify(`You cast ${spell}${event.blocked?' · blocked':''}`);if(room.players[1].health<=0){room.phase='finished';room.winners=[myId];}renderState();}else if(socket?.readyState===WebSocket.OPEN)send({type:'cast',spell,targetId:selected});else notify('Reconnecting. Casting is paused.');}
for(const spell of Object.keys(SPELLS))$(spell).onclick=()=>cast(spell);
$('start-round').onclick=()=>{if(practice){$('practice').click();return;}send({type:'start'});};
const voice=setupVoice({Recognition:window.SpeechRecognition||window.webkitSpeechRecognition,button:$('voice'),status:$('voice-status'),onSpell:cast});
setInterval(()=>{if(!room)return;renderAim();const me=room.players.find(p=>p.id===myId);for(const spell of Object.keys(SPELLS)){const remaining=Math.max(0,(me?.cooldowns[spell]||0)-now());const cover=$(spell).querySelector('.cooldown');cover.style.display=remaining?'flex':'none';cover.textContent=(remaining/1000).toFixed(1);if(spell!=='fireball')$(spell).disabled=room.phase!=='playing'||me?.health<=0||(!practice&&socket?.readyState!==WebSocket.OPEN);}
 if(room.phase==='playing'){const seconds=Math.max(0,Math.ceil((room.endsAt-now())/1000));$('phase').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`;if(practice&&seconds===0){room.phase='finished';room.winners=[];renderState();}}
 if(!practice){sendPosition();if(Date.now()-lastPing>3000){send({type:'ping',at:Date.now()});lastPing=Date.now();}}
},100);
document.addEventListener('visibilitychange',()=>{if(document.hidden){voice.stop();headingAt=0;}else if(joined)notify('Check your GPS and compass before casting.');});
window.addEventListener('pagehide',()=>{stopSensors();socket?.close();});
if(document.modelContext?.registerTool){try{document.modelContext.registerTool({name:'read_arena_status',description:'Read the current arena, players, sensor status, and connection. Does not start a game or share location.',inputSchema:{type:'object',properties:{},additionalProperties:false},annotations:{readOnlyHint:true,untrustedContentHint:true},execute:async input=>{if(!input||Object.keys(input).length)throw Error('No parameters expected.');return{mode:practice?'practice':'live',phase:room?.phase||'not joined',players:room?.players.map(p=>({name:p.name,health:p.health,connected:p.connected}))||[],locationEnabled:watchId!==null,compassAvailable:heading!==null};}});}catch{}}
