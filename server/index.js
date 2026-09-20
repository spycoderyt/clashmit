import {resolveMelee} from './melee.js';
import {createSharedMusicServer} from './music.js';
import {createLiveMap} from './live-map.js';
import {createPassiveCoins,PASSIVE_COINS} from './passive-coins.js';
import {launchOrbital,resolveOrbitals,rememberOrbitalLocation,ORBITAL} from './orbital.js';
import {COINS_PER_KILL,KILL_BOUNTY,bountyMultiplier,killReward,MAX_HEALTH,CONSUMABLES} from '../dist/economy.js';
import {createAdmin} from './admin.js';
import {createEventRounds} from './event-rounds.js';
import {SUPER_NAMES} from '../dist/supers.js';
import {RESPAWN_MS,spawnPlayer,advanceRespawns,selectRespawnPersona,requestRespawn,retirePlayer} from '../dist/respawn.js';
import {creditContinuous,scoreContinuousHit} from './continuous-scores.js';
import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {castSpell,launchProjectile,impactProjectile,expireProjectiles,settleRoom,MANA,SPELLS,PERSONAS,DEFAULT_PERSONA} from '../dist/rules.js';
import {profileId} from '../dist/shirt.js';
import {validLocation} from '../dist/geo.js';
import {validEncodedSamples,validAvatar} from '../dist/face-id.js';
import {serveVideo} from './video.js';
import {createScoreStore,startScoring,recordScore,recordLingering,settleScores,POINTS} from './scores.js';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.wasm':'application/wasm','.jpg':'image/jpeg','.png':'image/png','.mp3':'audio/mpeg','.ogg':'audio/ogg','.wav':'audio/wav'};
const allowedOrigins=(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean);
// countdownMs: how long every phone shows the synchronised countdown before a round begins (0 starts at once).
export function createGameServer({maxPlayers=null,maxBufferedBytes=256*1024,countdownMs=5000,scoreFile=null,continuous=false,economy=continuous,enhanced=continuous,adminPassword=process.env.ADMIN_PASSWORD||'',respawnDelayMs=RESPAWN_MS}={}){
 if(maxPlayers!==null&&(!Number.isInteger(maxPlayers)||maxPlayers<2))throw new Error('Invalid player capacity');
 if(!Number.isFinite(respawnDelayMs)||respawnDelayMs<=0)throw new Error('Invalid respawn delay');
 let closing=false,closePromise;
 const rooms=new Map(), clients=new Map(),scores=createScoreStore(scoreFile,{ranking:continuous?'coins':'points'});
 const participation=createPassiveCoins({credit:(id,coins)=>scores.award(id,0,0,0,false,coins)});
 const liveMap=createLiveMap();
 const kills=[],events=[],eventEpoch=randomUUID();let killSequence=0,eventSequence=0;
 const announce=(room,event,immediate={})=>{const full={type:'arena-event',id:`${eventEpoch}:${++eventSequence}`,at:Date.now(),...event};events.unshift(full);if(events.length>40)events.length=40;for(const p of room.players)send(p.socket,{...full,...immediate});};
 const rounds=createEventRounds({announce,resetStreak:id=>scores.resetStreak(id),getStandings:()=>scores.standings()});
 function ensureArena(){let room=rooms.get('ARENA');if(!room){room={code:'ARENA',players:[],continuous,economy,enhanced,phase:continuous?'playing':'lobby',startsAt:continuous?Date.now():0,hostId:null,endsAt:0,winners:[]};if(continuous)room.eventRound={id:Date.now(),mode:'ffa',endsAt:0,kingId:null,lastAt:Date.now(),players:{}};rooms.set('ARENA',room);}return room;}
 const recordKill=(room,event)=>{
  const {actorId,targetId,assists=[],...publicEvent}=event;const at=Date.now(),actor=room.players.find(p=>p.id===actorId),target=room.players.find(p=>p.id===targetId);
  rounds.kill(room,event,at);
  if(room.enhanced&&actor&&target){if(actor.revengeTargetId===targetId&&actor.health>0){actor.mana=Math.min(10,(actor.mana||0)+2);actor.revengeTargetId=null;announce(room,{kind:'revenge',actorId,text:`Revenge! ${actor.name} defeated ${target.name} · +2 mana`});}target.revengeTargetId=actorId;}
  if(room.economy&&actor&&event.streak>0&&event.streak%ORBITAL.streakStep===0){actor.airstrikeCharges=(actor.airstrikeCharges||0)+1;announce(room,{kind:'airstrike-ready',actorId,text:`${actor.name} earned an Orbital Airstrike!`});}
  const cheers=['Huzzah!','Unstoppable!','What a streak!','Keep it going!'];if(event.streak>=3)announce(room,{kind:'streak',actorId,text:room.economy&&event.streak>=KILL_BOUNTY.minimumStreak?`${event.killer} is on a ${event.streak}x killstreak. Bounty: ${bountyMultiplier(event.streak)}x coins (${killReward(event.streak)})!`:`${event.killer} is on a ${event.streak} killstreak. ${cheers[event.streak%cheers.length]}`});
  kills.unshift({id:++killSequence,at,...publicEvent});if(kills.length>100)kills.length=100;
  for(const assist of assists){const assistant=room.players.find(p=>p.id===assist.actorId);if(assistant?.socket)send(assistant.socket,{type:'assist',id:`${eventEpoch}:assist:${killSequence}:${assist.actorId}`,at,victim:event.victim,targetId,coins:assist.coins,balance:assist.balance});}
  announce(room,{kind:'kill',actorId,targetId,text:`${event.killer} killed ${event.victim} using ${event.attackName||'an attack'}`,...publicEvent},room.avatars?.[actorId]?{killerAvatar:room.avatars[actorId]}:{});
 };
 const music=createSharedMusicServer({directory:scoreFile?resolve(dirname(scoreFile),'music'):undefined,onChange:state=>{for(const room of rooms.values())broadcast(room,{type:'music',music:state});}});
 const admin=createAdmin({password:adminPassword,onMusicUpload:music.upload,onMusicConvert:music.convert,onMusicCommand:music.command,getState:()=>({music:music.snapshot(),round:rounds.snapshot(rooms.get('ARENA')),players:(rooms.get('ARENA')?.players||[]).filter(p=>p.connected).map(p=>({id:p.id,name:p.name,ready:!!p.faceReady})),serverTime:Date.now()}),onCommand:command=>{
  if(!continuous)return{error:'Admin rounds require continuous arena mode.'};const room=ensureArena();settleScored(room);finish(room);let result;
  if(command.action==='start')result=rounds.start(room,command.mode);else if(command.action==='end')result=rounds.end(room);else if(command.action==='manaSurge')result=rounds.manaSurge(room);else return{error:'Unknown command.'};if(!result.error)broadcast(room);return result;
 }});
 const server=http.createServer(async(req,res)=>{
  try{
  const url=new URL(req.url,'http://localhost');
  if(await admin(req,res,url))return;
  if(await music.serve(req,res,url))return;
  if(url.pathname==='/health'){res.writeHead(closing?503:200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:!closing}));}
  if(url.pathname==='/api/leaderboard'&&['GET','HEAD'].includes(req.method)){res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:JSON.stringify({players:scores.standings().map((p,i)=>({...p,avatar:i<3?(rooms.get('ARENA')?.avatars?.[p.id]||null):null})),rules:continuous?{...POINTS,win:0,finish:0,damageCapScope:'life',ranking:'coins',coinsPerKill:COINS_PER_KILL,killBounty:KILL_BOUNTY,participationCoinsPerMinute:PASSIVE_COINS.amount*60000/PASSIVE_COINS.intervalMs}:POINTS}));}
  if(url.pathname==='/api/live'&&['GET','HEAD'].includes(req.method)){
   const online=new Set([...rooms.values()].flatMap(room=>room.players.filter(p=>p.connected).map(p=>p.id)));
   const players=scores.standings().map(({id,name,rank,coins,bestStreak,currentStreak,knockouts,deaths},index)=>({id,name,rank,coins,bestStreak,currentStreak,kills:knockouts,deaths,online:online.has(id),avatar:index<3?(rooms.get('ARENA')?.avatars?.[id]||null):null}));
   res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(req.method==='HEAD'?undefined:JSON.stringify({players,kills,events,map:liveMap.snapshot(rooms.get('ARENA')),round:rounds.snapshot(rooms.get('ARENA')),online:online.size,serverTime:Date.now()}));
  }
  if(closing){res.writeHead(503,{'Retry-After':'2'});return res.end('Server restarting');}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
   const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':['/live','/live/'].includes(url.pathname)?'/live.html':['/admin','/admin/'].includes(url.pathname)?'/admin.html':url.pathname));
   if(!path.startsWith(root)){res.writeHead(403);return res.end();}
   if(extname(path)==='.mp4')return await serveVideo(req,res,path);
   const body=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':url.pathname.startsWith('/vendor/')||url.pathname.startsWith('/models/')?'public, max-age=3600':'no-cache'});res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404);res.end('Not found');}
 });
 const wss=new WebSocketServer({server,path:'/ws',maxPayload:8192,verifyClient:({origin,req})=>!closing&&(!allowedOrigins.length||allowedOrigins.includes(origin)||origin===`https://${req.headers.host}`||origin===`http://${req.headers.host}`)});
 function sendEncoded(ws,payload){
  if(closing||ws.readyState!==WebSocket.OPEN)return;
  // A stalled phone must not accumulate unlimited old snapshots in server memory.
  if(ws.bufferedAmount>maxBufferedBytes){ws.terminate();return;}
  try{ws.send(payload,error=>{if(error)ws.terminate();});}catch{ws.terminate();}
 }
 const send=(ws,msg)=>sendEncoded(ws,JSON.stringify(msg));
 // Poison and skeletons deal damage between hits. Settle it and credit whoever cast it before anything measures health.
 function announceStreak(room,event){if(event)for(const p of room.players)send(p.socket,event);}
 function deactivate(room,player){if(!player.connected)return;participation.pause(player);rememberOrbitalLocation(room,player);rounds.account(room,Date.now());player.connected=false;player.disconnectedAt=Date.now();player.location=null;player.faceReady=false;if(room.economy&&(room.eventRound?.mode||'ffa')!=='ffa'&&room.phase==='playing'){if(!(player.actionLockUntil>Date.now()))player.health=0;player.eliminated=true;if(room.eventRound?.players[player.id])room.eventRound.players[player.id].eliminated=true;}if(room.faces)delete room.faces[player.id];if(room.avatars)delete room.avatars[player.id];for(const p of room.players)if(p.connected){send(p.socket,{type:'faces',faces:{[player.id]:null}});send(p.socket,{type:'avatars',avatars:{[player.id]:null}});}rounds.tick(room);}
 function damageEvent(room,event){if(event.amount>0){const actor=room.players.find(p=>p.id===event.actorId),target=room.players.find(p=>p.id===event.targetId);if(room.economy){if(actor)participation.engage(actor);if(target)participation.engage(target);}if(actor)send(actor.socket,{type:'damage',actorId:event.actorId,targetId:event.targetId,amount:event.amount});}}
 function settleScored(room,now=Date.now()){resolveOrbitals(room,now,dealt=>{damageEvent(room,dealt);announceStreak(room,creditContinuous(room,scores,dealt,event=>recordKill(room,event)));});for(const dealt of settleRoom(room,now)){damageEvent(room,dealt);if(room.continuous)announceStreak(room,creditContinuous(room,scores,dealt,event=>recordKill(room,event)));else recordLingering(room,dealt);}}
 function compactRound(room){
  // Phones already have the avatar cache. Public HTTP snapshots retain portraits.
  const {king,leaders,...round}=rounds.snapshot(room),withoutAvatar=({avatar,...player})=>player;
  return {...round,king:king?withoutAvatar(king):null,leaders:leaders.map(withoutAvatar)};
 }
 function view(room){const now=Date.now();settleScored(room,now);if(room.continuous)finish(room);const board=scores.standings(),byId=new Map(board.map(p=>[p.id,p]));return {music:music.snapshot(),economy:!!room.economy,airstrikes:room.airstrikes||[],enhanced:!!room.enhanced,eventRound:compactRound(room),announcements:events.slice(0,6),leaders:board.filter(p=>room.players.some(a=>a.id===p.id&&a.connected)).slice(0,3).map(({id,name,rank,coins,bestStreak})=>({id,name,rank,coins,bestStreak})),continuous:!!room.continuous,respawnDelayMs,maxPlayers,code:room.code,hostId:room.hostId,phase:room.phase,startsAt:room.startsAt||0,endsAt:room.endsAt,winners:room.winners,results:room.results||null,players:room.players.filter(p=>!room.economy||p.connected).map(({token,socket,disconnectedAt,lastSeen,damageCredit,koScoredLife,deathScoredLife,...p})=>({...p,score:byId.get(p.id)})),shots:room.shots||[],combat:{mana:MANA,spells:SPELLS},serverTime:now};}
 function broadcast(room,event){if(closing)return;liveMap.record(room,event);const state=JSON.stringify({type:'state',room:view(room)}),encodedEvent=event?JSON.stringify(event):null;for(const p of room.players){if(encodedEvent)sendEncoded(p.socket,encodedEvent);sendEncoded(p.socket,state);}}
 // Begins the round once the countdown is over, or returns to the lobby if too few players are still connected.
 function begin(room){
  if(room.phase!=='countdown')return;clearTimeout(room.startTimer);room.startTimer=null;const now=Date.now();
  if(room.players.filter(p=>p.connected).length<2){room.phase='lobby';room.startsAt=0;broadcast(room,{type:'error',message:'Not enough players to start the round.'});return;}
  room.players=room.players.filter(p=>p.connected);
  for(const p of room.players){p.mana=MANA.max;p.manaUpdatedAt=now;p.healthRegenAt=now;}
  startScoring(room);room.phase='playing';room.startsAt=now;room.endsAt=now+180000;broadcast(room,{type:'round-start'});
 }
 // The moment each player is knocked out is what the end-of-round leaderboard ranks by.
 function finish(room){if(room.phase!=='playing')return;if(room.continuous){for(const p of room.players)if(p.life&&(p.faceReady||p.eliminated||p.orbitalKilled)&&p.health<=0&&p.deathScoredLife!==p.life){scores.award(p.id,0,0,1);p.deathScoredLife=p.life;if((room.eventRound?.mode||'ffa')!=='ffa'){p.eliminated=true;p.respawnAt=null;p.poison=null;p.swarm=null;if(room.eventRound?.players[p.id])room.eventRound.players[p.id].eliminated=true;}}rounds.tick(room);if(room.phase!=='playing')return;advanceRespawns(room,Date.now(),respawnDelayMs);const ids=new Set(room.players.map(p=>p.id));for(const p of room.players)for(const id of Object.keys(p.damageCredit||{}))if(!ids.has(id))delete p.damageCredit[id];return;}const moment=Date.now();for(const p of room.scoreRound?.players||room.players)if(p.health<=0&&!p.diedAt)p.diedAt=moment;const alive=room.players.filter(p=>p.health>0);if(alive.length<=1||Date.now()>=room.endsAt){settleScores(room,scores);room.phase='finished';const best=Math.max(...alive.map(p=>p.health),0);room.winners=alive.filter(p=>p.health===best).map(p=>p.id);}}
 // The server owns every arrival deadline. Client reports can wake this same resolver,
 // but cannot shorten flight time or cancel an already locked target.
 const impactTimers=new Map();
 function cancelImpact(shotId){clearTimeout(impactTimers.get(shotId));impactTimers.delete(shotId);}
 function scheduleImpact(room,shot){
  if(closing||!shot?.shotId||impactTimers.has(shot.shotId))return;
  const timer=setTimeout(()=>{impactTimers.delete(shot.shotId);if(!closing)resolveImpact(room,{id:shot.actorId},shot.shotId,true,true);},Math.max(0,shot.impactAt-Date.now()));
  timer.unref();impactTimers.set(shot.shotId,timer);
 }
 function resolveImpact(room,player,shotId,tracked,automatic=false){
  if(closing)return;
  const now=Date.now();settleScored(room,now);finish(room);const shot=(room.shots||[]).find(s=>s.shotId===shotId&&s.actorId===player.id),before=room.players.find(p=>p.id===shot?.targetId)?.health;
  if(!shot)return;
  if(now<shot.impactAt){scheduleImpact(room,shot);return;}
  if(shot.reflected&&!automatic)return;
  const event=impactProjectile(room,player.id,shotId,tracked,now);
  if(!event.error){
   for(const hit of [event,...event.secondaryHits||[]]){
    const healthBefore=hit.secondary?hit.healthBefore:before;
    if(!hit.missed&&!hit.blocked)damageEvent(room,{...hit,amount:healthBefore-(room.players.find(p=>p.id===hit.targetId)?.health??healthBefore)});
    if(room.continuous)announceStreak(room,scoreContinuousHit(room,scores,hit,healthBefore,kill=>recordKill(room,kill)));else recordScore(room,hit,healthBefore);
   }
   if(event.parried)announce(room,{kind:'parry',actorId:event.targetId,text:`${room.players.find(p=>p.id===event.targetId)?.name||'Player'} parried ${SUPER_NAMES[event.spell]&&event.super?SUPER_NAMES[event.spell]:event.spell}`});cancelImpact(shotId);if(event.reflection)scheduleImpact(room,event.reflection);finish(room);broadcast(room,event);return;}
  cancelImpact(shotId);
 }
 wss.on('connection',ws=>{
  ws.on('error',()=>ws.terminate());
  ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);let count=0,windowStart=Date.now();
  const timeout=setTimeout(()=>{if(!clients.has(ws))ws.close(1008,'Join the arena first');},10000);timeout.unref();
  ws.on('message',raw=>{
   try{
    if(Date.now()-windowStart>1000){windowStart=Date.now();count=0;}if(++count>30)return ws.close(1008,'Too many messages');
    const m=JSON.parse(raw);if(!m||typeof m!=='object')return;
    const contact=clients.get(ws);if(contact)contact.player.lastSeen=Date.now();
    if(m.type==='ping')return send(ws,{type:'pong',at:m.at,serverTime:Date.now()});
    if(m.type==='join'){
     if(clients.has(ws))return;
     const name=typeof m.name==='string'?m.name.trim().slice(0,20):'', code='ARENA';
     if(!name)return send(ws,{type:'error',message:'Choose a mage name.'});
     // An older tab sends no persona and keeps the original deck; anything else must be a real persona.
     const persona=m.persona==null?DEFAULT_PERSONA:typeof m.persona==='string'&&Object.hasOwn(PERSONAS,m.persona)?m.persona:null;
     if(!persona)return send(ws,{type:'error',message:'Choose a persona.'});
     let room=rooms.get(code),player;

     if(!room){
      const newCode='ARENA';
      room=ensureArena();
     }
     if(typeof m.token==='string')player=room.players.find(p=>p.token===m.token);
     if(player){
      // The lobby choice of a returning player is honoured, but never once a round is counting down or live, and a tab that sends none changes nothing.
      if(m.persona!=null&&room.phase!=='playing'&&room.phase!=='countdown')player.persona=persona;
      if(player.socket!==ws){clients.delete(player.socket);player.socket.close(4000,'Opened on another connection');}player.socket=ws;player.connected=true;player.lastSeen=Date.now();player.disconnectedAt=null;}
     else{
      if(!continuous&&(room.phase==='playing'||room.phase==='countdown'))return send(ws,{type:'error',message:'A round is running. Join when it finishes.'});
      if(maxPlayers!==null&&room.players.filter(p=>p.connected).length>=maxPlayers)return send(ws,{type:'error',message:`The arena is full (${maxPlayers} players).`});
      if(room.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return send(ws,{type:'error',message:'That mage name is taken. Choose another.'});
      const identity=scores.register(name,m.token);if(identity.error)return send(ws,{type:'error',message:identity.error});
      player={...identity,economy,loadout:scores.loadout(identity.id),lastSeen:Date.now(),persona,waitingForRound:!!continuous&&(room.eventRound?.mode||'ffa')!=='ffa',eliminated:!!room.eventRound?.players?.[identity.id]?.eliminated,health:continuous?0:100,life:0,respawnAt:null,mana:MANA.max,manaUpdatedAt:Date.now(),shieldUntil:0,cooldowns:{},connected:true,shirt:null,socket:ws};room.players.push(player);if(!room.players.some(p=>p.id===room.hostId&&p.connected))room.hostId=player.id;
     }
     clients.set(ws,{room,player});clearTimeout(timeout);send(ws,{type:'welcome',id:player.id,token:player.token,code:room.code});send(ws,{type:'faces',faces:room.faces||{}});send(ws,{type:'avatars',avatars:room.avatars||{}});broadcast(room);return;
    }
    const current=clients.get(ws);if(!current)return;const {room,player}=current;if(!player.connected)return;
    if(m.type==='start'){
     if(continuous)return;
     if(player.id!==room.hostId)return send(ws,{type:'error',message:'Only the host can start a round.'});
     if(room.phase==='playing'||room.phase==='countdown')return;
     room.players=room.players.filter(p=>p.connected);
     if(room.players.length<2)return send(ws,{type:'error',message:'Wait for at least one friend to join.'});
     // Players are identified by a scanned face. Headband samples are still accepted below but no longer needed to start.
     if(room.players.some(p=>!p.faceReady))return send(ws,{type:'error',message:'Every player needs to scan their face first.'});
     room.shots=[];room.results=null;
     for(const p of room.players){p.health=100;p.mana=MANA.max;p.manaUpdatedAt=Date.now();p.cooldowns={};p.shieldUntil=0;p.diedAt=null;p.poison=null;p.swarm=null;p.stunUntil=0;}
     // Every phone counts down to the same server moment, so the round opens for everyone together.
     room.winners=[];room.phase='countdown';room.startsAt=Date.now()+countdownMs;room.endsAt=room.startsAt+180000;
     if(countdownMs>0){broadcast(room,{type:'countdown',startsAt:room.startsAt});room.startTimer=setTimeout(()=>begin(room),countdownMs);room.startTimer.unref();}else begin(room);
    }else if(m.type==='inactive'){deactivate(room,player);broadcast(room);ws.close(1000);
    }else if(m.type==='retire'){
     const now=Date.now();settleScored(room,now);finish(room);const result=retirePlayer(room,player,now,respawnDelayMs);
     if(result.error)send(ws,{type:'error',message:result.error});else{finish(room);broadcast(room);}
    }else if(m.type==='respawn'){const result=requestRespawn(room,player);if(result.error)send(ws,{type:'error',message:result.error});else broadcast(room);
    }else if(m.type==='purchase'){
     const aliveSkillPurchase=(m.kind==='unlock'||m.kind==='upgrade')&&player.health>0&&player.faceReady;
     if(!room.economy||room.phase!=='playing'||(room.eventRound?.mode||'ffa')!=='ffa'||!player.life||(!aliveSkillPurchase&&(player.health>0||!player.respawnAt))||(player.actionLockUntil||0)>Date.now())return send(ws,{type:'error',message:'Shop while waiting to respawn in FFA.'});
     const purchase=scores.purchase(player.id,player.nextPersona||player.persona,m.kind,m.item);if(purchase.error)send(ws,{type:'error',message:purchase.error});else{player.loadout=purchase.loadout;broadcast(room);}
    }else if(m.type==='orbital'){settleScored(room);finish(room);const result=launchOrbital(room,player,m.point);if(result.error)send(ws,{type:'error',message:result.error});else{announce(room,{kind:'orbital',actorId:player.id,text:`${player.name} summoned an Orbital Airstrike!`});broadcast(room,result);}
    }else if(m.type==='persona'){
     settleScored(room);finish(room);const result=selectRespawnPersona(room,player,m.persona);if(result.error)send(ws,{type:'error',message:result.error});else broadcast(room);
    }else if(m.type==='cast'){
     const now=Date.now();settleScored(room,now);finish(room);const before=room.players.find(p=>p.id===m.targetId)?.health;
     const event=(typeof m.spell==='string'&&Object.hasOwn(SPELLS,m.spell)&&SPELLS[m.spell].flightMs)?launchProjectile(room,player.id,m.spell,m.targetId,randomUUID(),now):castSpell(room,player.id,m.spell,m.targetId,now);
     if(event.error)send(ws,{type:'error',message:event.error});else{if(room.economy&&(room.players.some(p=>p.id===event.targetId&&p.id!==player.id&&p.connected&&p.faceReady&&p.health>0)||event.affectedIds?.length))participation.engage(player,now);if(room.economy&&Object.hasOwn(CONSUMABLES,m.spell))scores.saveLoadout(player.id,player.loadout);if(event.super)announce(room,{kind:'super',spell:event.spell,actorId:event.actorId,targetId:event.targetId,text:`${SUPER_NAMES[event.spell]} activated by ${player.name}`});if(room.continuous)announceStreak(room,scoreContinuousHit(room,scores,event,before,kill=>recordKill(room,kill)));else recordScore(room,event,before);if(event.shotId)scheduleImpact(room,event);finish(room);broadcast(room,event);}
    }else if(m.type==='melee'){
     const now=Date.now();settleScored(room,now);finish(room);const before=room.players.find(p=>p.id===m.targetId)?.health;
     const event=resolveMelee(room,player,m,now);
     if(event.error)send(ws,{type:'error',message:event.error});else{
      if(event.damage>0)damageEvent(room,{...event,amount:event.damage});
      if(room.continuous)announceStreak(room,scoreContinuousHit(room,scores,event,before,kill=>recordKill(room,kill)));else recordScore(room,event,before);
      liveMap.record(room,{...event,type:'impact',resolvedAt:now,missed:false},now);finish(room);broadcast(room,event);
     }
    }else if(m.type==='impact'){
     resolveImpact(room,player,m.shotId,m.tracked===true);
    }else if(m.type==='shirt'){
     if(room.phase==='playing')return send(ws,{type:'error',message:'Scan headbands before the round starts.'});
     // The id is re-derived here; a client cannot claim a pair it did not sample.
     const id=profileId(m.profile);
     if(!id)return send(ws,{type:'error',message:'Invalid headband sample. Scan two different stripe colors.'});
     if(room.players.some(p=>p.id!==player.id&&p.shirt?.id===id))return send(ws,{type:'error',message:'Another player already registered that color pair. Use a different headband.'});
     const copy=o=>({bins:[...o.bins],rgb:[...o.rgb]});
     player.shirt={version:2,top:copy(m.profile.top),bottom:copy(m.profile.bottom),id};broadcast(room);
    }else if(m.type==='face'){
     // Face signatures live beside the room, not on the player, so the frequent state broadcast stays small.
     // They are held in memory only and removed when the player leaves or expires.
     if(!continuous&&(room.phase==='playing'||room.phase==='countdown'))return send(ws,{type:'error',message:'Scan your face before the round starts.'});
     if(continuous&&player.faceReady)return send(ws,{type:'error',message:'Your face is already registered.'});
     if(!validEncodedSamples(m.samples)||(m.upper!==undefined&&!validEncodedSamples(m.upper)))return send(ws,{type:'error',message:'That face scan was not readable. Scan again.'});
     // upper: the same scan described from the eyes and forehead only, for players aiming with a phone over their face.
     (room.faces??={})[player.id]={samples:[...m.samples],upper:[...(m.upper||[])]};player.faceReady=true;if(continuous&&room.phase==='playing'&&(room.eventRound?.mode||'ffa')==='ffa'&&!player.life){scores.resetStreak(player.id);spawnPlayer(player);}for(const p of room.players)send(p.socket,{type:'faces',faces:{[player.id]:room.faces[player.id]}});broadcast(room);
    }else if(m.type==='avatar'){
     // The player's map marker. Relayed once like a face signature, kept in memory only, removed when they leave.
     if(!validAvatar(m.image))return send(ws,{type:'error',message:'That photo could not be used as your map marker.'});
     (room.avatars??={})[player.id]=m.image;for(const p of room.players)send(p.socket,{type:'avatars',avatars:{[player.id]:m.image}});
    }else if(m.type==='location'){
     settleScored(room);rememberOrbitalLocation(room,player);
     // Opt-in minimap position; null stops sharing. The 500ms tick broadcasts it.
     if(m.location===null)player.location=null;
     else if(validLocation(m.location)&&Date.now()-(player.location?.at||0)>=500)player.location={latitude:m.location.latitude,longitude:m.location.longitude,accuracy:Math.round(m.location.accuracy),at:Date.now()};
    }else if(m.type==='leave'){
     if(continuous&&room.economy){deactivate(room,player);clients.delete(ws);broadcast(room);ws.close(1000);return;}
     if(continuous){rememberOrbitalLocation(room,player);rounds.account(room,Date.now());player.connected=false;player.disconnectedAt=Date.now();rounds.tick(room);player.location=null;player.faceReady=false;if(room.faces)delete room.faces[player.id];if(room.avatars)delete room.avatars[player.id];clients.delete(ws);for(const p of room.players){send(p.socket,{type:'faces',faces:{[player.id]:null}});send(p.socket,{type:'avatars',avatars:{[player.id]:null}});}finish(room);broadcast(room);ws.close(1000);return;}
     if(room.phase==='playing'&&player.health>0){player.health=0;player.diedAt=Date.now();player.forfeited=true;}if(room.faces)delete room.faces[player.id];if(room.avatars){delete room.avatars[player.id];for(const p of room.players)if(p.id!==player.id)send(p.socket,{type:'avatars',avatars:{[player.id]:null}});}room.players=room.players.filter(p=>p.id!==player.id);clients.delete(ws);if(room.hostId===player.id)room.hostId=room.players.find(p=>p.connected)?.id;finish(room);broadcast(room);ws.close(1000);}
   }catch{send(ws,{type:'error',message:'Invalid request.'});}
  });
  ws.on('close',()=>{const current=clients.get(ws);if(current){rememberOrbitalLocation(current.room,current.player);current.player.location=null;}}); // never keep a disconnected player's position
  ws.on('close',()=>{clearTimeout(timeout);const current=clients.get(ws);if(!current)return;const{room,player}=current;if(room.economy){deactivate(room,player);clients.delete(ws);broadcast(room);return;}rounds.account(room,Date.now());player.connected=false;player.disconnectedAt=Date.now();rounds.tick(room);clients.delete(ws);if(room.hostId===player.id)room.hostId=room.players.find(p=>p.connected)?.id||player.id;broadcast(room);});
 });
 const tick=setInterval(()=>{for(const [code,room]of rooms){for(const p of room.players)if(room.economy&&p.connected&&Date.now()-(p.lastSeen||0)>8000){deactivate(room,p);p.socket.terminate();}resolveOrbitals(room,Date.now(),dealt=>{damageEvent(room,dealt);announceStreak(room,creditContinuous(room,scores,dealt,event=>recordKill(room,event)));});for(const p of room.players)if(!p.connected&&Date.now()-p.disconnectedAt>60000){if(p.health>0&&room.phase==='playing'){p.health=0;p.diedAt=Date.now();p.forfeited=true;}p.expired=true;}room.players=room.players.filter(p=>!p.expired);if(room.faces)for(const id of Object.keys(room.faces))if(!room.players.some(p=>p.id===id))delete room.faces[id];if(room.avatars)for(const id of Object.keys(room.avatars))if(!room.players.some(p=>p.id===id))delete room.avatars[id];if(!room.players.some(p=>p.id===room.hostId&&p.connected))room.hostId=room.players.find(p=>p.connected)?.id||room.players[0]?.id;settleScored(room);finish(room);participation.tick(room,Date.now());for(const shot of [...room.shots||[]])if(Date.now()>=shot.impactAt){const actor=room.players.find(p=>p.id===shot.actorId);if(actor)resolveImpact(room,actor,shot.shotId,true,true);}if(!room.players.length&&!room.continuous){clearTimeout(room.startTimer);rooms.delete(code);continue;}for(const event of expireProjectiles(room))broadcast(room,event);broadcast(room);}},500);tick.unref();
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},15000);heartbeat.unref();
 function close({graceMs=0}={}){
  if(closePromise)return closePromise;
  closing=true;for(const timer of impactTimers.values())clearTimeout(timer);impactTimers.clear();clearInterval(tick);clearInterval(heartbeat);for(const room of rooms.values())clearTimeout(room.startTimer);
  closePromise=new Promise(resolve=>{
   const force=setTimeout(()=>{for(const ws of wss.clients)ws.terminate();server.closeAllConnections();},graceMs);force.unref();
   for(const ws of wss.clients){if(graceMs)ws.close(1012,'Server restarting');else ws.terminate();}
   wss.close();server.close(()=>{clearTimeout(force);void music.dispose().finally(resolve);});
  });return closePromise;
 }
 return {server,rooms,close};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const game=createGameServer({continuous:true,scoreFile:resolve(process.env.DATA_DIR||'data','leaderboard.json')});const port=Number(process.env.PORT||3000);
 game.server.listen(port,'0.0.0.0',()=>console.log(`ClashMIT ready on port ${port}`));
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void game.close({graceMs:3000}).then(()=>process.exit(0));});
}
