import test from 'node:test';
import assert from 'node:assert/strict';
import {loadFaceAsset} from '../dist/face-assets.js';
const bytes=new Uint8Array([0,97,115,109,1,0,0,0]);
const options={label:'Recognition runtime',cacheTimeoutMs:10,idleTimeoutMs:15,totalTimeoutMs:100};
const url='https://game.invalid/runtime.wasm';
const pending=()=>new Promise(()=>{});
test('a stalled cache write cannot delay a successfully downloaded model',async()=>{
 let writes=0,fetches=0;const cache={match:async()=>null,put(){writes++;return pending();}};
 const result=await loadFaceAsset(url,{...options,cacheStorage:{open:async()=>cache},fetchImpl:async()=>{fetches++;return new Response(bytes);}});
 assert.deepEqual(result,bytes);assert.equal(fetches,1);assert.equal(writes,1);
});
test('a stalled private-mode cache lookup falls back to exactly one network download',async()=>{
 let fetches=0;const result=await loadFaceAsset(url,{...options,cacheStorage:{open:pending},fetchImpl:async()=>{fetches++;return new Response(bytes);}});
 assert.deepEqual(result,bytes);assert.equal(fetches,1);
});
test('a stalled body read is cancelled and retried once, with accurate progress',async()=>{
 let fetches=0,cancelled=0;const progress=[];
 const result=await loadFaceAsset(url,{...options,cacheStorage:null,onProgress:text=>progress.push(text),fetchImpl:async()=>++fetches===1?{ok:true,headers:new Headers(),body:{getReader:()=>({read:pending,cancel:async()=>{cancelled++;}})}}:new Response(bytes)});
 assert.deepEqual(result,bytes);assert.equal(fetches,2);assert.equal(cancelled,1);assert.ok(progress.some(text=>text.startsWith('Retrying')));assert.ok(progress.some(text=>text.includes('MB')));
});
test('a stalled network request rejects after its one retry instead of hanging',async()=>{
 let fetches=0;await assert.rejects(loadFaceAsset(url,{...options,cacheStorage:null,fetchImpl:()=>{fetches++;return pending();}}),/stopped responding/);assert.equal(fetches,2);
});
test('an invalid cached runtime is evicted and recovered from the network',async()=>{
 let deletes=0,fetches=0;const cache={match:async()=>new Response('bad'),delete:async()=>{deletes++;},put:async()=>{}};
 const result=await loadFaceAsset(url,{...options,cacheStorage:{open:async()=>cache},fetchImpl:async()=>{fetches++;return new Response(bytes);}});assert.deepEqual(result,bytes);assert.equal(deletes,1);assert.equal(fetches,1);
});
test('HTML error pages are rejected and a valid cached runtime never redownloads',async()=>{
 let fetches=0;await assert.rejects(loadFaceAsset(url,{...options,cacheStorage:null,fetchImpl:async()=>{fetches++;return new Response('<html>offline</html>',{headers:{'content-type':'text/html'}});}}),/invalid/);assert.equal(fetches,2);
 const progress=[];const result=await loadFaceAsset(url,{...options,cacheStorage:{open:async()=>({match:async()=>new Response(bytes)})},fetchImpl:()=>{throw Error('must not fetch');},onProgress:text=>progress.push(text)});assert.deepEqual(result,bytes);assert.deepEqual(progress,['Recognition runtime: loaded from this device']);
});
