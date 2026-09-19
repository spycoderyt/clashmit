// Compact color histogram. Pixels/photos never leave the device.
export function colorProfile(data){
 const bins=Array(15).fill(0),rgb=[0,0,0];let n=0;
 for(let i=0;i<data.length;i+=16){const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,s=max?d/max:0;let bin;
  if(max<.22)bin=12;else if(s<.22)bin=max>.7?14:13;else{let h=d===0?0:max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;const u=h*2,j=Math.floor(u)%12,f=u-Math.floor(u);bins[j]+=1-f;bins[(j+1)%12]+=f;bin=null;}
  if(bin!==null)bins[bin]++;rgb[0]+=r;rgb[1]+=g;rgb[2]+=b;n++;
 }
 return{bins:bins.map(v=>n?v/n:0),rgb:rgb.map(v=>Math.round(n?v/n*255:0))};
}
export function validProfile(p){return !!p&&Array.isArray(p.bins)&&p.bins.length===15&&p.bins.every(x=>Number.isFinite(x)&&x>=0&&x<=1)&&Math.abs(p.bins.reduce((a,b)=>a+b,0)-1)<.01&&Array.isArray(p.rgb)&&p.rgb.length===3&&p.rgb.every(x=>Number.isInteger(x)&&x>=0&&x<=255);}
export function similarity(a,b){if(!validProfile(a)||!validProfile(b))return 0;return a.bins.reduce((sum,x,i)=>sum+Math.min(x,b.bins[i]),0);}
export function torsoRect(b){const tall=b.height/b.width>1.65;return{x:b.originX+b.width*.26,y:b.originY+b.height*(tall?.22:.4),width:b.width*.48,height:b.height*(tall?.25:.35)};}
export function coverRect(b,sourceW,sourceH,viewW,viewH){const s=Math.max(viewW/sourceW,viewH/sourceH);return{x:(b.originX*s-(sourceW*s-viewW)/2)/viewW,y:(b.originY*s-(sourceH*s-viewH)/2)/viewH,width:b.width*s/viewW,height:b.height*s/viewH};}
export function chooseShirt(detections,opponent,own){
 const scored=detections.map(d=>({...d,match:similarity(d.profile,opponent),self:similarity(d.profile,own)})).filter(d=>d.match>=.58&&d.match-d.self>=.12).sort((a,b)=>b.match-a.match);
 if(!scored.length||scored[1]&&scored[0].match-scored[1].match<.14)return null;
 return scored[0];
}
