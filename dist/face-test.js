// Standalone range test for on-device face recognition. Not part of the game loop yet:
// it exists to measure detection and match rates on real phones before face lock is built.
import {loadFaceEngine,describeFaces} from './face-engine.js?v=face10';
import {MATCH,matchFace,createIdentityVoter,addSample,estimateMetres,summarize} from './face-id.js?v=face10';
const $=id=>document.getElementById(id);
const video=$('video'),still=$('still'),overlay=$('overlay'),ctx=overlay.getContext('2d');
const gallery=[],voter=createIdentityVoter();let stream=null,facing='user',source=null,busy=false,running=false,enrolling=null,recording=null,lastFaces=[];
const status=text=>{$('status').textContent=text;};
const percent=value=>Math.round(value*100)+'%';
function refreshPeople(){
 $('people').replaceChildren(...gallery.map(p=>{const chip=document.createElement('span');chip.textContent=`${p.name} · ${p.samples.length} samples`;return chip;}));
 $('expected').replaceChildren(...gallery.map(p=>{const o=document.createElement('option');o.value=p.id;o.textContent=p.name;return o;}),Object.assign(document.createElement('option'),{value:'',textContent:'Stranger (not enrolled)'}));
 $('record').disabled=!gallery.length||!source;
}
async function startCamera(){
 stream?.getTracks().forEach(t=>t.stop());stream=null;
 if(!navigator.mediaDevices?.getUserMedia){status('Camera needs Safari or Chrome over HTTPS.');return;}
 const [captureWidth,captureHeight]=$('capture').value.split('x').map(Number);
 try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:facing},width:{ideal:captureWidth},height:{ideal:captureHeight}},audio:false});}
 catch(e){status(e.name==='NotAllowedError'?'Allow camera access, then tap Start camera again.':'Could not open the camera. Close other camera apps and retry.');return;}
 still.hidden=true;video.hidden=false;video.srcObject=stream;await video.play();source=video;$('flip').disabled=false;await begin();
}
async function usePhoto(file){
 if(!file)return;stream?.getTracks().forEach(t=>t.stop());stream=null;video.hidden=true;still.hidden=false;still.src=URL.createObjectURL(file);await still.decode();source=still;await begin();
}
async function begin(){
 try{const backend=await loadFaceEngine(status);status(`Ready · ${backend} backend · ${source.videoWidth||source.naturalWidth}×${source.videoHeight||source.naturalHeight}`);}
 catch(e){status('Could not load the face models: '+(e.message||e));return;}
 $('enrol').disabled=false;refreshPeople();if(!running){running=true;loop();}
}
// object-fit:cover mapping from source pixels to the overlay canvas.
function drawFaces(faces,width,height){
 const rect=overlay.getBoundingClientRect(),dpr=window.devicePixelRatio||1;if(overlay.width!==Math.round(rect.width*dpr)){overlay.width=Math.round(rect.width*dpr);overlay.height=Math.round(rect.height*dpr);}
 ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
 const scale=Math.max(rect.width/width,rect.height/height),dx=(rect.width-width*scale)/2,dy=(rect.height-height*scale)/2;
 for(const face of faces){
  const x=face.box.x*scale+dx,y=face.box.y*scale+dy,w=face.box.width*scale,h=face.box.height*scale,m=face.match;
  ctx.lineWidth=3;ctx.strokeStyle=m?.confident?'#7be0a0':'#ff9958';ctx.strokeRect(x,y,w,h);ctx.fillStyle=ctx.strokeStyle;for(const [px,py] of face.landmarks||[])ctx.fillRect(px*scale+dx-1.5,py*scale+dy-1.5,3,3);
  const label=m?.confident?`${m.name} ${m.distance.toFixed(2)}`:m&&Number.isFinite(m.distance)?`? ${m.distance.toFixed(2)}`:'face';
  ctx.font='600 14px system-ui';const tw=ctx.measureText(label).width+10;ctx.fillStyle='#0d131cd9';ctx.fillRect(x,Math.max(0,y-22),tw,20);ctx.fillStyle=ctx.strokeStyle;ctx.fillText(label,x+5,Math.max(14,y-7));
 }
}
async function loop(){
 if(!source){running=false;return;}
 if(!busy&&!document.hidden&&(source!==video||video.readyState>=2)){
  busy=true;const started=performance.now(),width=source.videoWidth||source.naturalWidth,height=source.videoHeight||source.naturalHeight;
  try{
   const faces=await describeFaces(source,{zoom:Number($('zoom').value)});const ms=performance.now()-started;
   for(const face of faces)face.match=matchFace(face.descriptor,gallery,{facePx:face.box.width});
   // The voter follows the largest face, which is the person this test is pointed at.
   const main=faces[0],voted=voter.push(main?.match),votedName=gallery.find(p=>p.id===voted.id)?.name;if(main)main.voted=voted.id;lastFaces=faces;drawFaces(faces,width,height);
   if(enrolling&&main&&main.box.width>=MATCH.minEnrolPx&&main.score>=.6&&addSample(enrolling.person,main.descriptor)){refreshPeople();}
   if(recording)recording.frames.push(main?{found:true,id:voted.id,distance:main.match.distance,facePx:main.box.width,ms}:{found:false,ms});
   if(main){const m=main.match,metres=estimateMetres(main.box.width,width);$('verdict').textContent=votedName?`${votedName} · ${m.distance.toFixed(2)}`:!gallery.length?'Face found · enrol someone':m.tooSmall?`Too far to identify · face ${Math.round(main.box.width)} px`:m.confident?`Checking ${m.name}… ${voted.votes}/3`:`Unknown · closest ${m.name} ${m.distance.toFixed(2)}`;$('verdict').className=votedName?'ok':gallery.length&&!m.confident?'no':'';$('detail').textContent=`Face ${Math.round(main.box.width)} px wide · about ${metres.toFixed(1)} m · found by ${main.pass} pass · ${faces.length} face${faces.length>1?'s':''}`;}
   else{$('verdict').textContent='No face found';$('verdict').className='no';$('detail').textContent='Move closer, add light, or try a higher zoom pass.';}
   $('timing').textContent=`${Math.round(ms)} ms per frame · ${(1000/ms).toFixed(1)} fps · match if under ${MATCH.threshold}`;
  }catch(e){status('Detection failed: '+(e.message||e));}
  busy=false;
 }
 setTimeout(loop,source===still?600:30);
}
$('start').onclick=()=>startCamera();
$('flip').onclick=()=>{facing=facing==='user'?'environment':'user';startCamera();};
$('photo').onchange=e=>usePhoto(e.target.files[0]);
$('capture').onchange=()=>{if(stream)startCamera();};
$('enrol').onclick=()=>{
 const name=$('name').value.trim();if(!name){status('Type a name first.');return;}
 let person=gallery.find(p=>p.name.toLowerCase()===name.toLowerCase());if(!person){person={id:crypto.randomUUID(),name,samples:[]};gallery.push(person);}
 const before=person.samples.length;enrolling={person};$('enrol').disabled=true;status(`Enrolling ${name}: turn your head slowly, raise the phone as in a match…`);
 setTimeout(()=>{enrolling=null;$('enrol').disabled=false;const added=person.samples.length-before;if(!person.samples.length)gallery.splice(gallery.indexOf(person),1);refreshPeople();status(added?`Enrolled ${name} with ${person.samples.length} samples.`:`No usable face seen. Move closer (face at least ${MATCH.minEnrolPx} px wide) and retry.`);voter.reset();},6000);
};
$('record').onclick=()=>{
 const expected=$('expected').value||null,who=gallery.find(p=>p.id===expected)?.name||'stranger',metres=$('metres').value;recording={frames:[]};$('record').disabled=true;status(`Recording ${who} at ${metres} m for 5 seconds…`);
 setTimeout(()=>{
  const s=summarize(recording.frames,expected);recording=null;$('record').disabled=false;
  const row=document.createElement('tr');
  for(const text of [`${metres} m · ${who}`,percent(s.detectRate),expected===null?'—':percent(s.rightRate),percent(s.wrongRate),s.medianDistance?.toFixed(2)??'—',s.medianFacePx?Math.round(s.medianFacePx):'—',s.medianMs?Math.round(s.medianMs):'—']){const td=document.createElement('td');td.textContent=text;row.append(td);}
  $('results').append(row);status(`Recorded ${s.frames} frames at ${metres} m.`);
 },5000);
};
$('clear').onclick=()=>$('results').replaceChildren();
window.addEventListener('pagehide',()=>stream?.getTracks().forEach(t=>t.stop()));
// Debug hook for desktop checks where no camera exists: /face-test.html?debug
if(new URLSearchParams(location.search).has('debug'))window.faceTest={gallery,usePhotoUrl:async url=>{stream?.getTracks().forEach(t=>t.stop());video.hidden=true;still.hidden=false;still.src=url;await still.decode();source=still;await begin();},faces:()=>lastFaces,enrolNow:name=>{const face=lastFaces[0];if(!face)return false;let person=gallery.find(p=>p.name===name);if(!person){person={id:crypto.randomUUID(),name,samples:[]};gallery.push(person);}const added=addSample(person,face.descriptor);refreshPeople();return added;}};
