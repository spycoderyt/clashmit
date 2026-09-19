// Soft pixel coverage, not identity probability. All samples remain on-device.
const clamp=x=>Math.max(0,Math.min(1,x));
const fade=(distance,inner,outer)=>1-clamp((distance-inner)/(outer-inner));
export function hsv(r,g,b){r/=255;g/=255;b/=255;const v=Math.max(r,g,b),d=v-Math.min(r,g,b);let h=0;if(d)h=(v===r?((g-b)/d+6)%6:v===g?(b-r)/d+2:(r-g)/d+4)/6;return{h,s:v?d/v:0,v};}
export function pixelMatch(pixel,reference){
 return colorWeight(hsv(pixel[0],pixel[1],pixel[2]),reference);
}
export function colorWeight(a,b){
 if(b.s>=.25&&b.v>=.12){
  const delta=Math.abs(a.h-b.h),hue=Math.min(delta,1-delta)*360;
  return fade(hue,12,28)*fade(Math.abs(a.s-b.s),.28,.55)*clamp((a.s-.12)/.13)*clamp((a.v-.06)/.1);
 }
 const neutral=fade(a.s,.2,.45);
 if(b.v<.3)return neutral*fade(a.v,.2,.4);
 if(b.v>.7)return neutral*clamp((a.v-.48)/.24);
 return neutral*fade(Math.abs(a.v-b.v),.15,.34);
}
export function coverage(data,profile){
 if(!profile?.rgb||!data?.length)return 0;
 const reference=hsv(...profile.rgb);let sum=0,count=0;
 for(let i=0;i<data.length;i+=4){if(data[i+3]<128)continue;sum+=pixelMatch([data[i],data[i+1],data[i+2]],reference);count++;}
 return count?sum/count:0;
}
export function scorePatches(patches,opponent,own){
 if(!patches||patches.length<2)return{match:0,self:0};
 // Two agreeing patches stop a single lucky patch from identifying a player.
 const scores=profile=>patches.map(p=>coverage(p.data,profile)).sort((a,b)=>b-a);
 const a=scores(opponent),b=scores(own);
 return{match:a[1]>=.25?(a[0]+a[1])/2:0,self:b[1]>=.25?(b[0]+b[1])/2:0};
}
export function torsoPatches(b){
 // Blend full-body and partial-body guesses continuously; no aspect-ratio jump.
 const full=clamp((b.height/b.width-1)/1.4),top=.4-.2*full;
 return[-.07,0,.07].map(offset=>({x:b.originX+b.width*.24,y:b.originY+b.height*(top+offset),width:b.width*.52,height:b.height*.28}));
}
