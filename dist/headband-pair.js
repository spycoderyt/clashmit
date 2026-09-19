// Two-stripe marker recognition: find solid palette-colored bands, then stack
// vertically adjacent bands of different colors into one ordered player ID.
// See docs/two-stripe-headbands.md for the physical marker design.
import {PALETTE,colorTable,pairId} from './palette.js?v=pair1';
export function findStripes({data,width,height},buffers={}){
 const table=colorTable(),n=width*height;
 if(buffers.size!==n){buffers.size=n;buffers.label=new Uint8Array(n);buffers.queue=new Int32Array(n);}
 const {label,queue}=buffers;
 for(let i=0;i<n;i++){const j=i*4;label[i]=data[j+3]<128?0:table[((data[j]>>3)<<10)|((data[j+1]>>3)<<5)|(data[j+2]>>3)];}
 const stripes=[];
 for(let i=0;i<n;i++){
  const color=label[i];if(!color)continue;
  label[i]=0;let head=0,tail=1,minX=width,minY=height,maxX=0,maxY=0;queue[0]=i;
  while(head<tail){
   const k=queue[head++],x=k%width,y=(k/width)|0;
   if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
   for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
    if(!dx&&!dy)continue;const xx=x+dx,yy=y+dy;
    if(xx<0||xx>=width||yy<0||yy>=height)continue;
    const next=yy*width+xx;if(label[next]===color){label[next]=0;queue[tail++]=next;}
   }
  }
  const w=maxX-minX+1,h=maxY-minY+1,fill=tail/(w*h),aspect=w/h;
  if(tail<8||w<5||h<2||aspect<1.2||aspect>24||fill<.35||tail>n*.45)continue;
  stripes.push({color:PALETTE[color-1].name,box:{originX:minX,originY:minY,width:w,height:h},area:tail,fill});
 }
 return stripes.sort((a,b)=>b.area-a.area).slice(0,24);
}
// Two stripes belong to one band only if they sit over the same head: similar
// widths, strong horizontal overlap, and a shared boundary rather than a gap.
export function aligned(a,b){
 const A=a.box,B=b.box;
 const span=Math.min(A.originX+A.width,B.originX+B.width)-Math.max(A.originX,B.originX);
 const narrow=Math.min(A.width,B.width);
 return span>0&&span>=narrow*.6&&narrow/Math.max(A.width,B.width)>=.5;
}
export function stacked(top,bottom,tolerance=.6){
 const A=top.box,B=bottom.box,gap=B.originY-(A.originY+A.height);
 return aligned(top,bottom)&&gap>=-Math.max(A.height,B.height)*.5&&gap<=Math.max(A.height,B.height)*tolerance;
}
function union(stripes,tolerance){
 const parent=stripes.map((_,i)=>i),find=i=>{while(parent[i]!==i)i=parent[i]=parent[parent[i]];return i;};
 for(let i=0;i<stripes.length;i++)for(let j=0;j<stripes.length;j++){
  if(i===j)continue;
  if(stacked(stripes[i],stripes[j],tolerance))parent[find(i)]=find(j);
 }
 const groups=new Map();
 stripes.forEach((s,i)=>{const r=find(i);(groups.get(r)??groups.set(r,[]).get(r)).push(s);});
 return [...groups.values()];
}
function enclose(group){
 const x=Math.min(...group.map(s=>s.box.originX)),y=Math.min(...group.map(s=>s.box.originY));
 return{originX:x,originY:y,
  width:Math.max(...group.map(s=>s.box.originX+s.box.width))-x,
  height:Math.max(...group.map(s=>s.box.originY+s.box.height))-y};
}
// A stack of three or more alternating stripes cannot be ordered: cut from a
// repeating sheet, ABAB reads as both AB and BA. Report it, never guess.
export function pairStripes(stripes,{tolerance=.6}={}){
 return union(stripes,tolerance).map(group=>{
  const ordered=[...group].sort((a,b)=>a.box.originY-b.box.originY);
  const box=enclose(ordered),area=ordered.reduce((sum,s)=>sum+s.area,0);
  if(ordered.length!==2)return{id:null,ambiguous:true,reason:ordered.length<2?'single stripe':'repeating stack',stripes:ordered,box,area};
  const [top,bottom]=ordered;
  const id=pairId(top.color,bottom.color);
  if(!id)return{id:null,ambiguous:true,reason:'same color',stripes:ordered,box,area};
  return{id,ambiguous:false,top:top.color,bottom:bottom.color,stripes:ordered,box,area};
 }).sort((a,b)=>b.area-a.area);
}
export function recognizePairs(image,buffers={},options={}){
 return pairStripes(findStripes(image,buffers),options).filter(m=>!m.ambiguous);
}
