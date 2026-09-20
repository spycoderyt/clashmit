export function setupLobbyVideo({video,lobby,button,headline}){
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let paused=reduced.matches,timer=null,headlineIndex=0;
 const lines=[...headline.children];
 function stopHeadlines(){clearInterval(timer);timer=null;}
 function startHeadlines(){
  if(timer!==null)return;
  timer=setInterval(()=>{
   lines[headlineIndex].setAttribute('aria-hidden','true');
   headlineIndex=(headlineIndex+1)%lines.length;
   lines[headlineIndex].removeAttribute('aria-hidden');
  },5000);
 }
 video.muted=true;
 function label(){
  const stopped=paused||video.paused;
  button.textContent=stopped?'▶':'Ⅱ';
  button.setAttribute('aria-pressed',String(stopped));
  button.setAttribute('aria-label',stopped?'Play background and rotating title':'Pause background and rotating title');
 }
 function sync(){
  if(paused||lobby.hidden||document.hidden){stopHeadlines();video.pause();label();return;}
  startHeadlines();
  video.play().then(()=>{
   if(paused||lobby.hidden||document.hidden)video.pause();
   label();
  }).catch(()=>{paused=true;stopHeadlines();label();}); // Low Power Mode may require the explicit play button.
 }
 button.onclick=()=>{paused=!video.paused;sync();};
 video.addEventListener('play',label);video.addEventListener('pause',label);
 video.addEventListener('error',()=>{button.hidden=true;});
 reduced.addEventListener('change',()=>{paused=reduced.matches;sync();});
 document.addEventListener('visibilitychange',sync);
 window.addEventListener('pagehide',()=>{stopHeadlines();video.pause();});
 window.addEventListener('pageshow',sync);
 new MutationObserver(sync).observe(lobby,{attributes:true,attributeFilter:['hidden']});
 sync();
}
