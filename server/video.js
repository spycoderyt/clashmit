import {stat} from 'node:fs/promises';
import {createReadStream} from 'node:fs';
import {pipeline} from 'node:stream';

// Safari requests byte ranges even for short looping background videos.
export async function serveVideo(req,res,path){
 const {size}=await stat(path);
 const headers={'Content-Type':'video/mp4','Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'};
 let start=0,end=size-1,status=200;
 if(req.headers.range){
  const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
  if(match&&(match[1]||match[2])){
   if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}
   else start=Math.max(0,size-Number(match[2]));
  }
  if(!match||(!match[1]&&!match[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){
   res.writeHead(416,{...headers,'Content-Range':`bytes */${size}`});res.end();return;
  }
  status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
 }
 headers['Content-Length']=end-start+1;res.writeHead(status,headers);
 if(req.method==='HEAD'){res.end();return;}
 pipeline(createReadStream(path,{start,end}),res,()=>{});
}
