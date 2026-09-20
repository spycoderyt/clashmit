import * as THREE from './vendor/three.module.js';
import {GLTFLoader} from './vendor/GLTFLoader.js';
import {rocketPath,rocketMapPath} from './orbital-rules.js';
let assets;
export function preloadRocket(){
 return assets??=Promise.all(['rocket_baseA','rocket_fuelA','rocket_topA'].map(name=>new GLTFLoader().loadAsync(`/models/rocket/${name}.glb`))).catch(error=>{assets=null;throw error;});
}
export async function createOrbitalRenderer(container){
 const models=await preloadRocket(),renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'low-power'});
 renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));renderer.setClearColor(0,0);renderer.domElement.className='orbital-canvas';renderer.domElement.setAttribute('aria-label','3D rocket flying in an arc');container.prepend(renderer.domElement);
 const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(52,1,.1,40);scene.add(new THREE.HemisphereLight(0xffffff,0x607991,3));
 const light=new THREE.DirectionalLight(0xffefce,4);light.position.set(-3,5,6);scene.add(light);
 const rocket=new THREE.Group(),shell=new THREE.Group();rocket.add(shell);scene.add(rocket);
 // Original Kenney modular meshes; remove their export offset and stack their connectors.
 for(let i=0;i<models.length;i++){
  const part=models[i].scene.clone(true),box=new THREE.Box3().setFromObject(part),center=box.getCenter(new THREE.Vector3());
  part.position.set(-center.x,[0,1.6,2.1][i]-box.min.y,-center.z);part.traverse(o=>{if(o.isMesh){o.material=o.material.clone();o.material.metalness=.25;o.material.roughness=.48;}});shell.add(part);
 }
 shell.position.y=-1.45;rocket.scale.setScalar(.8);
 const flame=new THREE.Mesh(new THREE.ConeGeometry(.25,1.1,10),new THREE.MeshBasicMaterial({color:0xffb834,transparent:true,opacity:.9}));flame.rotation.z=Math.PI;flame.position.y=-1.9;rocket.add(flame);
 const portrait=new THREE.Sprite(new THREE.SpriteMaterial({depthTest:false,transparent:true}));portrait.position.set(0,1.12,.35);portrait.scale.set(.7,.7,1);portrait.renderOrder=4;rocket.add(portrait);
 let serial=0,lastSize='',lost=false;
 renderer.domElement.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;});
 function face(photo,name){
  const id=++serial,canvas=document.createElement('canvas');canvas.width=canvas.height=128;const ctx=canvas.getContext('2d');
  function paint(img){if(id!==serial)return;ctx.clearRect(0,0,128,128);ctx.save();ctx.beginPath();ctx.arc(64,64,60,0,Math.PI*2);ctx.clip();ctx.fillStyle='#e8f2ff';ctx.fillRect(0,0,128,128);if(img)ctx.drawImage(img,0,0,128,128);else{ctx.fillStyle='#142535';ctx.font='bold 72px system-ui';ctx.textAlign='center';ctx.fillText((name||'?')[0],64,90);}ctx.restore();ctx.strokeStyle='#ffd777';ctx.lineWidth=7;ctx.beginPath();ctx.arc(64,64,60,0,Math.PI*2);ctx.stroke();portrait.material.map?.dispose();portrait.material.map=new THREE.CanvasTexture(canvas);portrait.material.map.colorSpace=THREE.SRGBColorSpace;portrait.material.needsUpdate=true;}
  paint();if(photo){const img=new Image();img.onload=()=>paint(img);img.src=photo;}
 }
 function render(progress,{caster=false,target}={}){if(lost)return;const width=container.clientWidth,height=container.clientHeight;if(!width||!height)return;
  if(lastSize!==`${width}/${height}`){lastSize=`${width}/${height}`;renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();}
  const path=caster?rocketMapPath(progress,camera.aspect,target):rocketPath(progress,camera.aspect);rocket.scale.setScalar(caster?.6:.8);rocket.position.fromArray(path.position);rocket.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),new THREE.Vector3().fromArray(path.tangent).normalize());shell.rotation.y=progress*1.8;flame.scale.y=.85+.15*Math.sin(progress*180);renderer.render(scene,camera);
 }
 return{face,render,dispose(){serial++;scene.traverse(o=>{o.geometry?.dispose();if(o.material){o.material.map?.dispose();o.material.dispose();}});renderer.dispose();renderer.domElement.remove();}};
}
