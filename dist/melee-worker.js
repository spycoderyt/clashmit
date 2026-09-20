// This worker receives camera bitmaps from the melee test page. It never opens a camera.
importScripts('./vendor/mediapipe/vision_bundle.js');
let handLandmarker=null,faceDetector=null,loading=null,busy=false,lastTimestamp=-Infinity;
const model=path=>new URL(path,self.location).href;
const clamp=value=>Math.max(0,Math.min(1,value));
async function init(){
 if(handLandmarker&&faceDetector)return;
 if(loading)return loading;
 loading=(async()=>{
  try{
   const files=await Vision.FilesetResolver.forVisionTasks(model('./vendor/mediapipe/wasm'));
   handLandmarker=await Vision.HandLandmarker.createFromOptions(files,{
    baseOptions:{modelAssetPath:model('./models/hand-landmarker.task'),delegate:'CPU'},
    runningMode:'VIDEO',numHands:2,minHandDetectionConfidence:.5,minHandPresenceConfidence:.5,minTrackingConfidence:.5,
   });
   faceDetector=await Vision.FaceDetector.createFromOptions(files,{
    baseOptions:{modelAssetPath:model('./models/face-detector.tflite'),delegate:'CPU'},
    runningMode:'VIDEO',minDetectionConfidence:.5,minSuppressionThreshold:.3,
   });
   lastTimestamp=-Infinity;
  }catch(error){handLandmarker?.close();faceDetector?.close();handLandmarker=faceDetector=null;throw error;}
 })();
 try{await loading;}finally{loading=null;}
}
function dropped(data,reason){postMessage({type:'frame',id:data.id,timestamp:data.timestamp,hands:[],faces:[],ms:0,dropped:true,reason});}
self.onmessage=async({data})=>{
 if(data.type==='init'){
  try{await init();postMessage({type:'ready'});}catch(error){postMessage({type:'error',message:error?.message||String(error)});}
  finally{data.bitmap?.close();}
  return;
 }
 if(data.type!=='frame'){data.bitmap?.close();return;}
 if(busy||!handLandmarker||!faceDetector){try{dropped(data,busy?'busy':'not-ready');}finally{data.bitmap?.close();}return;}
 const started=performance.now(),timestamp=data.timestamp;
 if(!Number.isFinite(timestamp)||timestamp<=lastTimestamp){try{dropped(data,'stale-timestamp');}finally{data.bitmap?.close();}return;}
 busy=true;
 try{
  const bitmap=data.bitmap;if(!bitmap?.width||!bitmap?.height)throw Error('The camera frame is empty.');
  lastTimestamp=timestamp;
  const handResult=await handLandmarker.detectForVideo(bitmap,timestamp);
  const faceResult=await faceDetector.detectForVideo(bitmap,timestamp);
  const hands=(handResult.landmarks||[]).slice(0,2).map((landmarks,index)=>({
   landmarks:landmarks.map(({x,y,z})=>({x,y,z})),
   handedness:handResult.handedness?.[index]?.[0]?.categoryName||'Unknown',
   handednessScore:handResult.handedness?.[index]?.[0]?.score||0,
  }));
  const ms=performance.now()-started;
  // Faces always come from this bitmap. Slow frames must not carry old face hit boxes.
  const faces=ms>300?[]:(faceResult.detections||[]).flatMap(detection=>{
   const box=detection.boundingBox;if(!box)return[];
   const x=clamp(box.originX/bitmap.width),y=clamp(box.originY/bitmap.height),right=clamp((box.originX+box.width)/bitmap.width),bottom=clamp((box.originY+box.height)/bitmap.height);
   return right>x&&bottom>y?[{x,y,width:right-x,height:bottom-y}]:[];
  });
  postMessage({type:'frame',id:data.id,timestamp,hands,faces,ms,...(ms>300?{staleFaces:true}:{})});
 }catch(error){postMessage({type:'frame',id:data.id,timestamp,hands:[],faces:[],ms:performance.now()-started,error:error?.message||String(error)});}
 finally{data.bitmap?.close();busy=false;}
};
