// The six printed headband colors, sampled from the 30-page stripe sheet.
// Ordered top/bottom pairs give 6 x 5 = 30 unique player IDs.
import {hsv} from './shirt-coverage.js?v=face1';
export const PALETTE=Object.freeze([
 {name:'red',rgb:[219,15,15]},
 {name:'orange',rgb:[255,128,0]},
 {name:'green',rgb:[56,255,20]},
 {name:'cyan',rgb:[89,191,245]},
 {name:'navy',rgb:[10,26,115]},
 {name:'pink',rgb:[255,107,189]}
]);
export const PAIR_IDS=Object.freeze(PALETTE.flatMap(a=>PALETTE.filter(b=>b.name!==a.name).map(b=>`${a.name}-${b.name}`)));
export function pairId(top,bottom){return top&&bottom&&top!==bottom?`${top}-${bottom}`:null;}
const REFERENCE=PALETTE.map(c=>({name:c.name,hsv:hsv(...c.rgb)}));
const hueGap=(a,b)=>{const d=Math.abs(a-b);return Math.min(d,1-d)*360;};
// Hue alone cannot split cyan from navy (30 degrees apart) or red from pink.
// Value and saturation carry that separation, so all three terms are weighted.
export function colorDistance(p,ref){return hueGap(p.h,ref.h)/180*2.2+Math.abs(p.s-ref.s)*.7+Math.abs(p.v-ref.v)*1.1;}
// Returns null rather than guessing when two palette colors are too close.
export function classifyColor(rgb,{margin=.18,limit=1}={}){
 if(!rgb)return null;
 const p=hsv(rgb[0],rgb[1],rgb[2]);
 if(p.s<.3||p.v<.12)return null;
 let best=null,bestD=Infinity,secondD=Infinity;
 for(const c of REFERENCE){const d=colorDistance(p,c.hsv);if(d<bestD){secondD=bestD;bestD=d;best=c.name;}else if(d<secondD)secondD=d;}
 if(bestD>limit||secondD-bestD<margin)return null;
 return best;
}
// 5-bit-per-channel lookup keeps the per-pixel cost to one array read.
let table=null;
export function colorTable(){
 if(table)return table;
 table=new Uint8Array(32768);
 for(let r=0;r<32;r++)for(let g=0;g<32;g++)for(let b=0;b<32;b++){
  const name=classifyColor([r*8+4,g*8+4,b*8+4]);
  table[(r<<10)|(g<<5)|b]=name?PALETTE.findIndex(c=>c.name===name)+1:0;
 }
 return table;
}
