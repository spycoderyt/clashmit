// Cache failures must never prevent on-device recognition from starting. Network reads
// have both a stalled-read deadline and a total deadline; a failed download gets one retry.
const CACHE='face-engine-v1';
function deadline(promise,ms,message,onTimeout=()=>{}){
 let timer;return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout();reject(Error(message));},ms);})]).finally(()=>clearTimeout(timer));
}
export async function loadFaceAsset(url,{label='Face model',onProgress=()=>{},fetchImpl=globalThis.fetch,cacheStorage=globalThis.caches,cacheTimeoutMs=1500,idleTimeoutMs=15000,totalTimeoutMs=45000,retries=1}={}){
 let cache;
 const validate=(bytes,type='')=>{if(!bytes.length||/text\/html/i.test(type)||(/\.wasm(?:$|\?)/.test(url)&&!(bytes[0]===0&&bytes[1]===97&&bytes[2]===115&&bytes[3]===109)))throw Error(`${label} download was invalid`);return bytes;};
 try{
  cache=await deadline(Promise.resolve().then(()=>cacheStorage?.open(CACHE)),cacheTimeoutMs,'Cache unavailable');
  if(cache){const response=await deadline(cache.match(url),cacheTimeoutMs,'Cache unavailable');if(response){const bytes=await deadline(response.arrayBuffer(),cacheTimeoutMs*2,'Cache unavailable');const valid=validate(new Uint8Array(bytes),response.headers?.get('content-type'));onProgress(`${label}: loaded from this device`);return valid;}}
 }catch{void Promise.resolve().then(()=>cache?.delete(url)).catch(()=>{});}
 for(let attempt=0;;attempt++){
  const controller=new AbortController();let totalTimer;
  try{
   onProgress(`${attempt?'Retrying':'Downloading'} ${label.toLowerCase()}…`);
   const download=(async()=>{
    const response=await deadline(Promise.resolve().then(()=>fetchImpl(url,{signal:controller.signal})),idleTimeoutMs,`${label} download stopped responding`,()=>controller.abort());
    if(controller.signal.aborted)throw Error(`${label} download was cancelled`);
    if(!response.ok)throw Error(`${label} download failed (${response.status})`);
    const length=Number(response.headers?.get('content-length'))||0;let bytes;
    if(response.body?.getReader){
     const reader=response.body.getReader(),chunks=[];let received=0,lastProgress=0;
     try{for(;;){const {done,value}=await deadline(reader.read(),idleTimeoutMs,`${label} download stopped responding`,()=>controller.abort());if(controller.signal.aborted)throw Error(`${label} download was cancelled`);if(done)break;received+=value.byteLength;if(received>40*1024*1024)throw Error(`${label} is larger than expected`);chunks.push(value);if(Date.now()-lastProgress>200){lastProgress=Date.now();onProgress(`${label}: ${(received/1048576).toFixed(1)}${length?` / ${(length/1048576).toFixed(1)}`:''} MB`);}}}
     catch(error){void reader.cancel().catch(()=>{});throw error;}
     bytes=new Uint8Array(received);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
    }else bytes=new Uint8Array(await deadline(response.arrayBuffer(),idleTimeoutMs,`${label} download stopped responding`,()=>controller.abort()));
    validate(bytes,response.headers?.get('content-type'));
    // Saving can stall in private browsing or storage pressure. Never wait for it.
    if(cache)void Promise.resolve().then(()=>cache.put(url,new Response(bytes))).catch(()=>{});
    return bytes;
   })();
   return await Promise.race([download,new Promise((_,reject)=>{totalTimer=setTimeout(()=>{controller.abort();reject(Error(`${label} download took too long`));},totalTimeoutMs);})]);
  }catch(error){controller.abort();if(attempt>=retries)throw error;}
  finally{clearTimeout(totalTimer);}
 }
}
