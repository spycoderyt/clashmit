import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {castSpell,launchProjectile,impactProjectile,expireProjectiles,replenishMana,MANA,SPELLS} from '../dist/rules.js';
import {profileId} from '../dist/shirt.js';
import {validLocation} from '../dist/geo.js';
import {validEncodedSamples} from '../dist/face-id.js';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.wasm':'application/wasm'};
const allowedOrigins=(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean);
// countdownMs: how long every phone shows the synchronised countdown before a round begins (0 starts at once).
export function createGameServer({maxPlayers=null,maxBufferedBytes=256*1024,countdownMs=5000}={}){
 if(maxPlayers!==null&&(!Number.isInteger(maxPlayers)||maxPlayers<2))throw new Error('Invalid player capacity');
 let closing=false,closePromise;
 const rooms=new Map(), clients=new Map();
 const server=http.createServer(async(req,res)=>{
  try{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health'){res.writeHead(closing?503:200,{'Content-Type':'application/json','Cache-Control':'no-store'});return res.end(JSON.stringify({ok:!closing}));}
  if(closing){res.writeHead(503,{'Retry-After':'2'});return res.end('Server restarting');}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
   const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!path.startsWith(root)){res.writeHead(403);return res.end();}
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
 function view(room){const now=Date.now();for(const p of room.players)replenishMana(p,now);return {maxPlayers,code:room.code,hostId:room.hostId,phase:room.phase,startsAt:room.startsAt||0,endsAt:room.endsAt,winners:room.winners,players:room.players.map(({token,socket,disconnectedAt,...p})=>p),shots:room.shots||[],combat:{mana:MANA,spells:SPELLS},serverTime:now};}
 function broadcast(room,event){if(closing)return;const state=JSON.stringify({type:'state',room:view(room)}),encodedEvent=event?JSON.stringify(event):null;for(const p of room.players){if(encodedEvent)sendEncoded(p.socket,encodedEvent);sendEncoded(p.socket,state);}}
 // Begins the round once the countdown is over, or returns to the lobby if too few players are still connected.
 function begin(room){
  if(room.phase!=='countdown')return;clearTimeout(room.startTimer);room.startTimer=null;const now=Date.now();
  if(room.players.filter(p=>p.connected).length<2){room.phase='lobby';room.startsAt=0;broadcast(room,{type:'error',message:'Not enough players to start the round.'});return;}
  for(const p of room.players){p.mana=MANA.max;p.manaUpdatedAt=now;}
  room.phase='playing';room.startsAt=now;room.endsAt=now+180000;broadcast(room,{type:'round-start'});
 }
 // The moment each player is knocked out is what the end-of-round leaderboard ranks by.
 function finish(room){if(room.phase!=='playing')return;const moment=Date.now();for(const p of room.players)if(p.health<=0&&!p.diedAt)p.diedAt=moment;const alive=room.players.filter(p=>p.health>0);if(alive.length<=1||Date.now()>=room.endsAt){room.phase='finished';const best=Math.max(...alive.map(p=>p.health),0);room.winners=alive.filter(p=>p.health===best).map(p=>p.id);}}
 wss.on('connection',ws=>{
  ws.on('error',()=>ws.terminate());
  ws.isAlive=true;ws.on('pong',()=>ws.isAlive=true);let count=0,windowStart=Date.now();
  const timeout=setTimeout(()=>{if(!clients.has(ws))ws.close(1008,'Join the arena first');},10000);timeout.unref();
  ws.on('message',raw=>{
   try{
    if(Date.now()-windowStart>1000){windowStart=Date.now();count=0;}if(++count>30)return ws.close(1008,'Too many messages');
    const m=JSON.parse(raw);if(!m||typeof m!=='object')return;
    if(m.type==='ping')return send(ws,{type:'pong',at:m.at,serverTime:Date.now()});
    if(m.type==='join'){
     if(clients.has(ws))return;
     const name=typeof m.name==='string'?m.name.trim().slice(0,20):'', code='ARENA';
     if(!name)return send(ws,{type:'error',message:'Choose a mage name.'});
     let room=rooms.get(code),player;

     if(!room){
      const newCode='ARENA';
      room={code:newCode,players:[],phase:'lobby',hostId:null,endsAt:0,winners:[]};rooms.set(newCode,room);
     }
     if(typeof m.token==='string')player=room.players.find(p=>p.token===m.token);
     if(player){if(player.socket!==ws){clients.delete(player.socket);player.socket.close(4000,'Opened on another connection');}player.socket=ws;player.connected=true;player.disconnectedAt=null;}
     else{
      if(room.phase==='playing'||room.phase==='countdown')return send(ws,{type:'error',message:'A round is running. Join when it finishes.'});
      if(maxPlayers!==null&&room.players.length>=maxPlayers)return send(ws,{type:'error',message:`The arena is full (${maxPlayers} players).`});
      if(room.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return send(ws,{type:'error',message:'That mage name is taken. Choose another.'});
      player={id:randomUUID(),token:randomBytes(24).toString('hex'),name,health:100,mana:MANA.max,manaUpdatedAt:Date.now(),shieldUntil:0,cooldowns:{},connected:true,shirt:null,socket:ws};room.players.push(player);if(!room.players.some(p=>p.id===room.hostId&&p.connected))room.hostId=player.id;
     }
     clients.set(ws,{room,player});clearTimeout(timeout);send(ws,{type:'welcome',id:player.id,token:player.token,code:room.code});send(ws,{type:'faces',faces:room.faces||{}});broadcast(room);return;
    }
    const current=clients.get(ws);if(!current)return;const {room,player}=current;
    if(m.type==='start'){
     if(player.id!==room.hostId)return send(ws,{type:'error',message:'Only the host can start a round.'});
     if(room.phase==='playing'||room.phase==='countdown')return;
     room.players=room.players.filter(p=>p.connected);
     if(room.players.length<2)return send(ws,{type:'error',message:'Wait for at least one friend to join.'});
     // Players are identified by a scanned face. Headband samples are still accepted below but no longer needed to start.
     if(room.players.some(p=>!p.faceReady))return send(ws,{type:'error',message:'Every player needs to scan their face first.'});
     room.shots=[];
     for(const p of room.players){p.health=100;p.mana=MANA.max;p.manaUpdatedAt=Date.now();p.cooldowns={};p.shieldUntil=0;p.diedAt=null;}
     // Every phone counts down to the same server moment, so the round opens for everyone together.
     room.winners=[];room.phase='countdown';room.startsAt=Date.now()+countdownMs;room.endsAt=room.startsAt+180000;
     if(countdownMs>0){broadcast(room,{type:'countdown',startsAt:room.startsAt});room.startTimer=setTimeout(()=>begin(room),countdownMs);room.startTimer.unref();}else begin(room);
    }else if(m.type==='cast'){
     const event=(m.spell==='fireball'||m.spell==='lightning')?launchProjectile(room,player.id,m.spell,m.targetId,randomUUID()):castSpell(room,player.id,m.spell,m.targetId);
     if(event.error)send(ws,{type:'error',message:event.error});else{finish(room);broadcast(room,event);}
    }else if(m.type==='impact'){
     const event=impactProjectile(room,player.id,m.shotId,m.tracked===true);if(!event.error){finish(room);broadcast(room,event);}
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
     if(room.phase==='playing'||room.phase==='countdown')return send(ws,{type:'error',message:'Scan your face before the round starts.'});
     if(!validEncodedSamples(m.samples)||(m.upper!==undefined&&!validEncodedSamples(m.upper)))return send(ws,{type:'error',message:'That face scan was not readable. Scan again.'});
     // upper: the same scan described from the eyes and forehead only, for players aiming with a phone over their face.
     (room.faces??={})[player.id]={samples:[...m.samples],upper:[...(m.upper||[])]};player.faceReady=true;for(const p of room.players)send(p.socket,{type:'faces',faces:{[player.id]:room.faces[player.id]}});broadcast(room);
    }else if(m.type==='location'){
     // Opt-in minimap position; null stops sharing. The 500ms tick broadcasts it.
     if(m.location===null)player.location=null;
     else if(validLocation(m.location)&&Date.now()-(player.location?.at||0)>=500)player.location={latitude:m.location.latitude,longitude:m.location.longitude,accuracy:Math.round(m.location.accuracy),at:Date.now()};
    }else if(m.type==='leave'){if(room.faces)delete room.faces[player.id];room.players=room.players.filter(p=>p.id!==player.id);clients.delete(ws);if(room.hostId===player.id)room.hostId=room.players.find(p=>p.connected)?.id;finish(room);broadcast(room);ws.close(1000);}
   }catch{send(ws,{type:'error',message:'Invalid request.'});}
  });
  ws.on('close',()=>{const current=clients.get(ws);if(current)current.player.location=null;}); // never keep a disconnected player's position
  ws.on('close',()=>{clearTimeout(timeout);const current=clients.get(ws);if(!current)return;const{room,player}=current;player.connected=false;player.disconnectedAt=Date.now();clients.delete(ws);if(room.hostId===player.id)room.hostId=room.players.find(p=>p.connected)?.id||player.id;broadcast(room);});
 });
 const tick=setInterval(()=>{for(const [code,room]of rooms){for(const p of room.players)if(!p.connected&&Date.now()-p.disconnectedAt>60000){p.health=0;p.expired=true;}room.players=room.players.filter(p=>!p.expired);if(room.faces)for(const id of Object.keys(room.faces))if(!room.players.some(p=>p.id===id))delete room.faces[id];if(!room.players.some(p=>p.id===room.hostId&&p.connected))room.hostId=room.players.find(p=>p.connected)?.id||room.players[0]?.id;if(!room.players.length){clearTimeout(room.startTimer);rooms.delete(code);continue;}finish(room);for(const event of expireProjectiles(room))broadcast(room,event);broadcast(room);}},500);tick.unref();
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},15000);heartbeat.unref();
 function close({graceMs=0}={}){
  if(closePromise)return closePromise;
  closing=true;clearInterval(tick);clearInterval(heartbeat);for(const room of rooms.values())clearTimeout(room.startTimer);
  closePromise=new Promise(resolve=>{
   const force=setTimeout(()=>{for(const ws of wss.clients)ws.terminate();server.closeAllConnections();},graceMs);force.unref();
   for(const ws of wss.clients){if(graceMs)ws.close(1012,'Server restarting');else ws.terminate();}
   wss.close();server.close(()=>{clearTimeout(force);resolve();});
  });return closePromise;
 }
 return {server,rooms,close};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 const game=createGameServer();const port=Number(process.env.PORT||3000);
 game.server.listen(port,'0.0.0.0',()=>console.log(`ClashMIT ready on port ${port}`));
 for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{void game.close({graceMs:3000}).then(()=>process.exit(0));});
}
