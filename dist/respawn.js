import {MANA} from './rules.js?v=regen1';
export const RESPAWN_MS=10000;
export const respawnSeconds=(at,now)=>Math.max(0,Math.ceil((at-now)/1000));
export function spawnPlayer(player,now=Date.now()){
 player.life=(player.life||0)+1;player.health=100;player.mana=MANA.max;player.manaUpdatedAt=now;player.healthRegenAt=now;
 player.shieldUntil=0;player.cooldowns={};player.poison=null;player.swarm=null;player.stunUntil=0;player.diedAt=null;player.respawnAt=null;player.damageCredit={};
}
export function advanceRespawns(room,now=Date.now(),delay=RESPAWN_MS){
 const spawned=[];
 for(const p of room.players){
  if(!p.faceReady||!p.life||p.health>0)continue;
  if(!p.respawnAt){p.diedAt=now;p.respawnAt=now+delay;p.poison=null;p.swarm=null;p.shieldUntil=0;p.stunUntil=0;
   for(const shot of room.shots||[])if(shot.actorId===p.id||shot.targetId===p.id)shot.expiresAt=Math.min(shot.expiresAt,now);
  }
  if(p.connected&&now>=p.respawnAt){spawnPlayer(p,now);spawned.push(p.id);}
 }
 return spawned;
}
