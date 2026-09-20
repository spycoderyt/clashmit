import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/index.js';
import {encodeDescriptor,DESCRIPTOR_LENGTH} from '../dist/face-id.js';

const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const face=[encodeDescriptor(Array.from({length:DESCRIPTOR_LENGTH},()=>1/Math.sqrt(DESCRIPTOR_LENGTH)))];

test('recent damage earns one private 20-coin assist, while all four phones see the 50-coin kill',async t=>{
 const game=createGameServer({continuous:true});
 await new Promise(resolve=>game.server.listen(0,'127.0.0.1',resolve));t.after(()=>game.close());
 const base=`http://127.0.0.1:${game.server.address().port}`;
 async function client(name){
  const ws=new WebSocket(base.replace('http:','ws:')+'/ws'),messages=[];
  t.after(()=>ws.terminate());ws.on('message',raw=>messages.push(JSON.parse(raw)));
  await new Promise(resolve=>ws.once('open',resolve));
  const send=data=>ws.send(JSON.stringify(data));
  async function next(type,predicate=()=>true){
   const end=Date.now()+4000;
   while(Date.now()<end){const index=messages.findIndex(m=>m.type===type&&predicate(m));if(index>=0)return messages.splice(index,1)[0];await wait(5);}
   throw Error(`Missing ${type} for ${name}`);
  }
  send({type:'join',name});const identity=await next('welcome');return{...identity,messages,send,next};
 }
 const helper=await client('Helpful Mage'),killer=await client('Final Mage'),victim=await client('Target Mage'),observer=await client('Watching Mage');
 const clients=[helper,killer,victim,observer];
 for(const c of clients)c.send({type:'face',samples:face});
 await helper.next('state',m=>m.room.players.length===4&&m.room.players.every(p=>p.faceReady));
 const room=game.rooms.get('ARENA'),target=room.players.find(p=>p.id===victim.id);
 target.health=20;target.healthRegenAt=Date.now();
 async function hit(actor){
  actor.send({type:'cast',spell:'lightning',targetId:victim.id});
  const shot=await actor.next('spell',m=>m.actorId===actor.id&&m.targetId===victim.id);
  actor.send({type:'impact',shotId:shot.shotId,tracked:true});
  const impact=await actor.next('impact',m=>m.shotId===shot.shotId);
  assert.equal(impact.missed,false);assert.equal(impact.blocked,false);return shot;
 }
 const helpShot=await hit(helper);assert.equal(target.health,10,'helper damages the victim without knocking them out');
 const lethalShot=await hit(killer);assert.equal(target.health,0);
 const globalKills=await Promise.all(clients.map(c=>c.next('arena-event',m=>m.kind==='kill'&&m.actorId===killer.id&&m.targetId===victim.id)));
 assert.equal(new Set(globalKills.map(e=>e.id)).size,1,'same confirmed kill broadcast to all players');
 for(const kill of globalKills){assert.equal(kill.coins,50);assert.equal(kill.balance,50);assert.equal(kill.killer,'Final Mage');assert.equal(kill.victim,'Target Mage');}
 const assist=await helper.next('assist',m=>m.targetId===victim.id);
 assert.ok(typeof assist.id==='string'&&assist.id.length>0);assert.ok(Number.isFinite(assist.at));
 assert.equal(assist.victim,'Target Mage');assert.equal(assist.coins,20);assert.equal(assist.balance,20);
 const board=async()=>(await(await fetch(base+'/api/leaderboard')).json()).players;
 let scores=await board(),helperScore=scores.find(p=>p.id===helper.id),killerScore=scores.find(p=>p.id===killer.id);
 assert.equal(helperScore.coins,20);assert.equal(helperScore.knockouts,0);assert.equal(helperScore.currentStreak,0);assert.equal(helperScore.bestStreak,0);
 assert.equal(killerScore.coins,50);assert.equal(killerScore.knockouts,1);assert.equal(killerScore.currentStreak,1);
 assert.equal(scores.find(p=>p.id===victim.id).deaths,1);assert.equal(scores.find(p=>p.id===observer.id).coins,0);
 // Replaying either the helper's hit or the lethal hit must not mint coins or notifications.
 helper.send({type:'impact',shotId:helpShot.shotId,tracked:true});killer.send({type:'impact',shotId:lethalShot.shotId,tracked:true});
 for(const [index,c]of clients.entries()){c.send({type:'ping',at:12345+index});await c.next('pong',m=>m.at===12345+index);}
 scores=await board();helperScore=scores.find(p=>p.id===helper.id);killerScore=scores.find(p=>p.id===killer.id);
 assert.equal(helperScore.coins,20);assert.equal(helperScore.knockouts,0);assert.equal(killerScore.coins,50);assert.equal(killerScore.knockouts,1);
 for(const c of clients)assert.equal(c.messages.filter(m=>m.type==='assist').length,0,c.id===helper.id?'helper receives no duplicate assist':'assist is private to the contributor');
 const live=await(await fetch(base+'/api/live')).json();
 assert.equal(live.kills.filter(k=>k.victim==='Target Mage').length,1);
 assert.ok(!live.events.some(e=>e.type==='assist'||e.kind==='assist'),'private assist never enters public event history');
});
