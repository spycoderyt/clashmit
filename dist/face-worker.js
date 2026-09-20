// Runs face detection and recognition off the main thread so the camera view, aiming and
// spell effects never stall. Receives ImageBitmaps of frame regions, returns faces in source pixels.
import {loadFaceEngine,detectRegion,describe} from './face-engine.js?v=face11';
const iou=(a,b)=>{const w=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),h=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);if(w<=0||h<=0)return 0;const i=w*h;return i/(a.width*a.height+b.width*b.height-i);};
self.onmessage=async({data})=>{
 if(data.type==='init'){try{await loadFaceEngine(text=>postMessage({type:'progress',text}));postMessage({type:'ready'});}catch(e){postMessage({type:'error',message:String(e?.message||e)});}return;}
 if(data.type!=='frame')return;
 const started=performance.now(),faces=[];
 try{
  for(const [index,region] of data.regions.entries()){
   const bitmap=region.bitmap,k=region.width/bitmap.width,found=await detectRegion(bitmap,{x:0,y:0,width:bitmap.width,height:bitmap.height},region.minScore??data.minScore??.5,region.detectSize||640);
   for(const f of found){
    // A face cut off by the edge of a crop is boxed badly; the full frame has no such edge.
    const edge=.03*bitmap.width;if(!region.full&&(f.box.x<edge||f.box.y<edge||f.box.x+f.box.width>bitmap.width-edge||f.box.y+f.box.height>bitmap.height-edge))continue;
    const face={index,k,score:f.score,pixels:f.box.width,local:f.landmarks,box:{x:f.box.x*k+region.x,y:f.box.y*k+region.y,width:f.box.width*k,height:f.box.height*k},landmarks:f.landmarks.map(([x,y])=>[x*k+region.x,y*k+region.y])};
    // The same face seen in two regions: keep the view with more pixels on it.
    const twin=faces.findIndex(other=>iou(other.box,face.box)>.3);if(twin<0)faces.push(face);else if(face.k<faces[twin].k)faces[twin]=face;
   }
  }
  // Describing is the expensive step, so skip faces the tracker already knows and take those nearest the reticle first.
  const focus=data.focus,wanted=faces.filter(f=>!(data.known||[]).some(box=>iou(box,f.box)>.3)).sort((a,b)=>focus?Math.hypot(a.box.x+a.box.width/2-focus.x,a.box.y+a.box.height/2-focus.y)-Math.hypot(b.box.x+b.box.width/2-focus.x,b.box.y+b.box.height/2-focus.y):b.box.width-a.box.width).slice(0,data.describeMax??2);
  for(const face of wanted){const bitmap=data.regions[face.index].bitmap;face.descriptor=await describe(bitmap,face.local);if(data.upper)face.upper=await describe(bitmap,face.local,{upper:true});}
  postMessage({type:'faces',seq:data.seq,ms:performance.now()-started,faces:faces.map(({box,score,landmarks,pixels,descriptor,upper})=>({box,score,landmarks,pixels,descriptor:descriptor||null,upper:upper||null}))});
 }catch(e){postMessage({type:'faces',seq:data.seq,error:String(e?.message||e),faces:[],ms:performance.now()-started});}
 finally{for(const region of data.regions)region.bitmap.close?.();}
};
