import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,extname} from 'node:path';
import {randomBytes,randomUUID} from 'node:crypto';
import {WebSocketServer,WebSocket} from 'ws';
import {castSpell} from '../dist/rules.js';
import {relativePosition} from '../dist/geo.js';

const root=fileURLToPath(new URL('../dist/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml'};
const allowedOrigins=(process.env.ALLOWED_ORIGINS||'').split(',').filter(Boolean);
export function createGameServer(){
 const rooms=new Map(), clients=new Map();
 const server=http.createServer(async(req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/health'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('{"ok":true}');}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  try{
   const path=resolve(root,'.'+decodeURIComponent(url.pathname==='/'?'/index.html':url.pathname));
   if(!path.startsWith(root)){res.writeHead(403);return res.end();}
   const body=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','Cache-Control':extname(path)==='.html'?'no-store':'public, max-age=60'});res.end(req.method==='HEAD'?undefined:body);
  }catch{res.writeHead(404);res.end('Not found');}
 });
 const wss=new WebSocketServer({server,path:'/ws',maxPayload:8192,verifyClient:({origin,req})=>!allowedOrigins.length||allowedOrigins.includes(origin)||origin===`https://${req.headers.host}`||origin===`http://${req.headers.host}`});
 const send=(ws,msg)=>{if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(msg));};
 function view(room){return {code:room.code,hostId:room.hostId,phase:room.phase,endsAt:room.endsAt,winners:room.winners,players:room.players.map(({token,socket,disconnectedAt,...p})=>p),serverTime:Date.now()};}
 function broadcast(room,event){for(const p of room.players){if(event)send(p.socket,event);send(p.socket,{type:'state',room:view(room)});}}
 function finish(room){if(room.phase!=='playing')return;const alive=room.players.filter(p=>p.health>0);if(alive.length<=1||Date.now()>=room.endsAt){room.phase='finished';const best=Math.max(...alive.map(p=>p.health),0);room.winners=alive.filter(p=>p.health===best).map(p=>p.id);}}
 wss.on('connection',ws=>{
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
      if(room.phase==='playing')return send(ws,{type:'error',message:'A round is running. Join when it finishes.'});
      if(room.players.length>=12)return send(ws,{type:'error',message:'The arena is full.'});
      if(room.players.some(p=>p.name.toLowerCase()===name.toLowerCase()))return send(ws,{type:'error',message:'That mage name is taken. Choose another.'});
      player={id:randomUUID(),token:randomBytes(24).toString('hex'),name,health:100,shieldUntil:0,cooldowns:{},connected:true,location:null,socket:ws};room.players.push(player);room.hostId ||=player.id;
     }
     clients.set(ws,{room,player});clearTimeout(timeout);send(ws,{type:'welcome',id:player.id,token:player.token,code:room.code});broadcast(room);return;
    }
    const current=clients.get(ws);if(!current)return;const {room,player}=current;
    if(m.type==='start'){
     if(player.id!==room.hostId)return send(ws,{type:'error',message:'Only the host can start a round.'});
     if(room.phase==='playing')return;
     room.players=room.players.filter(p=>p.connected);
     if(room.players.length<2)return send(ws,{type:'error',message:'Wait for at least one friend to join.'});
     for(const p of room.players){p.health=100;p.cooldowns={};p.shieldUntil=0;}
     room.phase='playing';room.endsAt=Date.now()+180000;room.winners=[];broadcast(room,{type:'round-start'});
    }else if(m.type==='cast'){
     if(m.spell==='fireball'){
      const target=room.players.find(p=>p.id===m.targetId),a=player.location,b=target?.location;
      if(!a||!b||Date.now()-a.at>10000||Date.now()-b.at>10000||a.accuracy>20||b.accuracy>20||relativePosition(a,b).distance>150)return send(ws,{type:'error',message:'Fresh nearby player locations are required.'});
     }
     const event=castSpell(room,player.id,m.spell,m.targetId);if(event.error)send(ws,{type:'error',message:event.error});else{finish(room);broadcast(room,event);}
    }else if(m.type==='location'){
     if(m.location===null)player.location=null;
     else if(Date.now()-(player.location?.at||0)>1000){const l=m.location;if(l&&Number.isFinite(l.latitude)&&Math.abs(l.latitude)<=90&&Number.isFinite(l.longitude)&&Math.abs(l.longitude)<=180&&Number.isFinite(l.accuracy)&&l.accuracy>=0)player.location={latitude:l.latitude,longitude:l.longitude,accuracy:l.accuracy,at:Date.now()};}
    }else if(m.type==='leave'){room.players=room.players.filter(p=>p.id!==player.id);clients.delete(ws);if(room.hostId===player.id)room.hostId=room.players.find(p=>p.connected)?.id;finish(room);broadcast(room);ws.close(1000);}
   }catch{send(ws,{type:'error',message:'Invalid request.'});}
  });
  ws.on('close',()=>{clearTimeout(timeout);const current=clients.get(ws);if(!current)return;const{room,player}=current;player.connected=false;player.location=null;player.disconnectedAt=Date.now();clients.delete(ws);if(room.hostId===player.id)room.hostId=room.players.find(p=>p.connected)?.id||player.id;broadcast(room);});
 });
 const tick=setInterval(()=>{for(const [code,room]of rooms){for(const p of room.players)if(!p.connected&&Date.now()-p.disconnectedAt>60000){p.health=0;p.expired=true;}room.players=room.players.filter(p=>!p.expired);if(!room.players.length){rooms.delete(code);continue;}finish(room);broadcast(room);}},500);tick.unref();
 const heartbeat=setInterval(()=>{for(const ws of wss.clients){if(!ws.isAlive){ws.terminate();continue;}ws.isAlive=false;ws.ping();}},15000);heartbeat.unref();
 return {server,rooms,close:()=>{clearInterval(tick);clearInterval(heartbeat);for(const ws of wss.clients)ws.terminate();wss.close();return new Promise(r=>server.close(r));}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){const game=createGameServer();const port=Number(process.env.PORT||3000);game.server.listen(port,'0.0.0.0',()=>console.log(`Fieldspell ready at http://localhost:${port}`));}
