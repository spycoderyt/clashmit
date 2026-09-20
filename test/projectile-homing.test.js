import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/index.js';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';
import {CLASS_ATTACKS,freshLoadout,COINS_PER_KILL} from '../dist/economy.js';
import {launchProjectile,impactProjectile,SPELLS} from '../dist/rules.js';
import {retirePlayer} from '../dist/respawn.js';
const face=[encodeDescriptor(Array.from({length:DESCRIPTOR_LENGTH},()=>1/Math.sqrt(DESCRIPTOR_LENGTH)))];
function arena(economy=true,persona='mage'){
 const players=['a','b'].map(id=>({id,name:id,connected:true,faceReady:true,health:70,life:1,economy,persona,mana:10,manaUpdatedAt:1000,cooldowns:{},loadout:freshLoadout()}));
 for(const p of players)for(const spell of CLASS_ATTACKS[persona])p.loadout.skills[spell]=1;
 return{phase:'playing',economy,continuous:true,players,shots:[],eventRound:{mode:'ffa'}};
}
test('all class projectiles retain identical damage and effects with tracking lost after launch',()=>{
 for(const [persona,spells] of Object.entries(CLASS_ATTACKS))for(const spell of spells){
  if(!SPELLS[spell]?.flightMs)continue;
  const tracked=arena(true,persona),lost=arena(true,persona);
  const shot=launchProjectile(tracked,'a',spell,'b','shot',1000),other=launchProjectile(lost,'a',spell,'b','shot',1000);
  assert.equal(shot.error,undefined,spell);assert.equal(other.error,undefined,spell);
  assert.deepEqual(impactProjectile(lost,'a','shot',false,shot.impactAt),impactProjectile(tracked,'a','shot',true,shot.impactAt),spell);
  assert.deepEqual(lost.players,tracked.players,spell);
 }
});
test('target retention does not bypass lives, deaths, disconnection, round state, or action locks',()=>{
 const changes=[r=>r.players[0].life++,r=>r.players[1].life++,r=>r.players[0].health=0,r=>r.players[1].health=0,r=>r.players[0].connected=false,r=>r.players[1].connected=false,r=>r.phase='finished',r=>r.players[1].actionLockUntil=9999];
 for(const change of changes){const room=arena(),shot=launchProjectile(room,'a','lightning','b','shot',1000);change(room);const health=room.players[1].health;assert.equal(impactProjectile(room,'a','shot',false,shot.impactAt).missed,true);assert.equal(room.players[1].health,health);}
});
test('locked arrows still respect a shield and retirement cancels pending spells',()=>{
 const room=arena(true,'archer'),shot=launchProjectile(room,'a','arrows','b','shot',1000);room.players[1].shieldUntil=9999;
 const impact=impactProjectile(room,'a','shot',false,shot.impactAt);assert.equal(impact.blocked,true);assert.equal(impact.missed,false);assert.equal(room.players[1].health,70);
 const retiring=arena(),pending=launchProjectile(retiring,'a','lightning','b','shot',1000);retirePlayer(retiring,retiring.players[1],1100);assert.ok(impactProjectile(retiring,'a','shot',false,pending.impactAt).error);assert.equal(retiring.players[0].health,70);
});
for(const economy of [true,false])test(`server resolves ${economy?'economy':'legacy'} flights without client acknowledgement and scores once`,async t=>{
 const game=createGameServer({continuous:true,economy});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());const base=`http://127.0.0.1:${game.server.address().port}`;
 async function join(name){const ws=new WebSocket(base.replace('http:','ws:')+'/ws'),messages=[];t.after(()=>ws.terminate());ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise(r=>ws.on('open',r));const send=m=>ws.send(JSON.stringify(m));async function next(type,predicate=()=>true){for(let n=0;n<800;n++){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error(`Missing ${type} for ${name}`);}send({type:'join',name});const welcome=await next('welcome');send({type:'face',samples:face});return{...welcome,send,next,messages};}
 const a=await join('Caster'),b=await join('Target');await a.next('state',m=>m.room.players.length===2&&m.room.players.every(p=>p.faceReady));const room=game.rooms.get('ARENA'),target=room.players.find(p=>p.id===b.id),actor=room.players.find(p=>p.id===a.id);target.health=economy?20:40;
 a.send({type:'cast',spell:'lightning',targetId:b.id});const first=await a.next('spell');assert.equal(target.health,economy?20:40);
 const firstHit=await a.next('impact',m=>m.shotId===first.shotId);assert.equal(firstHit.missed,false);assert.ok(firstHit.resolvedAt>=first.impactAt,'server never lands the projectile early');assert.equal(target.health,economy?10:20);await b.next('impact',m=>m.shotId===first.shotId);
 // A second flight receives an early negative tracking report. It must still arrive at its deadline.
 actor.cooldowns={};actor.mana=10;a.send({type:'cast',spell:'lightning',targetId:b.id});const second=await a.next('spell');a.send({type:'impact',shotId:second.shotId,tracked:false});a.send({type:'ping',at:1});await a.next('pong',m=>m.at===1);assert.equal(target.health,economy?10:20);
 const hit=await a.next('impact',m=>m.shotId===second.shotId);assert.equal(hit.missed,false);assert.ok(hit.resolvedAt>=second.impactAt);assert.equal(target.health,0);
 a.send({type:'impact',shotId:first.shotId,tracked:true});a.send({type:'impact',shotId:second.shotId,tracked:false});a.send({type:'ping',at:2});await a.next('pong',m=>m.at===2);
 const board=(await(await fetch(base+'/api/leaderboard')).json()).players,score=board.find(p=>p.id===a.id);assert.equal(score.knockouts,1);assert.equal(score.coins,COINS_PER_KILL);assert.equal(board.find(p=>p.id===b.id).deaths,1);assert.equal(room.shots.length,0);assert.equal(a.messages.filter(m=>m.type==='impact'&&m.shotId===second.shotId).length,0);
});
