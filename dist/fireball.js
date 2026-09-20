import * as THREE from './vendor/three.module.js';

// A perspective scene composited over the camera; it does not track real surfaces.
// One flight animation serves every thrown spell; a look changes only its colors, arc, trail and burst.
const LOOKS={
 fireball:{core:0xffeb9c,shell:0xff7100,halo:0xffb14d,trail:0xffb14d,sparks:[0xffa329,0xffedbb],blast:0xffc46b,glow:'fire',arc:.45,trailCount:26,trailGap:.014,trailSize:1,shape:'ball',burst:'sparks',burstSec:.7},
 poison:{core:0xe6ffb0,shell:0x3fae1e,halo:0x7dff4a,trail:0x6fe03a,sparks:[0x5fd22f,0xc9ff8f],blast:0x8cff5a,glow:'soft',arc:.15,trailCount:26,trailGap:.026,trailSize:1.15,shape:'ball',burst:'cloud',burstSec:1.3},
 // A volley flies a ballistic arc, leaves only a faint streak, and sticks in the target instead of bursting.
 arrows:{core:0x8a5a2b,shell:0xd5d8de,halo:0xffffff,trail:0xffffff,sparks:[0xe8dcc0,0xffffff],blast:0xe8dcc0,glow:'soft',arc:.2,trailCount:8,trailGap:.011,trailSize:.2,shape:'arrows',burst:'stick',burstSec:.9}
};
export function createFireballRenderer(container){
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setClearColor(0x000000,0);renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
 const canvas=renderer.domElement;canvas.className='spell-scene';canvas.setAttribute('aria-hidden','true');canvas.dataset.renderer='webgl';container.append(canvas);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(55,1,.1,100);
 const sphere=new THREE.IcosahedronGeometry(.19,2),torus=new THREE.TorusGeometry(1,.035,6,48),up=new THREE.Vector3(0,1,0),heading=new THREE.Vector3(),wobble=new THREE.Quaternion(),roll=new THREE.Vector3(0,0,1);
 // One arrow, modelled along +Y: wooden shaft, steel head, three vanes of fletching at the tail.
 const shaftGeo=new THREE.CylinderGeometry(.016,.016,.9,6),headGeo=new THREE.ConeGeometry(.05,.17,8),vaneGeo=new THREE.BoxGeometry(.004,.2,.075),nockGeo=new THREE.CylinderGeometry(.02,.02,.04,6);
 function glow(stops){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),gradient=ctx.createRadialGradient(32,32,0,32,32,32);for(const [at,color] of stops)gradient.addColorStop(at,color);ctx.fillStyle=gradient;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}
 // The fire glow is baked orange; the soft glow is white so a look can tint it any color.
 const glows={fire:glow([[0,'rgba(255,255,240,1)'],[.17,'rgba(255,226,145,.98)'],[.42,'rgba(255,114,20,.65)'],[1,'rgba(255,50,0,0)']]),soft:glow([[0,'rgba(255,255,255,1)'],[.3,'rgba(255,255,255,.7)'],[1,'rgba(255,255,255,0)']])};
 const shots=[];let frame=0,width=0,height=0;
 function resize(){const rect=container.getBoundingClientRect();if(rect.width===width&&rect.height===height)return;width=rect.width;height=rect.height;if(!width||!height)return;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
 function sprite(size,color=0xffb14d,map=glows.fire){const mat=new THREE.SpriteMaterial({map,color,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending});const s=new THREE.Sprite(mat);s.scale.setScalar(size);return s;}
 function screenPoint(x,y,z){const halfHeight=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*z;return new THREE.Vector3((x*2-1)*halfHeight*camera.aspect,(1-y*2)*halfHeight,-z);}
 // Sample a continuous per-shot spiral, so the tail follows the same bends as the core.
 function flightPoint(shot,u,out){
  shot.path.getPoint(u,out);
  if(!shot.swirl||u<=0||u>=1)return out;
  const s=shot.swirl,envelope=Math.sin(Math.PI*u)**1.4;
  const angle=s.phase+u*s.turns*Math.PI*2+.35*Math.sin(u*9+s.phase);
  const radius=envelope*(.72+.28*Math.sin(u*13+s.phase));
  const halfHeight=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*-out.z;
  const scale=halfHeight*Math.min(camera.aspect,1)*s.width;
  out.x+=scale*radius*(Math.cos(angle)+.35*Math.sin(u*7+s.phase));
  out.y+=scale*radius*(.75*Math.sin(angle)+.25*Math.sin(u*11+s.phase));
  return out;
 }
 function remove(shot){scene.remove(shot.group);shot.group.traverse(o=>{if(o.material)o.material.dispose();});}
 function clear(){cancelAnimationFrame(frame);frame=0;for(const shot of shots)remove(shot);shots.length=0;renderer.clear();canvas.dataset.phase='idle';}
 function animate(time){
  frame=0;resize();
  for(let i=shots.length-1;i>=0;i--){
   const shot=shots[i],age=(time-shot.started)/1000,t=age/shot.flight;
   const look=shot.look;if(age>shot.flight+look.burstSec||(shot.incoming&&t>=1)){remove(shot);shots.splice(i,1);continue;}
   if(t<1){
    canvas.dataset.phase='flight';shot.ball.visible=true;shot.blast.visible=false;
    // Ease the world-space advance to keep the near-to-far travel legible.
    if(shot.incoming){
     const source=shot.getSource?.();
     if(source&&(!shot.hiddenSource||t<.8)){shot.lastSeen=time;shot.hiddenSource=false;shot.path.v0.lerp(screenPoint(source.x,source.y,shot.depth),.22);}
     const fade=THREE.MathUtils.clamp(1-(time-shot.lastSeen-100)/200,0,1);if(!fade)shot.hiddenSource=true;
     shot.visibility=fade;shot.group.visible=fade>0;shot.path.v1.copy(shot.path.v0).lerp(shot.end,.45);shot.path.v1.y+=look.arc*.55;
    }else if(shot.getTarget){const target=shot.getTarget();if(target){shot.lastSeen=time;shot.end.lerp(screenPoint(target.x,target.y,shot.depth),.22);shot.path.v1.copy(shot.path.v0).lerp(shot.end,.45);shot.path.v1.y+=look.arc;shot.blast.position.copy(shot.end);}else if(time-shot.lastSeen>700){shot.lost=true;}}
    const travel=t*t;flightPoint(shot,travel,shot.ball.position);
    // Shafts fly point-first along the path; a ball just spins.
    if(look.shape==='arrows'){
     // The path runs into the scene, so a true heading shows each shaft end-on as a dot. Flattening the depth keeps them pointing at the target on screen.
     shot.path.getTangent(Math.min(.999,travel),heading);heading.z*=.1;if(heading.lengthSq()>1e-8)shot.ball.quaternion.setFromUnitVectors(up,heading.normalize());
     // Fletching makes an arrow spin about its own shaft in flight.
     shot.arrows.forEach((arrow,j)=>{arrow.rotation.y=time*.021+j*2;});
    }else{shot.ball.rotation.z=time*.008;shot.halo.scale.setScalar(.95+Math.sin(time*.027)*.11);}
    shot.trail.forEach((p,j)=>{const u=travel-j*look.trailGap;p.visible=u>0;if(!p.visible)return;flightPoint(shot,Math.max(0,u),p.position);p.position.x+=Math.sin(j*2+time*.009)*.035;p.position.y+=Math.cos(j+time*.005)*.03;p.scale.setScalar((.42*(1-j/shot.trail.length)+.08)*look.trailSize);p.material.opacity=(1-j/shot.trail.length)*.85;});
    shot.sparks.forEach(p=>p.visible=false);
    if(shot.incoming){for(const [material,full] of shot.parts)material.opacity=full*shot.visibility;shot.trail.forEach(p=>p.material.opacity*=shot.visibility);}
   }else{
    if(!shot.reported){shot.reported=true;shot.onImpact?.(!shot.lost&&(!shot.getTarget||!!shot.getTarget()));}if(shot.lost){remove(shot);shots.splice(i,1);continue;}
    canvas.dataset.phase='impact';shot.ball.visible=false;shot.trail.forEach(p=>p.visible=false);
    const burst=(age-shot.flight)/look.burstSec;shot.blast.visible=true;shot.blast.material.opacity=1-burst;
    if(look.burst==='cloud'){
     // Poison hangs and swells instead of bursting and falling.
     shot.blast.scale.setScalar(.3+burst*1.5);
     shot.sparks.forEach((p,j)=>{p.visible=true;p.position.copy(shot.end).addScaledVector(shot.directions[j],.25+burst*1.1);p.position.y+=burst*.35;p.material.opacity=(1-burst)*.75;p.scale.setScalar(.55+burst*.9);});
    }else if(look.burst==='stick'){
     // Arrows bury themselves where they land and quiver to rest, then fade.
     shot.ball.visible=true;shot.ball.position.copy(shot.end);shot.stuck??=shot.ball.quaternion.clone();
     wobble.setFromAxisAngle(roll,Math.sin((age-shot.flight)*75)*.17*Math.exp(-burst*7));shot.ball.quaternion.copy(shot.stuck).multiply(wobble);
     for(const [material] of shot.parts)material.opacity=1-burst*burst*burst;
     shot.blast.scale.setScalar(.1+burst*.55);shot.blast.material.opacity=(1-burst)*.5;
     shot.sparks.forEach((p,j)=>{p.visible=j<10&&burst<.5;if(!p.visible)return;p.position.copy(shot.end).addScaledVector(shot.directions[j],burst*.7);p.material.opacity=1-burst*2;p.scale.setScalar(.1*(1-burst)+.02);});
    }else{
     shot.blast.scale.setScalar(.35+burst*2.8);
     shot.sparks.forEach((p,j)=>{p.visible=true;p.position.copy(shot.end).addScaledVector(shot.directions[j],burst*2.4);p.position.y-=burst*burst*.8;p.material.opacity=1-burst;p.scale.setScalar(.26*(1-burst)+.03);});
    }
   }
  }
  renderer.render(scene,camera);
  if(shots.length)frame=requestAnimationFrame(animate);else{renderer.clear();canvas.dataset.phase='idle';}
 }
 function fire({x=.5,y=.4,distance=30,getTarget,onImpact,flightMs=1400,elapsedMs=0,incoming=false,getSource,shotId,style='fireball'}={}){
  const look=Object.hasOwn(LOOKS,style)?LOOKS[style]:LOOKS.fireball,map=glows[look.glow];
  if(document.hidden||matchMedia('(prefers-reduced-motion: reduce)').matches||renderer.getContext().isContextLost())return false;
  resize();if(!width||!height)return false;
  while(shots.length>=4)remove(shots.shift());
  // Visual depth is compressed for readability; it is not a surveyed world coordinate.
  const depth=THREE.MathUtils.clamp(distance*.35,8,25);
  const start=incoming?screenPoint(x,y,depth):screenPoint(.68,.68,1.3),end=incoming?screenPoint(.5,.53,.65):screenPoint(x,y,depth);
  const bend=start.clone().lerp(end,.45);bend.y+=look.arc;
  const path=new THREE.QuadraticBezierCurve3(start,bend,end),group=new THREE.Group(),ball=new THREE.Group();
  // `parts` lists each material with its full opacity so an incoming shot can fade as one.
  const parts=[],arrows=[];let halo=null;
  if(look.shape==='arrows'){
   const paint=color=>{const material=new THREE.MeshBasicMaterial({color,transparent:true});parts.push([material,1]);return material;};
   const wood=paint(look.core),steel=paint(look.shell),red=paint(0xc8302a),cream=paint(0xf3efe6);
   // Loosed together but not in lockstep: one leads, two trail, each fanned a few degrees.
   for(const [dx,dy,fan] of [[0,0,0],[-.21,-.24,.06],[.2,-.34,-.05]]){
    const loosed=new THREE.Group(),arrow=new THREE.Group(),head=new THREE.Mesh(headGeo,steel),nock=new THREE.Mesh(nockGeo,cream);head.position.y=.53;nock.position.y=-.46;
    arrow.add(new THREE.Mesh(shaftGeo,wood),head,nock);
    for(let k=0;k<3;k++){const pivot=new THREE.Group(),vane=new THREE.Mesh(vaneGeo,k?red:cream);vane.position.set(0,-.33,.05);pivot.rotation.y=k*2.0944;pivot.add(vane);arrow.add(pivot);}
    loosed.position.set(dx,dy,0);loosed.rotation.z=fan;loosed.add(arrow);ball.add(loosed);arrows.push(arrow);
   }
  }else{
   const core=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color:look.core,transparent:incoming,depthWrite:!incoming}));
   const shell=new THREE.Mesh(sphere,new THREE.MeshBasicMaterial({color:look.shell,wireframe:true,transparent:true,opacity:.85}));shell.scale.setScalar(1.35);
   halo=sprite(1.05,look.halo,map);ball.add(core,shell,halo);parts.push([core.material,1],[shell.material,.85],[halo.material,1]);
  }
  group.add(ball);
  const trail=Array.from({length:look.trailCount},()=>{const p=sprite(.4,look.trail,map);group.add(p);return p;});
  const blast=new THREE.Mesh(torus,new THREE.MeshBasicMaterial({color:look.blast,transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));blast.position.copy(end);group.add(blast);
  const directions=[],sparks=Array.from({length:36},(_,j)=>{const p=sprite(.2,look.sparks[j%3?0:1],map);group.add(p);const a=j*2.39996,z=1-2*(j+.5)/36,r=Math.sqrt(1-z*z);directions.push(new THREE.Vector3(Math.cos(a)*r,Math.sin(a)*r,z));return p;});
  scene.add(group);shots.push({swirl:look===LOOKS.fireball?{phase:Math.random()*Math.PI*2,turns:1.5+Math.random(),width:.24+Math.random()*.12}:null,look,parts,arrows,group,ball,halo,trail,blast,sparks,directions,path,end,started:performance.now()-Math.max(0,elapsedMs),flight:Math.max(1,flightMs)/1000,depth,getTarget,getSource,onImpact,incoming,shotId,visibility:1,hiddenSource:false,lastSeen:performance.now(),lost:false,reported:false});
  if(!frame)frame=requestAnimationFrame(animate);return true;
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
 canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();clear();canvas.dataset.renderer='unavailable';});
 function cancelIncoming(shotId){for(let i=shots.length-1;i>=0;i--)if(shots[i].incoming&&shots[i].shotId===shotId){remove(shots[i]);shots.splice(i,1);}}
 return{fire,incoming:options=>fire({...options,incoming:true}),cancelIncoming,clear};
}
