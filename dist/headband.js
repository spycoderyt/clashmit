import {overlap} from './target-track.js?v=face1';
import {hsv,colorWeight} from './shirt-coverage.js?v=face1';
export function bandColor(rgb){if(!rgb)return null;const p=hsv(...rgb),h=p.h*360;if(p.s<.35||p.v<.15)return null;return h<35||h>330?'red':h>190&&h<265?'blue':null;}
// First pass: connected regions of the registered opponent color. No person
// detector or body rectangle is used to find these candidates.
export function findHeadbands({data,width,height},opponent,own,buffers={}){
 const family=bandColor(opponent?.rgb);if(!family)return[];
 const reference=hsv(...opponent.rgb),other=own?.rgb?hsv(...own.rgb):null,n=width*height;
 if(buffers.size!==n){buffers.size=n;buffers.mask=new Uint8Array(n);buffers.weights=new Float32Array(n);buffers.others=new Float32Array(n);buffers.queue=new Int32Array(n);}
 const {mask,weights,others,queue}=buffers;mask.fill(0);
 for(let i=0;i<n;i++){
  const j=i*4,r=data[j],g=data[j+1],b=data[j+2];if(family==='red'?(r<g*1.15||r<b*1.15):(b<r*1.1||b<g*1.05))continue;const p=hsv(r,g,b);if(p.s<.3||p.v<.12)continue;
  const match=colorWeight(p,reference),self=other?colorWeight(p,other):0;
  if(match>=.55&&match-self>=.15){mask[i]=1;weights[i]=match;others[i]=self;}
 }
 const bands=[];
 for(let i=0;i<n;i++){
  if(!mask[i])continue;mask[i]=0;let head=0,tail=1,minX=width,minY=height,maxX=0,maxY=0,sum=0,self=0;queue[0]=i;
  while(head<tail){const k=queue[head++],x=k%width,y=Math.floor(k/width);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);sum+=weights[k];self+=others[k];
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;if(xx<0||xx>=width||yy<0||yy>=height)continue;const next=yy*width+xx;if(mask[next]){mask[next]=0;queue[tail++]=next;}}
  }
  const w=maxX-minX+1,h=maxY-minY+1,fill=tail/(w*h),aspect=w/h;
  if(tail<8||w<5||h<2||aspect<1.2||aspect>18||fill<.35||tail>n*.45)continue;
  bands.push({box:{originX:minX,originY:minY,width:w,height:h},match:sum/tail,self:self/tail,area:tail,fill});
 }
 return bands.sort((a,b)=>b.area-a.area).slice(0,12);
}
export function mapBand(band,scaleX,scaleY){const b=band.box;return{...band,box:{originX:b.originX*scaleX,originY:b.originY*scaleY,width:b.width*scaleX,height:b.height*scaleY}};}
export function personSearchRegion(bands,width,height){
 if(bands.length!==1)return{x:0,y:0,width,height};
 const b=bands[0].box,cx=b.originX+b.width/2;
 const x=Math.max(0,cx-b.width*4),y=Math.max(0,b.originY-b.width*.75),right=Math.min(width,cx+b.width*4),bottom=Math.min(height,b.originY+b.width*16);
 return{x,y,width:right-x,height:bottom-y};
}
export function bandOnHead(band,person){
 const b=band.box,p=person.box,cx=b.originX+b.width/2,cy=b.originY+b.height/2;
 return cx>p.originX+p.width*.12&&cx<p.originX+p.width*.88&&cy>p.originY-p.height*.06&&cy<p.originY+p.height*.22&&b.width>=p.width*.07&&b.width<=p.width*.85&&b.height<=p.height*.15;
}
export function associateHeadbands(bands,people){
 const linked=new Map();
 for(const band of bands){const matches=people.filter(p=>bandOnHead(band,p));if(matches.length!==1)continue;const person=matches[0];const previous=linked.get(person);if(!previous||band.area>previous.area)linked.set(person,band);}
 return [...linked].map(([person,band])=>({...person,band,match:band.match,self:band.self}));
}

export function faceSearchRegions(bands,width,height){
 return bands.slice(0,4).map(({box:b})=>{const cx=b.originX+b.width/2,x=Math.max(0,Math.floor(cx-b.width*1.25)),y=Math.max(0,Math.floor(b.originY-b.width*.35));return{x,y,width:Math.min(width,Math.ceil(cx+b.width*1.25))-x,height:Math.min(height,Math.ceil(b.originY+b.height+b.width*1.8))-y};});
}
export function mapDetection(d,region,inputWidth,inputHeight){const b=d.box;return{...d,box:{originX:region.x+b.originX*region.width/inputWidth,originY:region.y+b.originY*region.height/inputHeight,width:b.width*region.width/inputWidth,height:b.height*region.height/inputHeight}};}
export function bandAboveFace(band,face){
 const b=band.box,f=face.box,cx=b.originX+b.width/2,cy=b.originY+b.height/2;
 return Math.abs(cx-f.originX-f.width/2)<f.width*.85&&cy>f.originY-f.height*1.2&&cy<f.originY+f.height*.25&&b.width>=f.width*.4&&b.width<=f.width*2.8&&b.height<=f.height*.95;
}
export function confirmHeadbands(bands,faces,people){
 const unique=[];for(const f of [...faces].sort((a,b)=>b.score-a.score))if(!unique.some(x=>overlap(x.box,f.box)>.35))unique.push(f);
 const linked=new Map(),remaining=[];
 for(const band of bands){const matches=unique.filter(f=>bandAboveFace(band,f));if(matches.length===1){const face=matches[0],old=linked.get(face);if(!old||band.area>old.area)linked.set(face,band);}else if(!matches.length)remaining.push(band);}
 const confirmed=[...linked].map(([face,band])=>{const b=band.box,f=face.box,x=Math.min(b.originX,f.originX),y=Math.min(b.originY,f.originY);return{...face,box:{originX:x,originY:y,width:Math.max(b.originX+b.width,f.originX+f.width)-x,height:Math.max(b.originY+b.height,f.originY+f.height)-y},band,match:band.match,self:band.self,validation:'face'};});
 for(const p of associateHeadbands(remaining,people))if(!confirmed.some(c=>bandOnHead(c.band,p)))confirmed.push({...p,validation:'person'});
 return confirmed;
}
// Only continue a previously verified band. Color alone never starts a lock.
export function createBandContinuity(){
 let previous=null,lastSeen=0;
 return{reset(){previous=null;lastSeen=0;},update(bands,confirmed,now){
  if(confirmed.length){previous=confirmed.length===1?confirmed[0]:null;lastSeen=now;return confirmed;}
  if(!previous||now-lastSeen>700){previous=null;return[];}
  const old=previous.band.box,near=bands.filter(b=>overlap(b.box,old)>.3&&b.box.width/old.width>.5&&b.box.width/old.width<2);
  if(near.length!==1){previous=null;return[];}
  const band=near[0];previous={...previous,box:{...band.box},band,match:band.match,self:band.self,validation:'tracked band'};lastSeen=now;return[previous];
 }};
}
