import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {castSpell,launchFireball,impactFireball} from '../dist/rules.js';
import {colorProfile,similarity,validProfile,coverRect,bandProfile} from '../dist/shirt.js';
import {PALETTE} from '../dist/palette.js';
const profile=rgb=>colorProfile(new Uint8ClampedArray(Array.from({length:64},()=>[...rgb,255]).flat()));
const red=profile([220,30,30]),blue=profile([30,30,220]);
const swatch=name=>new Uint8ClampedArray(Array.from({length:64},()=>[...PALETTE.find(c=>c.name===name).rgb,255]).flat());
const band=(top,bottom)=>bandProfile(swatch(top),swatch(bottom));
const redCyan=band('red','cyan'),greenPink=band('green','pink');
import {createGameServer} from '../server/index.js';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';
// A stand-in face signature: any unit vector in the wire format.
const faceOf=seed=>{const v=Array.from({length:DESCRIPTOR_LENGTH},(_,i)=>Math.sin(seed*31+i*1.3)),n=Math.hypot(...v);return [encodeDescriptor(v.map(x=>x/n))];};
const player=id=>({id,health:100,connected:true,cooldowns:{},shieldUntil:0});
test('spells enforce phase, cooldown, shield and health bounds',()=>{
 const room={phase:'playing',players:[player('a'),player('b')]};
 assert.equal(castSpell(room,'a','fireball','b',1000).spell,'fireball');assert.equal(room.players[1].health,75);
 assert.ok(castSpell(room,'a','fireball','b',1100).error);assert.ok(castSpell(room,'a','toString','b',1100).error);
 castSpell(room,'b','shield',null,1200);assert.equal(castSpell(room,'a','fireball','b',3000).blocked,true);assert.equal(room.players[1].health,75);
 castSpell(room,'a','fireball','b',5000);assert.equal(room.players[1].health,50);
 castSpell(room,'b','heal',null,5100);assert.equal(room.players[1].health,70);
 room.phase='finished';assert.ok(castSpell(room,'a','heal',null,6000).error);
});
test('shirt profiles reject ambiguity and tolerate moderate brightness differences',()=>{
 assert.ok(validProfile(red));assert.equal(validProfile({bins:[1],rgb:[0,0,0]}),false);
 assert.ok(similarity(red,profile([160,22,22]))>.9);assert.ok(similarity(red,blue)<.1);
 const rect=coverRect({originX:320,originY:180,width:640,height:360},1280,720,400,800);
 assert.ok(Math.abs(rect.x+rect.width/2-.5)<.001);assert.equal(rect.y,.25);
});
test('fireball damage occurs at impact, keeps its target through tracking loss and respects shields',()=>{
 const room={phase:'playing',players:[player('a'),player('b')]};
 launchFireball(room,'a','b','one',1000);assert.equal(room.players[1].health,100);
 assert.ok(impactFireball(room,'a','one',true,1100).error);
 assert.equal(impactFireball(room,'a','one',false,2400).missed,false);assert.equal(room.players[1].health,75);
 launchFireball(room,'a','b','two',3000);castSpell(room,'b','shield',null,4000);
 assert.equal(impactFireball(room,'a','two',true,4400).blocked,true);
 launchFireball(room,'a','b','three',8000);assert.equal(impactFireball(room,'b','three',true,9400).error,'Projectile expired.');
 impactFireball(room,'a','three',true,9400);assert.equal(room.players[1].health,50);
 assert.ok(impactFireball(room,'a','three',true,9401).error);
 launchFireball(room,'a','b','four',10000);assert.equal(impactFireball(room,'a','four',true,14000).missed,true);
});
test('one shared arena, authoritative controller, face registration and delayed impact, reconnect and round outcome',async t=>{
 const game=createGameServer({countdownMs:0});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const url=`ws://127.0.0.1:${game.server.address().port}/ws`;
 async function client(name,token){const ws=new WebSocket(url),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.on('open',r));const send=m=>ws.send(JSON.stringify(m));const next=async(type,predicate=()=>true)=>{const end=Date.now()+2500;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for '+type);};send({type:'join',name,token});return {ws,send,next,messages};}
 const a=await client('Merlin'),aw=await a.next('welcome');const b=await client('Morgana'),bw=await b.next('welcome');assert.equal(aw.code,bw.code);
 b.send({type:'start'});assert.match((await b.next('error')).message,/host/);
 const third=await client('Third');await third.next('welcome');await a.next('state',m=>m.room.players.length===3);third.send({type:'leave'});await a.next('state',m=>m.room.players.length===2);
 a.send({type:'start'});assert.match((await a.next('error')).message,/scan their face/);
 a.send({type:'shirt',profile:{}});assert.match((await a.next('error')).message,/Invalid headband/);
 // A single-color version 1 profile must not be accepted into a two-stripe arena.
 a.send({type:'shirt',profile:red});assert.match((await a.next('error')).message,/Invalid headband/);
 a.send({type:'shirt',profile:redCyan});await a.next('state',m=>m.room.players.find(p=>p.id===aw.id)?.shirt?.id==='red-cyan');
 b.send({type:'shirt',profile:redCyan});assert.match((await b.next('error')).message,/already registered/);
 a.send({type:'start'});assert.match((await a.next('error')).message,/scan their face/);
 b.send({type:'shirt',profile:greenPink});await a.next('state',m=>m.room.players.find(p=>p.id===bw.id)?.shirt?.id==='green-pink');
 // Headband samples are still accepted, but players are identified by face, so they do not let a round start.
 a.send({type:'start'});assert.match((await a.next('error')).message,/scan their face/);
 a.send({type:'face',samples:['nonsense']});assert.match((await a.next('error')).message,/not readable/);a.send({type:'face',samples:faceOf(1),upper:['x']});assert.match((await a.next('error')).message,/not readable/);
 // Each scan reaches every player once as a 'faces' message and never rides along in the state broadcast.
 assert.deepEqual((await b.next('faces')).faces,{});a.send({type:'face',samples:faceOf(1),upper:faceOf(11)});const shared=await b.next('faces',m=>m.faces[aw.id]);assert.deepEqual(shared.faces[aw.id],{samples:faceOf(1),upper:faceOf(11)});
 b.send({type:'face',samples:faceOf(2)});const ready=await a.next('state',m=>m.room.players.every(p=>p.faceReady));assert.ok(!JSON.stringify(ready.room).includes(faceOf(1)[0].slice(0,40)));
 const late=await client('Late');await late.next('welcome');assert.deepEqual(Object.keys((await late.next('faces')).faces).sort(),[aw.id,bw.id].sort());late.send({type:'leave'});await a.next('state',m=>m.room.players.length===2);
 a.send({type:'start'});const started=await a.next('state',m=>m.room.phase==='playing');assert.equal(started.room.combat.mana.max,10);assert.ok(started.room.players.every(p=>p.mana===10));assert.deepEqual(started.room.shots,[]);
 a.send({type:'cast',spell:'fireball',targetId:bw.id});const shot=await a.next('spell');const flying=await b.next('state',m=>m.room.shots.some(s=>s.shotId===shot.shotId));assert.equal(shot.impactAt,shot.at+1400);assert.equal(flying.room.shots[0].actorId,aw.id);assert.ok(flying.room.players.find(p=>p.id===aw.id).mana<7.1);
 await new Promise(r=>setTimeout(r,1400));a.send({type:'impact',shotId:shot.shotId,tracked:true});await b.next('state',m=>m.room.players.find(p=>p.id===bw.id).health===75);
 a.send({type:'cast',spell:'fireball',targetId:bw.id});assert.match((await a.next('error')).message,/recharging/);
 b.send({type:'cast',spell:'shield'});await b.next('spell',m=>m.spell==='shield');
 a.send({type:'cast',spell:'lightning',targetId:bw.id,mana:999,manaCost:0});const bolt=await a.next('spell',m=>m.spell==='lightning');assert.equal(bolt.flightMs,250);
 await new Promise(r=>setTimeout(r,250));a.send({type:'impact',shotId:bolt.shotId,tracked:true});const boltHit=await b.next('impact',m=>m.shotId===bolt.shotId);assert.equal(boltHit.blocked,false);
 await b.next('state',m=>m.room.players.find(p=>p.id===bw.id).health===55);
 a.send({type:'cast',spell:'heal'});await a.next('spell',m=>m.spell==='heal');
 a.send({type:'cast',spell:'shield',mana:999,manaCost:0});assert.match((await a.next('error')).message,/mana/);
 b.ws.close();await a.next('state',m=>m.room.players.find(p=>p.id===bw.id)?.connected===false);
 const resumed=await client('Morgana',bw.token);assert.equal((await resumed.next('welcome')).id,bw.id);assert.equal((await resumed.next('state')).room.players.find(p=>p.id===bw.id).health,55);
 const resumedState=await resumed.next('state');const shielded=resumedState.room.players.find(p=>p.id===bw.id);assert.ok(shielded.mana>=7&&shielded.mana<10);assert.ok(shielded.shieldUntil>resumedState.room.serverTime);assert.ok(resumedState.room.players.every(p=>!('token' in p)));
 assert.ok(!('location' in (await resumed.next('state')).room.players[0]));
 const state=game.rooms.get('ARENA');state.endsAt=Date.now()-1;
 const final=await a.next('state',m=>m.room.phase==='finished');assert.deepEqual(final.room.winners,[aw.id]);
 a.send({type:'leave'});await resumed.next('state',m=>m.room.hostId===bw.id);
});
