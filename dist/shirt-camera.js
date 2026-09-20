import {bandProfile} from './shirt.js?v=pair1';
export function setupShirtCamera({beforeOpen,onSave,onClose,onError}){
 const $=id=>document.getElementById(id),dialog=$('shirt-dialog'),video=$('shirt-camera');let stream,profile,opening=false,epoch=0;
 function stop(){epoch++;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;}
 async function enable(){if(opening)return;opening=true;const e=epoch;$('shirt-enable').disabled=true;try{const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:960}},audio:false});if(!dialog.open||e!==epoch){s.getTracks().forEach(t=>t.stop());return;}stream=s;video.srcObject=s;await video.play();$('shirt-capture').disabled=false;$('shirt-enable').hidden=true;}catch{$('shirt-message').textContent='Allow camera access in your browser, then try again.';}finally{opening=false;$('shirt-enable').disabled=false;}}
 $('shirt-enable').onclick=enable;
 $('shirt-capture').onclick=()=>{
  if(!video.videoWidth)return;
  // Preview is stretched to its container. Guide uses the same percentages of
  // its image: one stripe in the top half, the other in the bottom half.
  const w=video.videoWidth,h=video.videoHeight;
  const sample=top=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,w*.3,h*top,w*.4,h*.07,0,0,96,96);return ctx.getImageData(0,0,96,96).data;};
  profile=bandProfile(sample(.3),sample(.37));
  $('shirt-swatch-top').style.background=`rgb(${profile.top.rgb.join(',')})`;
  $('shirt-swatch-bottom').style.background=`rgb(${profile.bottom.rgb.join(',')})`;
  $('shirt-swatch').hidden=false;$('shirt-save').disabled=!profile.id;
  $('shirt-message').textContent=profile.id?`Detected ${profile.id.replace('-',' over ')}. Check both swatches, then use this headband.`:'Could not read two colors. Put one stripe above the orange line and the other below it, then retake.';
 };
 $('shirt-save').onclick=()=>{if(profile){onSave(profile);dialog.close();}};
 $('shirt-cancel').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{stop();onClose();});
 return{open:()=>{beforeOpen();profile=null;$('shirt-swatch').hidden=true;$('shirt-save').disabled=true;$('shirt-capture').disabled=true;$('shirt-enable').hidden=false;$('shirt-message').textContent='Line up your headband so the orange line sits on the boundary between its two stripes.';dialog.showModal();},stop:()=>{stop();if(dialog.open)dialog.close();}};
}
