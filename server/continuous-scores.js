import {POINTS} from './scores.js';
// Damage allowance resets for each target's new life; persistent points are saved as they are earned.
export function creditContinuous(room,store,{actorId,targetId,amount,lethal=false,actorLife}){
 const actor=room.players.find(p=>p.id===actorId),target=room.players.find(p=>p.id===targetId);
 if(!actor||!target||actor===target||!Number.isFinite(amount)||amount<=0)return;
 const credit=target.damageCredit??={},previous=credit[actorId]||0,damage=Math.min(amount,Math.max(0,POINTS.damageCap-previous));credit[actorId]=previous+damage;
 const knockout=lethal&&target.koScoredLife!==target.life;
 if(knockout)target.koScoredLife=target.life;
 const countStreak=actor.health>0&&(actorLife===undefined||actorLife===actor.life);
 store.award(actorId,damage*POINTS.damage+(knockout?POINTS.knockout:0),knockout?1:0,0,countStreak);
 if(knockout&&countStreak){const score=store.standings().find(p=>p.id===actorId);if(score.currentStreak>=3)return{type:'killstreak',actorId,name:actor.name,streak:score.currentStreak};}
}
export function scoreContinuousHit(room,store,event,before){
 if(event.error||event.missed||event.blocked||!event.targetId||!(before>0))return;
 const target=room.players.find(p=>p.id===event.targetId);if(!target)return;
 return creditContinuous(room,store,{actorId:event.actorId,targetId:target.id,amount:Math.max(0,before-target.health),lethal:target.health<=0,actorLife:event.actorLife});
}
