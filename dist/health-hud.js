export const healthValue=value=>Math.max(0,Math.min(100,Number(value)||0));
export const healthColor=value=>`hsl(${Math.round(healthValue(value)*1.2)} 80% 58%)`;
export const heartFills=value=>Array.from({length:10},(_,i)=>Math.max(0,Math.min(1,healthValue(value)/10-i)));
export function healthRanking(players){
 const sorted=[...players].sort((a,b)=>healthValue(b.health)-healthValue(a.health)||String(a.id).localeCompare(String(b.id)));
 let rank=0,previous=null;
 return sorted.map((p,i)=>{const health=healthValue(p.health);if(health!==previous)rank=i+1;previous=health;return{...p,health,rank};});
}
export function createHealthHud({hearts,roster}){
 const NS='http://www.w3.org/2000/svg',shape='M1 0H4V1H5V0H8V1H9V4H8V5H7V6H6V7H5V8H4V7H3V6H2V5H1V4H0V1H1Z';
 const fills=Array.from({length:10},()=>{
  const svg=document.createElementNS(NS,'svg');svg.setAttribute('viewBox','0 0 9 8');svg.setAttribute('aria-hidden','true');svg.classList.add('pixel-heart');
  const empty=document.createElementNS(NS,'path'),fill=document.createElementNS(NS,'path');empty.setAttribute('d',shape);fill.setAttribute('d',shape);empty.setAttribute('fill','#352c33');fill.setAttribute('fill','#ff4e5a');svg.append(empty,fill);hearts.append(svg);return fill;
 });
 const nodes=new Map();let signature='',lastHealth=-1;
 return{update(players,myId,health,label='Your health'){
  health=healthValue(health);hearts.setAttribute('aria-label',`${label}: ${health} of 100`);hearts.title=`${health} / 100 HP`;
  if(health!==lastHealth){lastHealth=health;heartFills(health).forEach((value,i)=>fills[i].style.clipPath=`inset(0 ${100-value*100}% 0 0)`);}
  const rows=healthRanking(players),next=JSON.stringify(rows.map(p=>[p.id,p.name,p.health,p.connected,p.rank,p.id===myId]));if(next===signature)return;signature=next;
  const seen=new Set();
  for(const p of rows){
   seen.add(p.id);let row=nodes.get(p.id);
   if(!row){
    const root=document.createElement('div'),name=document.createElement('span'),value=document.createElement('b'),track=document.createElement('div'),fill=document.createElement('i');
    root.className='health-standing';name.className='health-standing-name';track.className='health-standing-track';track.append(fill);root.append(name,value,track);row={root,name,value,fill};nodes.set(p.id,row);
   }
   row.name.textContent=`${p.rank}. ${p.name}${p.id===myId?' (you)':''}`;row.value.textContent=String(Math.ceil(p.health));row.root.title=`${p.name}: ${p.health} HP${p.connected?'':' · disconnected'}`;
   row.root.classList.toggle('is-out',p.health<=0||!p.connected);row.fill.style.width=p.health+'%';row.fill.style.background=healthColor(p.health);roster.append(row.root);
  }
  for(const [id,row] of nodes)if(!seen.has(id)){row.root.remove();nodes.delete(id);}
 }};
}
