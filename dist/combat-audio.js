import {validLocation} from './geo.js';
import {inOrbitalZone,ORBITAL} from './orbital-rules.js';
export const hearsFlashbang=(event,myId)=>event?.type==='spell'&&event.spell==='flashbang'&&(event.actorId===myId||event.affectedIds?.includes(myId)===true);
// Each strike owns its audio, so escaping does not cut off another spell.
export function createOrbitalAudio({audio,now=Date.now,getLocation=()=>null}){
 const seen=new Set(),active=new Map();let myId=null;
 function tick(){const at=now(),loc=getLocation();for(const [id,entry] of active){
  if(at>=entry.strike.endsAt){active.delete(id);continue;}
  const fresh=validLocation(loc)&&Number.isFinite(loc.at)&&at-loc.at>=0&&at-loc.at<=ORBITAL.freshMs;
  if(entry.strike.actorId===myId||!fresh)continue;
  const inside=inOrbitalZone(entry.strike,loc,at);if(entry.wasInside&&!inside){audio.stop(entry.key);active.delete(id);}else entry.wasInside ||= inside;
 }}
 return{sync(strikes,id){myId=id;const at=now();for(const strike of strikes||[]){if(seen.has(strike.id)||!(strike.endsAt>at))continue;seen.add(strike.id);if(seen.size>200)seen.delete(seen.values().next().value);const key=`orbital:${strike.id}`,loc=getLocation(),inside=!!loc&&inOrbitalZone(strike,loc,at),warned=strike.victims?.some(p=>p.id===id);const entry={strike,key,wasInside:inside||!!warned};active.set(strike.id,entry);void audio.play('orbital','cast',{key,offsetSeconds:Math.max(0,(at-strike.startsAt)/1000)});}tick();},tick,clear(){for(const entry of active.values())audio.stop(entry.key);active.clear();seen.clear();audio.stop('orbital');}};
}
