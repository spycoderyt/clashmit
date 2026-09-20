import {createLiveMap} from './live-map.js?v=map1';
import {COINS_PER_KILL} from './economy.js';
import {rankLabel} from './leaderboard.js';
const $=id=>document.getElementById(id),players=$('players'),kills=$('kills'),status=$('connection');
const liveMap=createLiveMap($('live-map'),{onCount:count=>$('map-count').textContent=count?`${count} on the map`:'Waiting for locations'});
let busy=false,signature='',lastFeed='',hasData=false,roundSignature='',refreshTimer=0,requestController=null;
function render(data){
 data={...data,players:data.players||[],kills:data.kills||[]};liveMap.update(data.map||{},data.serverTime||Date.now());
 const r=data.round||{mode:'ffa',phase:'playing'},seconds=Math.max(0,Math.ceil(((r.endsAt||0)-(data.serverTime||Date.now()))/1000));$('mode').textContent=`${r.mode==='koth'?'King of the Hill':'FFA'} · ${r.phase==='playing'?(r.endsAt?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:'Live'):'Ended'}${r.modifier&&r.modifier.endsAt>data.serverTime?' · Mana surge':''}`;
 const announcement=(data.events||[]).find(e=>e.kind!=='kill'&&data.serverTime-e.at<10000);$('announcement').textContent=announcement?.text||'';
 const roundKey=JSON.stringify([r.mode,r.king,r.leaders]);if(roundKey!==roundSignature){roundSignature=roundKey;const box=$('round-leaders');box.replaceChildren();if(r.mode==='koth'){const title=document.createElement('p');title.textContent=r.king?`👑 ${r.king.name} has the crown`:'Crown time';box.append(title);for(const p of r.leaders||[]){const line=document.createElement('p');if(p.avatar){const img=document.createElement('img');img.src=p.avatar;img.alt='';line.append(img);}line.append(document.createTextNode(`${p.name} · ${(p.heldMs/1000).toFixed(1)}s`));box.append(line);}}}
 $('population').textContent=`${data.online} in the arena`;
 const next=JSON.stringify(data.players);
 if(next!==signature){signature=next;players.replaceChildren(...data.players.map(p=>{
  const row=document.createElement('tr');row.dataset.online=String(p.online);
  for(const value of [rankLabel(p.rank),p.name,p.coins??0,p.kills,p.deaths]){const cell=document.createElement('td');cell.textContent=value;if(row.children.length===1&&p.avatar?.startsWith('data:image/jpeg;base64,')){const img=document.createElement('img');img.src=p.avatar;img.alt='';img.className='board-avatar';cell.prepend(img);}row.append(cell);}
  return row;
 }));$('board-empty').hidden=data.players.length>0;}
 const feed=JSON.stringify(data.kills);
 if(feed!==lastFeed){const initial=!lastFeed;lastFeed=feed;const existing=new Map([...kills.children].map(el=>[el.dataset.id,el]));kills.replaceChildren(...data.kills.map(k=>{
  if(existing.has(String(k.id)))return existing.get(String(k.id));
  const li=document.createElement('li');li.dataset.id=k.id;if(initial)li.style.animation='none';
  const line=document.createElement('div');line.className='kill-line';
  for(const [cls,value] of [['killer',k.killer],['verb','killed'],['victim',k.victim],['verb',`using ${k.attackName||'an attack'}`]]){const span=document.createElement('span');span.className=cls;span.textContent=value;line.append(span);}
  const meta=document.createElement('div');meta.className='kill-meta';const time=document.createElement('time');time.dateTime=new Date(k.at).toISOString();time.textContent=new Date(k.at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',second:'2-digit'});meta.append(time);if(Number.isFinite(k.coins)){const change=document.createElement('span');change.className='kill-streak';change.textContent=`+${k.coins} coins`;meta.append(change);}
  if(k.streak>0){const streak=document.createElement('span');streak.className='kill-streak';streak.textContent=`${k.streak} kill streak`;meta.append(streak);}
  li.append(line,meta);return li;
 }));$('feed-empty').hidden=data.kills.length>0;}
}
const demoMode=new URLSearchParams(location.search).get('demo')==='1',demoStart=Date.now();
const demoNames=['Alex','Leon','John','Gino','Ada','Sam','Kai','Mira'];
function demoData(){
 const now=Date.now(),time=(now-demoStart)/1000;
 const mapped=demoNames.map((name,i)=>({id:i,name,persona:['mage','witch','archer'][i%3],health:[70,50,30,60,20,70,40,60][i],location:{latitude:42.36015+(Math.sin(i*1.3)*.00024)+Math.sin(time*.1+i)*.00002,longitude:-71.09415+Math.cos(i*1.3)*.00032+Math.cos(time*.12+i)*.00002,accuracy:5,at:now}}));
 const index=Math.floor((now-demoStart)/1800),spells=['fireball','lightning','poison','arrows','shield','heal','meteor','orbital'],casts=[];
 for(let n=Math.max(0,index-5);n<=index;n++){
  const spell=spells[n%spells.length],actor=mapped[n%mapped.length],target=mapped[(n+3)%mapped.length],from={...actor.location},to=['shield','heal'].includes(spell)?from:{...target.location};
  casts.push({id:`demo-${n}`,actorId:actor.id,targetId:target.id,spell,at:demoStart+n*1800,flightMs:spell==='orbital'?5000:spell==='lightning'?250:spell==='meteor'?2000:1400,from,to,kind:spell==='orbital'?'orbital':'spell',...(spell==='orbital'?{radius:10,point:to}:{})});
 }
 return{serverTime:now,online:8,round:{mode:'ffa',phase:'playing'},players:demoNames.map((name,i)=>({id:i,name,rank:i+1,coins:1020-i*97,bestStreak:12-i,kills:24-i*2,deaths:i+2,online:true})),kills:[['Alex','Leon',8],['John','Gino',3],['Leon','Kai',2],['Mira','Sam',1],['Alex','Ada',7]].map(([killer,victim,streak],i)=>({id:i,at:demoStart-i*19000,killer,victim,streak,coins:COINS_PER_KILL,attackName:['Wildfire','Chain Lightning','Arrows','Poison','Meteor'][i]})),map:{players:mapped,casts}};
}
async function refresh(){
 if(busy||document.hidden)return;busy=true;const started=performance.now();let abortTimer;
 try{
  if(demoMode){render(demoData());status.textContent='Demo data';status.dataset.state='demo';}
  else{
   requestController=new AbortController();abortTimer=setTimeout(()=>requestController?.abort(),4000);
   const response=await fetch('/api/live',{cache:'no-store',signal:requestController.signal});if(!response.ok)throw Error('Unavailable');
   const data=await response.json();if(document.hidden)return;render(data);hasData=true;status.textContent='Live';status.dataset.state='live';
  }
 }catch{if(!document.hidden){status.textContent=hasData?'Reconnecting · last update shown':'Connecting · retrying';status.dataset.state='retry';}}
 finally{clearTimeout(abortTimer);requestController=null;busy=false;clearTimeout(refreshTimer);if(!document.hidden)refreshTimer=setTimeout(refresh,Math.max(0,500-(performance.now()-started)));}
}
document.addEventListener('visibilitychange',()=>{
 clearTimeout(refreshTimer);liveMap.setVisible(!document.hidden);
 if(document.hidden)requestController?.abort();else void refresh();
});
window.addEventListener('online',()=>{clearTimeout(refreshTimer);void refresh();});
window.addEventListener('pagehide',()=>{clearTimeout(refreshTimer);requestController?.abort();liveMap.setVisible(false);});
window.addEventListener('pageshow',()=>{liveMap.setVisible(!document.hidden);clearTimeout(refreshTimer);void refresh();});
void refresh();
