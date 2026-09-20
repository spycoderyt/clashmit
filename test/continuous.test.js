import test from 'node:test';import assert from 'node:assert/strict';import {WebSocket} from 'ws';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {createGameServer} from '../server/index.js';import {spawnPlayer,advanceRespawns,respawnSeconds} from '../dist/respawn.js';
import {createScoreStore} from '../server/scores.js';import {creditContinuous} from '../server/continuous-scores.js';
import {launchProjectile,impactProjectile} from '../dist/rules.js';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';
const face=()=>[encodeDescriptor(Array.from({length:DESCRIPTOR_LENGTH},()=>1/Math.sqrt(DESCRIPTOR_LENGTH)))];
test('respawn uses a server deadline, resets combat state, and rejects projectiles from an old life',()=>{
 const a={id:'a',faceReady:true,connected:true},b={id:'b',faceReady:true,connected:true};spawnPlayer(a,1000);spawnPlayer(b,1000);
 const room={continuous:true,phase:'playing',players:[a,b],shots:[]};const shot=launchProjectile(room,'a','fireball','b','shot',1100);
 b.health=0;b.poison={};b.swarm={};b.shieldUntil=90000;b.stunUntil=90000;
 advanceRespawns(room,1500,10000);assert.equal(b.respawnAt,11500);assert.equal(respawnSeconds(b.respawnAt,1500),10);
 advanceRespawns(room,11499,10000);assert.equal(b.health,0);b.connected=false;advanceRespawns(room,12000,10000);assert.equal(b.health,0);
 b.connected=true;assert.deepEqual(advanceRespawns(room,12001,10000),['b']);assert.equal(b.health,100);assert.equal(b.mana,10);assert.equal(b.life,2);assert.equal(b.poison,null);assert.equal(b.swarm,null);assert.equal(b.stunUntil,0);assert.equal(b.respawnAt,null);
 assert.equal(impactProjectile(room,'a',shot.shotId,true,12002).missed,true);assert.equal(b.health,100);
 assert.equal(respawnSeconds(11500,12000),0);
});
test('continuous points save immediately; per-life caps and kills reset after respawn',()=>{
 const store=createScoreStore(),a={...store.register('A'),connected:true,faceReady:true},b={...store.register('B'),connected:true,faceReady:true};spawnPlayer(a,0);spawnPlayer(b,0);
 const room={players:[a,b]};creditContinuous(room,store,{actorId:a.id,targetId:b.id,amount:150});creditContinuous(room,store,{actorId:a.id,targetId:b.id,amount:20,lethal:true});creditContinuous(room,store,{actorId:a.id,targetId:b.id,amount:20,lethal:true});
 assert.equal(store.standings().find(p=>p.id===a.id).points,150);assert.equal(store.standings().find(p=>p.id===a.id).knockouts,1);
 spawnPlayer(b,10000);creditContinuous(room,store,{actorId:a.id,targetId:b.id,amount:20,lethal:true});assert.equal(store.standings().find(p=>p.id===a.id).points,220);assert.equal(store.standings().find(p=>p.id===a.id).knockouts,2);
 store.award(b.id,0,0,1);assert.equal(store.standings().find(p=>p.id===b.id).deaths,1);assert.equal(store.standings()[0].wins,0);
});
test('old score files acquire deaths without losing points or login identities',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'clash-continuous-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'scores.json');
 const initial=createScoreStore(file),a=initial.register('A');initial.award(a.id,75,1);
 const {readFile}=await import('node:fs/promises');const data=JSON.parse(await readFile(file,'utf8'));delete data.players[0].deaths;await writeFile(file,JSON.stringify(data));
 const store=createScoreStore(file);assert.equal(store.find(a.token).id,a.id);assert.equal(store.standings()[0].points,75);assert.equal(store.standings()[0].deaths,0);store.award(a.id,0,0,1);
 assert.equal(createScoreStore(file).standings()[0].deaths,1);
});
test('continuous server admits late players, counts kills and deaths once, and respawns after reconnect',async t=>{
 const game=createGameServer({continuous:true,respawnDelayMs:700});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const url=`ws://127.0.0.1:${game.server.address().port}/ws`;
 async function client(name,token){
  const ws=new WebSocket(url),messages=[];t.after(()=>ws.terminate());ws.on('message',b=>messages.push(JSON.parse(b)));await new Promise(r=>ws.on('open',r));const send=m=>ws.send(JSON.stringify(m));
  const next=async(type,predicate=()=>true)=>{const end=Date.now()+4000;while(Date.now()<end){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,10));}throw Error('Timed out: '+type);};send({type:'join',name,token});const welcome=await next('welcome');return{ws,send,next,...welcome};
 }
 const a=await client('Ada'),b=await client('Bo');a.send({type:'cast',spell:'heal'});assert.match((await a.next('error')).message,/live round/);
 a.send({type:'face',samples:face()});b.send({type:'face',samples:face()});await a.next('state',m=>m.room.players.every(p=>p.faceReady));
 const room=game.rooms.get('ARENA');assert.equal(room.phase,'playing');assert.equal(room.endsAt,0);room.players.find(p=>p.id===b.id).health=20;
 a.send({type:'cast',spell:'lightning',targetId:b.id});const shot=await a.next('spell');a.send({type:'impact',shotId:shot.shotId,tracked:true});
 const dead=await b.next('state',m=>m.room.players.find(p=>p.id===b.id)?.respawnAt>0),out=dead.room.players.find(p=>p.id===b.id);assert.equal(out.health,0);assert.equal(dead.room.phase,'playing');assert.equal(out.score.deaths,1);assert.equal(dead.room.players.find(p=>p.id===a.id).score.knockouts,1);
 assert.equal(dead.room.players.find(p=>p.id===a.id).score.points,70);assert.equal(out.respawnAt-out.diedAt,700);
 b.send({type:'cast',spell:'heal'});assert.match((await b.next('error')).message,/live round/);b.ws.close();
 const again=await client('Bo',b.token);const resumed=await again.next('state',m=>m.room.players.find(p=>p.id===b.id)?.health===0);assert.equal(resumed.room.players.find(p=>p.id===b.id).respawnAt,out.respawnAt);
 const c=await client('Cy');c.send({type:'face',samples:face()});await c.next('state',m=>m.room.players.find(p=>p.id===c.id)?.faceReady);
 a.send({type:'impact',shotId:shot.shotId,tracked:true});
 const alive=await again.next('state',m=>m.room.players.find(p=>p.id===b.id)?.life===2),reborn=alive.room.players.find(p=>p.id===b.id);assert.ok(Date.now()>=out.respawnAt);assert.equal(reborn.health,100);assert.equal(reborn.score.deaths,1);assert.equal(reborn.mana,10);assert.equal(reborn.respawnAt,null);assert.equal(alive.room.players.find(p=>p.id===a.id).score.knockouts,1);
 const api=await (await fetch(url.replace('ws:','http:').replace('/ws','/api/leaderboard'))).json();assert.equal(api.players.find(p=>p.id===b.id).deaths,1);
 const liveUrl=url.replace('ws:','http:').replace('/ws','/api/live');const live=await (await fetch(liveUrl)).json();
 assert.equal(live.online,3);assert.equal(live.kills.length,1);assert.equal(live.kills[0].killer,'Ada');assert.equal(live.kills[0].victim,'Bo');assert.equal(live.kills[0].streak,1);
 assert.equal(live.players[0].name,'Ada');assert.equal(live.players[0].kills,1);assert.equal(live.players[0].online,true);assert.equal(live.players[0].bestStreak,1);
 for(const p of live.players)assert.deepEqual(Object.keys(p).sort(),['id','name','rank','bestStreak','currentStreak','kills','deaths','online'].sort(),'spectators receive no location, face, token, or socket data');
 assert.equal((await fetch(liveUrl,{method:'HEAD'})).status,200);assert.equal((await fetch(liveUrl.replace('/api/live','/live'))).status,200);

});
test('best streak leads the leaderboard, persists after death, and current streak resets',()=>{
 const store=createScoreStore(null,{ranking:'killstreak'}),a=store.register('High damage'),b=store.register('Streak');
 store.award(a.id,10000,1);store.award(b.id,50,1);store.award(b.id,50,1);assert.equal(store.standings()[0].id,b.id);assert.equal(store.standings()[0].bestStreak,2);
 store.award(b.id,0,0,1);let p=store.standings().find(p=>p.id===b.id);assert.equal(p.currentStreak,0);assert.equal(p.bestStreak,2);assert.equal(p.deaths,1);
 store.award(b.id,50,1);p=store.standings().find(p=>p.id===b.id);assert.equal(p.currentStreak,1);assert.equal(p.bestStreak,2);
 store.resetStreak(b.id);assert.equal(store.standings().find(p=>p.id===b.id).bestStreak,2);
});
test('a posthumous or earlier-life kill counts but cannot advance a new streak',()=>{
 const store=createScoreStore(null,{ranking:'killstreak'}),a={...store.register('A'),connected:true,faceReady:true},b={...store.register('B'),connected:true,faceReady:true};spawnPlayer(a,0);spawnPlayer(b,0);const room={players:[a,b]};
 a.health=0;creditContinuous(room,store,{actorId:a.id,targetId:b.id,actorLife:1,amount:20,lethal:true});assert.equal(store.standings().find(p=>p.id===a.id).currentStreak,0);
 spawnPlayer(a,1000);spawnPlayer(b,1000);creditContinuous(room,store,{actorId:a.id,targetId:b.id,actorLife:1,amount:20,lethal:true});const score=store.standings().find(p=>p.id===a.id);assert.equal(score.knockouts,2);assert.equal(score.bestStreak,0);
});
test('every streak at three or above produces a global announcement exactly once',()=>{
 const store=createScoreStore(null,{ranking:'killstreak'}),a={...store.register('Ace'),connected:true,faceReady:true},b={...store.register('Target'),connected:true,faceReady:true};spawnPlayer(a,0);const room={players:[a,b]};
 for(let n=1;n<=5;n++){
  spawnPlayer(b,n*10000);const hit={actorId:a.id,targetId:b.id,actorLife:a.life,amount:100,lethal:true};
  const announcement=creditContinuous(room,store,hit);
  if(n<3)assert.equal(announcement,undefined);else assert.deepEqual(announcement,{type:'killstreak',actorId:a.id,name:'Ace',streak:n});
  assert.equal(creditContinuous(room,store,hit),undefined,'duplicate lethal report cannot broadcast twice');
 }
});
test('top three leaderboard ranks carry medals',async()=>{
 const {rankLabel}=await import('../dist/leaderboard.js');assert.equal(rankLabel(1),'🥇 1');assert.equal(rankLabel(2),'🥈 2');assert.equal(rankLabel(3),'🥉 3');assert.equal(rankLabel(4),'4');
});

test('confirmed kill callback includes every kill once, including posthumous lingering damage',()=>{
 const store=createScoreStore(),a={...store.register('A'),connected:true,faceReady:true},b={...store.register('B'),connected:true,faceReady:true};spawnPlayer(a,0);spawnPlayer(b,0);const room={players:[a,b]},events=[];
 const report=event=>events.push(event),hit={actorId:a.id,targetId:b.id,amount:10};
 creditContinuous(room,store,hit,report);assert.equal(events.length,0);
 creditContinuous(room,store,{...hit,lethal:true},report);creditContinuous(room,store,{...hit,lethal:true},report);assert.deepEqual(events,[{killer:'A',victim:'B',streak:1}]);
 spawnPlayer(b,1000);a.health=0;creditContinuous(room,store,{...hit,lethal:true},report);assert.deepEqual(events[1],{killer:'A',victim:'B',streak:0});
});
