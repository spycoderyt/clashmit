import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {castSpell} from '../dist/rules.js';
import {relativePosition,wrap,chooseTarget,cameraHeading} from '../dist/geo.js';
import {createGameServer} from '../server/index.js';
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
test('bearings cross north correctly, and uncertain overlaps do not select a player',()=>{
 const origin={latitude:0,longitude:0,accuracy:3};const east=relativePosition(origin,{latitude:0,longitude:.001,accuracy:4});assert.ok(Math.abs(east.distance-111.195)<.01);assert.equal(east.bearing,90);assert.equal(east.error,5);assert.equal(wrap(359-1),-2);
 assert.equal(cameraHeading({absolute:true,alpha:0,beta:90,gamma:0}),0);assert.equal(cameraHeading({absolute:true,alpha:270,beta:90,gamma:0}),90);
 const p={id:'a',name:'A',fresh:true,distance:30,error:5,accuracy:3,ownAccuracy:4,delta:0};assert.equal(chooseTarget([p]).id,'a');assert.equal(chooseTarget([p,{...p,id:'b',delta:5}]).id,null);assert.equal(chooseTarget([{...p,fresh:false}]).id,null);
});
test('one shared arena, authoritative controller, location gating, reconnect and round outcome',async t=>{
 const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const url=`ws://127.0.0.1:${game.server.address().port}/ws`;
 async function client(name,token){const ws=new WebSocket(url),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.on('open',r));const send=m=>ws.send(JSON.stringify(m));const next=async(type,predicate=()=>true)=>{const end=Date.now()+2500;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for '+type);};send({type:'join',name,token});return {ws,send,next,messages};}
 const a=await client('Merlin'),aw=await a.next('welcome');const b=await client('Morgana'),bw=await b.next('welcome');assert.equal(aw.code,bw.code);
 b.send({type:'start'});assert.match((await b.next('error')).message,/host/);
 a.send({type:'start'});await a.next('state',m=>m.room.phase==='playing');
 a.send({type:'cast',spell:'fireball',targetId:bw.id});assert.match((await a.next('error')).message,/locations/);
 a.send({type:'location',location:{latitude:40,longitude:-74,accuracy:4}});b.send({type:'location',location:{latitude:40.0003,longitude:-74,accuracy:4}});
 await a.next('state',m=>m.room.players.every(p=>p.location));
 a.send({type:'cast',spell:'fireball',targetId:bw.id});await b.next('state',m=>m.room.players.find(p=>p.id===bw.id).health===75);
 a.send({type:'cast',spell:'fireball',targetId:bw.id});assert.match((await a.next('error')).message,/recharging/);
 b.ws.close();await a.next('state',m=>m.room.players.find(p=>p.id===bw.id)?.connected===false);
 const resumed=await client('Morgana',bw.token);assert.equal((await resumed.next('welcome')).id,bw.id);assert.equal((await resumed.next('state')).room.players.find(p=>p.id===bw.id).health,75);
 const state=game.rooms.get('ARENA');state.endsAt=Date.now()-1;
 const final=await a.next('state',m=>m.room.phase==='finished');assert.deepEqual(final.room.winners,[aw.id]);
 a.send({type:'leave'});await resumed.next('state',m=>m.room.hostId===bw.id);
});
