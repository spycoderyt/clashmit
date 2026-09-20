// Participation pay uses server-accepted combat, not socket heartbeats. This
// stops ordinary AFK income; it does not prove that client input came from a
// human. Ten coins per 30 eligible seconds gives 20 coins per active minute.
export const PASSIVE_COINS=Object.freeze({amount:10,intervalMs:30000,activeWindowMs:60000,maxStepMs:1000,freshMs:8000});

export function createPassiveCoins({credit}={}){
 if(typeof credit!=='function')throw new TypeError('A coin credit function is required.');
 let ledgers=new WeakMap();
 function ledger(player,at){
  let value=ledgers.get(player);
  if(!value){value={lastAt:at,activeFrom:at,activeUntil:-Infinity,eligibleMs:0};ledgers.set(player,value);}
  return value;
 }
 function engage(player,at=Date.now()){
  if(!player||typeof player!=='object'||!Number.isFinite(at))return false;
  const entry=ledger(player,at);if(at<entry.lastAt)return false;
  if(at>=entry.activeUntil)entry.activeFrom=at;
  entry.activeUntil=at+PASSIVE_COINS.activeWindowMs;return true;
 }
 function pause(player,at=Date.now()){
  if(!player||typeof player!=='object'||!Number.isFinite(at))return;
  const entry=ledger(player,at);entry.lastAt=Math.max(entry.lastAt,at);entry.activeFrom=entry.lastAt;entry.activeUntil=-Infinity;
 }
 const fresh=(player,at)=>Number.isFinite(player.lastSeen)&&at-player.lastSeen>=-1000&&at-player.lastSeen<=PASSIVE_COINS.freshMs;
 const present=(player,at)=>player.connected&&player.faceReady&&fresh(player,at)&&!player.waitingForRound&&!player.eliminated;
 function tick(room,at=Date.now()){
  const awards=[];if(!Number.isFinite(at)||!Array.isArray(room?.players))return awards;
  const live=room.players.filter(p=>present(p,at)&&Number.isFinite(p.health)&&p.health>0);
  for(const player of room.players){
   const entry=ledger(player,at);if(at<=entry.lastAt)continue;
   const from=Math.max(entry.lastAt,at-PASSIVE_COINS.maxStepMs,entry.activeFrom);entry.lastAt=at;
   if(!room.economy||room.phase!=='playing'||!present(player,at)){
    entry.activeUntil=-Infinity;continue;
   }
   if(!live.some(p=>p.id!==player.id)||!(player.life>0))continue;
   let until=Math.min(at,entry.activeUntil);
   if(!(player.health>0)){
    // Only the required FFA wait counts. Staying in the shop after it ends
    // gives no income, even if the socket still sends heartbeats.
    if((room.eventRound?.mode||'ffa')!=='ffa'||!Number.isFinite(player.diedAt)||!Number.isFinite(player.respawnAt)||player.respawnAt<=player.diedAt)continue;
    until=Math.min(until,player.respawnAt);
   }
   entry.eligibleMs+=Math.max(0,until-from);
   const payouts=Math.floor(entry.eligibleMs/PASSIVE_COINS.intervalMs);
   if(!payouts)continue;
   const coins=payouts*PASSIVE_COINS.amount;
   credit(player.id,coins);entry.eligibleMs-=payouts*PASSIVE_COINS.intervalMs;awards.push({id:player.id,coins});
  }
  return awards;
 }
 return{engage,pause,tick,reset(){ledgers=new WeakMap();}};
}
