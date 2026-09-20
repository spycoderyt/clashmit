import {randomUUID} from 'node:crypto';
import {validLocation} from '../dist/geo.js';
import {ORBITAL,inOrbitalZone} from '../dist/orbital-rules.js';
export {ORBITAL};
export function launchOrbital(room,actor,point,now=Date.now()){
 if((actor.stunUntil||0)>now)return{error:'You are stunned.'};
 if(!room.economy||room.phase!=='playing'||!actor.connected||!actor.faceReady||actor.health<=0||!(actor.airstrikeCharges>0))return{error:`Earn a ${ORBITAL.streakStep}-kill streak to summon an airstrike.`};
 if(!validLocation({...point,accuracy:0})||!actor.location||now-actor.location.at>ORBITAL.freshMs)return{error:'Wait for a fresh location fix.'};
 const strike={id:randomUUID(),spell:'orbital',attackName:'Orbital Airstrike',actorId:actor.id,actorLife:actor.life,name:actor.name,avatar:room.avatars?.[actor.id]||null,point:{latitude:point.latitude,longitude:point.longitude},radius:ORBITAL.radius,victims:[],startsAt:now,endsAt:now+ORBITAL.durationMs};
 strike.victims=room.players.filter(p=>p.id!==actor.id&&p.connected&&p.faceReady&&p.health>0&&inOrbitalZone(strike,p.location,now)).map(p=>({id:p.id,life:p.life,location:{...p.location}}));
 actor.airstrikeCharges--;(room.airstrikes??=[]).push(strike);return{type:'orbital',strike};
}
// Preserve the last fix when a warned player closes their phone. Disconnecting
// cannot erase a pending strike, but a recorded escape remains an escape.
export function rememberOrbitalLocation(room,player){
 if(!player.location)return;
 for(const strike of room.airstrikes||[]){const v=strike.victims.find(v=>v.id===player.id&&v.life===player.life);if(v)v.location={...player.location};}
}
export function resolveOrbitals(room,now=Date.now(),onKill=()=>{}){
 const due=(room.airstrikes||[]).filter(s=>now>=s.endsAt);room.airstrikes=(room.airstrikes||[]).filter(s=>now<s.endsAt&&room.phase==='playing');if(room.phase!=='playing')return[];
 const hits=[];
 for(const strike of due)for(const p of room.players){
  if(p.id===strike.actorId||p.health<=0)continue;
  const warned=strike.victims.find(v=>v.id===p.id&&v.life===p.life);
  const location=p.location||warned?.location;
  if((!p.connected||!p.faceReady)&&!warned)continue;
  if(!inOrbitalZone(strike,location,strike.endsAt))continue;
  const amount=p.health;p.health=0;p.orbitalKilled=true;p.poison=null;p.swarm=null;
  const hit={spell:strike.spell||'orbital',attackName:strike.attackName||'Orbital Airstrike',actorId:strike.actorId,actorLife:strike.actorLife,targetId:p.id,amount,lethal:true};hits.push(hit);onKill(hit);
 }
 return hits;
}
