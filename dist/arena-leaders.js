export function createArenaLeaders(container){
 const root=document.createElement('aside'),title=document.createElement('small'),list=document.createElement('ol');
 root.className='arena-leaders';root.setAttribute('aria-label','Top three kill streaks');root.hidden=true;title.textContent='TOP STREAKS';root.append(title,list);container.append(root);let signature='';
 return{update(leaders,myId){
  const top=leaders.slice(0,3),next=JSON.stringify([top,myId]);if(next===signature)return;signature=next;root.hidden=!top.length;
  list.replaceChildren(...top.map((player,index)=>{
   const row=document.createElement('li'),medal=document.createElement('span'),name=document.createElement('span'),streak=document.createElement('b');
   medal.textContent=['🥇','🥈','🥉'][(player.rank||index+1)-1]||String(player.rank);medal.setAttribute('aria-label',`Rank ${player.rank||index+1}`);name.className='arena-leader-name';name.textContent=player.name;streak.textContent=String(player.bestStreak);streak.setAttribute('aria-label',`Best kill streak: ${player.bestStreak}`);row.classList.toggle('is-you',player.id===myId);row.title=`${player.name}: ${player.bestStreak} best kill streak`;row.append(medal,name,streak);return row;
  }));
 }};
}
