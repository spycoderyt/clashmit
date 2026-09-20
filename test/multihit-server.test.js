import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/index.js';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';
const face=[encodeDescriptor(Array.from({length:DESCRIPTOR_LENGTH},()=>1/Math.sqrt(DESCRIPTOR_LENGTH)))];
test('one upgraded cast broadcasts three hits, credits each KO once and spends mana once',async t=>{
 const game=createGameServer({continuous:true});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const base=`http://127.0.0.1:${game.server.address().port}`;
 async function join(name){const ws=new WebSocket(base.replace('http:','ws:')+'/ws'),messages=[];t.after(()=>ws.terminate());ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise(r=>ws.on('open',r));const send=m=>ws.send(JSON.stringify(m));async function next(type,predicate=()=>true){for(let n=0;n<500;n++){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error(`Missing ${type}: ${name}`);}send({type:'join',name});const welcome=await next('welcome');send({type:'face',samples:face});return{...welcome,send,next};}
 const clients=[];for(const name of ['Caster','Primary','Extra One','Extra Two'])clients.push(await join(name));const [a,b]=clients;
 await a.next('state',m=>m.room.players.length===4&&m.room.players.every(p=>p.faceReady));const room=game.rooms.get('ARENA'),stamp=Date.now();
 room.players.forEach((p,i)=>{p.location={latitude:42+i*.000005,longitude:-71,accuracy:2,at:stamp};p.health=i===0?70:i===1?14:7;p.healthRegenAt=stamp;});const caster=room.players.find(p=>p.id===a.id);caster.loadout.skills.lightning=2;caster.mana=10;
 a.send({type:'cast',spell:'lightning',targetId:b.id});const shot=await a.next('spell');a.send({type:'impact',shotId:shot.shotId,tracked:true});
 const impact=await a.next('impact');assert.equal(impact.secondaryHits.length,2);assert.ok(Math.abs((caster.mana-(caster.manaUpdatedAt-shot.at)*2/3000)-8)<.01,'one mana charge plus continuous regen');assert.ok(room.players.filter(p=>p.id!==a.id).every(p=>p.health===0));
 for(const c of clients.slice(1)){const seen=await c.next('impact');assert.deepEqual(seen.secondaryHits.map(h=>h.targetId),impact.secondaryHits.map(h=>h.targetId));}
 const board=async()=>(await(await fetch(base+'/api/leaderboard')).json()).players;
 let scores=await board(),score=scores.find(p=>p.id===a.id);assert.equal(score.coins,90);assert.equal(score.knockouts,3);assert.equal(score.currentStreak,3);assert.ok(scores.filter(p=>p.id!==a.id).every(p=>p.deaths===1));
 a.send({type:'impact',shotId:shot.shotId,tracked:true});a.send({type:'ping',at:123});await a.next('pong',m=>m.at===123);score=(await board()).find(p=>p.id===a.id);assert.equal(score.coins,90);assert.equal(score.knockouts,3);
});
