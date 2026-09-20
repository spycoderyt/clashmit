export const SUPER_EVERY=3;
export const SUPER_NAMES=Object.freeze({fireball:'Wildfire',lightning:'Thunderstorm',arrows:'Arrow Rain',poison:'Plague',skeletonArmy:'The Horde',zap:'Overload',shield:'Aegis',heal:'Renewal'});
const upgrades={fireball:{damage:40},lightning:{damage:35,flightMs:550},arrows:{damage:24,flightMs:800},poison:{damage:10,dot:{perSecond:5,duration:6000}},skeletonArmy:{swarm:{perSecond:7,duration:6000}},zap:{damage:16,stun:750},shield:{duration:5000},heal:{amount:35,regeneration:true}};
export const superProgress=(player,spell)=>(player?.castCounts?.[spell]||0)%SUPER_EVERY;
export const isSuperReady=(player,spell)=>superProgress(player,spell)===SUPER_EVERY-1;
export const upgradedRule=(spell,rule,superCast)=>superCast?{...rule,...upgrades[spell]}:rule;
