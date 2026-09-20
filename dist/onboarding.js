// Five one-line coach marks for a first-time player, shown once while they wait for the host. Each one dims
// the arena except the controls it is about, which stay tappable, so people learn where the buttons are
// instead of reading a wall of text. Builds its own elements and styles. Skip ends it, How to play brings it back.
// gate: the step cannot be stepped past until that named check passes, so nobody skims past enabling voice.
export const STEPS=Object.freeze([
 {key:'voice',anchor:'voice',gate:'voice',text:'Tap Enable voice, then say a spell to cast it.'},
 {key:'health',anchor:'health',text:'Protect your health.'},
 {key:'mana',anchor:'mana',text:'Use mana for spells.'},
 {key:'attack',anchor:'attack',text:'Your two primary spells.'},
 {key:'defence',anchor:'defence',text:'Shield blocks primary attacks, Heal recovers health.'},
]);
// A brand new player only: after their face is scanned, before any round is running, and never over the face scan.
export function shouldOpen({seen,practice,faceReady,phase,scanOpen,open}){
 return !seen&&!practice&&!!faceReady&&!open&&!scanOpen&&(phase==='lobby'||phase==='finished');
}
// The countdown and the live round own the screen; a coach mark must never compete with them.
export function shouldClose(phase){return phase==='countdown'||phase==='playing';}
// One box around every control a step points at, ignoring any that is hidden or swapped out.
export function union(rects){
 const live=(rects||[]).filter(r=>r&&r.width>0&&r.height>0);if(!live.length)return null;
 const x=Math.min(...live.map(r=>r.x)),y=Math.min(...live.map(r=>r.y));
 return{x,y,width:Math.max(...live.map(r=>r.x+r.width))-x,height:Math.max(...live.map(r=>r.y+r.height))-y};
}
// Pure geometry, in container pixels: the four dark panels that surround the lit controls, and the card's top.
// No hole (nothing visible to point at) darkens everything and centres the card.
export function frame(hole,box,{height=150,gap:GAP=14,margin=12}={}){
 if(!hole||!(hole.width>0)||!(hole.height>0))return{blocks:[{x:0,y:0,width:box.width,height:box.height}],top:Math.max(margin,(box.height-height)/2)};
 const x=Math.max(0,Math.min(hole.x,box.width)),y=Math.max(0,Math.min(hole.y,box.height));
 const width=Math.max(0,Math.min(hole.width,box.width-x)),depth=Math.max(0,Math.min(hole.height,box.height-y));
 const blocks=[
  {x:0,y:0,width:box.width,height:y},
  {x:0,y:y+depth,width:box.width,height:Math.max(0,box.height-y-depth)},
  {x:0,y,width:x,height:depth},
  {x:x+width,y,width:Math.max(0,box.width-x-width),height:depth},
 ].filter(b=>b.width>0&&b.height>0);
 const above=y-GAP-height;
 return{blocks,top:above>=margin?above:Math.max(margin,Math.min(y+depth+GAP,box.height-height-margin))};
}
const CSS='.coach{position:absolute;inset:0;z-index:6;font-size:1rem}.coach[hidden]{display:none}'
 +'.coach-block{position:absolute;background:#05070be0}'
 +'.coach-hole{position:absolute;border-radius:14px;pointer-events:none;box-shadow:0 0 0 2px var(--orange,#ff9958),0 0 26px #ff995885;animation:coach-glow 1.9s ease-in-out infinite}'
 +'.coach-card{position:absolute;left:12px;right:12px;max-width:380px;margin:0 auto;padding:14px 16px 12px;border-radius:16px;background:#121722f7;border:1px solid #4a5468;box-shadow:0 18px 60px #000a;color:#f6f4ef}'
 +'.coach-text{margin:0 0 12px;font-size:1rem;font-weight:700;line-height:1.35}'
 +'.coach-dots{display:flex;gap:6px;margin:0 0 12px;padding:0;list-style:none}.coach-dots li{flex:1;height:5px;border-radius:3px;background:#3a4150}.coach-dots li.active{background:var(--orange,#ff9958)}.coach-dots li.done{background:#7be0a0}'
 +'.coach-row{display:flex;align-items:center;gap:12px}'
 +'.coach-skip{background:transparent;color:#d6d8df;text-decoration:underline;text-underline-offset:5px;font-size:.85rem;padding:6px 0;min-height:0}'
 +'.coach-next{margin-left:auto;background:var(--orange,#ff9958);color:#24160e;border-radius:8px;font-weight:700;padding:11px 22px;font-size:.9rem;min-height:40px}'
 +'@keyframes coach-glow{50%{box-shadow:0 0 0 3px var(--orange,#ff9958),0 0 34px #ff9958b0}}'
 +'@media(prefers-reduced-motion:reduce){.coach-hole{animation:none}}';
