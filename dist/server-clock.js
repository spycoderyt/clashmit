// Estimate server time at the midpoint of a ping's round trip. Prefer the least
// delayed sample; snapshots only bootstrap, so their delivery time cannot keep
// moving an already running spell's deadline.
export function createServerClock(clock=()=>Date.now()){
 let offset=0,bestRtt=Infinity,bootstrapped=false;
 return{
  now:()=>clock()+offset,
  bootstrap(serverTime){if(!bootstrapped&&Number.isFinite(serverTime)){offset=serverTime-clock();bootstrapped=true;}},
  pong(serverTime,sentAt,receivedAt=clock()){
   const rtt=receivedAt-sentAt;
   if(!Number.isFinite(serverTime)||!Number.isFinite(sentAt)||!Number.isFinite(receivedAt)||rtt<0||rtt>10000||rtt>bestRtt)return false;
   bestRtt=rtt;offset=serverTime-(sentAt+receivedAt)/2;bootstrapped=true;return true;
  },
  reset(){offset=0;bestRtt=Infinity;bootstrapped=false;}
 };
}
