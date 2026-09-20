const portrait=(player,cls)=>{const box=document.createElement('span');box.className=cls;if(player.avatar?.startsWith('data:image/jpeg;base64,')){const img=document.createElement('img');img.src=player.avatar;img.alt='';box.append(img);}else box.textContent=player.name?.slice(0,1)||'?';return box;};
export function createArenaLeaders(container){
 const root=document.createElement('aside'),king=document.createElement('div'),title=document.createElement('small'),list=document.createElement('ol');root.className='arena-leaders';root.setAttribute('aria-label','Arena leaders');root.hidden=true;king.className='king-row';root.append(king,title,list);container.append(root);let signature='';
 return{update(leaders,myId,eventRound){
  const koth=eventRound?.mode==='koth',top=leaders.slice(0,3),holder=koth?eventRound.king:null,next=JSON.stringify([top,myId,holder,koth]);if(next===signature)return;signature=next;root.hidden=!top.length&&!holder;king.hidden=!holder;king.replaceChildren();
  if(holder){const name=document.createElement('strong'),label=document.createElement('small');name.textContent=holder.name;label.textContent='King';name.append(label);king.append(portrait(holder,'king-portrait'),name);}
  title.textContent='Top coins';
  list.replaceChildren(...top.map((player,index)=>{const row=document.createElement('li'),medal=document.createElement('span'),name=document.createElement('span'),value=document.createElement('b');medal.textContent=['🥇','🥈','🥉'][index];name.className='arena-leader-name';name.textContent=player.name;value.textContent=String(player.coins??0);row.classList.toggle('is-you',player.id===myId);row.append(medal,portrait(player,'arena-leader-avatar'),name,value);return row;}));
 }};
}
