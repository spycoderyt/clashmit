import {COINS_PER_KILL,ATTACKS} from '../dist/economy.js';
import {POINTS} from './scores.js';
// Coin games persist only knockouts; legacy games retain their per-life damage points.
export function creditContinuous(room,store,{actorId,targetId,amount,lethal=false,actorLife,spell,attackName},onKill){
 const actor=room.players.find(p=>p.id===actorId),target=room.players.find(p=>p.id===targetId);
 if(!actor||!target||actor===target||!Number.isFinite(amount)||amount<=0)return;
 const knockout=lethal&&target.koScoredLife!==target.life;
 // Nonlethal damage and repeated lethal reports change no coin statistics. Avoid
 // synchronous leaderboard-file writes on every hit and lingering-damage tick.
 if(room.economy&&!knockout)return;
 let damage=0;
 if(!room.economy){const credit=target.damageCredit??={},previous=credit[actorId]||0;damage=Math.min(amount,Math.max(0,POINTS.damageCap-previous));credit[actorId]=previous+damage;}
 if(knockout)target.koScoredLife=target.life;
 const countStreak=actor.health>0&&(actorLife===undefined||actorLife===actor.life);
 store.award(actorId,room.economy?0:damage*POINTS.damage+(knockout?POINTS.knockout:0),knockout?1:0,0,countStreak,knockout?COINS_PER_KILL:0);
 if(knockout){const score=store.standings().find(p=>p.id===actorId);onKill?.({killer:actor.name,victim:target.name,spell:spell||'unknown',attackName:attackName||ATTACKS[spell]?.name||'an attack',streak:countStreak?score.currentStreak:0,actorId,targetId,coins:COINS_PER_KILL,balance:score.coins});if(countStreak&&score.currentStreak>=3)return{type:'killstreak',actorId,name:actor.name,streak:score.currentStreak};}
}
export function scoreContinuousHit(room,store,event,before,onKill){
 if(event.error||event.missed||event.blocked||!event.targetId||!(before>0))return;
 const target=room.players.find(p=>p.id===event.targetId);if(!target)return;
 return creditContinuous(room,store,{actorId:event.actorId,targetId:target.id,amount:Math.max(0,before-target.health),lethal:target.health<=0,actorLife:event.actorLife,spell:event.spell,attackName:event.attackName},onKill);
}
