import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createScoreStore,startScoring,recordScore,settleScores,POINTS} from '../server/scores.js';
import {launchProjectile,impactProjectile} from '../dist/rules.js';
import {createGameServer} from '../server/index.js';
import {WebSocket} from 'ws';
const make=()=>{const store=createScoreStore(),a=store.register('Ada'),b=store.register('Bo'),room={phase:'playing',players:[a,b].map(p=>({...p,health:100,connected:true,shieldUntil:0,cooldowns:{},mana:10,manaUpdatedAt:0}))};startScoring(room);return {store,room,a,b};};
const hit=(room,actorId,targetId,amount,shotId)=>{const target=room.players.find(p=>p.id===targetId),before=target.health;target.health=Math.max(0,before-amount);const event={actorId,targetId,shotId};recordScore(room,event,before);return {event,before};};

test('actual damage, knockout, finish and last-standing bonus settle once; Wins require sole survivor',()=>{
 const {store,room,a,b}=make();const {event,before}=hit(room,a.id,b.id,150,'kill');
 assert.equal(room.players[0].roundPoints,150);recordScore(room,event,before);assert.equal(room.players[0].roundPoints,150,'duplicate impact cannot score again');
 settleScores(room,store);assert.equal(POINTS.win,200);
 assert.deepEqual(store.standings().map(p=>[p.name,p.points,p.wins,p.knockouts,p.rounds,p.rank]),[['Ada',375,1,1,1,1],['Bo',25,0,0,1,2]]);
 settleScores(room,store);assert.equal(store.standings()[0].points,375);
 store.settle(room.scoreRound.id,room.results.players);assert.equal(store.standings()[0].points,375);
 assert.equal(room.results.players[0].earnedPoints,375);assert.equal(room.results.players[0].totalPoints,375);
 for(const p of room.players)p.health=100;startScoring(room);assert.equal(room.players[0].roundPoints,0);settleScores(room,store);
 assert.equal(store.standings()[0].points,400);assert.equal(store.standings()[0].wins,1,'two surviving players at timeout award no extra Win');
 assert.equal(room.results.winnerId,null);
});
test('missed and blocked projectiles earn nothing; lightning earns only actual HP removed',()=>{
 const {room,a,b}=make();const [actor,target]=room.players;
 for(const [id,spell,tracked,at] of [['miss','fireball',false,1000],['block','fireball',true,5000],['bolt','lightning',true,9000]]){
  actor.mana=10;actor.manaUpdatedAt=at;target.shieldUntil=20000;
  const shot=launchProjectile(room,a.id,spell,b.id,id,at),before=target.health;
  const event=impactProjectile(room,a.id,id,tracked,shot.impactAt);recordScore(room,event,before);
 }
 assert.equal(actor.roundPoints,20);assert.equal(target.health,80);
});
test('healing cannot farm more than 100 damage points per opponent, overkill is clipped',()=>{
 const {room,a,b}=make();const target=room.players[1];
 for(let i=0;i<8;i++){target.health=100;hit(room,a.id,b.id,20,'hit'+i);}
 assert.equal(room.players[0].roundPoints,100);
 target.health=7;hit(room,a.id,b.id,20,'last');assert.equal(room.players[0].roundPoints,150);
});
test('leaving alive forfeits completion, keeps earned combat points, and is never a Win',()=>{
 const {store,room,a,b}=make();hit(room,b.id,a.id,20,'hit');const leaving=room.players[1];leaving.health=0;leaving.forfeited=true;
 settleScores(room,store);const bo=store.standings().find(p=>p.id===b.id);assert.equal(bo.points,20);assert.equal(bo.wins,0);assert.equal(room.results.players.find(p=>p.id===b.id).finishPoints,0);
 assert.equal(store.standings().find(p=>p.id===a.id).wins,1);
});
test('saved scores survive restart and only the same private browser token restores an identity',async t=>{
 const dir=await mkdtemp(join(tmpdir(),'clash-scores-'));t.after(()=>rm(dir,{recursive:true,force:true}));const file=join(dir,'leaderboard.json');
 const first=createScoreStore(file),ada=first.register('Ada');first.settle('round-1',[{id:ada.id,earnedPoints:225,won:true,knockouts:0}]);
 const loaded=createScoreStore(file);assert.equal(loaded.find(ada.token).id,ada.id);assert.equal(loaded.register('Ada',ada.token).id,ada.id);assert.ok(loaded.register('Ada','wrong').error);
 const publicData=JSON.stringify(loaded.standings());assert.ok(!publicData.includes(ada.token));assert.ok(!publicData.includes('tokenHash'));
 assert.ok(!(await readFile(file,'utf8')).includes(ada.token),'raw credentials are not saved');
 loaded.settle('round-1',[{id:ada.id,earnedPoints:225,won:true,knockouts:0}]);assert.equal(loaded.standings()[0].points,225);
});
test('equal points, Wins and knockouts share rank; exact ties skip the next place',()=>{
 const s=createScoreStore();const a=s.register('A'),b=s.register('B'),c=s.register('C');s.settle('one',[{id:a.id,earnedPoints:25,won:false,knockouts:0},{id:b.id,earnedPoints:25,won:false,knockouts:0},{id:c.id,earnedPoints:0,won:false,knockouts:0}]);
 assert.deepEqual(s.standings().map(p=>p.rank),[1,1,3]);
});
test('public standings never expose private state and reconnecting after leaving preserves identity',async t=>{
 const game=createGameServer();await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const base=`http://127.0.0.1:${game.server.address().port}`;
 async function enter(token){const ws=new WebSocket(base.replace('http','ws')+'/ws');t.after(()=>ws.terminate());const welcome=new Promise((resolve,reject)=>{ws.on('error',reject);ws.on('message',b=>{const m=JSON.parse(b);if(m.type==='welcome')resolve(m);});});ws.on('open',()=>ws.send(JSON.stringify({type:'join',name:'Ada',token,points:999999,wins:100})));return {ws,w:await welcome};}
 const a=await enter();const response=await fetch(base+'/api/leaderboard'),body=await response.json();assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(body.players[0].points,0);assert.equal(body.players[0].wins,0);assert.equal(body.rules.win,200);assert.deepEqual(Object.keys(body.players[0]).sort(),['id','knockouts','name','points','rank','rounds','wins']);
 const closed=new Promise(r=>a.ws.once('close',r));a.ws.send(JSON.stringify({type:'leave'}));await closed;
 const b=await enter(a.w.token);assert.equal(b.w.id,a.w.id);
});
