import test from 'node:test';
import assert from 'node:assert/strict';
import {stat,readFile} from 'node:fs/promises';
import {createGameServer} from '../server/index.js';

test('background video supports Safari byte ranges, HEAD, and rejects invalid ranges',async t=>{
 const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());
 const url=`http://127.0.0.1:${game.server.address().port}/media/lobby-gameplay-v1.mp4`;
 const path=new URL('../dist/media/lobby-gameplay-v1.mp4',import.meta.url),{size}=await stat(path),bytes=await readFile(path);
 const head=await fetch(url,{method:'HEAD'});assert.equal(head.status,200);assert.equal(head.headers.get('content-type'),'video/mp4');assert.equal(Number(head.headers.get('content-length')),size);assert.equal((await head.arrayBuffer()).byteLength,0);
 for(const [range,start,end] of [['bytes=0-1',0,1],['bytes=-16',size-16,size-1],[`bytes=${size-8}-`,size-8,size-1]]){
  const r=await fetch(url,{headers:{Range:range}});assert.equal(r.status,206);assert.equal(r.headers.get('content-range'),`bytes ${start}-${end}/${size}`);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes.subarray(start,end+1));
 }
 for(const range of [`bytes=${size}-`,'bytes=5-2','bytes=-0','bytes=0-1,4-5','garbage']){
  const r=await fetch(url,{headers:{Range:range}});assert.equal(r.status,416);assert.equal(r.headers.get('content-range'),`bytes */${size}`);await r.arrayBuffer();
 }
 const poster=await fetch(url.replace('.mp4','.jpg'));assert.equal(poster.headers.get('content-type'),'image/jpeg');await poster.arrayBuffer();
});
