import test from 'node:test';import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';
import {createGameServer} from '../server/index.js';
const faceOf=seed=>{const v=Array.from({length:DESCRIPTOR_LENGTH},(_,i)=>Math.sin(seed*31+i*1.3)),n=Math.hypot(...v);return [encodeDescriptor(v.map(x=>x/n))];};

// The firing phone reports an impact once, timed by its own estimate of the server clock. Lightning flies
// for 250ms and the server tolerates a report only 25ms early, so a phone whose estimate runs ahead used to
// have a true hit rejected, never retried, and finally expired as a miss.
test('an impact reported early still lands when the spell arrives, instead of expiring as a miss',async t=>{
 const game=createGameServer({countdownMs:0});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const url=`ws://127.0.0.1:${game.server.address().port}/ws`;
 async function client(name){
  const ws=new WebSocket(url),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.on('open',r));const send=m=>ws.send(JSON.stringify(m));
  const next=async(type,predicate=()=>true)=>{const end=Date.now()+2500;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for '+type);};
  send({type:'join',name});return{send,next};
 }
 const a=await client('Ada');await a.next('welcome');const b=await client('Bo'),bw=await b.next('welcome');
 a.send({type:'face',samples:faceOf(1)});b.send({type:'face',samples:faceOf(2)});await a.next('state',s=>s.room.players.every(p=>p.faceReady));
 a.send({type:'start'});await a.next('round-start');
 a.send({type:'cast',spell:'lightning',targetId:bw.id});const shot=await a.next('spell',e=>e.spell==='lightning');
 a.send({type:'impact',shotId:shot.shotId,tracked:true}); // at once: far earlier than the tolerance allows
 const impact=await b.next('impact');assert.equal(impact.missed,false,'a true hit must not become a miss');
 assert.ok(impact.resolvedAt>=shot.impactAt-25,'and it must not land before the spell could arrive');
 const state=await b.next('state',s=>s.room.players.find(p=>p.id===bw.id).health<100);assert.equal(state.room.players.find(p=>p.id===bw.id).health,80);
});
