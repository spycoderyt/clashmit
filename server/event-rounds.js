import {spawnPlayer} from '../dist/respawn.js';
export const KOTH_MS=180000;
const eligible=room=>room.players.filter(p=>p.connected&&p.faceReady&&p.health>0);
export function createEventRounds({announce=()=>{},resetStreak=()=>{},getStandings=()=>[],random=Math.random}={}){
 function remember(room){const round=room.eventRound;if(!round)return;for(const p of room.players)if(p.faceReady&&!round.players[p.id])round.players[p.id]={id:p.id,name:p.name,heldMs:0,kills:0,deaths:0};}
 function account(room,now){const r=room.eventRound;if(!r||room.phase!=='playing')return;remember(room);const until=Math.max(r.lastAt,Math.min(now,r.endsAt||now));if(r.mode==='koth'&&r.kingId&&r.players[r.kingId])r.players[r.kingId].heldMs+=until-r.lastAt;r.lastAt=until;}
 function crown(room,id,now){const r=room.eventRound;if(!r||r.kingId===id)return;r.kingId=id;const p=room.players.find(p=>p.id===id);announce(room,{kind:'crown',actorId:id,text:p?`${p.name} has the crown`:'The crown is waiting for a player',at:now});}
 function standings(room){const r=room.eventRound;if(!r)return[];const ratings=new Map(getStandings().map(p=>[p.id,p.coins]));const rows=Object.values(r.players).map(p=>({...p,coins:ratings.get(p.id)??0})).sort((a,b)=>r.mode==='koth'?b.heldMs-a.heldMs||b.kills-a.kills||a.deaths-b.deaths||a.name.localeCompare(b.name):b.coins-a.coins||b.kills-a.kills||a.deaths-b.deaths||a.name.localeCompare(b.name));let rank=0;return rows.map((p,i)=>{const prev=rows[i-1];if(!prev||(r.mode==='koth'?p.heldMs!==prev.heldMs||p.kills!==prev.kills||p.deaths!==prev.deaths:p.coins!==prev.coins||p.kills!==prev.kills||p.deaths!==prev.deaths))rank=i+1;return{...p,rank,place:rank,avatar:room.avatars?.[p.id]||null};});}
 function end(room,now=Date.now()){
  if(room.phase!=='playing')return{error:'There is no active round.'};account(room,now);room.phase='finished';room.endsAt=now;room.shots=[];room.airstrikes=[];room.modifier=null;for(const p of room.players){p.poison=null;p.swarm=null;p.renewal=null;p.shieldUntil=0;p.superShieldUntil=0;p.manaBoostUntil=0;p.actionLockUntil=0;p.flashUntil=0;}
  const ranked=standings(room),best=ranked[0],meaningful=best&&(room.eventRound.mode==='koth'?best.heldMs>0:ranked.some(p=>p.kills>0)),winners=meaningful?ranked.filter(p=>p.rank===1).map(p=>p.id):[];
  room.winners=winners;room.results={mode:room.eventRound.mode,players:ranked,winnerId:winners.length===1?winners[0]:null,winnerIds:winners};
  announce(room,{kind:'round-end',text:`${room.eventRound.mode==='koth'?'King of the Hill':'FFA'} ended${winners.length?` · ${ranked.filter(p=>winners.includes(p.id)).map(p=>p.name).join(' & ')} ${winners.length===1?'wins':'tie'}`:''}`,at:now});return{};
 }
 function tick(room,now=Date.now()){
  if(!room.eventRound||room.phase!=='playing')return;account(room,now);
  if(room.endsAt>0&&now>=room.endsAt){end(room,room.endsAt);return;}
  if(room.modifier&&now>=room.modifier.endsAt){announce(room,{kind:'modifier-end',text:'Mana surge ended',at:now});room.modifier=null;}
  if(room.eventRound.mode==='koth'&&!eligible(room).some(p=>p.id===room.eventRound.kingId)){const pool=eligible(room);crown(room,pool.length?pool[Math.floor(random()*pool.length)].id:null,now);}
 }
 function start(room,mode='ffa',now=Date.now()){
  if(!['ffa','koth'].includes(mode))return{error:'Choose FFA or King of the Hill.'};
  const ready=room.players.filter(p=>p.connected&&p.faceReady);if(mode==='koth'&&ready.length<2)return{error:'KOTH needs at least two scanned, connected players.'};
  if(room.phase==='playing'&&room.eventRound)end(room,now);
  room.continuous=true;room.directed=true;room.enhanced=true;room.phase='playing';room.startsAt=now;room.endsAt=mode==='koth'?now+KOTH_MS:0;room.results=null;room.winners=[];room.shots=[];room.airstrikes=[];room.modifier=null;
  room.eventRound={id:now,mode,endsAt:room.endsAt,kingId:null,lastAt:now,players:{}};
  for(const p of room.players){p.poison=null;p.swarm=null;p.renewal=null;p.respawnAt=null;p.revengeTargetId=null;p.manaBoostUntil=0;p.actionLockUntil=0;p.flashUntil=0;p.eliminated=false;p.waitingForRound=false;if(p.connected&&p.faceReady){spawnPlayer(p,now);resetStreak(p.id);}else{p.health=0;p.life=0;}}
  remember(room);announce(room,{kind:'round-start',text:mode==='koth'?'King of the Hill started · hold the crown for the most time in 3 minutes':'FFA started · the arena is open',at:now});tick(room,now);return{};
 }
 function kill(room,{actorId,targetId},now=Date.now()){
  const r=room.eventRound;if(!r||room.phase!=='playing')return;account(room,now);if(r.players[actorId])r.players[actorId].kills++;if(r.players[targetId]){r.players[targetId].deaths++;if(r.mode!=='ffa')r.players[targetId].eliminated=true;}
  if(r.mode==='koth'&&r.kingId===targetId){const actor=eligible(room).find(p=>p.id===actorId);crown(room,actor?.id||null,now);tick(room,now);}
 }
 function manaSurge(room,now=Date.now()){if(room.phase!=='playing')return{error:'Start a round first.'};room.modifier={id:'manaSurge',endsAt:now+20000};for(const p of room.players)p.manaBoostUntil=now+20000;announce(room,{kind:'modifier',text:'Mana surge · double mana regeneration for 20 seconds',at:now});return{};}
 function snapshot(room){if(!room)return{mode:'ffa',phase:'playing',endsAt:0,king:null,leaders:[],modifier:null};const r=room.eventRound,king=room.players.find(p=>p.id===r?.kingId);return{mode:r?.mode||'ffa',phase:room.phase,startsAt:room.startsAt||0,endsAt:room.endsAt||0,king:king?{id:king.id,name:king.name,avatar:room.avatars?.[king.id]||null}:null,leaders:standings(room).slice(0,3),modifier:room.modifier||null};}
 return{start,end,tick,kill,account,manaSurge,snapshot,standings};
}
