importScripts('./vendor/mediapipe/vision_bundle.js');
let segmenter;
self.onmessage=async({data})=>{
 try{
  if(data.type==='init'){
   const files=await Vision.FilesetResolver.forVisionTasks(new URL('./vendor/mediapipe/wasm',self.location).href);
   segmenter=await Vision.ImageSegmenter.createFromOptions(files,{baseOptions:{modelAssetPath:new URL('./models/selfie-segmenter.tflite',self.location).href,delegate:'CPU'},runningMode:'IMAGE',outputCategoryMask:false,outputConfidenceMasks:true});postMessage({type:'ready'});
  }else if(data.type==='frame'&&segmenter){
   try{segmenter.segment(data.bitmap,result=>{const mask=result.confidenceMasks[0],confidence=new Float32Array(mask.getAsFloat32Array());postMessage({type:'mask',id:data.id,width:mask.width,height:mask.height,confidence},[confidence.buffer]);});}finally{data.bitmap.close();}
  }
 }catch(e){data.bitmap?.close();postMessage({type:'error'});}
};
