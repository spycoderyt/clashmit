import {rankLabel} from './leaderboard.js';
const $=id=>document.getElementById(id),players=$('players'),kills=$('kills'),status=$('connection');
let busy=false,signature='',lastFeed='',hasData=false;
function render(data){
 $('population').textContent=`${data.online} in the arena`;
 const next=JSON.stringify(data.players);
 if(next!==signature){signature=next;players.replaceChildren(...data.players.map(p=>{
  const row=document.createElement('tr');row.dataset.online=String(p.online);
  for(const value of [rankLabel(p.rank),p.name,p.bestStreak,p.kills,p.deaths]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
  return row;
 }));$('board-empty').hidden=data.players.length>0;}
 const feed=JSON.stringify(data.kills);
 if(feed!==lastFeed){const initial=!lastFeed;lastFeed=feed;const existing=new Map([...kills.children].map(el=>[el.dataset.id,el]));kills.replaceChildren(...data.kills.map(k=>{
  if(existing.has(String(k.id)))return existing.get(String(k.id));
  const li=document.createElement('li');li.dataset.id=k.id;if(initial)li.style.animation='none';
  const line=document.createElement('div');line.className='kill-line';
  for(const [cls,value] of [['killer',k.killer],['verb','eliminated'],['victim',k.victim]]){const span=document.createElement('span');span.className=cls;span.textContent=value;line.append(span);}
  const meta=document.createElement('div');meta.className='kill-meta';const time=document.createElement('time');time.dateTime=new Date(k.at).toISOString();time.textContent=new Date(k.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});meta.append(time);
  if(k.streak>0){const streak=document.createElement('span');streak.className='kill-streak';streak.textContent=`${k.streak} kill streak`;meta.append(streak);}
  li.append(line,meta);return li;
 }));$('feed-empty').hidden=data.kills.length>0;}
}
async function refresh(){
 if(busy||document.hidden)return;busy=true;const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),5000);
 try{const response=await fetch('/api/live',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('Unavailable');render(await response.json());hasData=true;status.textContent='Live';status.dataset.state='live';}
 catch{status.textContent=hasData?'Reconnecting · last update shown':'Connecting · retrying';status.dataset.state='retry';}
 finally{clearTimeout(timer);busy=false;}
}
// Explicit demo mode for checking a projector layout without adding fake scores to the arena.
if(new URLSearchParams(location.search).get('demo')==='1'){
 status.textContent='Demo data';status.dataset.state='demo';
 render({online:18,players:['Alex','Leon','John','Gino','Ada','Sam','Kai','Mira'].map((name,i)=>({id:i,name,rank:i+1,bestStreak:12-i,kills:24-i*2,deaths:i+2,online:i!==4})),kills:[['Alex','Leon',8],['John','Gino',3],['Leon','Kai',2],['Mira','Sam',1],['Alex','Ada',7]].map(([killer,victim,streak],i)=>({id:i,at:Date.now()-i*19000,killer,victim,streak}))});
}else{void refresh();setInterval(refresh,1000);document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);}
