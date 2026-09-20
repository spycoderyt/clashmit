import {attacksFor,ATTACKS,CONSUMABLES,UNLOCK_COST,skillName,ruleFor,totalDamage,shopQuote} from './economy.js';
import {PERSONA_INFO} from './personas.js';
const ICONS={lightning:'zap',fireball:'flame',meteor:'orbit',poison:'flask-conical',skeletonArmy:'skull',soulReaper:'ghost',arrows:'move-up-right',bombArrow:'bomb',ballista:'crosshair'};
const image=(src,cls,alt='')=>{const img=document.createElement('img');img.src=src;img.className=cls;img.alt=alt;return img;};
const price=(button,amount)=>{const value=document.createElement('span');value.className='shop-price';value.append(image('/media/coin.svg','coin-icon'),String(amount));button.append(value);};
export function createRespawnShop({onPurchase,onPersonaChange,onRespawn,now=Date.now}){
 const root=document.createElement('section');root.className='respawn-shop';root.setAttribute('aria-label','Respawn shop');let current,signature='',timer;
 const header=document.createElement('header'),title=document.createElement('h2'),balance=document.createElement('strong'),characters=document.createElement('div'),skills=document.createElement('div'),items=document.createElement('div'),respawn=document.createElement('button');
 title.textContent='Next life';header.append(title,balance);characters.className='shop-characters';characters.setAttribute('aria-label','Choose your character');skills.className='shop-skills';items.className='shop-items';items.setAttribute('aria-label','Consumables');respawn.className='respawn-go';respawn.onclick=()=>{respawn.disabled=true;onRespawn();};root.append(header,characters,skills,items,respawn);
 const tick=()=>{if(!current)return;const seconds=Math.max(0,Math.ceil((current.respawnAt-now())/1000));const text=seconds?`Respawn in ${seconds}s`:'Respawn';if(respawn.textContent!==text)respawn.textContent=text;respawn.disabled=seconds>0;};
 function update(player){current=player;tick();if(!timer)timer=setInterval(tick,100);const persona=player.nextPersona||player.persona||'mage',next=JSON.stringify([persona,player.loadout,player.score?.coins]);if(signature===next)return;signature=next;const coins=player.score?.coins||0;balance.replaceChildren(image('/media/coin.svg','coin-icon','Coins'),String(coins));
  characters.replaceChildren(...Object.entries(PERSONA_INFO).map(([id,info])=>{const b=document.createElement('button');b.type='button';b.textContent=info.name;b.setAttribute('aria-pressed',String(id===persona));b.onclick=()=>onPersonaChange(id);return b;}));
  const preview={...player,persona},deck=attacksFor(persona);
  skills.replaceChildren(...deck.map((id,index)=>{
   const card=document.createElement('article'),name=document.createElement('h3'),stats=document.createElement('p'),state=document.createElement('small'),action=document.createElement('button'),level=player.loadout.skills[id]||0,rule=ruleFor(preview,id);
   if(!level){const quote=shopQuote(player.loadout,persona,'unlock',id),cost=UNLOCK_COST[index];card.className='shop-skill locked shop-mystery';action.type='button';action.className='shop-unlock-price';action.setAttribute('aria-label',`Unlock skill ${index+1} for ${cost} coins`);action.disabled=!!quote.error||coins<cost;if(quote.error)action.title=quote.error;price(action,cost);action.onclick=()=>onPurchase('unlock',id);card.append(action);return card;}
   card.className='shop-skill'+(level>1?' upgraded':'');state.className='shop-skill-state';state.textContent=level>1?'Max level':level?'Owned':'Locked';name.textContent=skillName(preview,id);
   stats.className='shop-stats';stats.setAttribute('aria-label',`${totalDamage(rule)/10} hearts damage, ${rule.manaCost} mana, ${Number((rule.cooldown/1000).toFixed(2))} second delay`);
   for(const [icon,value] of [['swords',+(totalDamage(rule)/10).toFixed(1)],['droplet',rule.manaCost],['hourglass',Number((rule.cooldown/1000).toFixed(2))+'s']]){const stat=document.createElement('span');stat.append(image(`/media/ui/${icon}.svg`,'shop-stat-icon'),String(value));stats.append(stat);}
   action.type='button';action.className='shop-skill-action';
   if(level<2){const kind=level?'upgrade':'unlock',quote=shopQuote(player.loadout,persona,kind,id),cost=quote.cost??UNLOCK_COST[index];action.textContent=level?'Upgrade':'Unlock';price(action,cost);action.disabled=!!quote.error||coins<cost;action.setAttribute('aria-label',level?`Upgrade ${ATTACKS[id].name} to ${ATTACKS[id].upgrade} for ${cost} coins`:`Unlock ${ATTACKS[id].name} for ${cost} coins`);if(quote.error)action.title=quote.error;action.onclick=()=>onPurchase(kind,id);}
   else{action.textContent='Maxed';action.disabled=true;}
   card.append(state,image(`/media/ui/${ICONS[id]}.svg`,'shop-skill-icon'),name,stats,action);return card;
  }));
  items.replaceChildren(...Object.entries(CONSUMABLES).map(([id,item])=>{
   const buy=document.createElement('button'),name=document.createElement('span'),count=document.createElement('span'),detail=document.createElement('small'),quote=shopQuote(player.loadout,persona,'consumable',id);buy.type='button';buy.className='shop-item';name.className='shop-item-name';name.textContent=item.name;count.className='shop-item-count';count.textContent=`${player.loadout.consumables[id]||0}×`;detail.textContent=id==='shield'?`${item.duration/1000}s`:id==='heal'?'5 ♥':`${item.duration/1000}s · ${item.radius}m`;buy.setAttribute('aria-label',quote.error?`${item.name} inventory full`:`Buy ${item.name} for ${item.cost} coins`);buy.disabled=!!quote.error||coins<item.cost;buy.onclick=()=>onPurchase('consumable',id);buy.append(count,image(`/media/ui/item-${id}.svg`,'shop-item-icon'),name,detail);price(buy,item.cost);return buy;
  }));
 }
 return{root,update,stop(){clearInterval(timer);timer=null;current=null;}};
}
