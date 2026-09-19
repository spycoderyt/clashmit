import {colorProfile} from './shirt.js?v=coverage1';
export function setupShirtCamera({beforeOpen,onSave,onClose,onError}){
 const $=id=>document.getElementById(id),dialog=$('shirt-dialog'),video=$('shirt-camera');let stream,profile,opening=false,epoch=0;
 function stop(){epoch++;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;}
 async function enable(){if(opening)return;opening=true;const e=epoch;$('shirt-enable').disabled=true;try{const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:960}},audio:false});if(!dialog.open||e!==epoch){s.getTracks().forEach(t=>t.stop());return;}stream=s;video.srcObject=s;await video.play();$('shirt-capture').disabled=false;$('shirt-enable').hidden=true;}catch{$('shirt-message').textContent='Allow camera access in your browser, then try again.';}finally{opening=false;$('shirt-enable').disabled=false;}}
 $('shirt-enable').onclick=enable;
 $('shirt-capture').onclick=()=>{
  if(!video.videoWidth)return;
  // Preview is stretched to its container. Guide uses the same percentages of its image.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,video.videoWidth*.3,video.videoHeight*.4,video.videoWidth*.4,video.videoHeight*.3,0,0,96,96);profile=colorProfile(ctx.getImageData(0,0,96,96).data);
  $('shirt-swatch').style.background=`rgb(${profile.rgb.join(',')})`;$('shirt-swatch').hidden=false;$('shirt-save').disabled=false;$('shirt-message').textContent='Check the dominant shirt color below. Retake if it looks like skin or background.';
 };
 $('shirt-save').onclick=()=>{if(profile){onSave(profile);dialog.close();}};
 $('shirt-cancel').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{stop();onClose();});
 return{open:()=>{beforeOpen();profile=null;$('shirt-swatch').hidden=true;$('shirt-save').disabled=true;$('shirt-capture').disabled=true;$('shirt-enable').hidden=false;$('shirt-message').textContent='Point the selfie camera at your shirt. Fill the outlined area with fabric.';dialog.showModal();},stop:()=>{stop();if(dialog.open)dialog.close();}};
}
