// A lightweight illustrated demo, rendered locally; no camera or video download.
export function setupLobbyScene({canvas,lobby,button}){
 const ctx=canvas.getContext('2d');if(!ctx){button.hidden=true;return;}
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let paused=reduced.matches,frame=0,elapsed=1800,last=0,width=0,height=0;
 const clamp=x=>Math.max(0,Math.min(1,x));
 function ellipse(x,y,rx,ry,color){ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill();}
 function line(points,color,size){ctx.strokeStyle=color;ctx.lineWidth=size;ctx.lineCap='round';ctx.lineJoin='round';ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
 function glow(x,y,r,alpha=1){const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(255,236,162,${alpha})`);g.addColorStop(.18,`rgba(255,157,39,${alpha*.8})`);g.addColorStop(.5,`rgba(250,78,19,${alpha*.28})`);g.addColorStop(1,'rgba(240,59,9,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);}
 function draw(time){
  const w=innerWidth,h=innerHeight,dpr=Math.min(devicePixelRatio||1,1.5);
  if(w!==width||h!==height){width=w;height=h;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);}
  ctx.setTransform(canvas.width/w,0,0,canvas.height/h,0,0);ctx.clearRect(0,0,w,h);
  // Portrait composition fits phones; on desktop, the target sits beside the form.
  const scale=Math.max(h/900,w/1500),cx=w<700?w*.77:w*.79,cy=h*.5;
  ctx.translate(cx,cy);ctx.scale(scale,scale);
  const sky=ctx.createLinearGradient(0,-600,0,600);sky.addColorStop(0,'#111d33');sky.addColorStop(.6,'#284754');sky.addColorStop(1,'#142b32');ctx.fillStyle=sky;ctx.fillRect(-2200,-1600,4400,3200);
  ctx.fillStyle='#233e43';ctx.beginPath();ctx.moveTo(-2200,110);for(let x=-2200;x<=2200;x+=80)ctx.lineTo(x,105+Math.sin(x*.006)*20);ctx.lineTo(2200,1600);ctx.lineTo(-2200,1600);ctx.fill();
  for(let i=-8;i<12;i++){const x=i*190-30,y=20+Math.sin(i*2)*13;line([[x,y+125],[x,y-120]],'#152d36',12);ellipse(x,y-100,70,125,'#1a333d');ellipse(x-30,y-140,47,90,'#1b3740');}
  ctx.fillStyle='#355057';ctx.beginPath();ctx.moveTo(-100,100);ctx.lineTo(-50,100);ctx.lineTo(-340,1000);ctx.lineTo(-1100,1000);ctx.fill();
  for(let i=0;i<13;i++){const y=155+i*i*8;line([[-100-y*.85,y],[-35-y*.24,y]],'#466167',1);}
  const t=(time%5600)/1000,travel=clamp((t-.7)/1.65),impact=clamp((t-2.35)/.85),hit=t>=2.35&&t<3.2;
  const sway=Math.sin(time*.0016)*8,recoil=hit?Math.sin(impact*Math.PI)*14:0;
  const px=sway+recoil,py=20;
  ellipse(px,py+180,65,14,'#0b1b28');
  ctx.save();ctx.translate(px,py);
  // A fictional player wearing a blue headband; no face recognition is implied.
  line([[-17,75],[-22,122],[-37,174]],'#142638',27);line([[18,75],[28,122],[36,175]],'#192e41',27);
  line([[-42,179],[-20,180]],'#718b99',13);line([[29,180],[51,180]],'#718b99',13);
  line([[-29,-38],[-47,8],[-34,45]],'#385774',24);line([[29,-38],[48,0],[62,25]],'#3e6384',24);
  ellipse(-34,48,10,12,'#cfaa8c');ellipse(63,28,10,12,'#d7b091');
  ctx.fillStyle=hit?'#647485':'#456a89';ctx.beginPath();ctx.moveTo(-24,-55);ctx.quadraticCurveTo(-41,-41,-32,13);ctx.lineTo(-29,83);ctx.quadraticCurveTo(0,91,29,83);ctx.lineTo(33,5);ctx.quadraticCurveTo(37,-43,24,-55);ctx.closePath();ctx.fill();
  line([[0,-39],[0,76]],'#34536e',2);line([[-17,47],[17,47]],'#2e4b64',2);
  ellipse(0,-53,13,18,'#bc927a');ellipse(0,-84,26,32,'#d8b293');
  ctx.fillStyle='#142335';ctx.beginPath();ctx.moveTo(-27,-83);ctx.quadraticCurveTo(-34,-125,5,-119);ctx.quadraticCurveTo(34,-119,28,-85);ctx.lineTo(21,-96);ctx.quadraticCurveTo(4,-85,-22,-99);ctx.fill();
  ctx.fillStyle='#479eea';ctx.fillRect(-26,-104,52,11);line([[-23,-103],[22,-103]],'#8bc8ff',2);
  // The health drop makes the hit legible without extra UI text.
  ctx.fillStyle='#0e1a28';ctx.fillRect(-48,-156,96,10);ctx.fillStyle=t>=2.35&&t<4.65?'#f4ac66':'#94d7b0';ctx.fillRect(-46,-154,t>=2.35&&t<4.65?65:92,6);
  ctx.restore();
  const end=[px,py-5],start=[-350,470];
  function point(u){const ease=u*u;return[start[0]+(end[0]-start[0])*ease-80*Math.sin(ease*Math.PI),start[1]+(end[1]-start[1])*ease-130*Math.sin(ease*Math.PI)];}
  if(t>=.7&&t<2.35){
   for(let j=18;j>=0;j--){const u=travel-j*.013;if(u<0)continue;const [x,y]=point(u);glow(x+Math.sin(j*2+time*.008)*4,y,((1-travel)*40+15)*(1-j/24),.7*(1-j/24));}
   const [x,y]=point(travel),r=11+30*(1-travel);glow(x,y,r*3.5);ellipse(x,y,r,r*.85,'#ffb33f');ellipse(x-2,y-3,r*.55,r*.48,'#fff2b5');
  }
  if(hit){
   glow(...end,90+impact*65,(1-impact)*.9);
   ctx.strokeStyle=`rgba(255,189,86,${(1-impact)*.85})`;ctx.lineWidth=3*(1-impact)+1;ctx.beginPath();ctx.ellipse(...end,15+impact*100,10+impact*75,0,0,Math.PI*2);ctx.stroke();
   for(let j=0;j<26;j++){const a=j*2.39996,r=(20+impact*135)*( .65+(j%5)*.08),x=end[0]+Math.cos(a)*r,y=end[1]+Math.sin(a)*r+impact*impact*30;ellipse(x,y,2*(1-impact)+.5,4*(1-impact)+.5,`rgba(255,${150+j%4*24},70,${1-impact})`);}
  }
 }
 function animate(at){frame=0;if(paused||lobby.hidden||document.hidden)return;elapsed+=Math.min(at-last,50);last=at;draw(elapsed);frame=requestAnimationFrame(animate);}
 function sync(){cancelAnimationFrame(frame);frame=0;canvas.hidden=lobby.hidden;button.setAttribute('aria-pressed',String(paused));button.setAttribute('aria-label',paused?'Play background animation':'Pause background animation');button.textContent=paused?'▶':'Ⅱ';if(lobby.hidden)return;draw(elapsed);if(!paused&&!document.hidden){last=performance.now();frame=requestAnimationFrame(animate);}}
 button.onclick=()=>{paused=!paused;sync();};
 reduced.addEventListener('change',()=>{paused=reduced.matches;sync();});
 document.addEventListener('visibilitychange',sync);window.addEventListener('resize',()=>draw(elapsed));
 new MutationObserver(sync).observe(lobby,{attributes:true,attributeFilter:['hidden']});sync();
}
