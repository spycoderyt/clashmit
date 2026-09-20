import {spawn} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {createReadStream,existsSync,mkdirSync,readFileSync,mkdtempSync} from 'node:fs';
import {writeFile,rename,unlink,rm,stat,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {pipeline} from 'node:stream';

export const MUSIC_MAX_BYTES=20*1024*1024;
const validId=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
const isMP3=bytes=>bytes.length>=16&&(bytes.subarray(0,3).toString()==='ID3'||(bytes[0]===255&&(bytes[1]&224)===224));
export function youtubeVideoId(input){
 try{const url=new URL(input);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.port)return null;
 const host=url.hostname.toLowerCase();let id;
 if(['youtube.com','www.youtube.com','m.youtube.com'].includes(host)&&url.pathname==='/watch')id=url.searchParams.get('v');
 else if(['youtu.be','www.youtu.be'].includes(host)&&/^\/[^/]+\/?$/.test(url.pathname))id=url.pathname.split('/')[1];
 return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:null;}catch{return null;}
}
function runTool(executable,args,{timeout=30000,maxOutput=1024*1024}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(executable,args,{stdio:['ignore','pipe','pipe'],shell:false,detached:process.platform!=='win32'});let stdout='',stderr='',done=false;
  const kill=()=>{try{if(process.platform!=='win32'&&child.pid)process.kill(-child.pid,'SIGKILL');else child.kill('SIGKILL');}catch{}};
  const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);if(error)reject(error);else resolve(value);};
  const timer=setTimeout(()=>{kill();finish(Error('Conversion timed out. Try a shorter video.'));},timeout);timer.unref?.();
  child.stdout.on('data',chunk=>{stdout+=chunk;if(Buffer.byteLength(stdout)>maxOutput){kill();finish(Error('The converter returned too much data.'));}});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk).slice(-4000);});
  child.on('error',error=>finish(Error(error.code==='ENOENT'?'YouTube conversion is unavailable on this server. Upload an MP3 instead.':error.message)));
  child.on('close',code=>{if(code===0)finish(null,stdout);else{const reason=stderr.split('\n').filter(line=>line.startsWith('ERROR:')).pop();finish(Error(reason?.replace(/^ERROR:\s*/,'').slice(0,400)||'YouTube could not provide this video. Try another link or upload an MP3.'));}});
 });
}
const titleOf=name=>String(name||'Background music').replace(/[\u0000-\u001f\u007f]/g,'').replace(/\.mp3$/i,'').slice(0,100)||'Background music';
export function createSharedMusicServer({directory,now=Date.now,onChange=()=>{},maxBytes=MUSIC_MAX_BYTES}={}){
 const temporary=!directory,folder=directory||mkdtempSync(join(tmpdir(),'clashmit-music-'));
 mkdirSync(folder,{recursive:true});
 let state={trackId:null,title:'',url:null,playing:false,startedAt:0,volume:.12,loop:true,version:0},uploading=false;
 const metadata=join(folder,'music.json'),path=id=>join(folder,id+'.mp3');
 try{const saved=JSON.parse(readFileSync(metadata,'utf8'));if(validId(saved.trackId)&&existsSync(path(saved.trackId)))state={...state,trackId:saved.trackId,title:titleOf(saved.title),url:`/api/music/${saved.trackId}.mp3`,volume:Number.isFinite(saved.volume)?Math.max(0,Math.min(.3,saved.volume)):.12,loop:saved.loop!==false};}catch{}
 const snapshot=()=>({...state});
 async function persist(){const data={trackId:state.trackId,title:state.title,volume:state.volume,loop:state.loop};const temp=metadata+'.'+randomUUID()+'.tmp';await writeFile(temp,JSON.stringify(data));await rename(temp,metadata);}
 function changed(){state.version++;onChange(snapshot());}
 async function upload(req,url){
  if(uploading)return{status:409,error:'Another song is uploading. Try again shortly.'};
  if(!['audio/mpeg','audio/mp3'].includes((req.headers['content-type']||'').split(';')[0].toLowerCase()))return{status:415,error:'Choose an MP3 audio file.'};
  const length=Number(req.headers['content-length']);if(Number.isFinite(length)&&length>maxBytes)return{status:413,error:'The MP3 must be 20 MB or smaller.'};
  uploading=true;let temp;
  try{
   const bytes=await new Promise((resolve,reject)=>{
    let size=0,done=false;const chunks=[];
    const finish=(error,value)=>{if(done)return;done=true;clearTimeout(timer);req.off('data',data);req.off('end',end);req.off('error',fail);req.off('aborted',abort);if(error){req.resume();reject(error);}else resolve(value);};
    const data=chunk=>{size+=chunk.length;if(size>maxBytes)finish(Object.assign(Error('The MP3 must be 20 MB or smaller.'),{status:413}));else chunks.push(chunk);};
    const end=()=>finish(null,Buffer.concat(chunks));const fail=error=>finish(error),abort=()=>finish(Error('Upload was interrupted.'));
    const timer=setTimeout(()=>finish(Object.assign(Error('Upload timed out. Try a smaller MP3.'),{status:408})),30000);timer.unref?.();
    req.on('data',data);req.on('end',end);req.on('error',fail);req.on('aborted',abort);
   });
   if(!isMP3(bytes))return{status:415,error:'That file does not look like an MP3.'};
   const id=randomUUID(),old=state.trackId;temp=path(id)+'.part';await writeFile(temp,bytes);await rename(temp,path(id));temp=null;
   state={...state,trackId:id,title:titleOf(url.searchParams.get('name')),url:`/api/music/${id}.mp3`,playing:false,startedAt:0};
   await persist();changed();if(old&&old!==id)void unlink(path(old)).catch(()=>{});
   return{music:snapshot()};
  }catch(error){if(temp)void unlink(temp).catch(()=>{});return{status:error.status||400,error:error.message||'Could not upload that song.'};}finally{uploading=false;}
 }
 async function convert(input){
  const id=youtubeVideoId(input);if(!id)return{status:400,error:'Paste a youtube.com/watch or youtu.be video link.'};
  if(uploading)return{status:409,error:'Another song is processing. Try again shortly.'};
  uploading=true;let working;
  try{
   const executable=process.env.YT_DLP_PATH||'yt-dlp',url=`https://www.youtube.com/watch?v=${id}`;
   const common=['--ignore-config','--no-plugin-dirs','--no-cache-dir','--no-playlist','--js-runtimes','node','--socket-timeout','15','--retries','1'];
   const info=JSON.parse(await runTool(executable,[...common,'--dump-single-json','--skip-download',url]));
   if(info.is_live||!Number.isFinite(info.duration)||info.duration<=0||info.duration>600)return{status:400,error:'Choose a non-live video that is 10 minutes or shorter.'};
   working=mkdtempSync(join(folder,'convert-'));
   const options=[...common,'--no-progress','--no-part','--max-filesize',String(maxBytes),'--format','bestaudio','--extract-audio','--audio-format','mp3','--audio-quality','5','--output',join(working,'song.%(ext)s')];
   if(process.env.FFMPEG_PATH)options.push('--ffmpeg-location',process.env.FFMPEG_PATH);
   await runTool(executable,[...options,url],{timeout:120000});
   const converted=join(working,'song.mp3'),details=await stat(converted);
   if(details.size>maxBytes)return{status:413,error:'The converted MP3 is too large. Choose a shorter song.'};
   const bytes=await readFile(converted);if(!isMP3(bytes))return{status:400,error:'The converter did not produce a playable MP3.'};
   const trackId=randomUUID(),old=state.trackId;await rename(converted,path(trackId));
   state={...state,trackId,title:titleOf(info.title),url:`/api/music/${trackId}.mp3`,playing:false,startedAt:0};await persist();changed();if(old)void unlink(path(old)).catch(()=>{});
   return{music:snapshot()};
  }catch(error){return{status:400,error:error.code==='ENOENT'?'No audio was produced. Try another link or upload an MP3.':error.message||'Could not convert this YouTube video.'};}
  finally{uploading=false;if(working)await rm(working,{recursive:true,force:true});}
 }
 async function command(command){
  if(command.action==='play'){if(!state.trackId)return{error:'Upload a song first.'};state.playing=true;state.startedAt=now();}
  else if(command.action==='stop'){state.playing=false;state.startedAt=0;}
  else if(command.action==='volume'){if(!Number.isFinite(command.volume)||command.volume<0||command.volume>.3)return{error:'Use a music volume between 0% and 30%.'};state.volume=command.volume;}
  else if(command.action==='loop'){if(typeof command.loop!=='boolean')return{error:'Choose whether to loop the song.'};state.loop=command.loop;}
  else return{error:'Unknown music command.'};
  await persist();changed();return{music:snapshot()};
 }
 async function serve(req,res,url){
  if(!url.pathname.startsWith('/api/music/'))return false;
  const headers={'Access-Control-Allow-Origin':'*','Content-Type':'audio/mpeg','Accept-Ranges':'bytes','Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'};
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405,headers);res.end();return true;}
  if(!state.trackId||url.pathname!==state.url){res.writeHead(404,headers);res.end();return true;}
  let size;try{({size}=await stat(path(state.trackId)));}catch{res.writeHead(404,headers);res.end();return true;}
  let start=0,end=size-1,status=200;
  if(req.headers.range){
   const match=/^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
   if(match&&(match[1]||match[2])){if(match[1]){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;}else start=Math.max(0,size-Number(match[2]));}
   if(!match||(!match[1]&&!match[2])||!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start>end||start>=size){res.writeHead(416,{...headers,'Content-Range':`bytes */${size}`});res.end();return true;}
   status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;
  }
  res.writeHead(status,{...headers,'Content-Length':end-start+1});if(req.method==='HEAD')res.end();else pipeline(createReadStream(path(state.trackId),{start,end}),res,()=>{});return true;
 }
 async function dispose(){if(temporary)await rm(folder,{recursive:true,force:true});}
 return{snapshot,upload,convert,command,serve,dispose};
}
