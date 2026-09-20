// Motion/face overlap is a client claim, like projectile tracking. Damage,
// identity, life freshness, shields, replay protection and timing are authoritative.
export const MELEE=Object.freeze({damage:5,cooldownMs:1000});
const histories=new WeakMap();
export function resolveMelee(room,actor,message,now=Date.now()){
 if(!Number.isFinite(now)||room.phase!=='playing'||!actor||!room.players.includes(actor)||!actor.connected||!actor.faceReady||actor.health<=0||actor.eliminated||actor.waitingForRound)return{error:'Wait for a live round.'};
 const target=room.players.find(p=>p.id===message?.targetId);
 if(!target||target===actor||!target.connected||!target.faceReady||target.health<=0||target.eliminated||target.waitingForRound)return{error:'Aim at an active opponent.'};
 if(!Number.isSafeInteger(message.actorLife)||message.actorLife<1||!Number.isSafeInteger(message.targetLife)||message.targetLife<1||message.actorLife!==actor.life||message.targetLife!==target.life)return{error:'That sword swing belongs to an earlier life.'};
 const match=typeof message.hitId==='string'&&/^([1-9]\d{0,9}):([1-9]\d{0,11})$/.exec(message.hitId);
 if(!match||Number(match[1])!==actor.life)return{error:'Invalid sword swing.'};
 const sequence=Number(match[2]);let history=histories.get(actor);
 if(!history||history.life!==actor.life){history={life:actor.life,lastSequence:0,nextAt:0};histories.set(actor,history);}
 if(sequence<=history.lastSequence)return{error:'That sword swing was already processed.'};
 // Even a rejected cooldown/stun attempt cannot be replayed later as a new gesture.
 history.lastSequence=sequence;
 if((actor.stunUntil||0)>now||(actor.flashUntil||0)>now)return{error:"You're stunned."};
 if((actor.actionLockUntil||0)>now)return{error:'Actions are currently locked.'};
 if(now<history.nextAt)return{error:'Your sword is recharging.',cooldownRemaining:history.nextAt-now};
 history.nextAt=now+MELEE.cooldownMs;
 const blocked=target.shieldUntil>now,damage=blocked?0:Math.min(MELEE.damage,target.health);
 target.health-=damage;
 return{type:'melee',spell:'melee',attackName:'Sword',actorId:actor.id,targetId:target.id,actorLife:actor.life,targetLife:target.life,hitId:message.hitId,damage,blocked,at:now};
}
