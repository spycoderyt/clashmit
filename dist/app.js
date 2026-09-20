import {createReaperEffect} from './reaper-effect.js';
import {createHealFeedback} from './heal-effect.js';
import {createUpgradeEffects} from './upgrade-effects.js';
import {createKillIntro} from './kill-intro.js';
import {attacksFor,ATTACKS,CONSUMABLES,ruleFor,skillName,skillLevel,wordsFor,totalDamage,freshLoadout,shopQuote,UNLOCK_COST} from './economy.js';
import {requestRespawn} from './respawn.js';
import {createCoinEffects,createOrbitalView} from './economy-effects.js';
import {createDamageFlash} from './damage-flash.js?v=1';
import {createArenaEvents} from './arena-events.js?v=1';
import {superProgress,SUPER_NAMES,upgradedRule} from './supers.js';
import {createArenaLeaders} from './arena-leaders.js?v=events1';
import {createKillStreak} from './killstreak.js?v=1';
import {respawnSeconds,advanceRespawns} from './respawn.js?v=death2';
import {createHealthHud} from './health-hud.js?v=smallhearts2';
import {setupLeaderboard} from './leaderboard.js?v=trophies1';
import {setupLobbyVideo} from './lobby-video.js?v=2';
import {createGameConnection} from './connection.js?v=hosting1';
import {createTargetOverlay} from './target-overlay.js?v=trophies1';
import {piercerOf,SPELLS,MANA,manaAt,castSpell,launchProjectile,impactProjectile,FLIGHT_MS,PERSONAS,DEFAULT_PERSONA,personaOf,settleRoom,lingeringKiller} from './rules.js?v=events1';
import {PERSONA_INFO,SPELL_INFO,deckWords,labelOf} from './personas.js?v=heel1';
import {createSkeletonArmy,feetOf} from './skeleton-army.js?v=supers1';
import {createServerClock} from './server-clock.js?v=combat1';
import {createSpellAudio} from './sound.js?v=memes1';
import {createIncomingFireballs} from './incoming-fireball.js?v=supers1';
import {setupVoice} from './voice.js?v=autovoice2';
import {coverRect} from './shirt.js?v=face1';
import {aimContains} from './target-track.js?v=face1';
import {createFlight} from './projectile-flight.js?v=face1';
import {createFaceTracker} from './face-tracker.js?v=damage1';
import {setupFaceScan} from './face-scan.js?v=events1';
import {encodeDescriptor,decodeDescriptor} from './face-id.js?v=face13';
import {createMinimap} from './minimap.js?v=topright3';
import {createHaptics} from './haptics.js?v=haptic4';
import {requestAllPermissions} from './permissions.js?v=perm1';
import {createRoundOverlay} from './round-overlay.js?v=death2';
import {createOnboarding,shouldOpen,shouldClose} from './onboarding.js?v=continuous1';
const $=id=>document.getElementById(id);
const previewMode=new URLSearchParams(location.search).get('test'),hudPreview=['hud','coach','respawn','fireball','supers','eliminated','shop','airstrike','coins','hearts','hud-alerts','flashbang','killed','consumables'].includes(previewMode);
let previewLocation={latitude:42.3601,longitude:-71.0942,accuracy:4};
let previewFix=null;
const previewGps={watchPosition(onFix){const fix=()=>{onFix({coords:{...previewLocation}});if(room)for(const p of room.players)if(p.location)p.location.at=Date.now();};previewFix=fix;queueMicrotask(fix);return setInterval(fix,1000);},clearWatch(id){clearInterval(id);previewFix=null;}};
setupLobbyVideo({video:$('lobby-background'),lobby:$('lobby'),button:$('background-toggle'),headline:$('lobby-headline')});
const reaperEffect=createReaperEffect($('arena'));$('leave').addEventListener('click',()=>reaperEffect.clear());
const healFeedback=createHealFeedback($('arena'));$('leave').addEventListener('click',()=>healFeedback.clear());
const upgradeEffects=createUpgradeEffects($('arena'));$('leave').addEventListener('click',()=>upgradeEffects.clear());
const arenaLeaders=createArenaLeaders($('arena'));
const killStreak=createKillStreak($('arena'));$('leave').addEventListener('click',()=>killStreak.clear());
const targetOverlay=createTargetOverlay($('arena'),$('boxes'));
const audio=createSpellAudio();document.addEventListener('pointerdown',()=>{void audio.unlock();},{passive:true});
const safeRead=key=>{try{return localStorage.getItem(key)||'';}catch{return '';}};
const safeWrite=(key,value)=>{try{localStorage.setItem(key,value);}catch{}};
let room,myId,practice=false,trackingPractice=false,joined=false;
let stream,selected=null,toastTimer,lockSince=0,lockId=null;
let detection={people:[],width:0,height:0,at:0},trackingStatus='Camera off',fireScene,graphicsLoading,effectTimer,cameraStarting=false,cameraEpoch=0;
const simulated=()=>practice&&!trackingPractice;
const serverClock=createServerClock();
const arenaEvents=createArenaEvents($('arena'),{audio,getMyId:()=>myId,now:()=>practice?Date.now():serverClock.now()});$('leave').addEventListener('click',()=>arenaEvents.clear());
const now=()=>practice?Date.now():serverClock.now(),me=()=>room?.players.find(p=>p.id===myId),opponent=()=>room?.players.find(p=>p.id===focusId&&p.id!==myId)||room?.players.find(p=>p.id!==myId);
// Face lock: decoded face signatures by player id, the player the camera is on, and the solo test's own face.
// avatars: each player's small face photo from their scan, used as their marker on the minimap.
const faces=new Map(),avatars=new Map();let myAvatar=null,focusId=null,localFace=null,autoScanOffered=false,mySamples=null,faceResent=false,permissionsReady=Promise.resolve(),joinPermissions=null;
const killIntro=createKillIntro($('arena'),{getMyId:()=>myId,getAvatar:id=>avatars.get(id),now});$('leave').addEventListener('click',()=>killIntro.clear());
const healthHud=createHealthHud({hearts:$('health-hearts'),roster:$('health-leaderboard')});
const gallery=()=>trackingPractice?(localFace?[{id:'dummy',name:'You',...localFace}]:[]):(room?.players||[]).filter(p=>p.id!==myId&&p.connected&&faces.has(p.id)).map(p=>({id:p.id,name:p.name,...faces.get(p.id)}));
$('name').value=safeRead('fieldspell-name');
let persona=Object.hasOwn(PERSONAS,safeRead('fieldspell-persona'))?safeRead('fieldspell-persona'):DEFAULT_PERSONA;
// In a live game the server's record wins; the lobby choice only matters until the welcome arrives.
const myPersona=()=>me()?personaOf(me()):persona,myDeck=()=>room?.economy?[...attacksFor(myPersona()),'shield','heal','flashbang']:PERSONAS[myPersona()],isThrown=spell=>!!SPELLS[spell]?.flightMs;
const active=(effect,at)=>!!effect&&effect.until>at;
$('persona-picker').append(...Object.entries(PERSONA_INFO).map(([id,info])=>{
 const card=document.createElement('label'),input=document.createElement('input'),symbol=document.createElement('span'),name=document.createElement('b'),blurb=document.createElement('small');
 card.className='persona-card';card.style.setProperty('--persona-accent',info.accent);input.type='radio';input.name='persona';input.value=id;input.checked=id===persona;
 input.onchange=()=>{persona=id;safeWrite('fieldspell-persona',id);};symbol.className='persona-symbol';symbol.textContent=info.symbol;name.textContent=info.name;blurb.textContent=info.blurb;
 card.append(input,symbol,name,blurb);return card;
}));
const notify=text=>{$('toast').textContent=text;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').textContent='',4000);};
function send(message){return connection.send(message);}
const minimap=createMinimap({container:$('arena'),send:message=>hudPreview?false:send(message),notify,...(hudPreview?{geolocation:previewGps}:{})});$('leave').addEventListener('click',()=>minimap.stop());window.addEventListener('pagehide',()=>minimap.stop());
const coinEffects=createCoinEffects($('arena'),{audio,destination:()=>($('player-score').querySelector('.coin-icon')||$('player-score')).getBoundingClientRect()});
const orbitalView=createOrbitalView($('arena'),{now,audio,getAvatar:id=>avatars.get(id),getLocation:()=>minimap.currentLocation()||me()?.location,onLaunchView:s=>minimap.showStrike(s),getMapPoint:p=>minimap.projectStrike(p)});
const orbitalButton=document.createElement('button');orbitalButton.className='orbital-button';orbitalButton.textContent='Summon Orbital Airstrike';orbitalButton.hidden=true;orbitalButton.onclick=()=>minimap.beginAirstrike(point=>{if(hudPreview){minimap.endAirstrike();orbitalView.sync([{id:crypto.randomUUID(),actorId:myId,name:'You',point,radius:10,startsAt:now(),endsAt:now()+5000,victims:[{id:'dummy'}]}],myId);}else send({type:'orbital',point});});$('arena').append(orbitalButton);
const flashScreen=document.createElement('div');flashScreen.className='flashbang-screen';flashScreen.setAttribute('aria-hidden','true');$('arena').append(flashScreen);
$('leave').addEventListener('click',()=>{faces.clear();avatars.clear();minimap.setAvatars(avatars);myAvatar=null;focusId=null;localFace=null;autoScanOffered=false;mySamples=null;});
const haptics=createHaptics({isMuted:()=>audio.muted,stage:$('arena'),shakeTarget:$('camera')});if(new URLSearchParams(location.search).get('test')==='haptics')haptics.showTestPanel();
// Synchronised 5-4-3-2-1 before every round and the leaderboard after it; a tick is felt on each second.
const roundOverlay=createRoundOverlay({container:$('arena'),now:()=>serverClock.now(),onTick:second=>haptics.play(second?'tap':'hit'),onPersonaChange:id=>{if(hudPreview){me().nextPersona=id;roundOverlay.update(room,myId);}else send({type:'persona',persona:id});},onPurchase:(kind,item)=>{if(hudPreview){const p=me(),q=shopQuote(p.loadout,p.nextPersona||p.persona,kind,item);if(q.error||p.score.coins<q.cost)return;p.score.coins-=q.cost;for(const leader of room.leaders||[])if(leader.id===p.id)leader.coins=p.score.coins;if(kind==='consumable')p.loadout.consumables[item]++;else p.loadout.skills[item]=(p.loadout.skills[item]||0)+1;roundOverlay.update(room,myId);renderState();}else send({type:'purchase',kind,item});},onRespawn:()=>{if(hudPreview){requestRespawn(room,me(),now());roundOverlay.update(room,myId);renderState();}else send({type:'respawn'});},onOut:(player,mine)=>{if(!mine)haptics.play('hit');}});$('leave').addEventListener('click',()=>roundOverlay.hide());
// Two voice-casting tips for a first-time player, once, while they wait for the host. The spell bar is drawn from
// their persona, so the last two steps light up its first and last pair of cards rather than named spells.
const spellCards=()=>[...$('spells').querySelectorAll('.spell')];
const onboarding=createOnboarding({container:$('arena'),anchors:{attack:()=>spellCards().slice(0,2),defence:()=>[...$('inventory').querySelectorAll('[data-consumable=shield],[data-consumable=heal]')]},gates:{},onFinish:()=>{if(!hudPreview)safeWrite('fieldspell-coached','1');}});$('leave').addEventListener('click',()=>onboarding.hide());
const flights=new Map(),completedShots=new Set();let dummyTimer,dummyShots=0;
function rememberShot(id){completedShots.add(id);if(completedShots.size>512)completedShots.delete(completedShots.values().next().value);}
const army=createSkeletonArmy($('arena'));
const describeIncoming=spell=>{const info=SPELL_INFO[spell]||SPELL_INFO.fireball;return{style:visualStyle(spell),ultimate:!!ATTACKS[spell]?.ultimate,label:info.label.toLowerCase(),rgb:info.rgb,bolt:!!info.bolt,thrown:spell!=='skeletonArmy',hit:spell==='skeletonArmy'?'Skeletons on you':undefined};};
const incoming=createIncomingFireballs({container:$('arena'),renderer:()=>fireScene,describe:describeIncoming,getAttacker:id=>{if(simulated())return{x:.5,y:.4};const p=matchedPerson(id);return p?.fresh?{x:p.x,y:p.y}:null;},now});
const faceTracker=createFaceTracker($('camera'),{getGallery:gallery,onStatus:status=>{trackingStatus=status;}});
const damageFlash=createDamageFlash({container:$('arena'),video:$('camera'),getTracks:()=>faceTracker.targets(),getSize:()=>faceTracker.size(),getMyId:()=>myId});
function loadGraphics(){graphicsLoading??=import('./fireball.js?v=supers1').then(m=>{fireScene=m.createFireballRenderer($('arena'));}).catch(()=>{fireScene=null;});return graphicsLoading;}
// Camera tracks mapped to the screen. `named` keeps only recognised, living players.
function visibleTracks(named=true){
 if(document.hidden||!stream?.active||!room||Date.now()-faceTracker.lastFrameAt()>1000)return[];
 const size=faceTracker.size(),rect=targetOverlay.size(),alive=new Set(room.players.filter(p=>p.id!==myId&&p.connected&&p.health>0).map(p=>p.id)),rows=[];
 for(const track of faceTracker.targets()){
  if(named?!alive.has(track.id):!!track.id)continue;
  const box=coverRect(track.box,size.width,size.height,rect.width,rect.height),x=box.x+box.width/2,y=box.y+box.height/2;
  if(x>=0&&x<=1&&y>=0&&y<=1)rows.push({...track,box,x,y,reticle:Math.hypot(x-.5,y-.4)});
 }
 if(rows.length)damageFlash.warm();return rows.sort((a,b)=>a.reticle-b.reticle);
}
// With an id: that player's lock, wherever they are on screen. Without: the recognised player nearest the reticle.
function matchedPerson(id){
 const rows=visibleTracks();if(id)return rows.find(t=>t.id===id)||null;
 if(rows[0])focusId=rows[0].id;return rows[0]||null;
}
function targetPoint(id){if(simulated())return{x:.5,y:.4};const target=matchedPerson(id);return target?{x:target.x,y:target.y}:null;}
function finishShot(shot,tracked){if(!room)return;if(practice){const event=impactProjectile(room,myId,shot.shotId,tracked);if(!event.error)handleImpact(event);if(opponent().health<=0){room.phase='finished';room.winners=[myId];}renderState();}else send({type:'impact',shotId:shot.shotId,tracked});}
function clearFlights(){reaperEffect.clear();healFeedback.clear();upgradeEffects.clear();clearInterval(dummyTimer);for(const timer of flights.values())clearInterval(timer);flights.clear();incoming.clear();fireScene?.clear();army.clear();}
function lightningEffect(target,spell,superCast=false){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('lightning-bolt');if(spell==='zap')svg.classList.add('zap');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');
 const path=document.createElementNS(svg.namespaceURI,'polyline'),tx=target.x*100,ty=target.y*100,points=[];
 for(let i=0;i<=9;i++){const f=i/9;points.push(`${50+(tx-50)*f+(i===0||i===9?0:(i%2?4:-4))},${93+(ty-93)*f}`);}path.setAttribute('points',points.join(' '));svg.append(path);if(superCast){svg.classList.add('super-bolt');for(const dx of [-4,4]){const copy=path.cloneNode(true);copy.setAttribute('transform',`translate(${dx} 0)`);svg.append(copy);}}$('fx').append(svg);
}
function effect(spell,{shot,projectile=true}={}){
 if(projectile&&shot?.shotId&&(flights.has(shot.shotId)||completedShots.has(shot.shotId)))return;
 haptics.play(SPELL_INFO[spell]?.bolt?'lightning':isThrown(spell)?'fireball':spell); // new spells borrow the nearest existing pattern
 if(!shot?.super)audio.play(spell,shot?.upgraded||ATTACKS[spell]?.ultimate?'super':'cast');if(spell==='heal'){healFeedback.show(shot?.healedAmount||0);return;}clearTimeout(effectTimer);const layer=$('fx');layer.className='';layer.replaceChildren();const burst=document.createElement('div');burst.className='spell-burst';
 for(const cls of ['spell-core','spell-ring','spell-feedback']){const el=document.createElement('div');el.className=cls;if(cls==='spell-feedback')el.textContent=room.economy?skillName(me(),spell):labelOf(spell);burst.append(el);}layer.append(burst);
 const target=targetPoint(shot?.targetId)||{x:.5,y:.4};let depth=false;
 if(isThrown(spell)&&projectile&&shot?.shotId){
  const flightMs=shot.flightMs||FLIGHT_MS,elapsedMs=Math.max(0,flightMs-((shot.impactAt??((shot.at||now())+flightMs))-now())),startedAt=performance.now()-elapsedMs,roundEndsAt=room.endsAt,actor=myId,flight=createFlight({startedAt,flightMs});
  const timer=setInterval(()=>{const active=!!room&&room.endsAt===roundEndsAt&&myId===actor&&!document.hidden;const result=flight.step(performance.now(),simulated()||!!matchedPerson(shot.targetId)?.fresh,active);if(result){clearInterval(timer);flights.delete(shot.shotId);if(!result.cancelled)rememberShot(shot.shotId);if(!result.cancelled)finishShot(shot,result.tracked);}},25);flights.set(shot.shotId,timer);
  // Bolts are streaks, the army walks on its own ground layer, and everything else is thrown in the 3D scene.
  if(SPELL_INFO[spell]?.bolt)lightningEffect(target,spell,shot.super||shot.upgraded);
  else if(spell==='soulReaper'){depth=reaperEffect.fire({...target,getTarget:()=>targetPoint(shot.targetId),flightMs,elapsedMs,upgraded:!!shot.upgraded});}
  else if(spell!=='skeletonArmy'){try{depth=!!fireScene?.fire({...target,style:visualStyle(spell),super:shot.super||shot.upgraded||!!ATTACKS[spell]?.ultimate,upgraded:!!shot.upgraded,getTarget:()=>targetPoint(shot.targetId),flightMs,elapsedMs});}catch(e){console.warn('Spell graphics fallback',e);}}
  notify(spell==='skeletonArmy'?'Skeletons marching · keep them in view':`${room.economy?skillName(me(),spell):labelOf(spell)} launched${SPELLS[spell].bypassShield?' · pierces shields':''}${shot.clearedSwarm?' · skeletons cleared':''}`);
 }else if(shot?.clearedSwarm)notify('Skeletons cleared');
 layer.className='cast-effect '+spell+(depth?' has-depth':'');effectTimer=setTimeout(()=>{layer.className='';layer.replaceChildren();},SPELL_INFO[spell]?.bolt?450:2200);
}
function handleImpact(m){
 for(const extra of m.secondaryHits||[])handleImpact(extra);
 if(m.actorId===myId&&!m.missed&&!m.blocked&&!m.parried&&(m.upgraded||m.attackRule?.upgraded||m.secondary)){
  const to=targetPoint(m.targetId),from=m.secondary?targetPoint(m.primaryTargetId):to;
  if(from&&to)upgradeEffects.impact({spell:m.spell,from,targets:[to],ground:m.spell==='fireball'?feetFor(m.targetId):null});
 }

 const shown=incoming.resolve(m);rememberShot(m.shotId);if(m.targetId===myId&&!shown&&!m.missed){$('arena').classList.add('incoming-hit-fallback');setTimeout(()=>$('arena').classList.remove('incoming-hit-fallback'),250);}const spell=m.spell||'fireball',name=room.economy?skillName(room.players.find(p=>p.id===m.actorId),spell):labelOf(spell),rule=m.attackRule||upgradedRule(spell,SPELLS[spell]||SPELLS.fireball,m.super),damage=rule.damage,linger=rule.dot||rule.swarm,after=linger?linger.perSecond*linger.duration/1000:0;
 const dealt=[damage?`${damage} damage`:'',after?`${after} more over ${linger.duration/1000}s`:'',rule.stun?'stunned':''].filter(Boolean).join(' · '),taken=[damage?`−${damage} HP`:'',rule.dot?'poisoned':'',rule.swarm?'say a splash spell to clear them':'',rule.stun?'stunned':''].filter(Boolean).join(' · ');
 // The impact event arrives before the state that applies it, so a lethal hit is predicted from current health.
 if(!m.missed&&!m.blocked&&m.targetId===myId&&(me()?.health??100)-damage<=0)deathFelt=true;
 if(!m.missed){if(m.targetId===myId)haptics.play(m.blocked?'shielded':(me()?.health??100)-damage<=0?'death':SPELL_INFO[spell]?.bolt?'hurtLightning':'hurt');else if(m.actorId===myId)haptics.play(m.blocked?'deflected':'hit');}
 if(m.actorId===myId||m.targetId===myId)audio.play(spell,m.parried?'parry':m.missed?'miss':m.blocked?'block':m.spell==='fireball'&&m.attackRule?.upgraded?'upgrade-impact':'impact');
 if(m.actorId===myId)notify(m.missed?`Target lost · ${name} missed`:m.parried?`${name} reflected back at you!`:m.blocked?`${name} blocked`:`${name} ${rule.swarm?'landed':'hit'} · ${dealt}`);
 if(m.targetId===myId&&!m.missed)notify(m.parried?`Parried! ${name} sent back`:m.blocked?`Your shield blocked ${name}`:`${rule.swarm?'Skeletons on you':'Hit by '+name} · ${taken}`);
}
function showArena(){loadGraphics();void orbitalView.warm();requestAnimationFrame(placeHud);$('lobby').hidden=true;$('arena').hidden=false;$('camera-instructions').textContent=trackingPractice?'Scan your face, then step back and see how far the lock holds.':practice?'Practice a 3D fireball over your camera with a simulated target.':'Scan your face once, then point the camera at another player.';$('camera-privacy').textContent='Camera video stays on your phone.';$('camera-prompt').hidden=!!stream?.active;}
function setError(text){$('join-status').textContent=text;$('join').disabled=false;notify(text);}
function endpoint(){const url=new URL(location.hostname.endsWith('.chatgpt.site')?'https://clashmit-production.up.railway.app':location.origin);url.protocol=url.protocol==='https:'?'wss:':'ws:';url.pathname='/ws';url.search='';url.hash='';return url.href;}
const leaderboard=setupLeaderboard({root:$('leaderboard'),lobby:$('lobby'),url:()=>{const u=new URL(endpoint());u.protocol=u.protocol==='wss:'?'https:':'http:';u.pathname='/api/leaderboard';return u.href;},getMyId:()=>safeRead('clashmit-player-id')});
const connection=createGameConnection({
 url:endpoint,
 join:()=>({type:'join',name:$('name').value.trim(),persona,token:safeRead('clashmit-player-token')||sessionStorage.getItem('fieldspell-token')}),
 onStatus:status=>{$('connection').textContent=status==='connected'?'Connected':status==='connecting'?'Connecting…':'Reconnecting · casting paused';if(!$('lobby').hidden)$('join-status').textContent=status==='connected'?'Joined':status==='connecting'?'Joining the game…':'Trying to reconnect…';},
 onDisconnect:()=>{selected=null;lockId=null;castPending=false;clearFlights();},
 onError:message=>{setError(message);$('connection').textContent='Disconnected · rejoin the arena';},
 onMessage:m=>{
  if(m.type==='damage')damageFlash.receive(m);
  if(m.type==='spell'&&m.actorId===myId&&m.targetId)damageFlash.prepare(m.targetId);
  if(m.type==='arena-event'){arenaEvents.receive(m);killIntro.receive(m);if(m.kind==='kill'&&m.actorId===myId)coinEffects.collect(targetPoint(m.targetId),m.coins??30,m.id,m.victim);}
  if(m.type==='orbital'){minimap.endAirstrike();orbitalView.sync([m.strike],myId);}
  if(m.type==='killstreak'&&m.actorId!==myId)killStreak.announce(m.name,m.streak);
  if(m.type==='welcome'){if(myId&&myId!==m.id){clearFlights();completedShots.clear();faceTracker.reset();room=null;notify('The arena restarted. Rejoining with your face scan.');}serverClock.reset();joined=true;myId=m.id;sessionStorage.setItem('fieldspell-token',m.token);safeWrite('clashmit-player-token',m.token);safeWrite('clashmit-player-id',m.id);showArena();startJoinedSensors();$('join').disabled=false;}
  // The knock-out banner names whoever landed the last hit. A death that no hit announced since the last state was
  // dealt by poison or skeletons, so name their caster instead of whoever happened to hit that player last.
  if(m.type==='state'){const previous=me()?.score?.currentStreak,next=m.room.players.find(p=>p.id===myId)?.score?.currentStreak;if(previous!==undefined&&next>previous)killStreak.show(next);if(room)for(const p of m.room.players){const was=room.players.find(o=>o.id===p.id);if(was?.health>0&&!(p.health>0)&&!hitSinceState.has(p.id)){const by=lingeringKiller(was);if(by)roundOverlay.impact({targetId:p.id,actorId:by});}}hitSinceState.clear();}
  if(m.type==='state'){if(room&&(room.endsAt!==m.room.endsAt||room.startsAt!==m.room.startsAt)){clearFlights();damageFlash.clear();orbitalView.clear();}if(m.room.continuous&&me()&&(me().life!==m.room.players.find(p=>p.id===myId)?.life||me().health>0&&m.room.players.find(p=>p.id===myId)?.health<=0)){clearFlights();completedShots.clear();castPending=false;selected=null;lockId=null;}if(m.room.players.find(p=>p.id===myId)?.health>0&&me()?.health<=0)killIntro.clear();room=m.room;if(room.eventRound){for(const p of [...(room.eventRound.leaders||[]),room.eventRound.king].filter(Boolean))p.avatar=avatars.get(p.id)||p.avatar;}serverClock.bootstrap(room.serverTime);arenaEvents.sync(room.announcements);orbitalView.sync(room.airstrikes||[],myId);incoming.sync((room.shots||[]).filter(s=>s.targetId===myId));for(const shot of room.shots||[])if(shot.actorId===myId&&room.phase==='playing'&&now()<(shot.expiresAt??Infinity))effect(shot.spell||'fireball',{shot});renderState();}
  if(m.type==='state')minimap.update(m.room,myId);
  if(m.type==='impact'){roundOverlay.impact(m);if(!m.missed&&!m.blocked&&m.targetId)hitSinceState.add(m.targetId);}
  if(m.type==='state'){roundOverlay.update(m.room,myId);if(m.room.phase==='countdown')$('phase').textContent='Round starting…';}
  if(m.type==='state'){if(shouldClose(m.room.phase,m.room.continuous)||me()?.respawnAt)onboarding.hide();else if(shouldOpen({seen:safeRead('fieldspell-coached')==='1',practice,continuous:m.room.continuous,faceReady:me()?.faceReady,phase:m.room.phase,scanOpen:faceScan.isOpen,open:onboarding.isOpen}))onboarding.open();}
  // Each player's scan: whole-face samples plus upper-face ones for when a phone hides their nose and mouth.
  if(m.type==='faces')for(const [id,scan] of Object.entries(m.faces||{})){const decode=list=>(list||[]).map(decodeDescriptor).filter(Boolean),samples=decode(scan?.samples);if(samples.length)faces.set(id,{samples,upper:decode(scan.upper)});else faces.delete(id);}
  if(m.type==='avatars'){for(const [id,image] of Object.entries(m.avatars||{})){if(typeof image==='string'&&image.startsWith('data:image/jpeg;base64,'))avatars.set(id,image);else avatars.delete(id);}minimap.setAvatars(avatars);}
  // First thing a new player sees after the permission prompts: the face scan, without having to find a button.
  // A player who already scanned (the server restarted, or they rejoined) silently sends the same signature again.
  if(m.type==='welcome')faceResent=false;
  if(m.type==='state'&&joined&&me()&&!me().faceReady&&(room.continuous||room.phase!=='playing')){if(mySamples){if(!faceResent){faceResent=true;send({type:'face',...mySamples});if(myAvatar)send({type:'avatar',image:myAvatar});}}else if(!autoScanOffered){autoScanOffered=true;void permissionsReady.then(()=>{if(joined&&!practice&&!$('arena').hidden&&!me()?.faceReady&&!faceScan.isOpen)faceScan.open();});}}
  if(m.type==='spell'&&m.spell==='flashbang'){
   if(m.actorId===myId){castPending=false;audio.play('flashbang');notify(`Flashbang · ${m.affectedIds?.length||0} nearby players blinded`);}
   else if(m.affectedIds?.includes(myId)){audio.play('flashbang');haptics.play('hit');notify('Flashbanged · 3 seconds');}
   else if(m.blockedIds?.includes(myId))notify('Your shield blocked the flashbang');
  }
  if(m.type==='spell'&&m.spell!=='flashbang'){if(m.actorId===myId){castPending=false;effect(m.spell,{shot:m});}else if(m.targetId===myId&&m.shotId){incoming.launch(m);if(!m.super)audio.play(m.spell);}else if(m.spell==='shield')notify(`Opponent shield active · Lightning pierces it`);else if(m.spell==='heal'){healed.set(m.actorId,Date.now()+900);notify(`${room?.players.find(p=>p.id===m.actorId)?.name||'Opponent'} healed +${m.healedAmount??(room.economy?50:m.super?35:20)}`);}else if(m.clearedSwarm)notify('Your skeletons were cleared');}
  if(m.type==='impact')handleImpact(m);
  if(m.type==='round-start')notify('Round started. Keep your opponent in view.');
  if(m.type==='error'){castPending=false;setError(m.message);}
  if(m.type==='pong'){const receivedAt=Date.now();serverClock.pong(m.serverTime,m.at,receivedAt);$('connection').textContent=`Live · ${receivedAt-m.at}ms`;}
 }
});
function connect(){connection.start();}
// Reconcile permission results both when they arrive and when the server welcomes us.
// Either can finish first; leaving invalidates pending permission callbacks.
function startJoinedSensors(){
 const asked=joinPermissions;if(!asked||!joined||practice)return;
 minimap.setPermission(asked.result.location);
 if(asked.result.location==='granted')void minimap.enable({compassGranted:asked.result.motion==='granted',requestCompass:false});
 void permissionsReady.then(()=>{if(joinPermissions===asked&&joined&&!practice&&!document.hidden&&!faceScan.isOpen)voice.resume();});
}
$('join-form').onsubmit=e=>{
 e.preventDefault();if(!$('name').value.trim())return;
 practice=false;trackingPractice=false;joined=false;$('join').disabled=true;safeWrite('fieldspell-name',$('name').value.trim());
 const asked=requestAllPermissions({onLocation:()=>{if(joinPermissions===asked)startJoinedSensors();}});
 joinPermissions=asked;permissionsReady=asked.ready.catch(()=>{});
 // Start speech inside the Join gesture so Safari can request speech access here.
 voice.enable();connect();
};
function beginPractice(realTracking=false){clearFlights();trackingPractice=realTracking;practice=true;connection.stop();myId='self';const make=(id,name,who=persona)=>({id,name,persona:who,health:100,mana:MANA.max,manaUpdatedAt:Date.now(),healthRegenAt:Date.now(),shieldUntil:0,cooldowns:{},connected:true});room={phase:'playing',hostId:myId,endsAt:Date.now()+180000,winners:[],players:[make(myId,$('name').value.trim()||'You'),make('dummy','Practice target',practiceFoe())]};showArena();$('connection').textContent=trackingPractice?'Local face test · no server':'Solo · simulated target';renderState();if(trackingPractice){room.players[1].name='You';faceScan.open();}else{startCamera();dummyTimer=setInterval(dummyTurn,3500);}}
// ?test=solo&vs=witch: a simulated opponent that casts its deck back, so every persona's incoming effects, status chips and clears can be seen on one device.
function practiceFoe(){const vs=new URLSearchParams(location.search).get('vs');return Object.hasOwn(PERSONAS,vs)?vs:'witch';}
function dummyTurn(){
 if(!simulated()||room?.phase!=='playing'||document.hidden)return;const foe=opponent(),attacks=PERSONAS[personaOf(foe)].filter(isThrown),shot=launchProjectile(room,foe.id,attacks[dummyShots++%attacks.length],myId,crypto.randomUUID());if(shot.error)return;
 incoming.launch(shot);audio.play(shot.spell);const round=room.endsAt;
 setTimeout(()=>{if(!simulated()||room?.endsAt!==round)return;const hit=impactProjectile(room,foe.id,shot.shotId,true);if(hit.error)return;handleImpact(hit);if(me().health<=0){room.phase='finished';room.winners=[foe.id];}renderState();},shot.flightMs);
}
function stopCamera(){damageFlash.clear();cameraEpoch++;faceTracker.stop();stream?.getTracks().forEach(t=>t.stop());stream=null;$('camera').srcObject=null;trackingStatus='Camera off';selected=null;lockId=null;targetOverlay.hide();}
function stopSensors(){clearFlights();stopCamera();faceScan.stop();fireScene?.clear();clearTimeout(effectTimer);$('fx').className='';$('fx').replaceChildren();voice.stop();}
$('leave').onclick=()=>{orbitalView.clear();if(!practice)send({type:'leave'});connection.stop();sessionStorage.removeItem('fieldspell-token');$('arena').hidden=true;joinPermissions=null;stopSensors();completedShots.clear();serverClock.reset();deckSignature='';healed.clear();room=null;myId=null;practice=false;trackingPractice=false;joined=false;$('lobby').hidden=false;$('camera-prompt').hidden=false;targetOverlay.hide();$('join-status').textContent='Everyone joins the same game.';};
async function startCamera(){
 if(cameraStarting||stream?.active)return;if(!navigator.mediaDevices?.getUserMedia){notify('Camera requires Safari or Chrome over HTTPS.');return;}
 cameraStarting=true;const epoch=cameraEpoch;$('camera-start').disabled=true;
 try{const next=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:trackingPractice?'user':'environment'},width:{ideal:1920},height:{ideal:1080}},audio:false});if($('arena').hidden||epoch!==cameraEpoch||faceScan.isOpen){next.getTracks().forEach(t=>t.stop());return;}stream=next;$('camera').srcObject=stream;await $('camera').play();$('camera-prompt').hidden=true;if(!simulated())faceTracker.start();}
 catch(e){stopCamera();$('camera-prompt').hidden=false;notify(e.name==='NotAllowedError'?'Allow camera access in browser settings, then retry.':'Could not open camera. Close other camera apps and retry.');}finally{cameraStarting=false;$('camera-start').disabled=false;}
}
const faceScan=setupFaceScan({beforeOpen:()=>{voice.pause();stopCamera();fireScene?.clear();},onSample:()=>haptics.play('tap'),onSave:(samples,upper,avatar)=>{if(trackingPractice){localFace={samples,upper};renderState();notify('Face saved. Step back and watch the lock follow you.');}else{mySamples={samples:samples.map(encodeDescriptor),upper:upper.map(encodeDescriptor)};send({type:'face',...mySamples});myAvatar=avatar;if(avatar)send({type:'avatar',image:avatar});notify('Face saved. Point your camera at another player.');}},onClose:()=>{if(!$('arena').hidden){startCamera();if(!document.hidden)voice.resume();}}});
$('camera-start').onclick=()=>{if((trackingPractice&&!localFace)||(!practice&&!me()?.faceReady))faceScan.open();else startCamera();};
function renderState(){if(!me())return;renderDeck();arenaLeaders.update((room.leaders||[]).map(p=>({...p,avatar:avatars.get(p.id)||p.avatar})),myId,room.eventRound);
 // Poison and skeletons kill between impacts, on the server's tick, so no impact announces that death. Feel it here, once.
 {const health=trackingPractice?100:me().health;if(lastHealth>0&&health<=0&&!deathFelt){deathFelt=true;haptics.play('death');}if(health>0)deathFelt=false;lastHealth=health;}
$('arena').classList.toggle('round-live',room.phase==='playing');const p=me();if(!practice)safeWrite('fieldspell-persona',p.nextPersona||p.persona||'mage');const displayHealth=trackingPractice?opponent()?.health:p.health;healthHud.update(room.players,myId,displayHealth,trackingPractice?'Target health':'Your health');$('room-label').textContent=hudPreview?'HUD PREVIEW':trackingPractice?'ONE PERSON FACE TEST':practice?'SOLO PRACTICE':(room.eventRound?.mode==='koth'?'KING OF THE HILL':'FFA');$('start-round').hidden=room.continuous||room.hostId!==myId;$('start-round').disabled=!trackingPractice&&room.phase==='playing';$('start-round').textContent=trackingPractice?'Reset target':room.phase==='finished'?'New round':'Start round';
 $('player-score').hidden=!p.score;$('player-score').replaceChildren();const coin=document.createElement('img');coin.src='/media/coin.svg';coin.className='coin-icon';coin.alt='Coins';$('player-score').append(coin,document.createTextNode(` ${p.score?.coins||0}`));renderInventory(p);
 if(room.phase==='finished'){const winners=room.players.filter(p=>room.winners.includes(p.id)).map(p=>p.name);$('phase').textContent=room.results?(room.results.winnerId?`${room.results.players.find(p=>p.id===room.results.winnerId)?.name} wins`:'Round ended'):(winners.length===1?`${winners[0]} wins`:winners.length?'Round tied':'Round ended');}else if(room.phase==='lobby')$('phase').textContent=room.hostId===myId?`${room.players.length}${room.maxPlayers?`/${room.maxPlayers}`:''} joined · you control the arena`:`Waiting for the host (${room.players.find(player=>player.id===room.hostId)?.name||'reconnecting…'})`;
}
function renderAim(){
 if(!room)return;if(me()?.health<=0&&!trackingPractice){selected=null;lockId=null;targetOverlay.hide();$('reticle').hidden=true;$('target-status').textContent='';army.clear();return;}$('reticle').hidden=false;const match=simulated()?{id:'dummy',x:.5,y:.4,confirmed:true,fresh:true,box:{x:.36,y:.23,width:.28,height:.34}}:matchedPerson();
 const foe=opponent();
 const liveOpponent=!!match&&foe?.id===match.id&&foe.connected&&foe.health>0;selected=liveOpponent&&match.confirmed&&aimContains(match.box)?match.id:null;
 // A face near the reticle that has not been named yet, so the player knows to hold still rather than give up.
 const pending=!match&&!simulated()?visibleTracks(false).find(t=>t.reticle<.2):null;
 if(!practice&&!connection.ready)selected=null;
 if(selected!==lockId){lockSince=Date.now();lockId=selected;}const locked=selected&&match?.fresh&&Date.now()-lockSince>200;
 $('reticle').classList.toggle('locked',!!locked);
 const aimText=simulated()?'Simulated target':!(trackingPractice?localFace:me()?.faceReady)?'Complete your face scan to get ready.':!gallery().length?'Waiting for other players to scan their faces.':!stream?.active?'Enable your camera.':match?(locked?`${foe.name} locked · cast a spell`:match.source==='body'?`Following ${foe.name} · aim at them`:`Aim the reticle at ${trackingPractice?'your face':foe.name}`):pending?(pending.match?.tooSmall?'Too far to recognise · move closer':'Identifying… hold steady'):trackingPractice?'Show your face to the camera.':'Point at another player’s face · works best within a few metres';
 if($('target-status').textContent!==aimText)$('target-status').textContent=aimText;
 const visionText=simulated()?'Simulated tracking':trackingStatus;if($('vision-status').textContent!==visionText)$('vision-status').textContent=visionText;
 targetOverlay.update(liveOpponent?match:pending?{...pending,pending:true}:null,liveOpponent?foe:{name:'Identifying…',health:100},{crowned:liveOpponent&&room.eventRound?.king?.id===foe.id,shielded:liveOpponent&&foe.shieldUntil>now(),poisoned:liveOpponent&&active(foe.poison,now()),healed:liveOpponent&&(healed.get(foe.id)||0)>Date.now(),accent:liveOpponent?PERSONA_INFO[personaOf(opponent())].accent:'',piercer:room.economy?'Lightning':liveOpponent&&foe.superShieldUntil>now()?'Lightning':labelOf(piercerOf(myDeck())),simulated:simulated()});
 for(const spell of myDeck())if(isThrown(spell))$(spell)?.classList.toggle('target-ready',!!locked);
 if(previewMode!=='supers')renderArmy();
}
const hitSinceState=new Set();let castPending=false,castRequest=0,wasStunned=false,lastBeat=0,lastHealth=100,deathFelt=false,deckSignature='';const healed=new Map();
function cast(spell){void audio.unlock();if(!room||!myDeck().includes(spell))return;if(me()?.health<=0){notify(me()?.respawnAt?(respawnSeconds(me().respawnAt,now())?`Respawn ready in ${respawnSeconds(me().respawnAt,now())}s`:'Shop · ready to respawn'):me()?.eliminated?'You’re out until the next round.':me()?.waitingForRound?'Waiting for the next round.':'Complete your face scan first.');return;}if(room.phase!=='playing'){notify('The host needs to start the round first.');return;}renderAim();if((me().actionLockUntil||0)>now()){notify('Orbital airstrike incoming.');return;}if((me().stunUntil||0)>now()){notify('You’re stunned.');return;}
 // Skeletons are on you, not across the field: a splash spell may be spent on them with nobody locked.
 const clearing=!!SPELLS[spell].splash&&active(me().swarm,now());
 if(isThrown(spell)&&!clearing&&(!selected||Date.now()-lockSince<200||(!simulated()&&!matchedPerson()?.fresh))){notify('Aim at another player until their face locks.');return;}if(practice){const event=isThrown(spell)?launchProjectile(room,myId,spell,selected,crypto.randomUUID()):castSpell(room,myId,spell,selected);if(event.error){notify(event.error);return;}effect(spell,{shot:event});renderState();}else if(connection.ready){if(castPending)return;castPending=true;const request=++castRequest;send({type:'cast',spell,targetId:selected});notify('Casting '+(room.economy?skillName(me(),spell):labelOf(spell))+'…');setTimeout(()=>{if(castPending&&request===castRequest){castPending=false;notify('Cast not confirmed. Check the connection.');}},2500);}else notify('Reconnecting. Casting is paused.');}
