export function healMessage(amount){const hearts=Number((Math.max(0,Number(amount)||0)/10).toFixed(1));return `Heal gave you ${hearts} ${hearts===1?'heart':'hearts'}!`;}
export function createHealFeedback(container){
 const glow=document.createElement('div'),message=document.createElement('div');glow.className='heal-glow';glow.setAttribute('aria-hidden','true');message.className='heal-message';message.setAttribute('role','status');container.append(glow,message);let glowTimer,messageTimer;
 function clear(){clearTimeout(glowTimer);clearTimeout(messageTimer);glow.classList.remove('active');message.classList.remove('active');message.textContent='';}
 function show(amount){clear();if(!(amount>0))return;glow.classList.add('active');message.textContent=healMessage(amount);message.classList.add('active');glowTimer=setTimeout(()=>glow.classList.remove('active'),850);messageTimer=setTimeout(()=>message.classList.remove('active'),2200);}
 return{show,clear};
}
