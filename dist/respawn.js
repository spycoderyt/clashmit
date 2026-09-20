import {MAX_HEALTH} from './economy.js';
import {MANA,PERSONAS} from './rules.js?v=regen1';
export const RESPAWN_MS=10000;
export const respawnSeconds=(at,now)=>Math.max(0,Math.ceil((at-now)/1000));
// The server must settle damage that is already due before it ends this life.
// Keep the same player object, socket, face scan, and saved loadout for the shop.
export function retirePlayer(room,player,now=Date.now(),delay=RESPAWN_MS){
 if(!room.continuous||!player.connected||!player.faceReady||!player.life)return{error:'Join the arena before you open the respawn menu.'};
 if(room.phase!=='playing'&&player.health>0)return{error:'Wait for the next round.'};
 const retired=player.health>0;
 player.health=0;player.koScoredLife=player.life;
 player.poison=null;player.swarm=null;player.renewal=null;player.shieldUntil=0;player.superShieldUntil=0;player.shieldStartedAt=null;player.stunUntil=0;player.flashUntil=0;player.actionLockUntil=0;player.airstrikeCharges=0;
 room.shots=(room.shots||[]).filter(s=>s.actorId!==player.id&&s.targetId!==player.id);
 room.airstrikes=(room.airstrikes||[]).filter(s=>s.actorId!==player.id);
 for(const other of room.players)for(const effect of ['poison','swarm'])if(other[effect]?.by===player.id)other[effect]=null;
 if((room.eventRound?.mode||'ffa')==='ffa'){
  if(!player.respawnAt){player.diedAt=now;player.respawnAt=now+delay;}
 }else{
  player.diedAt??=now;player.respawnAt=null;player.eliminated=true;
  if(room.eventRound?.players?.[player.id])room.eventRound.players[player.id].eliminated=true;
 }
 return{retired};
}
export function spawnPlayer(player,now=Date.now()){
 if(player.nextPersona&&Object.hasOwn(PERSONAS,player.nextPersona))player.persona=player.nextPersona;delete player.nextPersona;player.eliminated=false;player.waitingForRound=false;
 player.life=(player.life||0)+1;player.health=player.economy?MAX_HEALTH:100;player.orbitalKilled=false;player.airstrikeCharges=0;player.actionLockUntil=0;player.flashUntil=0;player.mana=MANA.max;player.manaUpdatedAt=now;player.healthRegenAt=now;
 player.castCounts={};player.shieldStartedAt=null;player.superShieldUntil=0;player.renewal=null;player.shieldUntil=0;player.cooldowns={};player.poison=null;player.swarm=null;player.stunUntil=0;player.diedAt=null;player.respawnAt=null;player.damageCredit={};
}
export function advanceRespawns(room,now=Date.now(),delay=RESPAWN_MS){
 const spawned=[];if((room.eventRound?.mode||'ffa')!=='ffa')return spawned;
 for(const p of room.players){
  if(!p.faceReady||!p.life||p.health>0)continue;
  if(!p.respawnAt){p.diedAt=now;p.respawnAt=now+delay;p.poison=null;p.swarm=null;p.shieldUntil=0;p.stunUntil=0;
   for(const shot of room.shots||[])if(shot.actorId===p.id||shot.targetId===p.id)shot.expiresAt=Math.min(shot.expiresAt,now);
  }
  if(!room.economy&&p.connected&&now>=p.respawnAt){spawnPlayer(p,now);spawned.push(p.id);}
 }
 return spawned;
}

export function selectRespawnPersona(room,player,persona,now=Date.now()){
 if(!room.continuous||(room.eventRound?.mode||'ffa')!=='ffa'||room.phase!=='playing'||player.health>0||!player.faceReady||!player.life||!player.respawnAt||(!room.economy&&!(player.respawnAt>now)))return{error:'You can change character during the FFA respawn countdown.'};
 if(typeof persona!=='string'||!Object.hasOwn(PERSONAS,persona))return{error:'Choose Mage, Witch, or Archer.'};
 player.nextPersona=persona;return{};
}

export function requestRespawn(room,player,now=Date.now()){if(!room.economy||room.phase!=='playing'||(room.eventRound?.mode||'ffa')!=='ffa'||!player.connected||!player.faceReady||player.health>0||!player.respawnAt||now<player.respawnAt||(player.actionLockUntil||0)>now)return{error:'Wait for the respawn countdown.'};spawnPlayer(player,now);return{};}
