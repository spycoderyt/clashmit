import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {WebSocket} from 'ws';
import {createSharedMusicServer,youtubeVideoId} from '../server/music.js';
import {createGameServer} from '../server/index.js';

const mp3=Buffer.concat([Buffer.from('ID3'),Buffer.alloc(100,0)]);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const request=(bytes,headers={})=>Object.assign(Readable.from([bytes]),{headers:{'content-type':'audio/mpeg',...headers}});

test('music upload enforces MIME, signature and streamed size limits, preserving the previous song on rejection',async t=>{
 const music=createSharedMusicServer({maxBytes:120});t.after(()=>music.dispose());
 assert.equal((await music.upload(request(mp3,{'content-type':'text/html'}),new URL('http://local/upload'))).status,415);
 assert.equal((await music.upload(request(Buffer.alloc(20)),new URL('http://local/upload'))).status,415);
 assert.equal((await music.upload(request(Buffer.alloc(121)),new URL('http://local/upload'))).status,413);
 assert.equal((await music.upload(request(mp3,{'content-length':'121'}),new URL('http://local/upload'))).status,413);
 const accepted=await music.upload(request(mp3),new URL('http://local/upload?name=Quiet%20song.mp3'));
 assert.equal(accepted.error,undefined);assert.equal(accepted.music.title,'Quiet song');assert.equal(accepted.music.playing,false);assert.equal(accepted.music.volume,.12);assert.equal(accepted.music.loop,true);
 const before=music.snapshot();await music.upload(request(Buffer.alloc(20)),new URL('http://local/upload'));assert.deepEqual(music.snapshot(),before);
});

test('song selection and low volume survive restart, but playback resumes only when admin presses play',async t=>{
 const directory=mkdtempSync(join(tmpdir(),'clash-music-test-'));t.after(()=>rmSync(directory,{recursive:true,force:true}));let stamp=1000;
 const music=createSharedMusicServer({directory,now:()=>stamp});
 assert.ok((await music.command({action:'play'})).error);
 await music.upload(request(mp3),new URL('http://local/upload?name=Song.mp3'));
 await music.command({action:'volume',volume:.2});await music.command({action:'loop',loop:false});
 assert.ok((await music.command({action:'volume',volume:1})).error);assert.ok((await music.command({action:'volume',volume:NaN})).error);
 const played=await music.command({action:'play'});assert.equal(played.music.startedAt,1000);assert.equal(played.music.playing,true);
 stamp=2000;const restarted=createSharedMusicServer({directory,now:()=>stamp});assert.equal(restarted.snapshot().trackId,music.snapshot().trackId);assert.equal(restarted.snapshot().playing,false);assert.equal(restarted.snapshot().volume,.2);assert.equal(restarted.snapshot().loop,false);
 await music.command({action:'stop'});assert.equal(music.snapshot().playing,false);assert.equal(music.snapshot().startedAt,0);
});

test('YouTube parser accepts only explicit single-video IDs from the allowed YouTube hosts',()=>{
 for(const url of ['https://www.youtube.com/watch?v=dQw4w9WgXcQ','https://youtu.be/dQw4w9WgXcQ?t=30','https://m.youtube.com/watch?v=dQw4w9WgXcQ&list=PLignored'])assert.equal(youtubeVideoId(url),'dQw4w9WgXcQ');
 for(const url of ['http://localhost/watch?v=dQw4w9WgXcQ','https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ','https://user:pass@youtube.com/watch?v=dQw4w9WgXcQ','https://youtube.com:8443/watch?v=dQw4w9WgXcQ','file:///tmp/test','https://youtu.be/../../etc/passwd','https://youtube.com/playlist?list=hello','https://youtube.com/watch?v=--exec','https://youtu.be/not-valid',null])assert.equal(youtubeVideoId(url),null,String(url));
});

