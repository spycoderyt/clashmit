import * as THREE from './vendor/three.module.js';

// A perspective scene composited over the camera; it does not track real surfaces.
export function createFireballRenderer(container){
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
 const canvas=renderer.domElement;canvas.className='spell-scene';canvas.setAttribute('aria-hidden','true');canvas.dataset.renderer='webgl';container.append(canvas);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,1,.1,100);
 const sphere=new THREE.IcosahedronGeometry(.19,2),torus=new THREE.TorusGeometry(1,.035,6,48);
 const textureCanvas=document.createElement('canvas');textureCanvas.width=textureCanvas.height=64;
 const ctx=textureCanvas.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);
 gradient.addColorStop(0,'rgba(255,255,240,1)');gradient.addColorStop(.17,'rgba(255,226,145,.98)');gradient.addColorStop(.42,'rgba(255,114,20,.65)');gradient.addColorStop(1,'rgba(255,50,0,0)');ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);
 const glowTexture=new THREE.CanvasTexture(textureCanvas);
 const shots=[];let frame=0,width=0,height=0;
 function resize(){const rect=container.getBoundingClientRect();if(rect.width===width&&rect.height===height)return;width=rect.width;height=rect.height;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
 function sprite(size,color=0xffb14d){const mat=new THREE.SpriteMaterial({map:glowTexture,color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});const s=new THREE.Sprite(mat);s.scale.setScalar(size);return s;}
 function screenPoint(x,y,z){const halfHeight=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*z;return new THREE.Vector3((x*2-1)*halfHeight*camera.aspect,(1-y*2)*halfHeight,-z);}
 function remove(shot){scene.remove(shot.group);shot.group.traverse(o=>{if(o.material)o.material.dispose();});}
 function clear(){cancelAnimationFrame(frame);frame=0;for(const shot of shots)remove(shot);shots.length=0;renderer.clear();canvas.dataset.phase='idle';}
 function animate(time){
  frame=0;resize();
  for(let i=shots.length-1;i>=0;i--){
   const shot=shots[i],age=(time-shot.started)/1000,t=age/shot.flight;
   if(age>shot.flight+.7){remove(shot);shots.splice(i,1);continue;}
   if(t<1){
    canvas.dataset.phase='flight';shot.ball.visible=true;shot.blast.visible=false;
    // Ease the world-space advance to keep the near-to-far travel legible.
    if(shot.getTarget){const target=shot.getTarget();if(target){shot.lastSeen=time;shot.end.lerp(screenPoint(target.x,target.y,shot.depth),.22);shot.path.v1.copy(shot.path.v0).lerp(shot.end,.45);shot.path.v1.y+=.45;shot.blast.position.copy(shot.end);}else if(time-shot.lastSeen>450){shot.lost=true;}}
    const travel=t*t;shot.path.getPoint(travel,shot.ball.position);shot.ball.rotation.z=time*.008;
    shot.halo.scale.setScalar(.95+Math.sin(time*.027)*.11);
    shot.trail.forEach((p,j)=>{const u=travel-j*.014;p.visible=u>0;if(!p.visible)return;shot.path.getPoint(Math.max(0,u),p.position);p.position.x+=Math.sin(j*2+time*.009)*.035;p.position.y+=Math.cos(j+time*.005)*.03;p.scale.setScalar(.42*(1-j/shot.trail.length)+.08);p.material.opacity=(1-j/shot.trail.length)*.85;});
    shot.sparks.forEach(p=>p.visible=false);
   }else{
    if(!shot.reported){shot.reported=true;shot.onImpact?.(!shot.lost&&(!shot.getTarget||!!shot.getTarget()));}if(shot.lost){remove(shot);shots.splice(i,1);continue;}
    canvas.dataset.phase='impact';shot.ball.visible=false;shot.trail.forEach(p=>p.visible=false);
    const burst=(age-shot.flight)/.7;shot.blast.visible=true;shot.blast.scale.setScalar(.35+burst*2.8);shot.blast.material.opacity=1-burst;
    shot.sparks.forEach((p,j)=>{p.visible=true;p.position.copy(shot.end).addScaledVector(shot.directions[j],burst*2.4);p.position.y-=burst*burst*.8;p.material.opacity=1-burst;p.scale.setScalar(.26*(1-burst)+.03);});
   }
  }
  renderer.render(scene,camera);
  if(shots.length)frame=requestAnimationFrame(animate);else{renderer.clear();canvas.dataset.phase='idle';}
 }
 function fire({x=.5,y=.4,distance=30,getTarget,onImpact,flightMs=1400}={}){
  if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches||renderer.getContext().isContextLost())return false;
  resize();if(!width||!height)return false;
  while(shots.length>=4)remove(shots.shift());
  // Visual depth is compressed for readability; it is not a surveyed world coordinate.
  const depth=THREE.MathUtils.clamp(distance*.35,8,25);
  const start=screenPoint(.68,.68,1.3),end=screenPoint(x,y,depth);
  const bend=start.clone().lerp(end,.45);bend.y+=.45;
  const path=new THREE.QuadraticBezierCurve3(start,bend,end),group=new THREE.Group(),ball=new THREE.Group();
  const core=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color:0xffeb9c}));
  const shell=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color:0xff7100,wireframe:true,transparent:true,opacity:.85}));shell.scale.setScalar(1.35);
  const halo=sprite(1.05);ball.add(core,shell,halo);group.add(ball);
  const trail=Array.from({length:26},()=>{const p=sprite(.4);group.add(p);return p;});
  const blast=new THREE.Mesh(torus,new THREE.MeshBasicMaterial({color:0xffc46b,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));blast.position.copy(end);group.add(blast);
  const directions=[],sparks=Array.from({length:36},(_,j)=>{const p=sprite(.2,j%3?0xffa329:0xffedbb);group.add(p);const a=j*2.39996,z=1-2*(j+.5)/36,r=Math.sqrt(1-z*z);directions.push(new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r,z));return p;});
  scene.add(group);shots.push({group,ball,halo,trail,blast,sparks,directions,path,end,started:performance.now(),flight:flightMs/1000,depth,getTarget,onImpact,lastSeen:performance.now(),lost:false,reported:false});
  if(!frame)frame=requestAnimationFrame(animate);return true;
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();clear();canvas.dataset.renderer='unavailable';});
 return{fire,clear};
}