// anchors: the real HUD elements each step lights up, one or several, by the step's `anchor` key.
// gates: named checks a step waits on, by the step's `gate` key.
export function createOnboarding({container,anchors={},gates={},onFinish=()=>{}}){
 const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
 const root=document.createElement('div');root.className='coach';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-label','How to play');
 const blocks=[0,1,2,3].map(()=>{const el=document.createElement('div');el.className='coach-block';return el;});
 const hole=document.createElement('div');hole.className='coach-hole';
 const card=document.createElement('div');card.className='coach-card';
 const text=document.createElement('p'),dots=document.createElement('ol'),row=document.createElement('div');
 text.className='coach-text';dots.className='coach-dots';dots.setAttribute('aria-hidden','true');row.className='coach-row';
 const skip=document.createElement('button'),next=document.createElement('button');
 skip.type=next.type='button';skip.className='coach-skip';next.className='coach-next';skip.textContent='Skip';
 dots.replaceChildren(...STEPS.map(()=>document.createElement('li')));
 row.append(skip,next);card.append(text,dots,row);root.append(...blocks,hole,card);container.append(root);
 let index=0,open=false,timer=null;
 const passed=step=>!step.gate||(gates[step.gate]?.()??true);
 function place(){
  if(!open)return;
  const step=STEPS[index],box=container.getBoundingClientRect();
  const targets=[anchors[step.anchor]].flat().filter(Boolean).map(el=>el.getBoundingClientRect());
  // 8px of breathing room, so a control's glow does not sit on its own edge.
  const spread=union(targets),lit=spread?{x:spread.x-box.left-8,y:spread.y-box.top-8,width:spread.width+16,height:spread.height+16}:null;
  const plan=frame(lit,{width:box.width,height:box.height},{height:card.getBoundingClientRect().height||150});
  for(const [i,el] of blocks.entries()){const b=plan.blocks[i];el.hidden=!b;if(b)Object.assign(el.style,{left:b.x+'px',top:b.y+'px',width:b.width+'px',height:b.height+'px'});}
  hole.hidden=!lit;if(lit)Object.assign(hole.style,{left:lit.x+'px',top:lit.y+'px',width:lit.width+'px',height:lit.height+'px'});
  card.style.top=plan.top+'px';
 }
 // A gated step keeps Next disabled until its check passes, and the lit control can swap out underneath
 // (Enable voice becomes the live transcript), so both are re-read on a tick rather than once per step.
 function sync(){if(!open)return;next.disabled=!passed(STEPS[index]);place();}
 function render(){
  const step=STEPS[index];text.textContent=step.text;
  for(const [i,dot] of [...dots.children].entries())dot.className=i===index?'active':i<index?'done':'';
  next.textContent=index===STEPS.length-1?'Got it':'Next';skip.hidden=index===STEPS.length-1;
  sync();requestAnimationFrame(place);
 }
 function finish(){if(!open)return;open=false;clearInterval(timer);timer=null;root.hidden=true;onFinish();}
 next.onclick=()=>{if(!passed(STEPS[index]))return;if(index<STEPS.length-1){index++;render();}else finish();};
 skip.onclick=finish;
 const reflow=()=>place();
 addEventListener('resize',reflow);addEventListener('orientationchange',reflow);
 return{
  open(){if(open)return;open=true;index=0;root.hidden=false;render();clearInterval(timer);timer=setInterval(sync,250);},
  hide:finish,
  get isOpen(){return open;},
 };
}
