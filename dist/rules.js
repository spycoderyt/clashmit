export const SPELLS = Object.freeze({fireball:{cooldown:1800,damage:25},shield:{cooldown:10000,duration:3000},heal:{cooldown:12000,amount:20}});
export function castSpell(room, casterId, spell, targetId, now = Date.now()) {
  const actor=room.players.find(p=>p.id===casterId), rule=Object.hasOwn(SPELLS,spell)?SPELLS[spell]:null;
  if(!rule || !actor || !actor.connected || actor.health<=0 || room.phase!=='playing') return {error:'Wait for a live round.'};
  if((actor.cooldowns[spell]||0)>now) return {error:'That spell is recharging.'};
  let target;
  if(spell==='fireball') {
    target=room.players.find(p=>p.id===targetId);
    if(!target || target.id===casterId || !target.connected || target.health<=0) return {error:'Aim at an active opponent.'};
    if(target.shieldUntil<=now) target.health=Math.max(0,target.health-rule.damage);
  }
  if(spell==='heal') actor.health=Math.min(100,actor.health+rule.amount);
  if(spell==='shield') actor.shieldUntil=now+rule.duration;
  actor.cooldowns[spell]=now+rule.cooldown;
  return {type:'spell',spell,actorId:actor.id,targetId:target?.id,blocked:!!target&&target.shieldUntil>now,at:now};
}

export const FLIGHT_MS=1400;
export function launchFireball(room,actorId,targetId,shotId,now=Date.now()){
 const actor=room.players.find(p=>p.id===actorId),target=room.players.find(p=>p.id===targetId);
 if(room.phase!=='playing'||!actor?.connected||actor.health<=0)return{error:'Wait for a live round.'};
 if((actor.cooldowns.fireball||0)>now)return{error:'That spell is recharging.'};
 if(!target?.connected||target.health<=0||targetId===actorId)return{error:'Aim at an active opponent.'};
 actor.cooldowns.fireball=now+SPELLS.fireball.cooldown;
 const shot={shotId,actorId,targetId,at:now,flightMs:FLIGHT_MS};(room.shots??=[]).push(shot);
 return{type:'spell',spell:'fireball',...shot};
}
export function impactFireball(room,actorId,shotId,tracked,now=Date.now()){
 const i=(room.shots||[]).findIndex(s=>s.shotId===shotId&&s.actorId===actorId);
 if(i<0)return{error:'Projectile expired.'};const shot=room.shots[i];
 if(now<shot.at+FLIGHT_MS-100)return{error:'Projectile is still in flight.'};
 room.shots.splice(i,1);const target=room.players.find(p=>p.id===shot.targetId);
 const missed=!tracked||now>shot.at+3500||room.phase!=='playing'||!target?.connected||target.health<=0;
 const blocked=!missed&&target.shieldUntil>now;
 if(!missed&&!blocked)target.health=Math.max(0,target.health-SPELLS.fireball.damage);
 return{type:'impact',...shot,missed,blocked};
}
