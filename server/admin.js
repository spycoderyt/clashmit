import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
const digest=value=>createHash('sha256').update(value).digest();
export function createAdmin({password='',getState,onCommand,onMusicUpload,onMusicConvert,onMusicCommand,now=Date.now}){
 const sessions=new Map(),attempts=new Map();let globalAttempts=[];
 const reply=(res,status,body,headers={})=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers});res.end(JSON.stringify(body));};
 async function body(req){if(!req.headers['content-type']?.startsWith('application/json'))throw Error('Send JSON.');let text='';for await(const chunk of req){text+=chunk;if(Buffer.byteLength(text)>2048)throw Error('Request too large.');}return JSON.parse(text||'{}');}
 const authenticated=req=>{const token=(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('clashmit_admin='))?.slice(15);return token&&sessions.get(token)>now()?token:null;};
 return async(req,res,url)=>{
  if(!url.pathname.startsWith('/api/admin/'))return false;
  const at=now();for(const [id,expires] of sessions)if(expires<=at)sessions.delete(id);
  if(!password){reply(res,503,{error:'Set ADMIN_PASSWORD in the server environment, then redeploy.'});return true;}
  if(req.headers.origin){let host;try{host=new URL(req.headers.origin).host;}catch{}if(host!==req.headers.host){reply(res,403,{error:'Use the admin page on this same website.'});return true;}}
  if(req.method==='GET'&&url.pathname==='/api/admin/state'){if(!authenticated(req))reply(res,401,{error:'Sign in first.'});else reply(res,200,getState());return true;}
  if(req.method!=='POST'){reply(res,405,{error:'Method not allowed.'});return true;}
  if(url.pathname==='/api/admin/login'){
   const ip=req.socket.remoteAddress||'unknown';for(const [key,value] of attempts)if(value.until<=at)attempts.delete(key);globalAttempts=globalAttempts.filter(t=>t>at-60000);const tries=attempts.get(ip)||{count:0,until:at+60000};
   if(tries.count>=8||globalAttempts.length>=50){reply(res,429,{error:'Too many attempts. Wait a minute.'},{'Retry-After':'60'});return true;}tries.count++;attempts.set(ip,tries);globalAttempts.push(at);if(attempts.size>1024)attempts.delete(attempts.keys().next().value);
   let data;try{data=await body(req);}catch{reply(res,400,{error:'Invalid login request.'});return true;}
   if(typeof data.password!=='string'||!timingSafeEqual(digest(data.password),digest(password))){reply(res,401,{error:'Incorrect password.'});return true;}
   const token=randomBytes(32).toString('hex');if(sessions.size>=100)sessions.delete(sessions.keys().next().value);sessions.set(token,at+8*60*60*1000);
   const secure=req.socket.encrypted||req.headers['x-forwarded-proto']==='https';reply(res,200,{ok:true},{'Set-Cookie':`clashmit_admin=${token}; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=28800${secure?'; Secure':''}`});return true;
  }
  const token=authenticated(req);if(!token){reply(res,401,{error:'Sign in first.'});return true;}
  if(url.pathname==='/api/admin/logout'){sessions.delete(token);reply(res,200,{ok:true},{'Set-Cookie':'clashmit_admin=; HttpOnly; SameSite=Strict; Path=/api/admin; Max-Age=0'});return true;}
  if(url.pathname==='/api/admin/music/upload'&&onMusicUpload){const result=await onMusicUpload(req,url);reply(res,result.error?(result.status||400):200,result.error?{error:result.error}:{ok:true,...getState()});return true;}
  if(url.pathname==='/api/admin/music/youtube'&&onMusicConvert){try{const input=await body(req),result=await onMusicConvert(input.url);reply(res,result.error?(result.status||400):200,result.error?{error:result.error}:{ok:true,...getState()});}catch{reply(res,400,{error:'Invalid YouTube conversion request.'});}return true;}
  if(url.pathname==='/api/admin/music'&&onMusicCommand){try{const result=await onMusicCommand(await body(req));reply(res,result.error?400:200,result.error?result:{ok:true,...getState()});}catch{reply(res,400,{error:'Invalid music command.'});}return true;}
  if(url.pathname!=='/api/admin/command'){reply(res,404,{error:'Not found.'});return true;}
  try{const data=await body(req),result=onCommand(data);reply(res,result.error?400:200,result.error?result:{ok:true,...getState()});}catch{reply(res,400,{error:'Invalid command.'});}return true;
 };
}
