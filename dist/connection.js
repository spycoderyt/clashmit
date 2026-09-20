// One active socket, no queued/replayed casts, and a fresh join deadline per attempt.
export function createGameConnection({url,join,onMessage=()=>{},onStatus=()=>{},onDisconnect=()=>{},onError=()=>{},WebSocketImpl=globalThis.WebSocket,random=Math.random,connectTimeoutMs=7000,heartbeatMs=3000,silenceMs=12000,retryBaseMs=800,maxRetryMs=5000}){
 let socket=null,active=false,ready=false,attempt=0,reconnectTimer,deadline,heartbeat,lastReceived=0;
 const clearTimers=()=>{clearTimeout(reconnectTimer);clearTimeout(deadline);clearInterval(heartbeat);};
 function discard(){
  const old=socket;socket=null;ready=false;clearTimers();
  if(old){old.onopen=old.onmessage=old.onclose=old.onerror=null;try{old.close();}catch{}}
 }
 function retry(){
  if(!active)return;
  discard();onDisconnect();onStatus('reconnecting');
  const delay=Math.min(maxRetryMs,retryBaseMs*2**Math.min(attempt++,8))*(.8+.4*random());
  reconnectTimer=setTimeout(connect,delay);
 }
 function stop(){active=false;discard();}
 function connect(){
  if(!active)return;
  clearTimers();onStatus(attempt?'reconnecting':'connecting');
  let ws;try{ws=new WebSocketImpl(url());}catch(e){stop();onError(e.message);return;}
  socket=ws;ready=false;
  const current=()=>active&&socket===ws;
  deadline=setTimeout(()=>{if(current()&&!ready)retry();},connectTimeoutMs);
  ws.onopen=()=>{
   if(!current())return;
   lastReceived=Date.now();
   try{ws.send(JSON.stringify(join()));}catch{retry();}
  };
  ws.onmessage=event=>{
   if(!current())return;
   let message;try{message=JSON.parse(event.data);}catch{return;}
   if(!message||typeof message!=='object')return;
   lastReceived=Date.now();
   if(message.type==='error'&&!ready){stop();onDisconnect();onError(message.message||'Could not join the arena.');return;}
   if(message.type==='welcome'){
    ready=true;attempt=0;clearTimeout(deadline);clearInterval(heartbeat);onStatus('connected');
    heartbeat=setInterval(()=>{
     if(!current())return;
     if(Date.now()-lastReceived>silenceMs){retry();return;}
     send({type:'ping',at:Date.now()});
    },heartbeatMs);
   }
   onMessage(message);
  };
  ws.onerror=()=>{if(current())retry();};
  ws.onclose=event=>{
   if(!current())return;
   if([1008,1009,4000].includes(event.code)){
    stop();onDisconnect();onError(event.code===4000?'This player was opened in another tab.':event.reason||'Connection rejected. Please rejoin.');
   }else retry();
  };
 }
 function send(message){
  if(!active||!ready||socket?.readyState!==1)return false;
  try{socket.send(JSON.stringify(message));return true;}catch{retry();return false;}
 }
 return{
  start(){stop();active=true;attempt=0;connect();},stop,send,
  get ready(){return active&&ready&&socket?.readyState===1;},
  // Mobile browsers throttle timers while backgrounded. Recheck immediately on return.
  check(){if(active&&(!socket||socket.readyState>1||(ready&&Date.now()-lastReceived>silenceMs))){discard();onDisconnect();connect();}}
 };
}