// Spell cards only show the deck, mana and cooldowns. Casting is voice-only.
const visualStyle=id=>id==='flashbang'?'fireball':id;
const iconNames={lightning:'zap',fireball:'flame',meteor:'orbit',poison:'flask-conical',skeletonArmy:'skull',soulReaper:'ghost',arrows:'move-up-right',bombArrow:'bomb',ballista:'crosshair',shield:'shield',heal:'heart',flashbang:'bomb'};
function uiIcon(name){const el=document.createElement('i');el.className='ui-icon';el.setAttribute('aria-hidden','true');el.style.setProperty('--icon',`url('/media/ui/${name}.svg')`);return el;}
let inventorySignature='';
function renderInventory(p){
 const signature=JSON.stringify(p.loadout?.consumables);if(inventorySignature===signature)return;inventorySignature=signature;
 $('inventory').replaceChildren(...Object.entries(CONSUMABLES).map(([id,item])=>{const row=document.createElement('div'),count=document.createElement('b'),label=document.createElement('span'),detail=document.createElement('small');count.textContent=`${p.loadout?.consumables?.[id]||0}×`;label.textContent=item.name;detail.textContent=id==='shield'?`${item.duration/1000}s`:id==='heal'?'5 ♥':'';const icon=document.createElement('img');icon.src=`/media/ui/item-${id}.svg`;icon.className='consumable-icon';icon.alt='';icon.width=22;icon.height=22;row.dataset.consumable=id;const content=document.createElement('span');content.className='consumable-content';content.append(count,icon,label,detail);const refill=content.cloneNode(true);refill.classList.add('consumable-refill');refill.setAttribute('aria-hidden','true');row.append(content,refill);return row;}));
}

