// Select only the foreground component connected to the target's face.
// The caller also clips the crop before a neighbouring identified face.
export function targetMask(confidence,width,height,face){
 const labels=new Int32Array(width*height),queue=new Int32Array(width*height);let next=0,best=null;
 for(let start=0;start<labels.length;start++){
  if(labels[start]||confidence[start]<.6)continue;
  const id=++next;let head=0,tail=1,facePixels=0;queue[0]=start;labels[start]=id;
  while(head<tail){const p=queue[head++],x=p%width,y=Math.floor(p/width);if(x>=face.x&&x<face.x+face.width&&y>=face.y&&y<face.y+face.height)facePixels++;
   for(const n of [x>0?p-1:-1,x+1<width?p+1:-1,y>0?p-width:-1,y+1<height?p+width:-1])if(n>=0&&!labels[n]&&confidence[n]>=.6){labels[n]=id;queue[tail++]=n;}
  }
  if(facePixels>0&&(!best||facePixels>best.facePixels))best={id,facePixels};
 }
 const pixels=new Uint8ClampedArray(width*height*4);if(!best)return pixels;
 for(let i=0;i<labels.length;i++)if(labels[i]===best.id){pixels[i*4]=255;pixels[i*4+3]=128;}
 return pixels;
}
export function damageForMe(event,myId){return event?.type==='damage'&&event.actorId===myId&&event.targetId!==myId&&Number.isFinite(event.amount)&&event.amount>0;}
