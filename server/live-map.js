import {validAvatar} from '../dist/face-id.js';
import {randomUUID} from 'node:crypto';
const TTL=8000,MAX_CASTS=80;
function point(value){return value&&Number.isFinite(value.latitude)&&Math.abs(value.latitude)<=90&&Number.isFinite(value.longitude)&&Math.abs(value.longitude)<=180?{latitude:value.latitude,longitude:value.longitude}:null;}
function location(player,now){const p=point(player?.location);return p&&Number.isFinite(player.location.at)&&now-player.location.at<=15000&&player.location.at<=now+1000?{...p,accuracy:player.location.accuracy,at:player.location.at}:null;}
// Spectators do not join the arena. Keep short-lived geographic snapshots so a
// fast spell is not lost between HTTP polls. Portraits use the current avatar cache;
// no video frames or recognition descriptors are included.
export function createLiveMap(){
 const rooms=new WeakMap();const epoch=randomUUID();let sequence=0;
 function buffer(room,now){let casts=rooms.get(room);if(!casts){casts=[];rooms.set(room,casts);}while(casts.length&&(now-casts[0].at>TTL||casts.length>MAX_CASTS))casts.shift();return casts;}
 function record(room,event,now=Date.now()){
  if(!room||!event)return;const casts=buffer(room,now);
  if(event.type==='orbital'){
   const s=event.strike,to=point(s?.point);if(!s||!to)return;
   casts.push({id:`${epoch}:${++sequence}`,kind:'orbital',actorId:s.actorId,targetId:null,spell:'orbital',at:s.startsAt??now,flightMs:Math.max(0,(s.endsAt??now)-(s.startsAt??now)),from:point(location(room.players.find(p=>p.id===s.actorId),now)),to,point:to,radius:s.radius});
  }else if(['spell','impact'].includes(event.type)){
   const from=point(location(room.players.find(p=>p.id===event.actorId),now)),to=event.targetId?point(location(room.players.find(p=>p.id===event.targetId),now)):from;
   if(from&&to)casts.push({id:`${epoch}:${++sequence}`,kind:event.type,actorId:event.actorId,targetId:event.targetId??null,spell:event.spell,at:event.type==='impact'?(event.resolvedAt??now):(event.at??now),flightMs:event.type==='spell'?(event.flightMs??0):0,from,to,radius:event.radius,missed:!!event.missed,blocked:!!event.blocked});
   for(const hit of event.secondaryHits||[])record(room,hit,now);
   if(event.reflection)record(room,{...event.reflection,type:'spell'},now);
  }
  while(casts.length>MAX_CASTS)casts.shift();
 }
 function snapshot(room,now=Date.now()){
  if(!room)return{players:[],casts:[]};
  const players=room.players.filter(p=>p.connected&&p.faceReady&&p.health>0).flatMap(p=>{const fix=location(p,now);return fix?[{id:p.id,name:p.name,persona:p.persona,health:p.health,avatar:validAvatar(room.avatars?.[p.id])?room.avatars[p.id]:null,location:fix}]:[];});
  return{players,casts:[...buffer(room,now)]};
 }
 return{record,snapshot};
}
