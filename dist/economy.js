// Shared presentation/balance data; the server is authoritative for spending and combat.
export const MAX_HEALTH=70,COINS_PER_KILL=30;
export const KILL_BOUNTY=Object.freeze({minimumStreak:5,multiplier:3});
export const CLASS_ATTACKS={mage:['lightning','fireball','meteor'],witch:['poison','skeletonArmy','soulReaper'],archer:['arrows','bombArrow','ballista']};
export const UNLOCK_COST=[0,60,140],UPGRADE_COST=[80,160,240];
export const CONSUMABLES={shield:{name:'Shield',cost:30,duration:7000,cooldown:14000},heal:{name:'Heal',cost:30,amount:50,cooldown:8000},flashbang:{name:'Flashbang',cost:50,duration:3000,radius:10,cooldown:8000}};
export const ATTACKS={
 lightning:{name:'Lightning',upgrade:'Chain Lightning',upgradeMultiHit:{radius:5,maxExtraTargets:2,damageScale:.5},icon:'ϟ',damage:10,upDamage:14,manaCost:2,cooldown:1000,flightMs:250,bypassShield:true,bolt:true,words:['lightning','lighting','light ning','chain lightning','chain lighting']},
 fireball:{name:'Fireball',upgrade:'Wildfire',icon:'✷',damage:25,upDamage:32,manaCost:4,cooldown:2400,flightMs:1400,splash:true,words:['fireball','fire ball','wildfire','wild fire']},
 meteor:{name:'Meteor',upgrade:'Extinction',icon:'☄',damage:60,upDamage:67,manaCost:10,cooldown:15000,flightMs:2000,splash:true,ultimate:true,words:['meteor','meteor strike','extinction']},
 poison:{name:'Poison',upgrade:'Plague',upgradeMultiHit:{radius:5,maxExtraTargets:2,damageScale:.5},icon:'☣',damage:5,upDamage:8,manaCost:1,cooldown:1000,flightMs:500,dot:{perSecond:2,duration:3000},splash:true,words:['poison','plague','poisoning']},
 skeletonArmy:{name:'Skeletons',upgrade:'Bone Legion',icon:'☠',damage:0,upDamage:0,manaCost:4,cooldown:5000,flightMs:1500,swarm:{perSecond:5,duration:5000},upSwarm:{perSecond:7,duration:5000},words:['skeleton army','skeletons','skeleton','bone legion','bone region']},
 soulReaper:{name:'Soul Reaper',upgrade:'Grim Reaper',icon:'♜',damage:60,upDamage:67,manaCost:10,cooldown:15000,flightMs:1800,splash:true,ultimate:true,words:['soul reaper','sole reaper','grim reaper','soul ripper']},
 arrows:{name:'Arrows',upgrade:'Arrow Storm',upgradeMultiHit:{radius:5,maxExtraTargets:2,damageScale:.5},icon:'➶',damage:8,upDamage:12,manaCost:1,cooldown:650,flightMs:450,splash:true,words:['arrows','arrow','arrow storm']},
 bombArrow:{name:'Bomb Arrow',upgrade:'Explosive Arrow',icon:'➹',damage:25,upDamage:32,manaCost:4,cooldown:2400,flightMs:1200,splash:true,words:['bomb arrow','bomb arrows','bombarrow','explosive arrow','explosive arrows']},
 ballista:{name:'Ballista',upgrade:'Railgun',icon:'⌁',damage:60,upDamage:67,manaCost:10,cooldown:15000,flightMs:1700,splash:true,ultimate:true,words:['ballista','ballistic','ballister','railgun','rail gun']}
};
export function freshLoadout(){return{skills:Object.fromEntries(Object.values(CLASS_ATTACKS).map(deck=>[deck[0],1])),consumables:{shield:0,heal:0,flashbang:0}};}
export const attacksFor=persona=>CLASS_ATTACKS[persona]||CLASS_ATTACKS.mage;
export const skillLevel=(player,id)=>player?.loadout?.skills?.[id]||0;
export function ruleFor(player,id){
 if(Object.hasOwn(CONSUMABLES,id))return{...CONSUMABLES[id],manaCost:0,...(id==='flashbang'?{damage:0,stun:CONSUMABLES.flashbang.duration,flash:true}:{})};
 const base=ATTACKS[id];if(!base)return null;const upgraded=skillLevel(player,id)>1;
 return{...base,...(upgraded&&base.upgradeMultiHit?{multiHit:{...base.upgradeMultiHit}}:{}),damage:upgraded?base.upDamage:base.damage,...(upgraded&&base.upSwarm?{swarm:base.upSwarm}:{}),upgraded};
}
export const skillName=(player,id)=>ATTACKS[id]?(skillLevel(player,id)>1?ATTACKS[id].upgrade:ATTACKS[id].name):CONSUMABLES[id]?.name||id;
export const totalDamage=rule=>(rule?.damage||0)+((rule?.dot||rule?.swarm)?.perSecond||0)*((rule?.dot||rule?.swarm)?.duration||0)/1000;
export function wordsFor(player){const words={};for(const id of attacksFor(player?.persona))if(skillLevel(player,id))words[id]=ATTACKS[id].words;for(const id of Object.keys(CONSUMABLES))if((player?.loadout?.consumables?.[id]||0)>0)words[id]=id==='heal'?['heal','heel','health']:id==='shield'?['shield','sheild','shields']:['flashbang','flash bang','flash bank','flashbank','flash bangs','flesh bang'];return words;}
export function shopQuote(loadout,persona,kind,id){
 const deck=attacksFor(persona),index=deck.indexOf(id),level=loadout.skills[id]||0;
 if(kind==='consumable'&&Object.hasOwn(CONSUMABLES,id)){if((loadout.consumables[id]||0)>=99)return{error:'You can carry up to 99 of each item.'};return{cost:CONSUMABLES[id].cost};}
 if(index<0)return{error:'Choose a skill from your current character.'};
 if(kind==='unlock'){if(level)return{error:'Already unlocked.'};if(index===0||!loadout.skills[deck[index-1]])return{error:'Unlock the previous skill first.'};return{cost:UNLOCK_COST[index]};}
 if(kind==='upgrade'){if(!level)return{error:'Unlock this skill first.'};if(level>=2)return{error:'Already fully upgraded.'};return{cost:UPGRADE_COST[index]};}
 return{error:'Unknown purchase.'};
}
