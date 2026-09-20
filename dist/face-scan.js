// Guided face scan shown right after joining. It runs itself: the player only has to
// follow one short instruction at a time while a ring fills up. Builds its own dialog and styles.
import {startFaceEngine,detectFaces} from './face-client.js?v=face13';
import {MATCH,MAX_SAMPLES,AVATAR,addSample,headTurn,avatarCrop} from './face-id.js?v=face13';
// need: samples to collect in this step. turn: which way the head must face. settle: a short pause so
// the player can get into the pose first. Every step gives up after `limit` and moves on, so nobody gets stuck.
const STEPS=[
 {key:'front',text:'Look straight at the camera',need:2,turn:'front',limit:9000},
 {key:'side',text:'Slowly turn your head to one side',need:1,turn:'side',limit:8000},
 {key:'other',text:'Now slowly turn the other way',need:1,turn:'other',limit:8000},
 {key:'aim',text:'Last one: raise your phone like you’re aiming at someone',need:1,turn:'any',settle:1200,limit:7000},
];
const TARGET=STEPS.reduce((n,s)=>n+s.need,0),MIN_TO_PASS=3,SAMPLE_GAP_MS=450;
const CSS='.face-dialog{text-align:center}.face-dialog h2{margin:0 0 4px}.face-sub{margin:0 0 12px}.face-stage{position:relative;width:min(68vw,250px);aspect-ratio:1;margin:0 auto 12px}.face-stage video{position:absolute;inset:7%;width:86%;height:86%;object-fit:cover;border-radius:50%;transform:scaleX(-1);background:#090d13}.face-ring{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg)}.face-ring circle{fill:none;stroke-width:4}.face-ring .track{stroke:#3a4150}.face-ring .progress{stroke:#ff9958;stroke-linecap:round;stroke-dasharray:295.3;stroke-dashoffset:295.3;transition:stroke-dashoffset .35s ease}.face-dialog.done .face-ring .progress{stroke:#7be0a0}.face-stage.pulse{animation:face-pulse .3s ease}.face-check{position:absolute;inset:7%;display:none;align-items:center;justify-content:center;border-radius:50%;background:#0d131cc9;color:#7be0a0;font-size:4.5rem}.face-dialog.done .face-check{display:flex}.face-step{min-height:3.2em;margin:0 0 10px;font-size:1.15rem;font-weight:700;color:#f6f4ef!important;line-height:1.3}.face-step.warn{color:#ffd0a8!important}.face-dots{display:flex;justify-content:center;gap:6px;margin:0 0 14px;padding:0;list-style:none}.face-dots li{width:26px;height:5px;border-radius:3px;background:#3a4150}.face-dots li.active{background:#ff9958}.face-dots li.complete{background:#7be0a0}.face-dialog .primary{width:100%}.face-dialog [hidden]{display:none}@keyframes face-pulse{50%{transform:scale(1.04)}}@media(prefers-reduced-motion:reduce){.face-stage.pulse{animation:none}.face-ring .progress{transition:none}}';
// Prepare camera and recognition concurrently, handling either failure immediately. A late
// camera permission response after cancellation must release its stream, not reclaim the camera.
export async function prepareFaceScan({loadEngine,getCamera,startVideo,isCurrent=()=>true,onProgress=()=>{},cameraTimeoutMs=30000}){
 let failed=false,camera=null,cameraReady=false,timer;
 const release=()=>camera?.getTracks().forEach(track=>track.stop());
 const engine=Promise.resolve().then(()=>loadEngine(text=>{if(!failed&&isCurrent())onProgress(text);})).then(()=>{if(!failed&&isCurrent()&&!cameraReady)onProgress('Starting camera… Allow access if asked.');},error=>{throw Object.assign(Error(error.message||'Face recognition could not load'),{stage:'engine'});});
 const cameraTask=Promise.resolve().then(getCamera).then(async stream=>{
  camera=stream;if(failed||!isCurrent()){release();return;}
  await startVideo(stream);cameraReady=true;
 });
 try{await Promise.all([engine,Promise.race([cameraTask,new Promise((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(Error('Camera did not start. Check camera permission, then tap Try again.'),{name:'CameraTimeoutError'})),cameraTimeoutMs);})])]);}
 catch(error){failed=true;release();throw error;}
 finally{clearTimeout(timer);}
}
export function setupFaceScan({beforeOpen=()=>{},onSave,onClose=()=>{},onSample=()=>{}}){
 const style=document.createElement('style');style.textContent=CSS;document.head.append(style);
 const dialog=document.createElement('dialog');dialog.className='face-dialog';dialog.setAttribute('aria-labelledby','face-title');
 dialog.innerHTML='<h2 id="face-title">Scan your face</h2><p class="face-sub">This is how other players’ phones recognise you. Nothing to wear or hold.</p><div class="face-stage"><video autoplay muted playsinline></video><svg class="face-ring" viewBox="0 0 100 100" aria-hidden="true"><circle class="track" cx="50" cy="50" r="47"/><circle class="progress" cx="50" cy="50" r="47"/></svg><div class="face-check" aria-hidden="true">✓</div></div><p class="face-step" role="status" aria-live="polite"></p><ol class="face-dots" aria-hidden="true"></ol><button type="button" class="primary face-retry" hidden>Try again</button><button type="button" class="text-button face-cancel">Cancel</button><p class="fine">Your numeric face signature is shared only with arena players. Your small face photo appears on the map and public top-three/crown displays while available. These are kept in memory, not saved to the leaderboard file.</p>';
 document.body.append(dialog);
 const video=dialog.querySelector('video'),stage=dialog.querySelector('.face-stage'),ring=dialog.querySelector('.progress'),stepText=dialog.querySelector('.face-step'),dots=dialog.querySelector('.face-dots'),retry=dialog.querySelector('.face-retry');
 dots.replaceChildren(...STEPS.map(()=>document.createElement('li')));
 let stream=null,epoch=0,saved=false,finished=true;
 const say=(text,warn=false)=>{if(stepText.textContent!==text)stepText.textContent=text;stepText.classList.toggle('warn',warn);};
 const progress=count=>{ring.style.strokeDashoffset=String(295.3*(1-Math.min(1,count/TARGET)));};
 function stop(){epoch++;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;}
 function snapshot(box){
  try{const crop=avatarCrop(box,video.videoWidth,video.videoHeight),canvas=document.createElement('canvas');canvas.width=canvas.height=AVATAR.size;canvas.getContext('2d').drawImage(video,crop.x,crop.y,crop.size,crop.size,0,0,AVATAR.size,AVATAR.size);
   for(const quality of [.72,.55,.4]){const image=canvas.toDataURL('image/jpeg',quality);if(image.length<=AVATAR.maxLength)return image;}}catch{}
  return null;
 }
 // What is wrong with the current view, in words a first-time player can act on. Null means it is good.
 function problem(face,width,height){
  if(!face)return'Put your face inside the circle';
  const cx=(face.box.x+face.box.width/2)/width,cy=(face.box.y+face.box.height/2)/height,share=face.box.width/Math.min(width,height);
  if(share<.22||face.pixels<MATCH.minEnrolPx)return'Move closer';if(share>.8)return'Move back a little';
  if(Math.abs(cx-.5)>.22||Math.abs(cy-.5)>.25)return'Centre your face in the circle';if(face.score<.6)return'Find brighter light';return null;
 }
 async function run(){
  const e=++epoch,person={samples:[]},uppers=[];let avatar=null;saved=false;dialog.classList.remove('done');retry.hidden=true;progress(0);for(const dot of dots.children)dot.className='';
  say('Starting face recognition…');
  try{
   await prepareFaceScan({loadEngine:startFaceEngine,isCurrent:()=>e===epoch&&dialog.open,onProgress:text=>say(text),
    getCamera:()=>{if(!navigator.mediaDevices?.getUserMedia)throw Object.assign(Error('no camera'),{name:'NotSupportedError'});return navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:960},height:{ideal:1280}},audio:false});},
    startVideo:async s=>{stream=s;video.srcObject=s;await video.play();}});
  }catch(error){if(e!==epoch)return;stop();say(error.stage==='engine'?(error.message.includes('Try again')?error.message:`${error.message}. Check your connection, then tap Try again`):error.name==='NotAllowedError'?'Allow camera access, then tap Try again':error.name==='CameraTimeoutError'?error.message:'Could not open the camera. Close other camera apps, then tap Try again',true);retry.hidden=false;return;}
  if(e!==epoch||!dialog.open)return;
  const scanDeadline=Date.now()+60000;let index=0,taken=0,stepStarted=Date.now(),lastSample=0,firstSide=0;
  while(e===epoch&&dialog.open&&index<STEPS.length&&Date.now()<scanDeadline){
   const step=STEPS[index],now=Date.now();dots.children[index].className='active';
   if(now-stepStarted>step.limit){dots.children[index].className=taken?'complete':'';index++;taken=0;stepStarted=Date.now();continue;}
   if(video.readyState<2||!video.videoWidth){await new Promise(r=>setTimeout(r,100));continue;}
   let face=null;try{face=(await detectFaces(video,[{x:0,y:0,width:video.videoWidth,height:video.videoHeight,maxSize:640,detectSize:640,full:true}],{describeMax:1,upper:true,focus:{x:video.videoWidth/2,y:video.videoHeight/2}})).faces.sort((a,b)=>b.box.width-a.box.width)[0]||null;}catch{if(e!==epoch||!dialog.open)return;stop();say('Face recognition stopped responding. Tap Try again',true);retry.hidden=false;return;}
   if(e!==epoch||!dialog.open)return;
   const issue=problem(face,video.videoWidth,video.videoHeight);
   if(issue){say(issue,true);stepStarted+=120;await new Promise(r=>setTimeout(r,60));continue;}
   say(step.text);const turn=headTurn(face.landmarks),posed=step.turn==='front'?Math.abs(turn)<.18:step.turn==='side'?Math.abs(turn)>.22:step.turn==='other'?Math.abs(turn)>.22&&Math.sign(turn)!==firstSide:true;
   if(posed&&face.descriptor&&Date.now()-stepStarted>(step.settle||0)&&Date.now()-lastSample>SAMPLE_GAP_MS&&person.samples.length<MAX_SAMPLES&&addSample(person,face.descriptor,{max:MAX_SAMPLES,minSpacing:0})){
    if(face.upper)uppers.push(Array.from(face.upper));lastSample=Date.now();taken++;
    // The map marker: the first straight-on frame, cropped to the head and shrunk to a small square.
    if(!avatar&&step.turn==='front')avatar=snapshot(face.box);if(step.turn==='side')firstSide=Math.sign(turn);progress(person.samples.length);stage.classList.remove('pulse');void stage.offsetWidth;stage.classList.add('pulse');onSample(person.samples.length);
    if(taken>=step.need){dots.children[index].className='complete';index++;taken=0;stepStarted=Date.now();}
   }
   await new Promise(r=>setTimeout(r,40));
  }
  if(e!==epoch||!dialog.open)return;
  if(person.samples.length>=MIN_TO_PASS){saved=true;progress(TARGET);dialog.classList.add('done');say('You’re in!');onSave(person.samples,uppers,avatar);setTimeout(()=>{if(e===epoch&&dialog.open)shut();},900);}
  else{say('That didn’t get a clear view. Face a light, hold the phone at arm’s length, then tap Try again',true);retry.hidden=false;}
 }
 retry.onclick=()=>{stop();void run();};
 // Closing hands the camera back to the game exactly once. It does not wait for the dialog's own close
 // event, which browsers deliver on an animation frame and so can arrive late or not at all in a hidden tab;
 // that event is still handled for the Escape key and the system back gesture.
 function finish(){if(finished)return;finished=true;stop();onClose(saved);}
 function shut(){if(dialog.open)dialog.close();finish();}
 dialog.querySelector('.face-cancel').onclick=shut;
 dialog.addEventListener('close',finish);
 return{open(){if(dialog.open)return;beforeOpen();finished=false;dialog.showModal();void run();},stop(){finished=true;stop();if(dialog.open)dialog.close();},get isOpen(){return dialog.open;}};
}
