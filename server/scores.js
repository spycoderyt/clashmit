import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {existsSync,readFileSync,mkdirSync,writeFileSync,renameSync} from 'node:fs';
import {dirname} from 'node:path';
import {rankPlayers} from '../dist/rules.js';

export const POINTS=Object.freeze({damage:1,damageCap:100,knockout:50,win:200,finish:25});
const hash=token=>createHash('sha256').update(token).digest('hex');
export function createScoreStore(file=null,{ranking='points'}={}){
 let entries=[],settled=[];
 if(file&&existsSync(file)){
  const data=JSON.parse(readFileSync(file,'utf8'));
  if(data.version!==1||!Array.isArray(data.players)||!Array.isArray(data.settled))throw Error('Invalid leaderboard file');
  entries=data.players.map(p=>({...p,deaths:p.deaths??0,currentStreak:p.currentStreak??0,bestStreak:p.bestStreak??0}));settled=data.settled;
  for(const p of entries)if(typeof p.id!=='string'||typeof p.name!=='string'||typeof p.tokenHash!=='string'||!['points','wins','knockouts','rounds','deaths','currentStreak','bestStreak'].every(k=>Number.isSafeInteger(p[k])&&p[k]>=0))throw Error('Invalid leaderboard player');
 }
 function commit(players,rounds=settled){
  if(file){mkdirSync(dirname(file),{recursive:true});const temp=file+'.tmp';writeFileSync(temp,JSON.stringify({version:1,players,settled:rounds}),{mode:0o600});renameSync(temp,file);}
  entries=players;settled=rounds;
 }
 function find(token){return typeof token==='string'&&token.length<=128?entries.find(p=>p.tokenHash===hash(token)):undefined;}
 function standings(){
  const sorted=entries.map(({id,name,points,wins,knockouts,rounds,deaths=0,currentStreak=0,bestStreak=0})=>({id,name,points,wins,knockouts,rounds,deaths,currentStreak,bestStreak})).sort((a,b)=>(ranking==='killstreak'?b.bestStreak-a.bestStreak:b.points-a.points)||b.knockouts-a.knockouts||a.deaths-b.deaths||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
  let rank=0;return sorted.map((p,i)=>{const prev=sorted[i-1];if(!prev||(ranking==='killstreak'?p.bestStreak!==prev.bestStreak:p.points!==prev.points)||p.knockouts!==prev.knockouts||p.deaths!==prev.deaths)rank=i+1;return {...p,rank};});
 }
 return {find,standings,
  award(id,points,knockouts=0,deaths=0,countStreak=true){
   if(!points&&!knockouts&&!deaths)return;if(![points,knockouts,deaths].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('Invalid score award');
   commit(entries.map(p=>{if(p.id!==id)return p;const currentStreak=deaths?0:(p.currentStreak||0)+(countStreak?knockouts:0);return{...p,points:p.points+points,knockouts:p.knockouts+knockouts,deaths:(p.deaths||0)+deaths,currentStreak,bestStreak:Math.max(p.bestStreak||0,currentStreak)};}));
  },
  resetStreak(id){if(entries.find(p=>p.id===id)?.currentStreak)commit(entries.map(p=>p.id===id?{...p,currentStreak:0}:p));},
  register(name,token){
   const known=find(token);
   if(entries.some(p=>p.id!==known?.id&&p.name.toLowerCase()===name.toLowerCase()))return {error:'That name already has a score. Use your original browser or choose another name.'};
   if(known){if(known.name!==name)commit(entries.map(p=>p.id===known.id?{...p,name}:p));return {id:known.id,token,name};}
   token=randomBytes(24).toString('hex');const player={id:randomUUID(),tokenHash:hash(token),name,points:0,wins:0,knockouts:0,rounds:0,deaths:0,currentStreak:0,bestStreak:0};commit([...entries,player]);return {id:player.id,token,name};
  },
  settle(roundId,awards){
   if(settled.includes(roundId))return;
   const byId=new Map(awards.map(a=>[a.id,a]));
   commit(entries.map(p=>{const a=byId.get(p.id);return a?{...p,points:p.points+a.earnedPoints,wins:p.wins+Number(a.won),knockouts:p.knockouts+a.knockouts,rounds:p.rounds+1}:p;}),[...settled,roundId]);
  }
 };
}
export function startScoring(room){
 room.scoreRound={id:randomUUID(),settled:false,players:room.players.filter(p=>p.connected).map(p=>{p.roundPoints=0;p.roundKnockouts=0;p.forfeited=false;return p;}),damage:new Map(),scoredShots:new Set()};room.results=null;
}
export function recordScore(room,event,healthBefore){
 const round=room.scoreRound;if(!round||round.settled||event.error||event.missed||event.blocked||!event.targetId)return;
 if(event.shotId&&round.scoredShots.has(event.shotId))return;
 const actor=round.players.find(p=>p.id===event.actorId),target=round.players.find(p=>p.id===event.targetId);
 if(!actor||!target||actor===target||!Number.isFinite(healthBefore)||healthBefore<=0)return;
 const actual=Math.max(0,healthBefore-target.health);if(!actual)return;
 if(event.shotId)round.scoredShots.add(event.shotId);
 credit(round,actor,target,actual,target.health<=0);
}
function credit(round,actor,target,actual,knockedOut){
 const key=actor.id+':'+target.id,previous=round.damage.get(key)||0,credited=Math.min(actual,Math.max(0,POINTS.damageCap-previous));round.damage.set(key,previous+credited);
 actor.roundPoints+=credited*POINTS.damage;
 if(knockedOut){actor.roundKnockouts++;actor.roundPoints+=POINTS.knockout;}
}
// Poison and skeletons deal their damage between hits, where no impact event exists to score. `dealt` is one entry
// from settleRoom(); it counts toward the same per-opponent cap, and the point that kills earns the knockout.
export function recordLingering(room,dealt){
 const round=room.scoreRound;if(!round||round.settled||!dealt||!(dealt.amount>0))return;
 const actor=round.players.find(p=>p.id===dealt.actorId),target=round.players.find(p=>p.id===dealt.targetId);
 if(!actor||!target||actor===target)return;
 credit(round,actor,target,dealt.amount,dealt.lethal===true);
}
export function settleScores(room,store){
 const round=room.scoreRound;if(!round||round.settled)return;
 const standing=round.players.filter(p=>p.health>0&&!p.forfeited);
 const winner=standing.length===1&&round.players.length>=2?standing[0].id:null;
 const ranked=rankPlayers(round.players);
 const awards=ranked.map(p=>{const won=p.id===winner,finish=p.forfeited?0:POINTS.finish;return {id:p.id,name:p.name,place:p.place,health:p.health,diedAt:p.diedAt||null,forfeited:!!p.forfeited,damagePoints:p.roundPoints-p.roundKnockouts*POINTS.knockout,knockoutPoints:p.roundKnockouts*POINTS.knockout,finishPoints:finish,winPoints:won?POINTS.win:0,earnedPoints:p.roundPoints+finish+(won?POINTS.win:0),knockouts:p.roundKnockouts,won};});
 store.settle(round.id,awards);round.settled=true;
 const standings=store.standings();room.results={roundId:round.id,winnerId:winner,players:awards.map(a=>{const total=standings.find(p=>p.id===a.id);return {...a,totalPoints:total.points,wins:total.wins,rank:total.rank};})};
 for(const p of round.players)p.roundPoints=awards.find(a=>a.id===p.id).earnedPoints;
}
