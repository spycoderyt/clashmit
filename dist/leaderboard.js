export function setupLeaderboard({root,lobby,url,getMyId}){
 const list=root.querySelector('tbody'),status=root.querySelector('[data-board-status]');
 let busy=false,last='',hasData=false;
 async function refresh(){
  if(busy||document.hidden||lobby.hidden)return;busy=true;
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),6000);
  try{
   const response=await fetch(url(),{signal:controller.signal,cache:'no-store'});if(!response.ok)throw Error('Leaderboard unavailable');
   const data=await response.json(),players=data.players.filter(p=>p.points>0),myId=getMyId(),signature=JSON.stringify([players,myId]);
   if(signature!==last){last=signature;list.replaceChildren(...players.map(p=>{
    const row=document.createElement('tr');if(p.id===myId)row.className='is-you';
    for(const value of ['#'+p.rank,p.name+(p.id===myId?' (you)':''),p.points.toLocaleString(),p.wins]){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}
    return row;
   }));}
   hasData=true;status.textContent=players.length?'Ranked by total points · updated every 5 seconds':'No scores yet. Be the first to play.';
  }catch{status.textContent=hasData?'Reconnecting · showing last scores':'Leaderboard unavailable. Retrying…';}
  finally{clearTimeout(timer);busy=false;}
 }
 setInterval(refresh,5000);document.addEventListener('visibilitychange',refresh);window.addEventListener('online',refresh);
 new MutationObserver(refresh).observe(lobby,{attributes:true,attributeFilter:['hidden']});void refresh();
 return {refresh};
}
