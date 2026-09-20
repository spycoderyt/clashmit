// Face detection and description, fully on-device with ONNX Runtime Web (WebAssembly).
// Detector: SCRFD-500M. Recogniser: MobileFaceNet trained with ArcFace on WebFace600K, which
// separates different people far more widely than the older dlib network it replaced.
// Both come from InsightFace's buffalo_sc pack: NON-COMMERCIAL RESEARCH licence, see
// models/face/NOTICE.txt. Frames and descriptors never leave the page unless the caller sends them.
import * as ort from './vendor/onnxruntime/ort.wasm.bundle.min.js';
import {alignmentTransform,FACE_TEMPLATE,UPPER_FACE_ROWS} from './face-id.js?v=face13';
const asset=path=>new URL(path,import.meta.url).href;
const ALIGNED=112,STRIDES=[8,16,32];
let loading,detector,recogniser;
// The runtime and models total about 30 MB and never change, so they are kept in Cache Storage
// after the first visit instead of being fetched again on every reload. Bump the name to refresh.
const CACHE='face-engine-v1';
async function cachedBytes(url){
 try{const cache=await caches.open(CACHE);let response=await cache.match(url);if(!response){response=await fetch(url);if(!response.ok)throw Error(`${response.status} for ${url}`);await cache.put(url,response.clone());}return new Uint8Array(await response.arrayBuffer());}
 catch{const response=await fetch(url);if(!response.ok)throw Error(`Could not download ${url}`);return new Uint8Array(await response.arrayBuffer());}
}
export function loadFaceEngine(onProgress=()=>{}){
 loading??=(async()=>{
  // The detector declares output sizes for 640 px input but runs fine at 320; silence its per-run shape warnings.
  ort.env.logLevel='error';const options={executionProviders:['wasm'],graphOptimizationLevel:'all',logSeverityLevel:3};
  onProgress('Loading recognition runtime (14 MB, first visit only)…');ort.env.wasm.numThreads=1;ort.env.wasm.wasmBinary=await cachedBytes(asset('./vendor/onnxruntime/ort-wasm-simd-threaded.wasm'));
  onProgress('Loading face detector (3 MB, first visit only)…');detector=await ort.InferenceSession.create(await cachedBytes(asset('./models/face/det_500m.onnx')),options);
  onProgress('Loading face recogniser (14 MB, first visit only)…');recogniser=await ort.InferenceSession.create(await cachedBytes(asset('./models/face/w600k_mbf.onnx')),options);
  return 'ONNX WebAssembly';
 })().catch(error=>{loading=undefined;throw error;});
 return loading;
}
// Works on the page and inside a worker, where only OffscreenCanvas exists.
const canvas=size=>{if(typeof OffscreenCanvas!=='undefined')return new OffscreenCanvas(size,size);if(typeof document==='undefined')return null;const c=document.createElement('canvas');c.width=c.height=size;return c;};
const detectCanvases=new Map(),alignCanvas=canvas(ALIGNED);
const detectCanvas=size=>{if(!detectCanvases.has(size))detectCanvases.set(size,canvas(size));return detectCanvases.get(size);};
const sourceSize=source=>({width:source.videoWidth||source.naturalWidth||source.width,height:source.videoHeight||source.naturalHeight||source.height});
// RGBA bytes to the planar float layout both networks expect.
function toTensor(data,size,scale){
 const plane=size*size,input=new Float32Array(3*plane);
 for(let i=0,p=0;i<plane;i++,p+=4){input[i]=(data[p]-127.5)/scale;input[plane+i]=(data[p+1]-127.5)/scale;input[2*plane+i]=(data[p+2]-127.5)/scale;}
 return new ort.Tensor('float32',input,[1,3,size,size]);
}
const iou=(a,b)=>{const w=Math.min(a.x+a.width,b.x+b.width)-Math.max(a.x,b.x),h=Math.min(a.y+a.height,b.y+b.height)-Math.max(a.y,b.y);if(w<=0||h<=0)return 0;const i=w*h;return i/(a.width*a.height+b.width*b.height-i);};
// One SCRFD pass over a region of the source, letterboxed into a square of `DETECT` pixels (a
// multiple of 32: 640 to search, 320 to follow a known face cheaply). Returns faces in source pixels.
export async function detectRegion(source,region,minScore=.5,DETECT=640){
 const ctx=detectCanvas(DETECT).getContext('2d',{willReadFrequently:true}),scale=Math.min(DETECT/region.width,DETECT/region.height);
 ctx.fillStyle='#000';ctx.fillRect(0,0,DETECT,DETECT);ctx.drawImage(source,region.x,region.y,region.width,region.height,0,0,Math.round(region.width*scale),Math.round(region.height*scale));
 const outputs=Object.values(await detector.run({[detector.inputNames[0]]:toTensor(ctx.getImageData(0,0,DETECT,DETECT).data,DETECT,128)}));
 // Outputs are told apart by shape: per stride there is a score (1), a box (4) and a landmark (10) tensor.
 const pick=width=>outputs.filter(t=>t.dims.at(-1)===width).sort((a,b)=>b.data.length-a.data.length),scores=pick(1),boxes=pick(4),points=pick(10),found=[];
 STRIDES.forEach((stride,level)=>{
  const cells=DETECT/stride,s=scores[level].data,b=boxes[level].data,k=points[level].data,anchors=s.length/(cells*cells);
  for(let i=0;i<s.length;i++){
   if(s[i]<minScore)continue;const cell=Math.floor(i/anchors),cx=(cell%cells)*stride,cy=Math.floor(cell/cells)*stride;
   const x1=cx-b[i*4]*stride,y1=cy-b[i*4+1]*stride,x2=cx+b[i*4+2]*stride,y2=cy+b[i*4+3]*stride,landmarks=[];
   for(let j=0;j<5;j++)landmarks.push([(cx+k[i*10+j*2]*stride)/scale+region.x,(cy+k[i*10+j*2+1]*stride)/scale+region.y]);
   found.push({score:s[i],landmarks,box:{x:x1/scale+region.x,y:y1/scale+region.y,width:(x2-x1)/scale,height:(y2-y1)/scale}});
  }
 });
 found.sort((a,b)=>b.score-a.score);const kept=[];for(const face of found)if(!kept.some(k=>iou(k.box,face.box)>.4))kept.push(face);return kept;
}
// The 512-number unit descriptor for one face, given its five landmarks in source pixels.
// upper: describe only the eyes, brows and forehead. The face is aligned on the two eyes alone (the nose and
// mouth landmarks are guesses when a phone covers them) and everything below the eyes is blanked, so the
// result does not depend on what is covering the lower face. Compare it only with other upper descriptors.
export async function describe(source,landmarks,{upper=false}={}){
 const ctx=alignCanvas.getContext('2d',{willReadFrequently:true}),{a,b,tx,ty}=upper?alignmentTransform(landmarks.slice(0,2),FACE_TEMPLATE.slice(0,2)):alignmentTransform(landmarks);
 ctx.setTransform(1,0,0,1,0,0);ctx.fillStyle='#000';ctx.fillRect(0,0,ALIGNED,ALIGNED);ctx.imageSmoothingQuality='high';ctx.setTransform(a,b,-b,a,tx,ty);ctx.drawImage(source,0,0);ctx.setTransform(1,0,0,1,0,0);
 // Mid grey becomes zero after normalisation, which is the recogniser's "no information".
 if(upper){ctx.fillStyle='rgb(127,127,127)';ctx.fillRect(0,UPPER_FACE_ROWS,ALIGNED,ALIGNED-UPPER_FACE_ROWS);}
 const output=Object.values(await recogniser.run({[recogniser.inputNames[0]]:toTensor(ctx.getImageData(0,0,ALIGNED,ALIGNED).data,ALIGNED,127.5)}))[0].data;
 let norm=0;for(const v of output)norm+=v*v;norm=Math.sqrt(norm)||1;return Float32Array.from(output,v=>v/norm);
}
// Finds faces and returns [{box,score,landmarks,descriptor,pass}] in source pixels, largest first.
// zoom > 1 adds a pass over a native-resolution crop around `focus` (the reticle in the game),
// which is what gives distant faces enough pixels to be found. Only the `maxFaces` largest
// faces are described, to bound the cost per frame.
export async function describeFaces(source,{zoom=1,focus={x:.5,y:.4},minScore=.5,maxFaces=4}={}){
 const {width,height}=sourceSize(source);if(!width||!height||!detector)return[];
 const faces=(await detectRegion(source,{x:0,y:0,width,height},minScore)).map(f=>({...f,pass:'full'}));
 if(zoom>1){
  const cropWidth=Math.round(width/zoom),cropHeight=Math.round(height/zoom),region={x:Math.round(Math.min(width-cropWidth,Math.max(0,focus.x*width-cropWidth/2))),y:Math.round(Math.min(height-cropHeight,Math.max(0,focus.y*height-cropHeight/2))),width:cropWidth,height:cropHeight};
  for(const face of await detectRegion(source,region,minScore)){
   // A face cut off by the crop edge is boxed badly, so only whole faces count.
   const edge=.03*cropWidth,box=face.box;if(box.x-region.x<edge||box.y-region.y<edge||box.x+box.width>region.x+cropWidth-edge||box.y+box.height>region.y+cropHeight-edge)continue;
   // The zoomed pass sees more pixels, so its box and landmarks replace the full-frame ones.
   const twin=faces.findIndex(f=>iou(f.box,box)>.3);if(twin<0)faces.push({...face,pass:`zoom ${zoom}x`});else faces[twin]={...face,pass:`zoom ${zoom}x`};
  }
 }
 faces.sort((a,b)=>b.box.width-a.box.width);const described=faces.slice(0,maxFaces);
 for(const face of described)face.descriptor=await describe(source,face.landmarks);
 return described;
}
