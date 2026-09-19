import {findHeadbands} from './headband.js?v=smooth1';
let canvas,ctx;const buffers={};
self.onmessage=({data})=>{
 if(data.type==='init'){postMessage({type:'ready',supported:typeof OffscreenCanvas!=='undefined'});return;}
 const {bitmap,width,height,opponent,own}=data;
 try{canvas??=new OffscreenCanvas(width,height);ctx??=canvas.getContext('2d',{willReadFrequently:true});if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;ctx.drawImage(bitmap,0,0);const bands=findHeadbands(ctx.getImageData(0,0,width,height),opponent,own,buffers);postMessage({type:'bands',bands});}catch(e){postMessage({type:'error',message:e.message});}finally{bitmap.close();}
};
