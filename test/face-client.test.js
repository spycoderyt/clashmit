import test from 'node:test';
import assert from 'node:assert/strict';

let moduleId=0;
async function withClient(run){
 const names=['Worker','document','createImageBitmap','setTimeout','clearTimeout'];
 const originals=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 const workers=[],timers=new Map();let timerId=0;
 class FakeWorker{
  constructor(){this.messages=[];this.terminated=false;workers.push(this);}
  postMessage(message){this.messages.push(message);}
  reply(data){this.onmessage?.({data});}
  terminate(){this.terminated=true;}
 }
 globalThis.Worker=FakeWorker;
 globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){}})})};
 globalThis.createImageBitmap=async canvas=>({width:canvas.width,height:canvas.height,close(){this.closed=true;}});
 globalThis.setTimeout=(callback,ms)=>{const id=++timerId;timers.set(id,{callback,ms});return id;};
 globalThis.clearTimeout=id=>timers.delete(id);
 const flush=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
 const fire=ms=>{const found=[...timers].find(([,timer])=>timer.ms===ms);assert.ok(found,`missing ${ms} ms timeout`);timers.delete(found[0]);found[1].callback();};
 try{
  const client=await import(`../dist/face-client.js?client-test=${++moduleId}`);
  await run({client,workers,timers,flush,fire});
 }finally{
  for(const [name,descriptor] of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}
 }
}
const region={x:0,y:0,width:640,height:480,maxSize:320};

test('face client preserves normal startup, progress, detection, and shared worker reuse',()=>withClient(async({client,workers,timers,flush})=>{
 const progress=[],ready=client.startFaceEngine(text=>progress.push(text));
 workers[0].reply({type:'progress',text:'Loading'});workers[0].reply({type:'ready'});await ready;
 assert.deepEqual(progress,['Loading']);assert.equal(timers.size,0);
 const detection=client.detectFaces({},[region]);await flush();
 const frame=workers[0].messages.find(m=>m.type==='frame');assert.equal(frame.regions[0].bitmap.width,320);
 workers[0].reply({type:'faces',seq:frame.seq,faces:[{score:.95}]});
 assert.deepEqual((await detection).faces,[{score:.95}]);assert.equal(timers.size,0);
 await client.startFaceEngine();assert.equal(workers.length,1);
}));

test('a stalled frame rejects all pending requests, clears timers, and permits a fresh worker',()=>withClient(async({client,workers,timers,flush,fire})=>{
 const ready=client.startFaceEngine();workers[0].reply({type:'ready'});await ready;
 const first=client.detectFaces({},[region]),second=client.detectFaces({},[region]);
 const results=Promise.allSettled([first,second]);await flush();
 const old=workers[0],oldFrame=old.messages.find(m=>m.type==='frame');assert.equal(timers.size,2);
 fire(3000);
 for(const result of await results){assert.equal(result.status,'rejected');assert.match(result.reason.message,/did not respond/);}
 assert.equal(old.terminated,true);assert.equal(timers.size,0);
 const restarted=client.startFaceEngine();const fresh=workers[1];fresh.reply({type:'ready'});await restarted;
 let settled=false;const detection=client.detectFaces({},[region]).then(value=>{settled=true;return value;});await flush();
 const frame=fresh.messages.find(m=>m.type==='frame');
 // Even a stale reply with the new sequence number must not resolve a new request.
 old.reply({type:'faces',seq:frame.seq,faces:[{stale:true}]});old.reply({type:'error',message:'old failure'});old.onerror({message:'old crash'});await flush();
 assert.equal(settled,false);assert.equal(fresh.terminated,false);assert.equal(timers.size,1);
 fresh.reply({type:'faces',seq:frame.seq,faces:[{fresh:true}]});assert.deepEqual((await detection).faces,[{fresh:true}]);
 old.reply({type:'faces',seq:oldFrame.seq,faces:[]});assert.equal(timers.size,0);
}));

test('a stalled startup has a deadline and can be retried',()=>withClient(async({client,workers,timers,fire})=>{
 const ready=client.startFaceEngine();const rejected=assert.rejects(ready,/did not finish loading/);fire(60000);await rejected;
 assert.equal(workers[0].terminated,true);assert.equal(timers.size,0);
 const restarted=client.startFaceEngine();workers[0].reply({type:'ready'});workers[1].reply({type:'ready'});await restarted;
 assert.equal(workers[1].terminated,false);assert.equal(timers.size,0);
}));

test('worker errors reject in-flight requests and dispose of their deadlines',()=>withClient(async({client,workers,timers,flush})=>{
 const ready=client.startFaceEngine();workers[0].reply({type:'ready'});await ready;
 const detection=client.detectFaces({},[region]);const rejected=assert.rejects(detection,/runtime stopped/);await flush();
 workers[0].reply({type:'error',message:'runtime stopped'});await rejected;
 assert.equal(workers[0].terminated,true);assert.equal(timers.size,0);
 const restarted=client.startFaceEngine();workers[1].reply({type:'ready'});await restarted;
}));
