import {createRespawnShop} from './respawn-shop.js';
import {PERSONA_INFO} from './personas.js';
import {respawnSeconds} from './respawn.js?v=1';
// Round start, knock-out and end screens. Before a round every phone counts down to the same server moment; when it
// ends the view darkens and a leaderboard shows who lasted longest, with medals for the top three.
// Builds its own elements and styles, and sits under the HUD so the host can still tap New round.
import {rankPlayers,newlyOut} from './rules.js?v=round2';
// Knock-outs are announced to everyone in a banner, and the player who went out gets a screen they cannot miss:
// the camera drains to grey, the edges burn red and KNOCKED OUT stays up until the round ends.
const OUT_CSS='.round-feed{position:absolute;top:max(132px,calc(env(safe-area-inset-top) + 120px));left:12px;right:12px;z-index:6;display:grid;gap:6px;justify-items:center;pointer-events:none}.round-feed div{max-width:100%;padding:9px 14px;border-radius:12px;background:#190b0df2;border:1px solid #ff5a4f;color:#fff;font-size:.95rem;font-weight:700;box-shadow:0 8px 28px #000b;animation:round-feed 4s ease both;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.round-feed div.me{background:#ff5a4f;color:#190b0d}.round-dead #camera{filter:grayscale(1) brightness(.5) contrast(1.1)}.round-out{position:absolute;inset:0;z-index:2;display:none;flex-direction:column;align-items:center;justify-content:center;gap:6px;padding:0 20px 26%;text-align:center;pointer-events:none;background:radial-gradient(ellipse at center,#0000 25%,#7a0d0dcc 100%);animation:round-out-in .5s ease both}.round-dead .round-out{display:flex}.round-out b{font-size:clamp(2.4rem,12vw,4rem);font-weight:900;letter-spacing:.04em;line-height:1;color:#ff5a4f;text-shadow:0 4px 30px #000}.round-out span{font-size:1.05rem;font-weight:700;color:#fff;text-shadow:0 2px 10px #000}.round-out small{font-size:.85rem;color:#f6d0cc;text-shadow:0 2px 8px #000}@keyframes round-feed{0%{transform:translateY(-14px);opacity:0}8%{transform:none;opacity:1}85%{opacity:1}100%{opacity:0}}@keyframes round-out-in{0%{opacity:0;transform:scale(1.15)}100%{opacity:1;transform:none}}@media(prefers-reduced-motion:reduce){.round-feed div,.round-out{animation:none}}';
const CSS='.round-overlay{position:absolute;inset:0;z-index:2;display:flex;align-items:center;justify-content:center;pointer-events:none;opacity:0;transition:opacity .35s ease;background:transparent}.round-overlay.show{opacity:1}.round-overlay.dim{background:#05070bb8}.round-count{font-size:clamp(7rem,38vw,13rem);font-weight:800;line-height:1;color:#fff;text-shadow:0 6px 40px #000c,0 0 60px #ff995866;font-variant-numeric:tabular-nums}.round-count.pop{animation:round-pop .9s ease-out both}.round-count.go{color:#ffb070}.round-caption{position:absolute;top:calc(50% + min(24vw,8.5rem));left:0;right:0;text-align:center;font-size:1rem;font-weight:700;letter-spacing:.12em;color:#f6f4efd9;text-shadow:0 2px 8px #000}.round-board{pointer-events:auto;width:min(88%,360px);max-height:62%;overflow:auto;margin-bottom:18%;padding:16px 16px 10px;border-radius:16px;background:#121722f2;border:1px solid #4a5468;box-shadow:0 18px 60px #000a;color:#f6f4ef}.round-board h2{margin:0;font-size:1.25rem;text-align:center}.round-board p{margin:2px 0 12px;text-align:center;font-size:.85rem;color:#ffcfa3}.round-board ol{margin:0;padding:0;list-style:none}.round-board li{display:grid;grid-template-columns:2.2rem 1fr auto;align-items:center;gap:8px;padding:8px 6px;border-top:1px solid #2c3444;font-size:.95rem}.round-board li:first-child{border-top:0}.round-board .place{text-align:center;font-size:1.35rem;font-variant-numeric:tabular-nums;color:#a5a9b5}.round-board .place.number{font-size:.95rem;font-weight:700}.round-board b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.round-board small{color:#a5a9b5;font-size:.78rem;white-space:nowrap}.round-board li.me{background:#ff99581f;border-radius:10px}.round-board li.top b{color:#fff}@keyframes round-pop{0%{transform:scale(1.5);opacity:0}18%{transform:scale(1);opacity:1}80%{opacity:1}100%{transform:scale(.92);opacity:.25}}@media(prefers-reduced-motion:reduce){.round-count.pop{animation:none}.round-overlay{transition:none}}';
const MEDALS=['🥇','🥈','🥉'];
const clock=ms=>{const seconds=Math.max(0,Math.round(ms/1000));return `${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;};
export function createRoundOverlay({container,now=()=>Date.now(),onTick=()=>{},onOut=()=>{},onPersonaChange=()=>{},onPurchase=()=>{},onRespawn=()=>{}}){
 const style=document.createElement('style');style.textContent=CSS+OUT_CSS+'.round-score-total,.round-breakdown{grid-column:2/-1}.round-board .round-earned{color:#ffcb83;font-weight:700;font-size:.9rem}.round-board .round-score-total{font-size:.72rem}.round-breakdown{font-size:.7rem;color:#a5a9b5}.round-breakdown summary{cursor:pointer}.round-board .round-breakdown small{display:block;white-space:normal;font-size:.7rem;line-height:1.6}.round-board li{row-gap:4px}';document.head.append(style);
 const root=document.createElement('div');root.className='round-overlay';root.setAttribute('aria-live','polite');container.append(root);
 const feed=document.createElement('div');feed.className='round-feed';feed.setAttribute('aria-live','assertive');const outScreen=document.createElement('div');outScreen.className='round-out';container.append(outScreen,feed);
 const shop=createRespawnShop({onPurchase,onPersonaChange,onRespawn,now});
 let respawnTimer=null,respawning=null;
 let timer=null,shown='',lastSecond=null,goUntil=0,round=null;const health=new Map(),lastHitBy=new Map();
 function announce(player,myId,players,showFeed=true){
  const by=players.find(p=>p.id===lastHitBy.get(player.id))?.name,mine=player.id===myId,line=document.createElement('div');if(mine)line.className='me';
  line.textContent=mine?`💀 You were knocked out${by?` by ${by}`:''}`:`💀 ${player.name} was knocked out${by?` by ${by===players.find(p=>p.id===myId)?.name?'you':by}`:''}`;if(showFeed)feed.append(line);while(feed.children.length>3)feed.firstChild.remove();setTimeout(()=>line.remove(),4000);
  if(mine){const title=document.createElement('b'),who=document.createElement('span'),note=document.createElement('small');title.textContent='KNOCKED OUT';who.textContent=by?`by ${by}`:'';note.textContent='You’re out for this round. Watch how it ends.';outScreen.replaceChildren(title,who,note);container.classList.add('round-dead');}
  onOut(player,mine);
 }
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
  const ranked=room.results?.players||rankPlayers(room.players),winners=ranked.filter(p=>room.results?.winnerIds?room.results.winnerIds.includes(p.id):room.results?p.id===room.results.winnerId:room.winners?.includes(p.id)).map(p=>p.name);
  const board=document.createElement('section'),title=document.createElement('h2'),subtitle=document.createElement('p'),list=document.createElement('ol');board.className='round-board';
  title.textContent=room.results?.mode==='koth'?'King of the Hill ended':'Round over';subtitle.textContent=room.results?.mode?(winners.length?`${winners.join(' & ')} ${winners.length===1?'wins':'tie'}`:'Round ended'):(winners.length===1?`${winners[0]} is last standing · +200 pts`:room.results?'No last-standing win this round':winners.length?`Tie: ${winners.join(' & ')}`:'Nobody survived');
  for(const p of ranked){
   const row=document.createElement('li'),place=document.createElement('span'),name=document.createElement('b'),detail=document.createElement('small');
   if(p.place<=3)row.classList.add('top');if(p.id===myId)row.classList.add('me');
   place.className='place'+(p.place<=3?'':' number');place.textContent=MEDALS[p.place-1]||String(p.place);place.setAttribute('aria-label',`Place ${p.place}`);
   name.textContent=p.name+(p.id===myId?' (you)':'');if(p.avatar){const img=document.createElement('img');img.src=p.avatar;img.alt='';img.className='round-avatar';name.prepend(img);}
   detail.textContent=room.results?.mode?(room.results.mode==='koth'?`${(p.heldMs/1000).toFixed(1)}s with crown`:`◉ ${p.coins??0} · ${p.kills} kills · ${p.deaths} deaths`):p.health>0?`Survived · ${p.health} HP`:p.diedAt&&room.startsAt?`Out at ${clock(p.diedAt-room.startsAt)}`:'Out';
   if(room.results&&!room.results.mode){
    const survival=detail.textContent;detail.textContent=`+${p.earnedPoints} pts`;detail.className='round-earned';
    const total=document.createElement('small');total.className='round-score-total';total.textContent=`Overall #${p.rank} · ${p.totalPoints} pts · ${p.wins} wins`;
    const breakdown=document.createElement('details'),summary=document.createElement('summary'),explanation=document.createElement('small');breakdown.className='round-breakdown';summary.textContent=p.forfeited?'Left round':survival;explanation.textContent=`Damage ${p.damagePoints} + KOs ${p.knockoutPoints} + finish ${p.finishPoints} + win ${p.winPoints}`;breakdown.append(summary,explanation);
    row.append(place,name,detail,total,breakdown);
   }else row.append(place,name,detail);
   list.append(row);
  }
  board.append(title,subtitle,list);root.replaceChildren(board);root.classList.add('show','dim');
 }
 function clearRespawn(){clearInterval(respawnTimer);respawnTimer=null;respawning=null;}
 function showRespawn(player,players){
  container.classList.add('round-dead');
  if(respawning===player.respawnAt){for(const button of outScreen.querySelectorAll('[data-persona]'))button.setAttribute('aria-pressed',String(button.dataset.persona===(player.nextPersona||player.persona||'mage')));return;}clearRespawn();respawning=player.respawnAt;
  const title=document.createElement('b'),who=document.createElement('span'),note=document.createElement('small');
  title.textContent='KNOCKED OUT';const by=players.find(p=>p.id===lastHitBy.get(player.id))?.name;who.textContent=by?`by ${by}`:'';
  const picker=document.createElement('div'),caption=document.createElement('small');picker.className='respawn-characters';caption.textContent='Choose your next character';
  for(const [id,info] of Object.entries(PERSONA_INFO)){const button=document.createElement('button');button.type='button';button.dataset.persona=id;button.textContent=info.symbol+' '+info.name;button.setAttribute('aria-pressed',String(id===(player.nextPersona||player.persona||'mage')));button.onclick=()=>onPersonaChange(id);picker.append(button);}
  outScreen.replaceChildren(title,who,note,caption,picker);
  const tick=()=>{const seconds=respawnSeconds(respawning,now());note.textContent=seconds?`Respawning in ${seconds}…`:'Waiting for server to respawn…';for(const button of picker.children)button.disabled=seconds===0;};tick();respawnTimer=setInterval(tick,100);
 }
 return{
  // Call with every server state. Anything other than a countdown or a finished round clears the screen.
  // Who landed the hit that knocked someone out, remembered from impact events until the state shows the knock-out.
  impact(event){if(event&&!event.missed&&!event.blocked&&event.targetId)lastHitBy.set(event.targetId,event.actorId);},
  update(room,myId){
   // A new round forgets the old one; within a round, anyone whose health has just reached zero is announced.
   if(room&&round!==room.startsAt){round=room.startsAt;health.clear();lastHitBy.clear();}
   if(room&&(room.phase==='playing'||room.phase==='finished'))for(const player of newlyOut(health,room.players))announce(player,myId,room.players,!room.economy);
   if(room)for(const p of room.players){if(p.health>0&&health.get(p.id)<=0)lastHitBy.delete(p.id);health.set(p.id,p.health);}
   const mine=room?.players.find(p=>p.id===myId);
   if(room?.economy&&(room.eventRound?.mode||'ffa')==='ffa'&&room.phase==='playing'&&mine?.health<=0&&mine.respawnAt){clearRespawn();container.classList.add('round-dead');outScreen.classList.add('shop-screen');if(shop.root.parentElement!==outScreen)outScreen.replaceChildren(shop.root);shop.update(mine);}
   else if(room?.continuous&&(room.eventRound?.mode||'ffa')==='ffa'&&room.phase==='playing'&&mine?.health<=0&&mine.respawnAt)showRespawn(mine,room.players);
   else if(room?.phase==='playing'&&mine?.health<=0&&mine.faceReady&&(room.eventRound?.mode||'ffa')!=='ffa'){clearRespawn();shop.stop();outScreen.classList.remove('shop-screen');container.classList.add('round-dead');const title=document.createElement('b'),note=document.createElement('span');title.textContent=mine.eliminated?'ELIMINATED':'SPECTATING';note.textContent=mine.eliminated?'You’re out for this round. Watch how it ends.':'You’ll join when the next round starts.';outScreen.replaceChildren(title,note);}
   else if(mine?.health>0||!room||room.phase!=='playing'){clearRespawn();shop.stop();outScreen.classList.remove('shop-screen');container.classList.remove('round-dead');outScreen.replaceChildren();}
   if(!room||room.phase!=='playing')container.classList.remove('round-dead');
   if(room?.phase==='countdown'&&room.startsAt)countdown(room.startsAt);else if(room?.phase==='finished')leaderboard(room,myId);else if(shown.startsWith('board:')||(shown.startsWith('count:')&&!goUntil&&room?.phase!=='playing'))hide();},
  hide(){hide();shop.stop();outScreen.classList.remove('shop-screen');clearRespawn();container.classList.remove('round-dead');feed.replaceChildren();health.clear();},
 };
}
