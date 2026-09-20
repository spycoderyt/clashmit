import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createPassiveCoins} from '../server/passive-coins.js';
import {createScoreStore} from '../server/scores.js';

function fixture(){
 const paid=[],system=createPassiveCoins({credit:(id,coins)=>paid.push({id,coins})});
 const player=id=>({id,life:1,connected:true,faceReady:true,health:70,lastSeen:0});
 const a=player('a'),b=player('b'),room={economy:true,phase:'playing',eventRound:{mode:'ffa'},players:[a,b]};
 function step(at){for(const p of room.players)if(p.connected)p.lastSeen=at;return system.tick(room,at);}
 function run(from,to){for(let at=from;at<=to;at+=1000)step(at);}
 const total=id=>paid.filter(p=>p.id===id).reduce((sum,p)=>sum+p.coins,0);
 return{system,a,b,room,paid,step,run,total};
}

test('accepted combat persists 20 coins per active minute without changing combat scores',t=>{
 const dir=mkdtempSync(join(tmpdir(),'clash-participation-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const file=join(dir,'scores.json'),store=createScoreStore(file,{ranking:'coins'}),identity=store.register('Participant');
 store.award(identity.id,0,3);
 const system=createPassiveCoins({credit:(id,coins)=>store.award(id,0,0,0,false,coins)});
 const a={id:identity.id,life:1,connected:true,faceReady:true,health:70,lastSeen:0},b={...a,id:'opponent'};
 const room={economy:true,phase:'playing',players:[a,b]};system.engage(a,0);
 for(let at=0;at<=60000;at+=1000){a.lastSeen=b.lastSeen=at;system.tick(room,at);}
 const score=store.standings()[0];assert.equal(score.coins,20);assert.equal(score.knockouts,3);assert.equal(score.currentStreak,3);assert.equal(score.points,0);
 assert.deepEqual(createScoreStore(file,{ranking:'coins'}).standings()[0],score);
});

test('heartbeats alone never start income and do not extend a combat activity window',()=>{
 const f=fixture();f.run(0,120000);assert.equal(f.total('a'),0);
 f.system.engage(f.a,120000);f.run(121000,240000);assert.equal(f.total('a'),20);
 f.run(241000,360000);assert.equal(f.total('a'),20);
});

test('ten active minutes pay 200 coins even with no kills',()=>{
 const f=fixture();f.system.engage(f.a,0);f.step(0);
 for(let at=1000;at<=600000;at+=1000){if(at%30000===0)f.system.engage(f.a,at);f.step(at);}
 assert.equal(f.total('a'),200);assert.equal(f.total('b'),0);
});

test('forced FFA respawn wait counts, but an open shop after the deadline does not',()=>{
 const f=fixture();f.system.engage(f.a,0);f.run(0,20000);
 f.a.health=0;f.a.diedAt=20000;f.a.respawnAt=30000;
 f.run(21000,60000);assert.equal(f.total('a'),10);
 f.system.engage(f.a,60000);f.run(61000,90000);assert.equal(f.total('a'),10);
 f.a.health=70;f.a.respawnAt=null;f.system.engage(f.a,90000);f.run(91000,120000);assert.equal(f.total('a'),20);
});

test('idle, unscanned, eliminated, paused and solo players do not receive pay',()=>{
 for(const mode of ['unscanned','eliminated','waiting','paused','solo','legacy','stale','koth-dead']){
  const f=fixture();f.system.engage(f.a,0);
  if(mode==='unscanned')f.a.faceReady=false;
  if(mode==='eliminated')f.a.eliminated=true;
  if(mode==='waiting')f.a.waitingForRound=true;
  if(mode==='paused')f.room.phase='finished';
  if(mode==='solo')f.b.connected=false;
  if(mode==='legacy')f.room.economy=false;
  if(mode==='koth-dead'){f.room.eventRound.mode='koth';f.a.health=0;f.a.diedAt=0;f.a.respawnAt=60000;}
  if(mode==='stale'){for(let at=0;at<=60000;at+=1000){f.b.lastSeen=at;f.system.tick(f.room,at);}}
  else f.run(0,60000);
  assert.equal(f.total('a'),0,mode);
 }
});

test('disconnects give no offline pay and reconnecting preserves only unpaid active progress',()=>{
 const f=fixture();f.system.engage(f.a,0);f.run(0,15000);
 f.a.connected=false;f.system.pause(f.a,15000);f.run(16000,75000);
 f.a.connected=true;f.run(76000,105000);assert.equal(f.total('a'),0,'a heartbeat cannot resume pay');
 f.system.engage(f.a,105000);f.run(106000,120000);assert.equal(f.total('a'),10);
});

test('a delayed tick cannot grant missed wall time, and repeated or reversed ticks do not double-pay',()=>{
 const f=fixture();f.system.engage(f.a,0);f.run(0,29000);
 assert.deepEqual(f.step(29000),[]);assert.deepEqual(f.step(28000),[]);
 assert.equal(f.total('a'),0);
 f.system.engage(f.a,329000);f.step(329000);assert.equal(f.total('a'),0,'time before renewed combat does not count');
 f.step(330000);assert.equal(f.total('a'),10);
 assert.deepEqual(f.step(330000),[]);f.step(NaN);assert.equal(f.total('a'),10);
 const stalled=fixture();stalled.system.engage(stalled.a,0);stalled.step(0);stalled.step(30000);assert.equal(stalled.total('a'),0,'one tick credits at most one second');
});

test('reset discards the session clock and partial income without granting time to a new session',()=>{
 const f=fixture();f.system.engage(f.a,0);f.run(0,29000);f.system.reset();
 f.system.engage(f.a,30000);f.run(30000,59000);assert.equal(f.total('a'),0);f.step(60000);assert.equal(f.total('a'),10);
});
