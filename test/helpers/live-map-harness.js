// Counts browser work deterministically; this is not a phone GPU/FPS benchmark.
export async function withLiveMapHarness(createLiveMap,run){
 const keys=['document','ResizeObserver','devicePixelRatio','requestAnimationFrame','cancelAnimationFrame','performance'];
 const saved=new Map(keys.map(key=>[key,Object.getOwnPropertyDescriptor(globalThis,key)]));
 let time=0,id=0;const frames=new Map(),stats={measures:0,projects:0,paints:0,resizes:0,dimensions:0,text:[],points:[]};
 const noop=()=>{},ctx=new Proxy({measureText(text){stats.measures++;return{width:text.length*6};},fillText(text){stats.text.push(text);},clearRect(){stats.paints++;}}, {get:(obj,key)=>obj[key]??noop,set:(obj,key,value)=>(obj[key]=value,true)});
 function element(tag){let width=300,height=150;return{childNodes:[],append(...children){this.childNodes.push(...children);},prepend(child){this.childNodes.unshift(child);},replaceChildren(){this.childNodes=[];},setAttribute:noop,getBoundingClientRect:()=>({width:800,height:500}),getContext:()=>ctx,get width(){return width;},set width(v){stats.dimensions++;width=v;},get height(){return height;},set height(v){stats.dimensions++;height=v;}};}
 const fonts=new EventTarget(),doc={fonts,createElement:element};
 const tiles={ready:true,load:async()=>{},follow:noop,resize(){stats.resizes++;},project(latitude,longitude){stats.projects++;stats.points.push({latitude,longitude});return{x:(longitude+71)*100000+100,y:(latitude-42)*100000+100};}};
 const host=element('host');let controller;
 Object.assign(globalThis,{document:doc,ResizeObserver:class{observe(){}disconnect(){}},devicePixelRatio:2,performance:{now:()=>time},requestAnimationFrame:fn=>{const key=++id;frames.set(key,fn);return key;},cancelAnimationFrame:key=>frames.delete(key)});
 async function flush(){for(let n=0;n<4;n++)await Promise.resolve();}
 async function advance(count=1){for(let n=0;n<count;n++){time+=34;const queued=[...frames.values()];frames.clear();queued.forEach(fn=>fn(time));await flush();}}
 try{controller=createLiveMap(host,{createTiles:()=>tiles});return await run({controller,stats,tiles,fonts,frames,host,advance,flush,now:()=>time});}
 finally{controller?.destroy();for(const[key,value]of saved){if(value)Object.defineProperty(globalThis,key,value);else delete globalThis[key];}}
}
export function liveMapFixture(){
 const players=Array.from({length:30},(_,i)=>({id:String(i),name:`Player ${i}`,persona:'mage',health:70,location:{latitude:42+i*.00002,longitude:-71+i*.00002,at:1000}}));
 const casts=Array.from({length:40},(_,i)=>({id:i,actorId:'0',targetId:'1',spell:'fireball',kind:'spell',at:1000,flightMs:5000,from:{...players[0].location},to:{...players[1].location}}));
 return{players,casts};
}
