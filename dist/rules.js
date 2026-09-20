// Prototype balance: ten whole spendable units; the fractional bar fills one unit every 1.5 seconds.
export const MANA = Object.freeze({max:10,regenPerSecond:2/3});
export const FLIGHT_MS=1400;
export const SPELLS = Object.freeze({
 fireball:{cooldown:1800,damage:25,manaCost:3,flightMs:FLIGHT_MS},
 lightning:{cooldown:2500,damage:20,manaCost:4,flightMs:250,bypassShield:true},
 shield:{cooldown:10000,duration:3000,manaCost:3},
 heal:{cooldown:12000,amount:20,manaCost:4}
});
export function manaAt(player,now=Date.now()){
 const current=Number.isFinite(player.mana)?player.mana:MANA.max;
 const elapsed=Number.isFinite(player.manaUpdatedAt)?Math.max(0,now-player.manaUpdatedAt):0;
 return Math.min(MANA.max,Math.max(0,current)+elapsed*MANA.regenPerSecond/1000);
}
export function replenishMana(player,now=Date.now()){
 player.mana=manaAt(player,now);player.manaUpdatedAt=Math.max(player.manaUpdatedAt??now,now);return player.mana;
}
function prepareCast(room,casterId,spell,targetId,now){
 const actor=room.players.find(p=>p.id===casterId),rule=Object.hasOwn(SPELLS,spell)?SPELLS[spell]:null;
 if(!rule||!actor?.connected||actor.health<=0||room.phase!=='playing')return{error:'Wait for a live round.'};
 if((actor.cooldowns?.[spell]||0)>now)return{error:'That spell is recharging.'};
 let target;
 if(rule.damage){
  target=room.players.find(p=>p.id===targetId);
  if(!target?.connected||target.health<=0||target.id===casterId)return{error:'Aim at an active opponent.'};
 }
 replenishMana(actor,now);
 if(actor.mana+1e-9<rule.manaCost)return{error:`Not enough mana. ${spell[0].toUpperCase()+spell.slice(1)} needs ${rule.manaCost}.`};
 return{actor,rule,target};
}
function spend(actor,spell,rule,now){actor.mana=Math.max(0,actor.mana-rule.manaCost);(actor.cooldowns??={})[spell]=now+rule.cooldown;}
function damage(target,rule,now){
 // Shields reject every damaging spell unless that spell explicitly bypasses them.
 const blocked=target.shieldUntil>now&&!rule.bypassShield;
 if(!blocked)target.health=Math.max(0,target.health-rule.damage);
 return blocked;
}
export function castSpell(room,casterId,spell,targetId,now=Date.now()){
 const cast=prepareCast(room,casterId,spell,targetId,now);if(cast.error)return cast;
 const{actor,rule,target}=cast;spend(actor,spell,rule,now);
 const blocked=target?damage(target,rule,now):false;
 if(spell==='heal')actor.health=Math.min(100,actor.health+rule.amount);
 if(spell==='shield')actor.shieldUntil=now+rule.duration;
 return{type:'spell',spell,actorId:actor.id,targetId:target?.id,blocked,at:now};
}
export function launchProjectile(room,actorId,spell,targetId,shotId,now=Date.now()){
 if(!Object.hasOwn(SPELLS,spell)||!SPELLS[spell].flightMs)return{error:'Choose a projectile spell.'};
 if(typeof shotId!=='string'||!shotId||(room.shots||[]).some(s=>s.shotId===shotId))return{error:'Invalid projectile.'};
 const cast=prepareCast(room,actorId,spell,targetId,now);if(cast.error)return cast;
 const{actor,rule}=cast;spend(actor,spell,rule,now);
 const shot={spell,shotId,actorId,targetId,at:now,flightMs:rule.flightMs,impactAt:now+rule.flightMs,expiresAt:now+rule.flightMs+2100};
 (room.shots??=[]).push(shot);
 return{type:'spell',...shot};
}
export function launchFireball(room,actorId,targetId,shotId,now=Date.now()){
 return launchProjectile(room,actorId,'fireball',targetId,shotId,now);
}
export function impactProjectile(room,actorId,shotId,tracked,now=Date.now()){
 const i=(room.shots||[]).findIndex(s=>s.shotId===shotId&&s.actorId===actorId);
 if(i<0)return{error:'Projectile expired.'};const shot=room.shots[i],rule=SPELLS[shot.spell||'fireball'];
 if(now<shot.impactAt-Math.min(100,shot.flightMs*.1))return{error:'Projectile is still in flight.'};
 room.shots.splice(i,1);const target=room.players.find(p=>p.id===shot.targetId);
 const missed=!tracked||now>shot.expiresAt||room.phase!=='playing'||!target?.connected||target.health<=0;
 const blocked=!missed?damage(target,rule,now):false;
 return{type:'impact',...shot,resolvedAt:now,missed,blocked};
}
export const impactFireball=impactProjectile;
export function expireProjectiles(room,now=Date.now()){
 const expired=(room.shots||[]).filter(s=>now>=s.expiresAt||room.phase!=='playing');
 room.shots=(room.shots||[]).filter(s=>now<s.expiresAt&&room.phase==='playing');
 return expired.map(shot=>({type:'impact',...shot,resolvedAt:now,missed:true,blocked:false}));
}
// End-of-round order: survivors first by remaining health, then everyone knocked out, latest first.
// diedAt is the server time a player reached zero health. Returns [{...player,place}] with place from 1.
export function rankPlayers(players){
 const alive=players.filter(p=>p.health>0).sort((a,b)=>b.health-a.health),out=players.filter(p=>!(p.health>0)).sort((a,b)=>(b.diedAt||0)-(a.diedAt||0));
 return [...alive,...out].map((p,i)=>({...p,place:i+1}));
}
