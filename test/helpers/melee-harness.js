// Deterministic browser/worker harness. Counts costly operations without claiming
// that a desktop mock measures phone inference or GPU frame rates.
export async function withMeleeHarness(createGame,run){
 const names=['document','window','Worker','ResizeObserver','createImageBitmap','performance','devicePixelRatio','requestAnimationFrame','cancelAnimationFrame','setTimeout','clearTimeout'];
 const originals=new Map(names.map(name=>[name,Object.getOwnPropertyDescriptor(globalThis,name)]));
 let clock=0,id=0,autoReply=true,frozen=false;
 const timers=new Map(),frames=new Map(),workers=[],observers=[],canvases=[];
 const stats={containerReads:0,videoReads:0,paints:0,captures:0,frameMessages:0,hits:[]};
 let pose={x:.25,y:.55},geometry={left:0,top:0,width:390,height:844};
 function hands(){const l=Array.from({length:21},()=>({x:pose.x,y:pose.y,z:0}));l[0].y+=.04;l[5].x-=.04;l[9].y-=.04;l[17].x+=.04;return[{landmarks:l,handedness:'Left',handednessScore:.95}];}
 function reply(worker,message){worker.onmessage?.({data:{type:'frame',id:message.id,timestamp:message.timestamp,hands:hands(),ms:10}});}
 class FakeWorker{
  constructor(){this.messages=[];workers.push(this);}
  postMessage(message){this.messages.push(message);if(message.type==='init')queueMicrotask(()=>this.onmessage?.({data:{type:'ready'}}));else if(message.type==='frame'){stats.frameMessages++;if(autoReply)queueMicrotask(()=>reply(this,message));}}
  terminate(){this.terminated=true;}
 }
 class Resize{constructor(callback){this.callback=callback;observers.push(this);}observe(){}disconnect(){this.disconnected=true;}}
 const doc=new EventTarget(),win=new EventTarget();doc.hidden=false;
 doc.createElement=()=>{
  const index=canvases.length;let width=300,height=150;
  const noop=()=>{},context={clearRect:noop,setTransform:noop,save(){if(index===0)stats.paints++;},restore:noop,translate:noop,rotate:noop,beginPath:noop,moveTo:noop,lineTo:noop,closePath:noop,fill:noop,stroke:noop,fillRect:noop,drawImage(){stats.captures++;}};
  const canvas={style:{},dimensionWrites:0,setAttribute:noop,getContext:()=>context,remove(){this.removed=true;},get width(){return width;},set width(value){this.dimensionWrites++;width=value;},get height(){return height;},set height(value){this.dimensionWrites++;height=value;}};
  canvases.push(canvas);return canvas;
 };
 const container={append(){},getBoundingClientRect(){stats.containerReads++;return{...geometry};}};
 const video={readyState:2,videoWidth:720,videoHeight:1280,currentTime:0,getBoundingClientRect(){stats.videoReads++;return{...geometry};}};
 Object.assign(globalThis,{document:doc,window:win,Worker:FakeWorker,ResizeObserver:Resize,devicePixelRatio:2,createImageBitmap:async canvas=>({width:canvas.width,height:canvas.height,close(){this.closed=true;}}),performance:{now:()=>clock},setTimeout:(fn,delay)=>{const key=++id;timers.set(key,{fn,at:clock+Math.max(0,delay)});return key;},clearTimeout:key=>timers.delete(key),requestAnimationFrame:fn=>{const key=++id;frames.set(key,fn);return key;},cancelAnimationFrame:key=>frames.delete(key)});
 const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
 const controller=createGame({video,container,getTargets:()=>[{id:'target',x:.42,y:.28,width:.16,height:.18}],onHit:event=>stats.hits.push(event)});
 async function advance(ms){const until=clock+ms;while(clock<until){clock=Math.min(until,clock+1000/60);if(!frozen)video.currentTime=clock/1000;for(const [key,timer]of [...timers])if(timer.at<=clock){timers.delete(key);timer.fn();}await flush();const queued=[...frames];frames.clear();for(const [,fn]of queued)fn(clock);await flush();}}
 try{return await run({controller,video,container,doc,stats,canvases,workers,timers,frames,advance,flush,now:()=>clock,setPose:value=>pose=value,setAutoReply:value=>autoReply=value,setFrozen:value=>frozen=value,replyLast(){const worker=workers.at(-1),message=worker.messages.filter(m=>m.type==='frame').at(-1);reply(worker,message);},resize(next){geometry={...geometry,...next};for(const o of observers)o.callback();},observers});}
 finally{controller.dispose?.();controller.stop();for(const [name,descriptor]of originals){if(descriptor)Object.defineProperty(globalThis,name,descriptor);else delete globalThis[name];}}
}