function renderDeck(){
 const deck=myDeck(),signature=JSON.stringify([myPersona(),room.economy,me()?.loadout]);if(signature===deckSignature)return;deckSignature=signature;
 $('arena').style.setProperty('--persona-accent',PERSONA_INFO[myPersona()].accent);
 $('spells').classList.toggle('economy-spells',!!room.economy);$('spells').replaceChildren();
 for(const spell of deck){if(room.economy&&CONSUMABLES[spell])continue;const info=SPELL_INFO[spell],rule=room.economy?ruleFor(me(),spell):SPELLS[spell],name=room.economy?skillName(me(),spell):info.label,button=document.createElement('div');button.id=spell;button.className='spell '+info.css;button.setAttribute('role','group');button.setAttribute('aria-label',`Say ${name} to cast`);
  const stat=room.economy?(ATTACKS[spell]?`♥ ${+(totalDamage(rule)/10).toFixed(1)}  ◆ ${rule.manaCost}  ◷ ${rule.cooldown/1000}s`:`${me().loadout?.consumables?.[spell]||0} left · ${spell==='shield'?`${rule.duration/1000}s`:'5 ♥'}`):info.blurb;
  for(const [tag,cls,value] of [['span','spell-symbol',info.symbol],['b','',name],['span','mana-cost',rule.manaCost],['span','super-progress',''],['small','skill-stats',stat],['span','cooldown','']]){const el=document.createElement(tag);if(cls)el.className=cls;el.textContent=value;button.append(el);}
  button.querySelector('.spell-symbol').replaceChildren(uiIcon(iconNames[spell]||'zap'));
  if(room.economy&&ATTACKS[spell]){const stats=button.querySelector('.skill-stats');stats.replaceChildren(...[['swords',+(totalDamage(rule)/10).toFixed(1),'hearts damage'],['droplet',rule.manaCost,'mana'],['hourglass',rule.cooldown/1000+'s','delay']].map(([icon,value,label])=>{const span=document.createElement('span');span.className='skill-stat';span.setAttribute('aria-label',`${value} ${label}`);span.append(uiIcon(icon),String(value));return span;}));}
  button.classList.toggle('upgraded',skillLevel(me(),spell)>1);if(room.economy&&ATTACKS[spell]&&!skillLevel(me(),spell)){button.classList.add('skill-locked');const lock=document.createElement('span');lock.className='skill-lock';lock.textContent=`Unlock · ${UNLOCK_COST[attacksFor(myPersona()).indexOf(spell)]} coins`;button.append(lock);}
  if(rule.multiHit){const badge=document.createElement('span');badge.className='skill-multi';badge.textContent='Up to 3 targets';badge.title='Two extra opponents within 5m take half damage';button.append(badge);}
  $('spells').append(button);
 }
}
// Where a player stands on the ground, from their face lock; null while they are out of sight.
function feetFor(id){
 const rect=targetOverlay.size();if(simulated())return{x:.5,y:.57,size:.075}; // the simulated target box is a whole body
 const track=matchedPerson(id);return track?feetOf(track.box,rect.width/rect.height):null;
}
// The army is drawn from shared state every frame, so every phone shows the same marches and the same mobs.
let hudGround=.62;
function renderArmy(){
 const at=now(),hasArmy=(room.shots||[]).some(s=>s.spell==='skeletonArmy')||room.players.some(p=>active(p.swarm,at));if(!hasArmy){if(army.active)army.clear();return;}
 const rect=targetOverlay.size(),live=room.phase==='playing';
 const progress=s=>Math.max(0,Math.min(1,1-(s.impactAt-at)/s.flightMs)),marches=(room.shots||[]).filter(s=>s.spell==='skeletonArmy');
 army.update({
  outgoing:marches.filter(s=>s.actorId===myId).map(s=>({id:s.shotId,who:s.targetId,super:s.super||s.upgraded,progress:progress(s),feet:feetFor(s.targetId)})),
  incoming:marches.filter(s=>s.targetId===myId).map(s=>({id:s.shotId,who:s.actorId,super:s.super||s.upgraded,progress:progress(s),feet:feetFor(s.actorId)})),
  mobbed:live?room.players.filter(p=>p.id!==myId&&p.health>0&&active(p.swarm,at)).map(p=>({who:p.id,super:p.swarm.perSecond>5,feet:feetFor(p.id)})):[],
  superOnMe:!!me()?.swarm&&me().swarm.perSecond>5,onMe:live&&!trackingPractice&&active(me()?.swarm,at),ground:hudGround});
}
$('start-round').onclick=()=>{if(practice){clearFlights();if(trackingPractice){opponent().health=100;room.phase='playing';room.endsAt=Date.now()+180000;room.winners=[];room.shots=[];me().cooldowns={};me().mana=MANA.max;me().manaUpdatedAt=Date.now();me().healthRegenAt=Date.now();me().shieldUntil=0;for(const p of room.players){p.poison=null;p.swarm=null;p.stunUntil=0;}renderState();}else beginPractice(false);return;}send({type:'start'});};
const voice=setupVoice({Recognition:window.SpeechRecognition||window.webkitSpeechRecognition,status:$('voice-status'),onSpell:cast,getWords:()=>room?.economy?wordsFor(me()):deckWords(myDeck()),describe:()=>room?.economy?Object.keys(wordsFor(me())).map(id=>skillName(me(),id)).join(', '):myDeck().map(labelOf).join(', ')});
function renderCombat(){
 const p=me();if(!p)return;orbitalButton.hidden=!(p.airstrikeCharges>0&&p.health>0&&room.phase==='playing'&&!(p.actionLockUntil>now()));flashScreen.style.opacity=p.flashUntil>now()?'1':0;const at=now(),mana=Math.min(MANA.max,Math.max(0,manaAt(p,at))),shieldRemaining=Math.max(0,p.shieldUntil-at);
 $('mana-fill').style.width=100*mana/MANA.max+'%';$('mana-value').textContent=`${Math.floor(mana)} / ${MANA.max}`;$('mana-track').setAttribute('aria-valuenow',mana.toFixed(1));
 $('own-shield').classList.toggle('active',shieldRemaining>0);$('own-shield').classList.toggle('own-super-shield',p.superShieldUntil>at);$('shield-status').hidden=!shieldRemaining;$('shield-status').textContent=p.economy?`◇ Shield ${(shieldRemaining/1000).toFixed(1)}s · Lightning pierces`:p.superShieldUntil>at?`◇ Aegis ${(shieldRemaining/1000).toFixed(1)}s · Lightning pierces`:`◇ Shield ${(shieldRemaining/1000).toFixed(1)}s · Lightning, Skeletons, Zap pierce`;
 for(const row of $('inventory').children){const id=row.dataset.consumable,item=CONSUMABLES[id];if(!item)continue;const remaining=Math.max(0,(p.cooldowns[id]||0)-at),percent=Math.max(0,Math.min(100,100*(1-remaining/item.cooldown))).toFixed(1);row.classList.toggle('is-cooling',remaining>0);row.classList.toggle('is-empty',!(p.loadout?.consumables?.[id]>0));row.style.setProperty('--consumable-ready',percent+'%');const label=`${p.loadout?.consumables?.[id]||0} ${item.name}${remaining?`, ready in ${Math.ceil(remaining/1000)} seconds`:''}`;if(row.getAttribute('aria-label')!==label)row.setAttribute('aria-label',label);}
 const poisoned=active(p.poison,at),swarmed=active(p.swarm,at),stunned=(p.stunUntil||0)>at,live=room.phase==='playing';
 // Re-trigger the flash on each new stun, not on every frame of it.
 if(stunned&&!wasStunned){$('arena').classList.remove('stunned');void $('arena').offsetWidth;$('arena').classList.add('stunned');}wasStunned=stunned;
 $('arena').classList.toggle('poisoned',live&&poisoned&&!trackingPractice);
 // One quiet beat a second while damage lingers on me or on the player I am facing, so it can be heard without looking.
 const beat=Math.floor(at/1000);if(live&&beat!==lastBeat){lastBeat=beat;const foe=opponent();for(const [effect,spell] of [['poison','poison'],['swarm','skeletonArmy']])if(active(p[effect],at)||active(foe?.[effect],at))audio.play(spell,'tick');}
 const chips=[];if(live&&poisoned)chips.push(['poison',`☣ Poisoned ${Math.ceil((p.poison.until-at)/1000)}s`]);if(live&&swarmed){const counters=myDeck().filter(s=>SPELLS[s]?.splash&&(!room.economy||skillLevel(p,s)>0)&&!(p.cooldowns[s]>at)&&manaAt(p,at)>=(room.economy?ruleFor(p,s):SPELLS[s]).manaCost).map(s=>room.economy?skillName(p,s):labelOf(s));if((!room.economy||p.loadout?.consumables?.shield>0)&&!(p.cooldowns.shield>at))counters.push('Shield');chips.push(['swarm',counters.length?`Skeletons on you · Say ${counters.join(' or ')}`:'Skeletons on you · Wait for them to clear']);}if(live&&stunned)chips.push(['stun','⚡ Stunned']);
 const chipText=chips.map(c=>c[1]).join('|');if($('status-chips').dataset.text!==chipText){$('status-chips').dataset.text=chipText;$('status-chips').replaceChildren(...chips.map(([cls,text])=>{const el=document.createElement('div');el.className='status-chip '+cls;el.textContent=text;return el;}));}
 for(const spell of myDeck()){
  const rule=room.economy?ruleFor(p,spell):SPELLS[spell],remaining=Math.max(0,(p.cooldowns[spell]||0)-at),button=$(spell);if(!button)continue;const cover=button.querySelector('.cooldown');cover.style.display=remaining?'flex':'none';cover.textContent=(remaining/1000).toFixed(1);
  const charge=superProgress(p,spell),superLabel=button.querySelector('.super-progress');superLabel.hidden=room.economy||!room.enhanced;superLabel.textContent=charge===2?'● ● ◉ Super ready':`${'● '.repeat(charge)}${'○ '.repeat(3-charge)}Super in ${3-charge}`;button.classList.toggle('super-ready',!room.economy&&room.enhanced&&charge===2);
  button.querySelector('.mana-cost').textContent=rule.manaCost;button.title=room.economy?`Say ${skillName(p,spell)} · ${ATTACKS[spell]?`${totalDamage(rule)/10} hearts damage · ${rule.manaCost} mana · ${rule.cooldown/1000}s delay`:(spell==='heal'?'Restore 5 hearts':`${rule.duration/1000}s · Lightning pierces`)}`:`Say ${labelOf(spell)} · ${rule.manaCost} mana · ${SPELL_INFO[spell].blurb}`;
  button.classList.toggle('clears-swarm',live&&swarmed&&!!rule.splash&&!remaining);
  button.classList.toggle('unavailable',room.phase!=='playing'||p.health<=0||stunned||p.actionLockUntil>at||(room.economy&&(ATTACKS[spell]?!skillLevel(p,spell):!p.loadout?.consumables?.[spell]))||castPending||remaining>0||mana+1e-6<rule.manaCost||(!practice&&!connection.ready));button.classList.toggle('needs-mana',mana<rule.manaCost);
 }
}
function renderAimFrame(){if(room&&!document.hidden&&!$('arena').hidden)renderAim();requestAnimationFrame(renderAimFrame);}
requestAnimationFrame(renderAimFrame);
setInterval(()=>{if(!room)return;if(practice){if(room.continuous){if(advanceRespawns(room,Date.now()).length)renderState();roundOverlay.update(room,myId);}const before=room.players.map(p=>p.health).join();settleRoom(room,Date.now());if(room.phase==='playing'&&opponent()?.health<=0){room.phase='finished';room.winners=[myId];}if(before!==room.players.map(p=>p.health).join()||room.phase==='finished')renderState();}renderCombat();
 if(room.continuous){const mode=room.eventRound?.mode==='koth'?'KOTH':'FFA',left=Math.max(0,Math.ceil((room.endsAt-now())/1000));$('phase').textContent=room.phase==='finished'?`${mode} ended · waiting for admin`:me()?.respawnAt?(respawnSeconds(me().respawnAt,now())?`Respawn ready in ${respawnSeconds(me().respawnAt,now())}s`:'Shop · ready to respawn'):`${mode}${room.endsAt?` · ${Math.floor(left/60)}:${String(left%60).padStart(2,'0')}`:' · Live'} · ${room.players.filter(p=>p.connected&&p.faceReady).length} players${room.eventRound?.modifier?.endsAt>now()?` · Mana surge ${Math.ceil((room.eventRound.modifier.endsAt-now())/1000)}s`:''}`;}else if(room.phase==='playing'&&trackingPractice){$('phase').textContent='Real face tracking · local test';}else if(room.phase==='playing'){const seconds=Math.max(0,Math.ceil((room.endsAt-now())/1000));$('phase').textContent=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')} remaining`;if(practice&&seconds===0){room.phase='finished';room.winners=[];renderState();}}
},100);
document.addEventListener('visibilitychange',()=>{if(document.hidden){voice.pause();faceTracker.reset();if(joined&&!practice){send({type:'inactive'});faceResent=false;connection.stop();}}else if(joined&&!practice){if(!faceScan.isOpen)voice.resume();connection.start();notify('Find your opponent again before casting.');}});
window.addEventListener('online',()=>{if(joined&&!practice)connection.check();});
window.addEventListener('pageshow',event=>{if(event.persisted&&joined&&!practice){voice.enable();connect();}});
window.addEventListener('pagehide',()=>{if(joined&&!practice)send({type:'inactive'});$('arena').hidden=true;stopSensors();connection.stop();});

if(new URLSearchParams(location.search).get('test')==='face')beginPractice(true);
else if(new URLSearchParams(location.search).get('test')==='solo')beginPractice(false);
// ?test=coach previews the real tips below, without marking the real onboarding as seen.

// Existing alert components share a flow layout rather than competing for fixed coordinates.
const hudNotices=document.createElement('div');hudNotices.id='hud-notices';
for(const selector of ['#shield-status','#status-chips','.killstreak-global','.killstreak-pop','.round-feed','.arena-announcement']){
 const element=$('arena').querySelector(selector);if(element)hudNotices.append(element);
}
$('arena').append(hudNotices);
function placeHud(){
 if($('arena').hidden)return;
 const header=document.querySelector('.hud-top'),top=header.getBoundingClientRect().bottom-$('arena').getBoundingClientRect().top+8;
 $('arena').style.setProperty('--hud-below',`${top}px`);
 const bottom=$('arena').getBoundingClientRect().bottom-document.querySelector('.bottom-hud').getBoundingClientRect().top+10;
 $('arena').style.setProperty('--hud-bottom-height',`${bottom}px`);
 hudGround=1-bottom/Math.max(1,targetOverlay.size().height);
 const arenaTop=$('arena').getBoundingClientRect().top;
 const obstacles=[$('arena').querySelector('.arena-leaders'),$('arena').querySelector('.minimap:not(.full)')];
 const topBottom=Math.max(top,...obstacles.filter(el=>el&&!el.hidden).map(el=>el.getBoundingClientRect().bottom-arenaTop));
 $('arena').style.setProperty('--hud-content-top',`${topBottom+12}px`);
 const noticesBottom=hudNotices.getBoundingClientRect().bottom-arenaTop;
 targetOverlay.setSafeTop(Math.max(topBottom,noticesBottom)+58);
}
const hudObserver=new ResizeObserver(placeHud);hudObserver.observe(document.querySelector('.hud-top'));hudObserver.observe(document.querySelector('.bottom-hud'));
for(const element of [hudNotices,$('arena').querySelector('.arena-leaders'),$('arena').querySelector('.minimap')])if(element)hudObserver.observe(element);
window.addEventListener('resize',placeHud);

// A sensor-free preview of the actual HUD, with simulated health changes and map positions.
if(hudPreview){
 practice=true;myId='preview-you';
 const make=(id,name,health,latitude,longitude)=>({id,name,health,persona:'mage',connected:true,faceReady:true,mana:7,manaUpdatedAt:Date.now(),shieldUntil:0,cooldowns:{},location:{latitude,longitude,accuracy:3,at:Date.now()}});
 room={phase:'lobby',hostId:'dummy',serverTime:Date.now(),endsAt:Date.now()+180000,winners:[],players:[make(myId,'You',75,42.3601,-71.0942),make('dummy','Alex',100,42.36025,-71.09405),make('preview-leon','Leon',50,42.36003,-71.0944),make('preview-john','John',20,42.35985,-71.0941)]};
 room.leaders=[{id:'dummy',name:'Alex',rank:1,coins:890,bestStreak:8},{id:'preview-leon',name:'Leon',rank:2,coins:810,bestStreak:5},{id:'preview-you',name:'You',rank:3,coins:750,bestStreak:3}];
 room.economy=true;room.enhanced=true;room.eventRound={mode:'ffa'};for(const p of room.players){p.economy=true;p.health=Math.min(70,p.health);p.loadout=freshLoadout();p.life=1;p.airstrikeCharges=1;p.score={coins:750,rank:4,knockouts:2,deaths:1};}
 if(previewMode==='hearts')me().health=65;
 showArena();void orbitalView.warm();$('camera-prompt').hidden=true;$('camera').hidden=true;
 $('connection').textContent='Preview · simulated players';$('voice-status').textContent='Preview only · in a game, voice and location start on Join.';
 if(previewMode==='eliminated'){room.continuous=true;room.phase='playing';room.eventRound={mode:'koth'};me().health=0;me().eliminated=true;me().life=1;roundOverlay.update(room,myId);}
 if(['respawn','shop'].includes(previewMode)){room.continuous=true;room.phase='playing';room.endsAt=0;for(const p of room.players)p.life=1;const die=()=>{me().health=0;me().diedAt=Date.now();me().respawnAt=Date.now()+10000;roundOverlay.update(room,myId);renderState();};die();const repeat=document.createElement('button');repeat.textContent='Preview FFA death';repeat.className='respawn-demo-repeat';repeat.onclick=die;$('arena').append(repeat);setInterval(()=>{if(!room||$('arena').hidden)return;advanceRespawns(room,Date.now());renderState();roundOverlay.update(room,myId);},100);}
 renderState();minimap.update(room,myId);void minimap.enable({requestCompass:false});if(previewMode==='coach')onboarding.open();
 if(previewMode==='consumables'){
  me().loadout.consumables={shield:3,heal:4,flashbang:1};renderState();
  const demo=document.createElement('button');demo.textContent='Preview consumable cooldowns';demo.className='respawn-demo-repeat';demo.onclick=()=>{for(const [id,item] of Object.entries(CONSUMABLES))me().cooldowns[id]=now()+item.cooldown;renderCombat();};$('arena').append(demo);
 }
 if(previewMode==='killed'){
  room.continuous=true;room.phase='playing';room.endsAt=0;renderState();roundOverlay.update(room,myId);
  const demo=document.createElement('button');demo.textContent='Preview being killed by Alex';demo.className='respawn-demo-repeat';
  demo.onclick=()=>{const event={id:crypto.randomUUID(),at:now(),kind:'kill',actorId:'dummy',targetId:myId,killer:'Alex',victim:'You',attackName:'Wildfire',spell:'fireball',text:'Alex killed You using Wildfire'};me().health=0;me().diedAt=now();me().respawnAt=now()+10000;killIntro.receive(event);arenaEvents.receive(event);roundOverlay.impact({actorId:'dummy',targetId:myId});roundOverlay.update(room,myId);renderState();};$('arena').append(demo);
 }
 if(previewMode==='flashbang'){
  room.phase='playing';room.continuous=true;room.endsAt=0;renderState();
  const demo=document.createElement('button');demo.textContent='Preview being flashbanged · 3s';demo.className='respawn-demo-repeat';
  demo.onclick=async()=>{await audio.unlock();const at=now(),caster=opponent();caster.location={latitude:42.3601,longitude:-71.0942,accuracy:3,at};me().location={...caster.location,latitude:42.36014};caster.loadout.consumables.flashbang=1;caster.cooldowns.flashbang=0;me().shieldUntil=0;const event=castSpell(room,caster.id,'flashbang',null,at);if(event.error){notify(event.error);return;}audio.play('flashbang');demo.disabled=true;setTimeout(()=>demo.disabled=false,3000);renderState();};$('arena').append(demo);
 }
 if(previewMode==='hud-alerts'){
 const preview=document.createElement('button');preview.textContent='Preview overlapping alerts';preview.className='respawn-demo-repeat';
 preview.onclick=()=>{me().shieldUntil=now()+CONSUMABLES.shield.duration;killStreak.announce('Leon',5);killStreak.show(3);arenaEvents.receive({id:crypto.randomUUID(),at:now(),kind:'kill',text:'Alex eliminated John · Huzzah!'});renderState();};$('arena').append(preview);
 }
 if(previewMode==='coins'){const demo=document.createElement('button');demo.textContent='Preview coin pickup';demo.className='respawn-demo-repeat';demo.onclick=async()=>{await audio.unlock();coinEffects.collect({x:.5,y:.4},30,crypto.randomUUID(),'Alex');};$('arena').append(demo);}
 if(previewMode==='airstrike'){
  const controls=document.createElement('details');controls.className='airstrike-preview-controls';controls.innerHTML='<summary>Preview controls</summary>';
  function previewStrike(caster=false,escape=false){controls.open=false;previewLocation={latitude:42.3601,longitude:-71.0942,accuracy:4};previewFix?.();const point={...previewLocation};orbitalView.clear();orbitalView.sync([{id:crypto.randomUUID(),actorId:caster?myId:'dummy',name:caster?'You':'Alex',point,radius:10,startsAt:now(),endsAt:now()+5000,victims:caster?[]:[{id:myId}]}],myId);if(escape)setTimeout(()=>{previewLocation={...previewLocation,latitude:42.3603};previewFix?.();},1300);}
  for(const [text,fn]of [['Preview incoming strike',()=>previewStrike()],['Preview launcher view',()=>previewStrike(true)],['Preview escaping the radius',()=>previewStrike(false,true)]]){const button=document.createElement('button');button.textContent=text;button.onclick=fn;controls.append(button);}$('arena').append(controls);room.continuous=true;room.phase='playing';room.endsAt=0;renderState();
 }

 if(previewMode==='fireball'){const launch=()=>{if(!$('arena').hidden&&!document.hidden)fireScene?.fire({x:.5,y:.4,distance:24,getTarget:()=>({x:.5,y:.4}),flightMs:1400});};void loadGraphics().then(launch);setInterval(launch,2500);}
 if(previewMode==='supers'){
  room.phase='playing';room.continuous=true;room.endsAt=0;renderState();
  const panel=document.createElement('div');panel.className='super-demo';let n=1000;
  for(const spell of Object.keys(SUPER_NAMES)){const button=document.createElement('button');button.textContent=SUPER_NAMES[spell];button.onclick=async()=>{await audio.unlock();arenaEvents.receive({id:n++,at:now(),kind:'super',spell,actorId:myId,text:`${SUPER_NAMES[spell]} activated by You`});if(['fireball','arrows','poison'].includes(spell)){await loadGraphics();fireScene?.fire({style:visualStyle(spell),super:true,x:.5,y:.4});}else if(SPELL_INFO[spell]?.bolt)lightningEffect(.5,.4,true);else if(spell==='skeletonArmy'){const until=performance.now()+2000;const tick=()=>{const t=performance.now();army.update({incoming:[{id:'demo-horde',who:'dummy',super:true,progress:1-(until-t)/2000,feet:{x:.5,y:.42,size:.07}}]});if(t<until)requestAnimationFrame(tick);else army.clear();};tick();}};panel.append(button);}const link=document.createElement('a');link.href='/effects.html';link.textContent='Test red hit flash';panel.append(link);$('arena').append(panel);
 }
 let step=0;setInterval(()=>{if(!hudPreview||$('arena').hidden||!room||['respawn','shop','eliminated','airstrike','hearts','flashbang','killed','consumables'].includes(previewMode))return;step++;const values=[[75,100,50,20],[40,60,90,20],[20,30,50,80],[95,100,50,20]][step%4];room.players.forEach((p,i)=>{p.health=Math.min(70,values[i]);p.location.at=Date.now();});renderState();minimap.update(room,myId);},3500);
}
