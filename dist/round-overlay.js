// Round start and end screens. Before a round every phone counts down to the same server moment; when it
// ends the view darkens and a leaderboard shows who lasted longest, with medals for the top three.
// Builds its own elements and styles, and sits under the HUD so the host can still tap New round.
import {rankPlayers} from './rules.js?v=round1';
const CSS='.round-overlay{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .35s ease;background:transparent}.round-overlay.show{opacity:1}.round-overlay.dim{background:#05070bb8}.round-count{font-size:clamp(7rem,38vw,13rem);font-weight:800;line-height:1;color:#fff;text-shadow:0 6px 40px #000c,0 0 60px #ff995866;font-variant-numeric:tabular-nums}.round-count.pop{animation:round-pop .9s ease-out both}.round-count.go{color:#ffb070}.round-caption{position:absolute;top:calc(50% + min(24vw,8.5rem));left:0;right:0;text-align:center;font-size:1rem;font-weight:700;letter-spacing:.12em;color:#f6f4efd9;text-shadow:0 2px 8px #000}.round-board{pointer-events:auto;width:min(88%,360px);max-height:62%;overflow:auto;margin-bottom:18%;padding:16px 16px 10px;border-radius:16px;background:#121722f2;border:1px solid #4a5468;box-shadow:0 18px 60px #000a;color:#f6f4ef}.round-board h2{margin:0;font-size:1.25rem;text-align:center}.round-board p{margin:2px 0 12px;text-align:center;font-size:.85rem;color:#ffcfa3}.round-board ol{margin:0;padding:0;list-style:none}.round-board li{display:grid;grid-template-columns:2.2rem 1fr auto;align-items:center;gap:8px;padding:8px 6px;border-top:1px solid #2c3444;font-size:.95rem}.round-board li:first-child{border-top:0}.round-board .place{text-align:center;font-size:1.35rem;font-variant-numeric:tabular-nums;color:#a5a9b5}.round-board .place.number{font-size:.95rem;font-weight:700}.round-board b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.round-board small{color:#a5a9b5;font-size:.78rem;white-space:nowrap}.round-board li.me{background:#ff99581f;border-radius:10px}.round-board li.top b{color:#fff}@keyframes round-pop{0%{transform:scale(1.5);opacity:0}18%{transform:scale(1);opacity:1}80%{opacity:1}100%{transform:scale(.92);opacity:.25}}@media(prefers-reduced-motion:reduce){.round-count.pop{animation:none}.round-overlay{transition:none}}';
const MEDALS=['🥇','🥈','🥉'];
const clock=ms=>{const seconds=Math.max(0,Math.round(ms/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
export function createRoundOverlay({container,now=()=>Date.now(),onTick=()=>{}}){
 const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
 const root=document.createElement('div');root.className='round-overlay';root.setAttribute('aria-live','polite');container.append(root);
 let timer=null,shown='',lastSecond=null,goUntil=0;
 const clear=()=>{clearInterval(timer);timer=null;lastSecond=null;};
 function hide(){clear();shown='';root.classList.remove('show','dim');root.replaceChildren();}
 function countdown(startsAt){
  const key='count:'+startsAt;if(shown===key)return;clear();shown=key;
  const number=document.createElement('div'),caption=document.createElement('div');number.className='round-count';caption.className='round-caption';caption.textContent='ROUND STARTS';root.replaceChildren(number,caption);root.classList.add('show');root.classList.remove('dim');
  const tick=()=>{
   const left=startsAt-now(),second=Math.ceil(left/1000);
   if(left<=0){if(!goUntil){goUntil=Date.now()+800;number.textContent='GO!';number.className='round-count go pop';caption.textContent='';onTick(0);}else if(Date.now()>goUntil){goUntil=0;if(shown===key)hide();}return;}
   if(second!==lastSecond){lastSecond=second;number.textContent=String(second);number.classList.remove('pop');void number.offsetWidth;number.classList.add('pop');onTick(second);}
  };
  goUntil=0;tick();timer=setInterval(tick,50);
 }
 function leaderboard(room,myId){
  const key='board:'+room.startsAt+':'+room.endsAt;if(shown===key)return;clear();shown=key;
  const ranked=rankPlayers(room.players),winners=ranked.filter(p=>room.winners?.includes(p.id)).map(p=>p.name);
  const board=document.createElement('section'),title=document.createElement('h2'),subtitle=document.createElement('p'),list=document.createElement('ol');board.className='round-board';
  title.textContent='Round over';subtitle.textContent=winners.length===1?`${winners[0]} wins`:winners.length?`Tie: ${winners.join(' & ')}`:'Nobody survived';
  for(const p of ranked){
   const row=document.createElement('li'),place=document.createElement('span'),name=document.createElement('b'),detail=document.createElement('small');
   if(p.place<=3)row.classList.add('top');if(p.id===myId)row.classList.add('me');
   place.className='place'+(p.place<=3?'':' number');place.textContent=MEDALS[p.place-1]||String(p.place);place.setAttribute('aria-label',`Place ${p.place}`);
   name.textContent=p.name+(p.id===myId?' (you)':'');
   detail.textContent=p.health>0?`Survived · ${p.health} HP`:p.diedAt&&room.startsAt?`Out at ${clock(p.diedAt-room.startsAt)}`:'Out';
   row.append(place,name,detail);list.append(row);
  }
  board.append(title,subtitle,list);root.replaceChildren(board);root.classList.add('show','dim');
 }
 return{
  // Call with every server state. Anything other than a countdown or a finished round clears the screen.
  update(room,myId){if(room?.phase==='countdown'&&room.startsAt)countdown(room.startsAt);else if(room?.phase==='finished')leaderboard(room,myId);else if(shown.startsWith('board:')||(shown.startsWith('count:')&&!goUntil&&room?.phase!=='playing'))hide();},
  hide,
 };
}
