import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/index.js';
import {rankPlayers,newlyOut} from '../dist/rules.js';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';
const faceOf=seed=>{const v=Array.from({length:DESCRIPTOR_LENGTH},(_,i)=>Math.sin(seed*31+i*1.3)),n=Math.hypot(...v);return [encodeDescriptor(v.map(x=>x/n))];};
test('the leaderboard puts survivors first by health, then the knocked out, latest first',()=>{
 const players=[{id:'early',name:'Early',health:0,diedAt:1000},{id:'hurt',name:'Hurt',health:20},{id:'late',name:'Late',health:0,diedAt:9000},{id:'fit',name:'Fit',health:80},{id:'mid',name:'Mid',health:0,diedAt:5000}];
 const ranked=rankPlayers(players);assert.deepEqual(ranked.map(p=>p.id),['fit','hurt','late','mid','early']);assert.deepEqual(ranked.map(p=>p.place),[1,2,3,4,5]);
 assert.equal(players[0].place,undefined,'the input is not modified');assert.deepEqual(rankPlayers([]),[]);
 // Someone with no recorded time (they were already out) sorts last rather than breaking the order.
 assert.deepEqual(rankPlayers([{id:'x',health:0},{id:'y',health:0,diedAt:5}]).map(p=>p.id),['y','x']);
});
test('starting a round runs a shared countdown, then records when each player is knocked out',async t=>{
 const game=createGameServer({countdownMs:250});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const url=`ws://127.0.0.1:${game.server.address().port}/ws`;
 async function client(name){const ws=new WebSocket(url),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.on('open',r));const send=m=>ws.send(JSON.stringify(m));const next=async(type,predicate=()=>true)=>{const end=Date.now()+3000;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for '+type);};send({type:'join',name});return {ws,send,next};}
 const a=await client('Ada'),aw=await a.next('welcome'),b=await client('Bo'),bw=await b.next('welcome');
 a.send({type:'face',samples:faceOf(1)});b.send({type:'face',samples:faceOf(2)});await a.next('state',m=>m.room.players.length===2&&m.room.players.every(p=>p.faceReady));
 const clicked=Date.now();a.send({type:'start'});
 // Both phones are told the same start moment, and nothing can be cast or joined until it arrives.
 const [forA,forB]=await Promise.all([a.next('countdown'),b.next('countdown')]);assert.equal(forA.startsAt,forB.startsAt);assert.ok(Math.abs(forA.startsAt-clicked-250)<120);
 const waiting=await b.next('state',m=>m.room.phase==='countdown');assert.equal(waiting.room.startsAt,forA.startsAt);assert.ok(waiting.room.players.every(p=>p.health===100));
 a.send({type:'cast',spell:'fireball',targetId:bw.id});assert.match((await a.next('error')).message,/live round/);
 a.send({type:'start'});const late=await client('Late');assert.match((await late.next('error')).message,/round is running/);late.ws.close();
 await a.next('round-start');const live=await b.next('state',m=>m.room.phase==='playing');assert.ok(Date.now()-clicked>=240);assert.ok(Math.abs(live.room.endsAt-live.room.startsAt-180000)<5);
 // Four lightning bolts knock Bo out; the moment is recorded and the round ends with Ada on top.
 const room=game.rooms.get('ARENA'),bo=room.players.find(p=>p.id===bw.id);bo.health=20;
 a.send({type:'cast',spell:'lightning',targetId:bw.id});const shot=await a.next('spell');await new Promise(r=>setTimeout(r,260));a.send({type:'impact',shotId:shot.shotId,tracked:true});
 const over=await a.next('state',m=>m.room.phase==='finished');const out=over.room.players.find(p=>p.id===bw.id);assert.equal(out.health,0);assert.ok(out.diedAt>=over.room.startsAt&&out.diedAt<=Date.now());
 assert.deepEqual(rankPlayers(over.room.players).map(p=>p.name),['Ada','Bo']);assert.deepEqual(over.room.winners,[aw.id]);
 assert.equal(over.room.results.players.find(p=>p.id===aw.id).earnedPoints,295);assert.equal(over.room.results.players.find(p=>p.id===aw.id).wins,1);assert.equal(over.room.players.find(p=>p.id===aw.id).score.points,295);assert.equal(over.room.results.players.find(p=>p.id===bw.id).earnedPoints,25);
 // A new round counts down again and clears the old knock-out times.
 a.send({type:'start'});await a.next('countdown');const again=await a.next('state',m=>m.room.phase==='countdown');assert.ok(again.room.players.every(p=>p.health===100&&!p.diedAt));
 a.ws.close();b.ws.close();
});
test('a countdown is abandoned if players leave before it ends',async t=>{
 const game=createGameServer({countdownMs:200});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const url=`ws://127.0.0.1:${game.server.address().port}/ws`;
 const join=async name=>{const ws=new WebSocket(url),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.on('open',r));ws.send(JSON.stringify({type:'join',name}));const next=async(type,predicate=()=>true)=>{const end=Date.now()+3000;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for '+type);};return{ws,next,send:m=>ws.send(JSON.stringify(m))};};
 const a=await join('Ada');await a.next('welcome');const b=await join('Bo');await b.next('welcome');a.send({type:'face',samples:faceOf(1)});b.send({type:'face',samples:faceOf(2)});await a.next('state',m=>m.room.players.every(p=>p.faceReady)&&m.room.players.length===2);
 a.send({type:'start'});await a.next('countdown');b.send({type:'leave'});
 assert.match((await a.next('error',m=>/Not enough/.test(m.message))).message,/Not enough players/);const back=await a.next('state',m=>m.room.phase==='lobby');assert.equal(back.room.startsAt,0);a.ws.close();
});
test('a face photo for the map is relayed once, validated strictly and removed when the player leaves',async t=>{
 const {validAvatar,avatarCrop,AVATAR}=await import('../dist/face-id.js');
 const jpeg='data:image/jpeg;base64,'+Buffer.from('not really a jpeg but valid base64').toString('base64');
 assert.ok(validAvatar(jpeg));for(const bad of [null,42,'','data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=','data:image/jpeg;base64,<script>','data:text/html;base64,AAAA','data:image/jpeg;base64,'+'A'.repeat(AVATAR.maxLength)])assert.equal(validAvatar(bad),false);
 // The crop is a square around the whole head, kept inside the frame.
 const crop=avatarCrop({x:300,y:200,width:100,height:140},720,960);assert.ok(crop.size>=140&&crop.size<=720);assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.size<=720&&crop.y+crop.size<=960);assert.ok(Math.abs(crop.x+crop.size/2-350)<1);
 const edge=avatarCrop({x:0,y:0,width:200,height:260},720,960);assert.equal(edge.x,0);assert.equal(edge.y,0);
 const game=createGameServer({countdownMs:0});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const url=`ws://127.0.0.1:${game.server.address().port}/ws`;
 const join=async name=>{const ws=new WebSocket(url),messages=[];ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.on('open',r));ws.send(JSON.stringify({type:'join',name}));const next=async(type,predicate=()=>true)=>{const end=Date.now()+3000;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Timed out waiting for '+type);};return{ws,next,send:m=>ws.send(JSON.stringify(m))};};
 const a=await join('Ada'),aw=await a.next('welcome'),b=await join('Bo');await b.next('welcome');assert.deepEqual((await b.next('avatars')).avatars,{});
 a.send({type:'avatar',image:'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='});assert.match((await a.next('error')).message,/could not be used/);
 a.send({type:'avatar',image:jpeg});assert.equal((await b.next('avatars',m=>m.avatars[aw.id])).avatars[aw.id],jpeg);
 // It never rides along in the state broadcast, and a player who joins later still receives it.
 const state=await b.next('state');assert.ok(!JSON.stringify(state).includes(jpeg.slice(30)));const late=await join('Cy');await late.next('welcome');assert.equal((await late.next('avatars')).avatars[aw.id],jpeg);
 a.send({type:'leave'});assert.equal((await b.next('avatars',m=>aw.id in m.avatars)).avatars[aw.id],null);assert.equal(game.rooms.get('ARENA').avatars[aw.id],undefined);b.ws.close();late.ws.close();
});
test('a knock-out is reported once, at the moment health reaches zero',()=>{
 const before=new Map([['a',100],['b',25],['c',0]]);
 const players=[{id:'a',name:'Ada',health:75},{id:'b',name:'Bo',health:0},{id:'c',name:'Cy',health:0},{id:'d',name:'Di',health:0}];
 // Bo has just gone out. Cy was already out, and Di is seen for the first time already at zero, so neither is news.
 assert.deepEqual(newlyOut(before,players).map(p=>p.id),['b']);
 for(const p of players)before.set(p.id,p.health);assert.deepEqual(newlyOut(before,players),[]);
});
