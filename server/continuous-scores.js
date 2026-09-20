import {COINS_PER_KILL,killReward,ATTACKS,ASSIST_COINS,ASSIST_WINDOW_MS} from '../dist/economy.js';
import {POINTS} from './scores.js';
// Private per-victim-life damage history. It never enters a room snapshot.
const contributions=new WeakMap();
function rememberDamage(target,actor,now){
 let ledger=contributions.get(target);
 if(!ledger||ledger.life!==target.life){ledger={life:target.life,players:new Map()};contributions.set(target,ledger);}
 for(const [id,entry] of ledger.players)if(now-entry.at>ASSIST_WINDOW_MS)ledger.players.delete(id);
 ledger.players.set(actor.id,{at:now,life:actor.life});return ledger;
}
// Coin games persist only rewards; nonlethal damage updates only the assist ledger.
export function creditContinuous(room,store,{actorId,targetId,amount,lethal=false,actorLife,targetLife,spell,attackName,missed,blocked,error},onKill){
 const actor=room.players.find(p=>p.id===actorId),target=room.players.find(p=>p.id===targetId);
 if(error||missed||blocked||!actor||!target||actor===target||!Number.isFinite(amount)||amount<=0||(targetLife!==undefined&&targetLife!==target.life))return;
 const knockout=lethal&&target.koScoredLife!==target.life;
 const now=Date.now();let ledger;
 if(room.economy){
  if(target.koScoredLife===target.life)return;
  // Old-life effects can retain their existing kill credit, but cannot create a new assist.
  if(actorLife===undefined||actorLife===actor.life)ledger=rememberDamage(target,actor,now);
  else ledger=contributions.get(target);
  if(!knockout)return;
 }
 let damage=0;
 if(!room.economy){const credit=target.damageCredit??={},previous=credit[actorId]||0;damage=Math.min(amount,Math.max(0,POINTS.damageCap-previous));credit[actorId]=previous+damage;}
 // Read the victim's saved streak before finish() records their death and resets it.
 const victimStreak=knockout&&room.economy?(store.standings().find(p=>p.id===targetId)?.currentStreak||0):0;
 const coins=knockout?(room.economy?killReward(victimStreak):COINS_PER_KILL):0;
 if(knockout)target.koScoredLife=target.life;
 const countStreak=actor.health>0&&(actorLife===undefined||actorLife===actor.life);
 store.award(actorId,room.economy?0:damage*POINTS.damage+(knockout?POINTS.knockout:0),knockout?1:0,0,countStreak,coins);
 if(knockout){
  const assists=[];
  if(room.economy&&ledger?.life===target.life){
   for(const [id,entry] of ledger.players){
    if(id===actorId||id===targetId||now-entry.at>ASSIST_WINDOW_MS||entry.at>now)continue;
    const contributor=room.players.find(p=>p.id===id);
    if(!contributor)continue;
    store.award(id,0,0,0,false,ASSIST_COINS);
    assists.push({actorId:id,coins:ASSIST_COINS,balance:store.standings().find(p=>p.id===id)?.coins});
   }
   contributions.delete(target);
  }
  const score=store.standings().find(p=>p.id===actorId);onKill?.({killer:actor.name,victim:target.name,spell:spell||'unknown',attackName:attackName||ATTACKS[spell]?.name||'an attack',streak:countStreak?score.currentStreak:0,actorId,targetId,coins,balance:score.coins,...(assists.length?{assists}:{})});if(countStreak&&score.currentStreak>=3)return{type:'killstreak',actorId,name:actor.name,streak:score.currentStreak};}
}
export function scoreContinuousHit(room,store,event,before,onKill){
 if(event.error||event.missed||event.blocked||!event.targetId||!(before>0))return;
 const target=room.players.find(p=>p.id===event.targetId);if(!target)return;
 return creditContinuous(room,store,{actorId:event.actorId,targetId:target.id,amount:Math.max(0,before-target.health),lethal:target.health<=0,actorLife:event.actorLife,targetLife:event.targetLife,spell:event.spell,attackName:event.attackName},onKill);
}