test('authenticated admin uploads and controls music; current and late-joining sockets share one playback clock',async t=>{
 const game=createGameServer({continuous:true,adminPassword:'music-test-password'});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());
 const base=`http://127.0.0.1:${game.server.address().port}`;
 const post=(path,body,headers={})=>fetch(base+'/api/admin/'+path,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
 assert.equal((await fetch(base+'/api/admin/music/upload',{method:'POST',headers:{'Content-Type':'audio/mpeg'},body:mp3})).status,401);
 assert.equal((await post('music/youtube',{url:'https://youtu.be/dQw4w9WgXcQ'})).status,401);
 const login=await post('login',{password:'music-test-password'}),cookie=login.headers.get('set-cookie').split(';')[0];assert.equal(login.status,200);
 assert.equal((await post('music',{action:'play'},{Cookie:cookie,Origin:'https://evil.example'})).status,403);
 assert.equal((await post('music/youtube',{url:'http://127.0.0.1/private'},{Cookie:cookie})).status,400);
 async function client(name){
  const ws=new WebSocket(base.replace('http:','ws:')+'/ws'),messages=[];t.after(()=>ws.terminate());ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.once('open',r));
  const next=async(type,predicate=()=>true)=>{for(let i=0;i<600;i++){const index=messages.findIndex(m=>m.type===type&&predicate(m));if(index>=0)return messages.splice(index,1)[0];await wait(5);}throw Error('Missing '+type);};
  ws.send(JSON.stringify({type:'join',name}));await next('welcome');return{next};
 }
 const early=await client('Music Early');
 const uploaded=await fetch(base+'/api/admin/music/upload?name=Shared.mp3',{method:'POST',headers:{Cookie:cookie,'Content-Type':'audio/mpeg'},body:mp3});assert.equal(uploaded.status,200);const {music}=await uploaded.json();
 const selection=await early.next('music');assert.equal(selection.music.trackId,music.trackId);assert.equal(selection.music.playing,false);
 const play=await post('music',{action:'play'},{Cookie:cookie});assert.equal(play.status,200);const played=(await play.json()).music;
 const event=await early.next('music',m=>m.music.playing);assert.equal(event.music.startedAt,played.startedAt);
 const late=await client('Music Late'),snapshot=await late.next('state',m=>m.room.music?.playing);
 assert.equal(snapshot.room.music.startedAt,played.startedAt);assert.equal(snapshot.room.music.url,played.url);assert.ok(snapshot.room.serverTime>=played.startedAt);
 const range=await fetch(base+music.url,{headers:{Range:'bytes=0-2'}});assert.equal(range.status,206);assert.equal(range.headers.get('content-type'),'audio/mpeg');assert.equal(await range.text(),'ID3');
 const head=await fetch(base+music.url,{method:'HEAD'});assert.equal(Number(head.headers.get('content-length')),mp3.length);assert.equal(await head.text(),'');
 assert.equal((await fetch(base+music.url,{headers:{Range:'bytes=99999-'}})).status,416);
 await post('music',{action:'volume',volume:.07},{Cookie:cookie});assert.equal((await early.next('music',m=>m.music.volume===.07)).music.volume,.07);
 await post('music',{action:'stop'},{Cookie:cookie});assert.equal((await late.next('music',m=>!m.music.playing)).music.playing,false);
});

test('YouTube conversion validates duration, output size, and single-flight jobs without accepting arbitrary URLs',async t=>{
 const {writeFileSync}=await import('node:fs');const directory=mkdtempSync(join(tmpdir(),'clash-converter-test-'));
 const executable=join(directory,'fake-ytdlp'),old=process.env.YT_DLP_PATH;process.env.YT_DLP_PATH=executable;
 t.after(()=>{if(old===undefined)delete process.env.YT_DLP_PATH;else process.env.YT_DLP_PATH=old;rmSync(directory,{recursive:true,force:true});});
 writeFileSync(executable,`#!${process.execPath}\nconst fs=require('fs');const args=process.argv.slice(2),url=args.at(-1);if(args.includes('--dump-single-json')){console.log(JSON.stringify({title:'Converted song',duration:url.includes('longvideo01')?601:25,is_live:false}));}else{const out=args[args.indexOf('--output')+1].replace('%(ext)s','mp3');fs.writeFileSync(out,Buffer.concat([Buffer.from('ID3'),Buffer.alloc(url.includes('bigvideo001')?200:100)]));}\n`,{mode:0o755});
 const music=createSharedMusicServer({directory:join(directory,'music'),maxBytes:120});
 assert.equal((await music.convert('https://example.com/unsafe')).status,400);
 assert.equal((await music.convert('https://youtu.be/longvideo01')).status,400);
 const pending=music.convert('https://youtu.be/dQw4w9WgXcQ');assert.equal((await music.convert('https://youtu.be/dQw4w9WgXcQ')).status,409);
 const result=await pending;assert.equal(result.error,undefined);assert.equal(result.music.title,'Converted song');assert.equal(result.music.playing,false);
 const selected=music.snapshot();assert.equal((await music.convert('https://youtu.be/bigvideo001')).status,413);assert.deepEqual(music.snapshot(),selected,'oversized conversion cannot replace the current song');
});
