importScripts('./vendor/mediapipe/vision_bundle.js');
let detector;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   const files=await Vision.FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',self.location).href);
   detector=await Vision.ObjectDetector.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./models/person-detector.tflite',self.location).href,delegate:'CPU'},runningMode:'VIDEO',scoreThreshold:.5,categoryAllowlist:['person'],maxResults:5});
   postMessage({type:'ready'});
  }else if(data.type==='frame'){
   try{const result=detector.detectForVideo(data.bitmap,data.time);postMessage({type:'detections',detections:result.detections.map(d=>({box:d.boundingBox,score:d.categories[0]?.score}))});}finally{data.bitmap.close();}
  }
 }catch(e){postMessage({type:'error',message:e.message||String(e)});}
};
