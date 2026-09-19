// Compact color histogram. Pixels/photos never leave the device.
export function colorProfile(data){
 // Keep the compact histogram for server registration compatibility. Identity
 // matching uses pixel coverage against the dominant RGB sample below.
 const bins=Array(15).fill(0),sums=Array.from({length:15},()=>[0,0,0]);let n=0;
 for(let i=0;i<data.length;i+=4){if(data[i+3]<128)continue;const r=data[i]/255,g=data[i+1]/255,b=data[i+2]/255,max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,s=max?d/max:0;
  const add=(bin,weight)=>{bins[bin]+=weight;for(let k=0;k<3;k++)sums[bin][k]+=data[i+k]*weight;};
  if(max<.22)add(12,1);else if(s<.22)add(max>.7?14:13,1);else{const h=d===0?0:max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4,u=h*2,j=Math.floor(u)%12,f=u-Math.floor(u);add(j,1-f);add((j+1)%12,f);}n++;
 }
 const dominant=bins.indexOf(Math.max(...bins));
 return{bins:bins.map(v=>n?v/n:0),rgb:sums[dominant].map(v=>Math.round(bins[dominant]?v/bins[dominant]:0))};
}
export function validProfile(p){return !!p&&Array.isArray(p.bins)&&p.bins.length===15&&p.bins.every(x=>Number.isFinite(x)&&x>=0&&x<=1)&&Math.abs(p.bins.reduce((a,b)=>a+b,0)-1)<.01&&Array.isArray(p.rgb)&&p.rgb.length===3&&p.rgb.every(x=>Number.isInteger(x)&&x>=0&&x<=255);}
export function similarity(a,b){if(!validProfile(a)||!validProfile(b))return 0;return a.bins.reduce((sum,x,i)=>sum+Math.min(x,b.bins[i]),0);}
export function coverRect(b,sourceW,sourceH,viewW,viewH){const s=Math.max(viewW/sourceW,viewH/sourceH);return{x:(b.originX*s-(sourceW*s-viewW)/2)/viewW,y:(b.originY*s-(sourceH*s-viewH)/2)/viewH,width:b.width*s/viewW,height:b.height*s/viewH};}
