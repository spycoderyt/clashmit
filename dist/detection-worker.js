importScripts('./vendor/mediapipe/vision_bundle.js');
let detector,faceDetector;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   const files=await Vision.FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',self.location).href);
   faceDetector=await Vision.FaceDetector.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./models/face-detector.tflite',self.location).href,delegate:'CPU'},runningMode:'VIDEO',minDetectionConfidence:.5,minSuppressionThreshold:.3});
   detector=await Vision.ObjectDetector.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./models/person-detector.tflite',self.location).href,delegate:'CPU'},runningMode:'VIDEO',scoreThreshold:.5,categoryAllowlist:['person'],maxResults:5});
   postMessage({type:'ready'});
  }else if(data.type==='frame'){
   try{
    const faces=[];for(const [region,frame]of(data.faceFrames||[]).entries()){const result=faceDetector.detectForVideo(frame.bitmap,data.time*10+region);faces.push(...result.detections.map(d=>({box:d.boundingBox,score:d.categories[0]?.score,region})));}
    const result=detector.detectForVideo(data.bitmap,data.time);postMessage({type:'detections',faces,detections:result.detections.map(d=>({box:d.boundingBox,score:d.categories[0]?.score}))});
   }finally{data.bitmap.close();for(const f of data.faceFrames||[])f.bitmap.close();}
  }
 }catch(e){postMessage({type:'error',message:e.message||String(e)});}
};
