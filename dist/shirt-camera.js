import {colorProfile} from './shirt.js?v=face1';
import {bandColor} from './headband.js?v=face1';
export function setupShirtCamera({beforeOpen,onSave,onClose,onError}){
 const $=id=>document.getElementById(id),dialog=$('shirt-dialog'),video=$('shirt-camera');let stream,profile,opening=false,epoch=0;
 function stop(){epoch++;stream?.getTracks().forEach(t=>t.stop());stream=null;video.srcObject=null;}
 async function enable(){if(opening)return;opening=true;const e=epoch;$('shirt-enable').disabled=true;try{const s=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:960}},audio:false});if(!dialog.open||e!==epoch){s.getTracks().forEach(t=>t.stop());return;}stream=s;video.srcObject=s;await video.play();$('shirt-capture').disabled=false;$('shirt-enable').hidden=true;}catch{$('shirt-message').textContent='Allow camera access in your browser, then try again.';}finally{opening=false;$('shirt-enable').disabled=false;}}
 $('shirt-enable').onclick=enable;
 $('shirt-capture').onclick=()=>{
  if(!video.videoWidth)return;
  // Preview is stretched to its container. Guide uses the same percentages of its image.
  const canvas=document.createElement('canvas');canvas.width=canvas.height=96;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,video.videoWidth*.3,video.videoHeight*.32,video.videoWidth*.4,video.videoHeight*.1,0,0,96,96);profile=colorProfile(ctx.getImageData(0,0,96,96).data);
  $('shirt-swatch').style.background=`rgb(${profile.rgb.join(',')})`;$('shirt-swatch').hidden=false;$('shirt-save').disabled=!bandColor(profile.rgb);$('shirt-message').textContent=bandColor(profile.rgb)?`Detected ${bandColor(profile.rgb)}. Check the swatch, then use this headband.`:'No clear red or blue sample. Fill the narrow guide with headband fabric and retake.';
 };
 $('shirt-save').onclick=()=>{if(profile){onSave(profile);dialog.close();}};
 $('shirt-cancel').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{stop();onClose();});
 return{open:()=>{beforeOpen();profile=null;$('shirt-swatch').hidden=true;$('shirt-save').disabled=true;$('shirt-capture').disabled=true;$('shirt-enable').hidden=false;$('shirt-message').textContent='Line up your red or blue headband with the narrow guide. Fill it with fabric, not skin or hair.';dialog.showModal();},stop:()=>{stop();if(dialog.open)dialog.close();}};
}
