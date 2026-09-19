// Gameplay runs independently of WebGL and requestAnimationFrame.
export function createFlight({startedAt,flightMs=1400,lossGraceMs=700}){
 let lastSeen=startedAt,lost=false,done=false;
 return{step(now,tracked,active=true){
  if(done)return null;
  if(!active){done=true;return{tracked:false,cancelled:true};}
  if(now-lastSeen>lossGraceMs)lost=true;
  if(tracked)lastSeen=now;
  if(now-startedAt<flightMs)return null;
  done=true;return{tracked:!lost&&tracked,cancelled:false};
 }};
}
