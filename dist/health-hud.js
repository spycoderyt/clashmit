export const healthValue=value=>Math.max(0,Math.min(70,Number(value)||0));
export const healthColor=value=>`hsl(${Math.round(healthValue(value)/70*120)} 80% 58%)`;
export const heartFills=value=>Array.from({length:7},(_,i)=>Math.max(0,Math.min(1,healthValue(value)/10-i)));
// The exact HP remains in the accessible label. A living player always has at least half a heart.
export const heartStates=value=>heartFills(Math.ceil(healthValue(value)/5)*5).map(fill=>fill===1?'full':fill>0?'half':'empty');
export function healthRanking(players){
 const sorted=[...players].sort((a,b)=>healthValue(b.health)-healthValue(a.health)||String(a.id).localeCompare(String(b.id)));
 let rank=0,previous=null;
 return sorted.map((p,i)=>{const health=healthValue(p.health);if(health!==previous)rank=i+1;previous=health;return{...p,health,rank};});
}
export function createHealthHud({hearts,roster}){
 const makeHearts=container=>Array.from({length:7},()=>{
  const image=document.createElement('img');image.className='pixel-heart';image.alt='';image.setAttribute('aria-hidden','true');image.width=image.height=18;image.draggable=false;container.append(image);return image;
 });
 const paint=(images,health)=>heartStates(health).forEach((state,i)=>{if(images[i].dataset.state===state)return;images[i].dataset.state=state;images[i].src=`/media/heart-${state}.svg`;});
 const fills=makeHearts(hearts);
 const nodes=new Map();let signature='',lastHealth=-1;
 return{update(players,myId,health,label='Your health'){
  health=healthValue(health);hearts.setAttribute('aria-label',`${label}: ${health} of 70`);hearts.title=`${health} / 70 HP`;
  if(health!==lastHealth){lastHealth=health;paint(fills,health);}
  if(!roster)return;
  const rows=healthRanking(players),next=JSON.stringify(rows.map(p=>[p.id,p.name,p.health,p.connected,p.rank,p.id===myId]));if(next===signature)return;signature=next;
  const seen=new Set();
  for(const p of rows){
   seen.add(p.id);let row=nodes.get(p.id);
   if(!row){
    const root=document.createElement('div'),name=document.createElement('span'),track=document.createElement('div');
    root.className='health-standing';name.className='health-standing-name';track.className='health-standing-hearts';track.setAttribute('role','img');const fills=makeHearts(track);root.append(name,track);row={root,name,track,fills};nodes.set(p.id,row);
   }
   row.name.textContent=`${p.rank}. ${p.name}${p.id===myId?' (you)':''}`;row.track.setAttribute('aria-label',`${p.health} of 70 health`);row.root.title=`${p.name}: ${p.health} HP${p.connected?'':' · disconnected'}`;
   row.root.classList.toggle('is-out',p.health<=0||!p.connected);paint(row.fills,p.health);roster.append(row.root);
  }
  for(const [id,row] of nodes)if(!seen.has(id)){row.root.remove();nodes.delete(id);}
 }};
}
