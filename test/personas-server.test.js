import test from 'node:test';import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';
import {createGameServer} from '../server/index.js';
// Players are identified by a scanned face; a round cannot start until everyone has one.
const faceOf=seed=>{const v=Array.from({length:DESCRIPTOR_LENGTH},(_,i)=>Math.sin(seed*31+i*1.3)),n=Math.hypot(...v);return [encodeDescriptor(v.map(x=>x/n))];};

async function harness(t){
 const game=createGameServer({countdownMs:0});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const url=`ws://127.0.0.1:${game.server.address().port}/ws`;
 async function client(join){
  const ws=new WebSocket(url),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.on('open',r));
  const send=m=>ws.send(JSON.stringify(m));
  const next=async(type,predicate=()=>true)=>{const end=Date.now()+2500;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for '+type);};
  send({type:'join',...join});return{ws,send,next};
 }
 return{game,client};
}
test('join stores a valid persona, defaults to mage, and rejects an unknown one',async t=>{
 const{client}=await harness(t);
 const bad=await client({name:'Bad',persona:'necromancer'});assert.equal((await bad.next('error')).message,'Choose a persona.');
 const proto=await client({name:'Proto',persona:'constructor'});assert.equal((await proto.next('error')).message,'Choose a persona.');
 const w=await client({name:'Wanda',persona:'witch'});await w.next('welcome');
 const old=await client({name:'Oldtab'});await old.next('welcome');
 const state=await w.next('state',m=>m.room.players.length===2);
 assert.equal(state.room.players.find(p=>p.name==='Wanda').persona,'witch');assert.equal(state.room.players.find(p=>p.name==='Oldtab').persona,'mage');
});
test('persona survives a token reconnect',async t=>{
 const{client}=await harness(t);
 const a=await client({name:'Archie',persona:'archer'}),welcome=await a.next('welcome');a.ws.close();
 const again=await client({name:'Archie',token:welcome.token});await again.next('welcome');
 const state=await again.next('state',m=>m.room.players.some(p=>p.name==='Archie'&&p.connected));
 assert.equal(state.room.players.find(p=>p.name==='Archie').persona,'archer');
});
test('the server enforces decks and delivers skeleton damage on its own tick',async t=>{
 const{client}=await harness(t);
 const w=await client({name:'Wanda',persona:'witch'}),ww=await w.next('welcome');const m=await client({name:'Merlin',persona:'mage'}),mw=await m.next('welcome');
 w.send({type:'face',samples:faceOf(1)});m.send({type:'face',samples:faceOf(2)});
 await w.next('state',s=>s.room.players.every(p=>p.faceReady));w.send({type:'start'});await w.next('round-start');
 w.send({type:'cast',spell:'fireball',targetId:mw.id});assert.equal((await w.next('error')).message,'Not in your deck.');
 w.send({type:'cast',spell:'skeletonArmy',targetId:mw.id});const shot=await w.next('spell',e=>e.spell==='skeletonArmy');assert.ok(shot.shotId);
 await new Promise(r=>setTimeout(r,shot.flightMs));w.send({type:'impact',shotId:shot.shotId,tracked:true});
 const impact=await m.next('impact');assert.equal(impact.missed,false);
 const swarmed=await m.next('state',s=>s.room.players.find(p=>p.id===mw.id).swarm);assert.ok(swarmed);
 // No further messages from either client: the tick alone must move health.
 const hurt=await m.next('state',s=>s.room.players.find(p=>p.id===mw.id).health<100);assert.ok(hurt.room.players.find(p=>p.id===mw.id).health<100);
 // The leaderboard must pay for that damage too: it happens between hits, where no impact event is scored.
 const paid=await w.next('state',s=>s.room.players.find(p=>p.id===ww.id).roundPoints>0),witch=paid.room.players.find(p=>p.id===ww.id),mage=paid.room.players.find(p=>p.id===mw.id);
 assert.equal(witch.roundPoints,100-mage.health,'one point per health the skeletons have taken');
 m.send({type:'cast',spell:'fireball',targetId:null});const clear=await m.next('spell',e=>e.clearedSwarm);assert.equal(clear.shotId,undefined);
 const cleared=await m.next('state',s=>!s.room.players.find(p=>p.id===mw.id).swarm);assert.ok(cleared);
});
test('a returning player may change persona before a round, never during one',async t=>{
 const{client}=await harness(t);
 const a=await client({name:'Archie',persona:'archer'}),aw=await a.next('welcome');const m=await client({name:'Merlin',persona:'mage'});await m.next('welcome');
 const personaOf=async(who,name)=>(await who.next('state',s=>s.room.players.some(p=>p.name===name&&p.connected))).room.players.find(p=>p.name===name).persona;
 a.ws.close();const lobby=await client({name:'Archie',persona:'witch',token:aw.token});await lobby.next('welcome');
 assert.equal(await personaOf(lobby,'Archie'),'witch','the lobby choice is honoured');
 lobby.ws.close();const old=await client({name:'Archie',token:aw.token});await old.next('welcome');
 assert.equal(await personaOf(old,'Archie'),'witch','a tab that sends no persona changes nothing');
 old.send({type:'face',samples:faceOf(1)});m.send({type:'face',samples:faceOf(2)});
 await old.next('state',s=>s.room.players.every(p=>p.faceReady));
 // Hosting passed to Merlin when Archie first dropped.
 m.send({type:'start'});await old.next('round-start');
 old.ws.close();const mid=await client({name:'Archie',persona:'mage',token:aw.token});await mid.next('welcome');
 assert.equal(await personaOf(mid,'Archie'),'witch','no swapping decks mid-round');
});
