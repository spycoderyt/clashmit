import {relativePosition,validLocation} from './geo.js';
import {ATTACKS,CONSUMABLES,attacksFor,ruleFor,skillLevel,skillName,MAX_HEALTH} from './economy.js';
import {isSuperReady,upgradedRule,SUPER_NAMES} from './supers.js';
// Prototype balance: ten whole spendable units; the fractional bar fills one unit every 1.5 seconds.
export const MANA = Object.freeze({max:10,regenPerSecond:2/3});
export const HEALTH_REGEN=Object.freeze({amount:5,intervalMs:8000,max:100});
export const FLIGHT_MS=1400;
export const SPELLS = Object.freeze({
 ...ATTACKS,flashbang:{...CONSUMABLES.flashbang,damage:0,manaCost:0,flash:true},
 fireball:{cooldown:1800,damage:25,manaCost:3,flightMs:FLIGHT_MS,splash:true},
 lightning:{cooldown:2500,damage:20,manaCost:4,flightMs:250,bypassShield:true},
 // The army marches like a projectile; landing it starts damage that needs no further tracking.
 skeletonArmy:{cooldown:9000,damage:0,manaCost:4,flightMs:1500,bypassShield:true,swarm:{perSecond:5,duration:6000}},
 poison:{cooldown:2500,damage:5,manaCost:3,flightMs:1200,splash:true,dot:{perSecond:3,duration:5000}}, // 20 in total: 5 on impact, 15 lingering
 arrows:{cooldown:600,damage:10,manaCost:1,flightMs:500,splash:true},
 zap:{cooldown:1500,damage:8,manaCost:2,flightMs:150,bypassShield:true,stun:500},
 shield:{cooldown:10000,duration:3000,manaCost:3},
 heal:{cooldown:12000,amount:20,manaCost:4}
});
// Two signature attacks plus the shared shield and heal: one attack a shield blocks and one it cannot,
// so every persona faces the same choice against a shielded opponent. Slot order is fixed: blockable, unblockable, shield, heal. A player with no persona plays the original deck.
export const DEFAULT_PERSONA='mage';
export const PERSONAS = Object.freeze({
 mage:Object.freeze(['fireball','lightning','shield','heal']),
 witch:Object.freeze(['poison','skeletonArmy','shield','heal']),
 archer:Object.freeze(['arrows','zap','shield','heal'])
});
export const personaOf=player=>Object.hasOwn(PERSONAS,player?.persona)?player.persona:DEFAULT_PERSONA;
export const deckOf=player=>player?.economy?[...attacksFor(personaOf(player)),'shield','heal','flashbang']:PERSONAS[personaOf(player)];
export const piercerOf=deck=>deck.find(spell=>SPELLS[spell].bypassShield)||null;
export function manaAt(player,now=Date.now()){
 const current=Number.isFinite(player.mana)?player.mana:MANA.max;
 const elapsed=Number.isFinite(player.manaUpdatedAt)?Math.max(0,now-player.manaUpdatedAt):0;
 const boosted=Number.isFinite(player.manaUpdatedAt)?Math.max(0,Math.min(now,player.manaBoostUntil||0)-player.manaUpdatedAt):0;
 return Math.min(MANA.max,Math.max(0,current)+(elapsed+boosted)*MANA.regenPerSecond/1000);
}
export function replenishMana(player,now=Date.now()){
 player.mana=manaAt(player,now);player.manaUpdatedAt=Math.max(player.manaUpdatedAt??now,now);return player.mana;
}
// Whole points fall due against the effect's own clock, so any settling cadence totals the same damage.
// `dealt`, when given, collects what was taken and by whom, so damage done between hits can still be credited.
function bleed(player,key,now,dealt){
 const effect=player[key];if(!effect)return;
 const due=Math.floor((Math.min(now,effect.until)-effect.startedAt)*effect.perSecond/1000)-effect.applied;
 if(due>0){const amount=Math.min(due,player.health);player.health-=amount;effect.applied+=due;if(amount>0)dealt?.push({actorId:effect.by,targetId:player.id,amount,lethal:player.health<=0,...(effect.spell?{spell:effect.spell,attackName:effect.attackName}:{}),...(Number.isFinite(effect.life)?{actorLife:effect.life}:{})});}
 if(now>=effect.until||player.health<=0)player[key]=null;
}
const lingering=(rule,now,by,life,shot)=>({by,...(shot?.spell?{spell:shot.spell,attackName:shot.attackName}:{}),...(Number.isFinite(life)?{life}:{}),perSecond:rule.perSecond,startedAt:now,until:now+rule.duration,applied:0});
function applyPoison(target,rule,now,by,life,shot){
 // A weak area hit must not lower active poison damage or take its kill credit.
 // Keep its original expiry too; weak hits cannot extend a stronger effect.
 if(target.poison?.until>now&&target.poison.perSecond>rule.perSecond)return;
 target.poison=lingering(rule,now,by,life,shot);
}
// Who to name for a knock-out that no impact announced: the caster of the lingering damage that was on the
// player when last seen alive. With both on them, the skeletons out-damage the poison and most likely landed it.
export function lingeringKiller(before){
 const worst=[before?.swarm,before?.poison].filter(Boolean).sort((a,b)=>b.perSecond-a.perSecond)[0];return worst?.by||null;
}
export function settle(player,now=Date.now(),dealt){
 replenishMana(player,now);
 // Resolve each Renewal tick after damage due at that instant; delayed server ticks cannot revive a player.
 const renewal=player.renewal;
 if(renewal){while(renewal.at+1000<=Math.min(now,renewal.until)&&player.health>0){renewal.at+=1000;settleHealth(player,renewal.at,dealt);if(player.health>0&&player.connected!==false)player.health=Math.min(player.economy?MAX_HEALTH:100,player.health+3);}if(now>=renewal.until||player.health<=0)player.renewal=null;}
 settleHealth(player,now,dealt);return player;
}
function settleHealth(player,now,dealt){
 const {amount,intervalMs}=HEALTH_REGEN,max=player.economy?MAX_HEALTH:HEALTH_REGEN.max;
 if(Number.isFinite(player.healthRegenAt)){
  // Resolve ongoing damage before each heal boundary so late ticks cannot revive a dead player
  // or change the result compared with frequent ticks. Full health never banks unused healing.
  let next=player.healthRegenAt+intervalMs;
  while(next<=now&&player.health>0&&(player.poison||player.swarm)){
   bleed(player,'poison',next,dealt);bleed(player,'swarm',next,dealt);
   if(player.health>0&&player.connected!==false)player.health=Math.min(max,player.health+amount);
   player.healthRegenAt=next;next+=intervalMs;
  }
  const ticks=Math.max(0,Math.floor((now-player.healthRegenAt)/intervalMs));
  if(ticks){if(player.health>0&&player.connected!==false)player.health=Math.min(max,player.health+ticks*amount);player.healthRegenAt+=ticks*intervalMs;}
 }
 bleed(player,'poison',now,dealt);bleed(player,'swarm',now,dealt);return player;
}
// Returns the lingering damage just dealt as [{actorId,targetId,amount,lethal}]. A server that scores should settle
// with the same `now` it then passes to a cast or an impact, so nothing is dealt unseen inside those calls.
export function settleRoom(room,now=Date.now()){
 const dealt=[];
 for(const p of room.players){if(room.phase==='playing'&&(p.actionLockUntil||0)<=now){const at=room.endsAt>0?Math.min(now,room.endsAt):now;p.healthRegenAt??=at;settle(p,at,dealt);}else{replenishMana(p,now);p.healthRegenAt=now;p.poison=null;p.swarm=null;}}
 return dealt;
}
function prepareCast(room,casterId,spell,targetId,now){
 const actor=room.players.find(p=>p.id===casterId),superCast=!room.economy&&!!room.enhanced&&isSuperReady(actor,spell),rule=Object.hasOwn(SPELLS,spell)?(room.economy?ruleFor(actor,spell):upgradedRule(spell,SPELLS[spell],superCast)):null;
 // Lingering damage is settled first so a dead or freshly cleared caster is judged correctly; mana waits until the cast is otherwise valid.
 if(actor&&room.phase==='playing'){bleed(actor,'poison',now);bleed(actor,'swarm',now);}
 if(!rule||!actor?.connected||actor.health<=0||(room.continuous&&!actor.faceReady)||room.phase!=='playing')return{error:'Wait for a live round.'};
 if((actor.actionLockUntil||0)>now)return{error:'Orbital airstrike incoming — actions locked.'};
 if(room.economy){if(Object.hasOwn(CONSUMABLES,spell)){if(!(actor.loadout?.consumables?.[spell]>0))return{error:'Buy this consumable after you die.'};}else if(!skillLevel(actor,spell))return{error:'Unlock that skill in the respawn shop.'};}
 if(!deckOf(actor).includes(spell))return{error:'Not in your deck.'};
 if((actor.stunUntil||0)>now)return{error:"You're stunned."};
 if((actor.cooldowns?.[spell]||0)>now)return{error:'That spell is recharging.'};
 let target;
 if(rule.damage||rule.flightMs){
  target=room.players.find(p=>p.id===targetId);
  if(!target?.connected||target.health<=0||(room.continuous&&!target.faceReady)||target.id===casterId){
   // Skeletons are on the caster, not across the field: splash may be spent on them with nobody locked.
   if(rule.splash&&actor.swarm)target=null;else return{error:'Aim at an active opponent.'};
  }
 }
 replenishMana(actor,now);
 if(actor.mana+1e-9<rule.manaCost)return{error:`Not enough mana. ${spell[0].toUpperCase()+spell.slice(1)} needs ${rule.manaCost}.`};
 return{actor,rule,target,superCast};
}
function spend(actor,spell,rule,now,room){if(room.economy&&Object.hasOwn(CONSUMABLES,spell))actor.loadout.consumables[spell]--;if(room.enhanced&&!room.economy)(actor.castCounts??={})[spell]=((actor.castCounts?.[spell]||0)+1)%3;actor.mana=Math.max(0,actor.mana-rule.manaCost);(actor.cooldowns??={})[spell]=now+rule.cooldown;}
function damage(target,rule,now,spell){
 // Shields reject every damaging spell unless that spell explicitly bypasses them.
 const blocked=target.shieldUntil>now&&(target.economy?spell!=='lightning':(!rule.bypassShield||(target.superShieldUntil>now&&spell!=='lightning')));
 if(!blocked)target.health=Math.max(0,target.health-rule.damage);
 return blocked;
}
export function castSpell(room,casterId,spell,targetId,now=Date.now()){
 // Resolving these instantly would drop the poison, swarm or stun they exist to deliver.
 if(Object.hasOwn(SPELLS,spell)&&(SPELLS[spell].dot||SPELLS[spell].swarm||SPELLS[spell].stun))return{error:'That spell must be thrown.'};
 const cast=prepareCast(room,casterId,spell,targetId,now);if(cast.error)return cast;
 const{actor,rule,target,superCast}=cast;
 if(room.economy&&spell==='heal'&&actor.health>=MAX_HEALTH)return{error:'You are at full health.'};
 if(spell==='flashbang'){
  const fresh=p=>validLocation(p.location)&&Number.isFinite(p.location.at)&&now-p.location.at>=-1000&&now-p.location.at<=10000;
  if(!fresh(actor))return{error:'Waiting for a fresh location before using Flashbang.'};
  const nearby=room.players.filter(p=>p.id!==actor.id&&p.connected&&p.health>0&&(!room.continuous||p.faceReady)&&fresh(p)&&relativePosition(actor.location,p.location).distance<=rule.radius);
  spend(actor,spell,rule,now,room);const affectedIds=[],blockedIds=[];
  for(const p of nearby){if(p.shieldUntil>now){blockedIds.push(p.id);continue;}p.flashUntil=Math.max(p.flashUntil||0,now+rule.duration);p.stunUntil=Math.max(p.stunUntil||0,now+rule.duration);affectedIds.push(p.id);}
  return{type:'spell',spell,actorId:actor.id,affectedIds,blockedIds,radius:rule.radius,duration:rule.duration,at:now};
 }
 spend(actor,spell,rule,now,room);
 const blocked=target?damage(target,rule,now,spell):false;
 let healedAmount;
 if(spell==='heal'){const before=actor.health;actor.health=Math.min(actor.economy?MAX_HEALTH:100,actor.health+rule.amount);healedAmount=Math.max(0,actor.health-before);if(rule.regeneration)actor.renewal={at:now,until:now+5000};}
 if(spell==='shield'){actor.shieldUntil=now+rule.duration;if(room.enhanced)actor.shieldStartedAt=now;if(superCast||room.economy){actor.superShieldUntil=actor.shieldUntil;actor.poison=null;actor.swarm=null;}}
 return{type:'spell',spell,attackName:room.economy?skillName(actor,spell):(superCast?SUPER_NAMES[spell]:null)||ATTACKS[spell]?.name||spell,...(superCast?{super:true}:{}),...(spell==='heal'?{healedAmount}:{}),actorId:actor.id,targetId:target?.id,blocked,at:now};
}
export function launchProjectile(room,actorId,spell,targetId,shotId,now=Date.now()){
 if(!Object.hasOwn(SPELLS,spell)||!SPELLS[spell].flightMs)return{error:'Choose a projectile spell.'};
 if(typeof shotId!=='string'||!shotId||(room.shots||[]).some(s=>s.shotId===shotId))return{error:'Invalid projectile.'};
 const cast=prepareCast(room,actorId,spell,targetId,now);if(cast.error)return cast;
 const{actor,rule,target,superCast}=cast;spend(actor,spell,rule,now,room);
 const clearedSwarm=rule.splash&&actor.swarm?true:undefined;if(clearedSwarm)actor.swarm=null;
 if(!target)return{type:'spell',spell,...(superCast?{super:true}:{}),actorId,clearedSwarm,at:now};
 const shot={spell,attackName:room.economy?skillName(actor,spell):(superCast?SUPER_NAMES[spell]:null)||ATTACKS[spell]?.name||spell,...(room.economy?{economy:true,upgraded:rule.upgraded,attackRule:{damage:rule.damage||0,dot:rule.dot,swarm:rule.swarm,stun:rule.stun,flash:rule.flash,multiHit:rule.multiHit?{...rule.multiHit}:undefined,bypassShield:rule.bypassShield,flightMs:rule.flightMs}}:{}),...(superCast?{super:true}:{}),shotId,actorId,targetId,...(room.continuous?{actorLife:actor.life,targetLife:target.life}:{}),at:now,flightMs:rule.flightMs,impactAt:now+rule.flightMs,expiresAt:now+rule.flightMs+2100};
 (room.shots??=[]).push(shot);
 return{type:'spell',...shot,clearedSwarm};
}
export function launchFireball(room,actorId,targetId,shotId,now=Date.now()){
 return launchProjectile(room,actorId,'fireball',targetId,shotId,now);
}
export function impactProjectile(room,actorId,shotId,tracked,now=Date.now()){
 const i=(room.shots||[]).findIndex(s=>s.shotId===shotId&&s.actorId===actorId);
 if(i<0)return{error:'Projectile expired.'};const shot=room.shots[i],rule=shot.attackRule||upgradedRule(shot.spell||'fireball',SPELLS[shot.spell||'fireball'],shot.super);
 if(now<shot.impactAt-Math.min(100,shot.flightMs*.1))return{error:'Projectile is still in flight.'};
 room.shots.splice(i,1);const target=room.players.find(p=>p.id===shot.targetId);
 // Damage already owed is paid before this hit is judged: a target it has killed cannot be hit, and a refreshed effect must not swallow it.
 if(target&&room.phase==='playing'){bleed(target,'poison',now);bleed(target,'swarm',now);}
 const actor=room.players.find(p=>p.id===actorId),staleLife=room.continuous&&(!actor?.faceReady||!target?.faceReady||actor.health<=0||actor.life!==shot.actorLife||target.life!==shot.targetLife);
 // Target identity is locked at launch; camera visibility after casting cannot cancel a paid spell.
 const missed=staleLife||(target?.actionLockUntil||0)>now||(actor?.actionLockUntil||0)>now||!actor?.connected||actor.health<=0||now>shot.expiresAt||room.phase!=='playing'||!target?.connected||target.health<=0;
 const canBlock=target?.economy?shot.spell!=='lightning':!rule.bypassShield||(target?.superShieldUntil>now&&shot.spell!=='lightning');
 const parried=!!room.enhanced&&!missed&&!shot.reflected&&canBlock&&target.shieldUntil>now&&Number.isFinite(target.shieldStartedAt)&&now-target.shieldStartedAt>=0&&now-target.shieldStartedAt<=350;
 const blocked=parried||(!missed?damage(target,rule,now,shot.spell):false);
 let reflection;
 if(parried){reflection={...shot,shotId:shot.shotId+':return',actorId:target.id,targetId:actor.id,actorLife:target.life,targetLife:actor.life,reflected:true,at:now,flightMs:450,impactAt:now+450,expiresAt:now+1800};room.shots.push(reflection);}
 if(!missed&&!blocked){
  if(rule.dot)applyPoison(target,rule.dot,now,shot.actorId,shot.actorLife,shot);
  if(rule.swarm)target.swarm=lingering(rule.swarm,now,shot.actorId,shot.actorLife,shot);
  if(rule.stun)target.stunUntil=now+rule.stun;if(rule.flash)target.flashUntil=now+rule.stun;
 }
 const secondaryHits=[];
 if(!missed&&!blocked&&!shot.reflected&&rule.multiHit){
  const fresh=p=>validLocation(p?.location)&&Number.isFinite(p.location.at)&&now-p.location.at>=-1000&&now-p.location.at<=10000;
  if(fresh(target)){
   const nearby=room.players.filter(p=>p.id!==actorId&&p.id!==target.id&&p.connected&&p.health>0&&(!room.continuous||p.faceReady)&&!(p.actionLockUntil>now)&&fresh(p))
    .map(p=>({p,distance:relativePosition(target.location,p.location).distance})).filter(x=>x.distance<=rule.multiHit.radius)
    .sort((a,b)=>a.distance-b.distance||a.p.id.localeCompare(b.p.id)).slice(0,rule.multiHit.maxExtraTargets);
   const secondaryRule={...rule,damage:rule.damage*rule.multiHit.damageScale,multiHit:undefined,...(rule.dot?{dot:{...rule.dot,perSecond:rule.dot.perSecond*rule.multiHit.damageScale}}:{})};
   for(const {p} of nearby){
    const healthBefore=p.health,blocked=damage(p,secondaryRule,now,shot.spell);
    if(!blocked&&secondaryRule.dot)applyPoison(p,secondaryRule.dot,now,actorId,shot.actorLife,shot);
    secondaryHits.push({type:'impact',...shot,shotId:`${shot.shotId}:extra:${p.id}`,primaryTargetId:target.id,targetId:p.id,targetLife:p.life,attackRule:secondaryRule,secondary:true,healthBefore,resolvedAt:now,missed:false,blocked});
   }
  }
 }
 return{type:'impact',...shot,resolvedAt:now,missed,blocked,...(parried?{parried:true,reflection}: {}),...(secondaryHits.length?{secondaryHits}:{})};
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
// Players knocked out since the last look: `before` maps player id to the health seen previously.
// Someone seen for the first time already at zero is not news, so they are not reported.
export function newlyOut(before,players){return players.filter(p=>!(p.health>0)&&before.get(p.id)>0);}
