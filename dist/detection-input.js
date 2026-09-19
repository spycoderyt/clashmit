import {personSearchRegion,faceSearchRegions,mapDetection,confirmHeadbands} from './headband.js?v=face1';
export async function makeDetectionFrame(canvas,bands,time){
 const regions=faceSearchRegions(bands,canvas.width,canvas.height),body=personSearchRegion(bands,canvas.width,canvas.height),bitmaps=[];
 async function capture(r,width){const bitmap=await createImageBitmap(canvas,Math.floor(r.x),Math.floor(r.y),Math.min(canvas.width-Math.floor(r.x),Math.ceil(r.width)),Math.min(canvas.height-Math.floor(r.y),Math.ceil(r.height)),{resizeWidth:width,resizeHeight:Math.max(1,Math.round(width*r.height/r.width))});bitmaps.push(bitmap);return bitmap;}
 try{const bitmap=await capture(body,640),faceFrames=[];for(const r of regions){const image=await capture(r,256);faceFrames.push({bitmap:image});r.inputWidth=image.width;r.inputHeight=image.height;}return{message:{type:'frame',bitmap,faceFrames,time},transfer:bitmaps,body:{...body,inputWidth:bitmap.width,inputHeight:bitmap.height},regions};}catch(e){bitmaps.forEach(b=>b.close());throw e;}
}
export function readDetectionFrame(result,input,bands){
 const r=input.body,people=result.detections.map(d=>mapDetection(d,r,r.inputWidth,r.inputHeight)),faces=(result.faces||[]).map(d=>{const r=input.regions[d.region];return mapDetection(d,r,r.inputWidth,r.inputHeight);});
 return{people,faces,confirmed:confirmHeadbands(bands,faces,people)};
}
