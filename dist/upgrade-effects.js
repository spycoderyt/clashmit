// Shared impact accents for gameplay and the upgrade preview. Positions are normalized
// screen coordinates. These effects never resolve hits, damage or game timers.
const NS='http://www.w3.org/2000/svg';
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const valid=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y);
function element(name,attrs={}){const el=document.createElementNS(NS,name);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));return el;}
export function createUpgradeEffects(container){
 const live=new Set();
 function clear(){for(const effect of [...live])effect.remove();}
 function impact({spell,from,targets=[],ground,upgraded=true}={}){
  if(!upgraded||!container||!valid(from))return false;
  const selected=targets.filter(valid).slice(0,3);if(!selected.length)return false;
  // No full-screen filters, canvas loop, blur, or uncapped particle emitters.
  while(live.size>=3)[...live][0].remove();
  const box=container.getBoundingClientRect(),width=Math.max(1,box.width),height=Math.max(1,box.height),size=clamp(Math.min(width,height)*.105,28,58);
  const point=p=>({x:clamp(p.x,0,1)*width,y:clamp(p.y,0,1)*height});
  const source=point(from),ends=selected.map(point),reduced=globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const duration=reduced?220:({fireball:3200,lightning:520,arrows:580,ballista:620,poison:900,soulReaper:850}[spell]||760);
  const svg=element('svg',{viewBox:`0 0 ${width} ${height}`,'aria-hidden':'true','data-upgrade-effect':spell});
  Object.assign(svg.style,{position:'absolute',inset:'0',width:'100%',height:'100%',pointerEvents:'none',overflow:'hidden',zIndex:'24'});
  const animations=[];let timer;
  const effect={remove(){clearTimeout(timer);for(const a of animations)a.cancel();svg.remove();live.delete(effect);}};
  live.add(effect);container.append(svg);
  function animate(node,frames,options={}){
   if(typeof node.animate==='function')animations.push(node.animate(frames,{duration,easing:'cubic-bezier(.15,.7,.25,1)',fill:'both',...options}));
  }
  function add(name,attrs,parent=svg){const e=element(name,attrs);parent.append(e);return e;}
  function groupAt(p){return add('g',{transform:`translate(${p.x} ${p.y})`});}
  function pulse(p,color,radius=size,delay=0){
   const group=groupAt(p),ring=add('circle',{r:radius,fill:'none',stroke:color,'stroke-width':3},group);
   const dot=add('circle',{r:radius*.27,fill:color,opacity:.35},group);
   for(const node of [ring,dot]){node.style.transformOrigin='0px 0px';animate(node,[{transform:'scale(.12)',opacity:.9},{transform:'scale(1.2)',opacity:0}],{delay,duration:duration-delay});}
  }
  function ray(a,b,color,stroke=3,delay=0){
   const path=add('path',{d:`M${a.x} ${a.y} L${b.x} ${b.y}`,fill:'none',stroke:color,'stroke-width':stroke,'stroke-linecap':'round',pathLength:1,'stroke-dasharray':1});
   animate(path,[{strokeDashoffset:1,opacity:0},{strokeDashoffset:0,opacity:1,offset:.35},{strokeDashoffset:0,opacity:0}],{delay,duration:duration-delay});return path;
  }
  function sparks(p,color,count=10,radius=size){
   for(let i=0;i<count;i++){
    const angle=i*Math.PI*2/count+Math.random()*.25,inner=radius*.3,outer=radius*(.9+Math.random()*.65);
    const fragment=add('path',{d:`M${p.x+Math.cos(angle)*inner} ${p.y+Math.sin(angle)*inner} l${Math.cos(angle)*outer*.35} ${Math.sin(angle)*outer*.35}`,stroke:color,'stroke-width':i%3===0?4:2,'stroke-linecap':'round'});
    animate(fragment,[{transform:'translate(0px,0px)',opacity:1},{transform:`translate(${Math.cos(angle)*outer*.65}px,${Math.sin(angle)*outer*.65}px)`,opacity:0}]);
   }
  }
  function jagged(a,b,seed){
   const dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy)||1,n=9;let d=`M${a.x} ${a.y}`;
   for(let i=1;i<n;i++){const t=i/n,offset=Math.sin(i*2.4+seed)*Math.min(22,length*.14);d+=` L${a.x+dx*t-dy/length*offset} ${a.y+dy*t+dx/length*offset}`;}
   return d+` L${b.x} ${b.y}`;
  }
  if(spell==='lightning'){
   ends.forEach((p,i)=>{
    const a=i===0?source:ends[0],d=jagged(a,p,i+.3);
    for(const [color,stroke]of [['#626af3',18],['#bcc6ff',10],['#ffffff',5]]){const path=add('path',{d,fill:'none',stroke:color,'stroke-width':stroke,'stroke-linejoin':'round'});animate(path,[{opacity:0},{opacity:1,offset:.12},{opacity:.3,offset:.35},{opacity:.95,offset:.48},{opacity:0}],{delay:i*35,duration:duration-i*35});}
    pulse(p,'#bdc6ff',size*.6,i*35);
   });
  }else if(spell==='poison'){
   ends.forEach((p,i)=>{
    const a=i===0?source:ends[0];ray(a,p,'#a9f271',2,i*50);pulse(p,'#91e96b',size,i*50);
    for(let j=0;j<8;j++){
     const angle=j*Math.PI/4+i*.7,r=size*(.6+(j%3)*.23),bubble=add('circle',{cx:p.x,cy:p.y,r:3+j%3,fill:j%2?'#a7ef5f':'#66d4a3'});
     animate(bubble,[{transform:'translate(0px,0px)',opacity:.9},{transform:`translate(${Math.cos(angle)*r}px,${Math.sin(angle)*r-16}px)`,opacity:0}],{delay:i*45,duration:duration-i*45});
    }
   });
  }else if(spell==='arrows'){
   ends.forEach((p,i)=>{for(let j=-1;j<=1;j++){
    const end={x:p.x+j*7,y:p.y+Math.abs(j)*6},a={x:source.x+j*12,y:source.y+Math.abs(j)*8};
    ray(a,end,j===0?'#fcf7cf':'#d6b771',j===0?3:1.5,i*35+(j+1)*25);
    const angle=Math.atan2(end.y-a.y,end.x-a.x),head=8;
    const arrow=add('path',{d:`M${end.x-Math.cos(angle-.5)*head} ${end.y-Math.sin(angle-.5)*head} L${end.x} ${end.y} L${end.x-Math.cos(angle+.5)*head} ${end.y-Math.sin(angle+.5)*head}`,fill:'none',stroke:'#fcf7cf','stroke-width':2});
    animate(arrow,[{opacity:0},{opacity:1,offset:.35},{opacity:0}]);
   }pulse(p,'#f6e5ac',size*.45);});
  }else if(spell==='ballista'){
   ends.forEach(p=>{ray(source,p,'#9493ff',15);ray(source,p,'#b7f9ff',6);ray(source,p,'#ffffff',2);pulse(p,'#b7f9ff',size*1.2);sparks(p,'#ddeaff',8,size);});
  }else if(spell==='soulReaper'){
   ends.forEach(p=>{
    const g=groupAt(p),r=size*1.3;
    const arc=add('path',{d:`M${-r} ${r*.6} Q${-r*.7} ${-r*1.4} ${r} ${-r*.5} Q${r*.1} ${-r*.15} ${r*.55} ${r*.8} Q${r*.7} ${-r*.3} ${-r} ${r*.6}`,fill:'#c8a7ff',opacity:.9},g);
    arc.style.transformOrigin='0px 0px';animate(arc,[{transform:'rotate(-60deg) scale(.5)',opacity:0},{transform:'rotate(0deg) scale(1)',opacity:1,offset:.3},{transform:'rotate(80deg) scale(1.3)',opacity:0}]);
    for(let i=0;i<3;i++){
     const ghost=add('path',{d:'M-9 6 V-4 A9 9 0 0 1 9 -4 V6 L5 3 0 7 -5 3 Z',fill:'#e9ddff'},g);
     animate(ghost,[{transform:`translate(${(i-1)*16}px,8px)`,opacity:.8},{transform:`translate(${(i-1)*36}px,-${45+i*15}px)`,opacity:0}],{delay:i*40,duration:duration-i*40});
    }
   });
  }else if(spell==='skeletonArmy'){
   ends.forEach(p=>{pulse(p,'#eadcc0',size);for(let i=0;i<7;i++){
    const a=i*Math.PI*2/7,g=groupAt(p),bone=add('g',{},g);
    add('path',{d:'M-7 0 H7',stroke:'#f7eedb','stroke-width':4,'stroke-linecap':'round'},bone);
    for(const x of [-8,8])for(const y of [-2,2])add('circle',{cx:x,cy:y,r:2.5,fill:'#f7eedb'},bone);
    bone.style.transformOrigin='0px 0px';animate(bone,[{transform:'scale(.4)',opacity:1},{transform:`translate(${Math.cos(a)*size}px,${Math.sin(a)*size}px) rotate(${i*48}deg)`,opacity:0}]);
   }});
  }else{
   const meteor=spell==='meteor',bomb=spell==='bombArrow',color=meteor?'#ffcc86':bomb?'#ffd896':'#ff9448';
   ends.forEach(p=>{
    pulse(p,color,size*(meteor?1.65:1.1));pulse(p,meteor?'#e58c70':'#ffda79',size*(meteor?1.15:.7),70);
    sparks(p,color,meteor?14:bomb?12:10,size*(meteor?1.6:1));
    if(meteor){
     const crater=add('ellipse',{cx:p.x,cy:p.y+size*.15,rx:size*1.3,ry:size*.4,fill:'#392126',stroke:'#e98d64','stroke-width':3});
     crater.style.transformOrigin=`${p.x}px ${p.y}px`;animate(crater,[{transform:'scale(.2)',opacity:0},{transform:'scale(1)',opacity:.8,offset:.2},{transform:'scale(1.1)',opacity:0}]);
    }else if(!bomb){
     // The camera has no world map. Use the tracked feet, or an estimated ground point.
     const floor=valid(ground)?point(ground):{x:p.x,y:Math.min(height*.82,p.y+height*.26)},g=groupAt(floor);
     const ember=add('ellipse',{rx:size*1.55,ry:size*.25,fill:'#b63914',opacity:.8},g);
     animate(ember,[{transform:'scale(.3)',opacity:0},{transform:'scale(1)',opacity:.8,offset:.12},{transform:'scale(1.1)',opacity:.7,offset:.85},{opacity:0}]);
     for(let j=0;j<9;j++){
      const x=(j-4)*size*.32,y=Math.sin(j*2.4)*size*.08,h=size*(.55+(j%3)*.19),base=add('g',{transform:`translate(${x} ${y})`},g);
      const flame=add('path',{d:`M${-h*.24} 0 Q${-h*.48} ${-h*.36} ${-h*.07} ${-h} Q${h*.05} ${-h*.5} ${h*.25} ${-h*.66} Q${h*.55} ${-h*.16} ${h*.24} 0 Z`,fill:j%2?'#ff772d':'#ffa23a'},base);
      const core=add('path',{d:`M${-h*.12} 0 Q${-h*.22} ${-h*.22} 0 ${-h*.52} Q${h*.3} ${-h*.12} ${h*.12} 0 Z`,fill:'#ffeaa1'},base);
      for(const node of [flame,core]){node.style.transformOrigin='0px 0px';animate(node,[{transform:'scale(.9, .78)'},{transform:'scale(1.1, 1.13)'},{transform:'scale(.85, .9)'}],{duration:420+j*29,iterations:reduced?1:7,direction:'alternate'});}
     }
    }
   });
  }
  animate(svg,[{opacity:1,offset:0},{opacity:1,offset:.65},{opacity:0}]);
  timer=setTimeout(()=>effect.remove(),duration+50);
  return true;
 }
 return {impact,clear};
}
