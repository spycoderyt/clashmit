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
