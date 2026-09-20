import test from 'node:test';
import assert from 'node:assert/strict';
import {COINS_PER_KILL,freshLoadout,ATTACKS} from '../dist/economy.js';
import {launchProjectile,impactProjectile,settleRoom} from '../dist/rules.js';
import {createScoreStore} from '../server/scores.js';
import {creditContinuous,scoreContinuousHit} from '../server/continuous-scores.js';
import {launchOrbital,resolveOrbitals} from '../server/orbital.js';

const now=100000;
function setup(persona='mage') {
 const store=createScoreStore(null,{ranking:'coins'});
 const players=['Caster','Victim','Nearby'].map((name,i)=>({...store.register(name),name,economy:true,connected:true,faceReady:true,health:70,life:1,persona:i===0?persona:'mage',loadout:freshLoadout(),mana:10,manaUpdatedAt:now,cooldowns:{},location:{latitude:42+i/111195,longitude:-71,accuracy:2,at:now}}));
 return {store,room:{phase:'playing',continuous:true,economy:true,enhanced:true,players,shots:[]}};
}

test('direct kills preserve upgraded cast names after the caster switches character and loadout',()=>{
 for(const [persona,spell] of [['mage','fireball'],['mage','lightning'],['witch','poison'],['archer','arrows'],['mage','meteor'],['witch','soulReaper'],['archer','bombArrow'],['archer','ballista']]){
  const {store,room}=setup(persona),[actor,target]=room.players;room.players.length=2;actor.loadout.skills[spell]=2;target.health=1;
  const shot=launchProjectile(room,actor.id,spell,target.id,'one',now);assert.equal(shot.attackName,ATTACKS[spell].upgrade);
  actor.loadout=freshLoadout();actor.persona='archer';
  const hit=impactProjectile(room,actor.id,shot.shotId,true,shot.impactAt),kills=[];
  scoreContinuousHit(room,store,hit,1,kill=>kills.push(kill));
  assert.equal(kills.length,1,spell);assert.equal(kills[0].spell,spell);assert.equal(kills[0].attackName,ATTACKS[spell].upgrade);assert.equal(kills[0].actorId,actor.id);assert.equal(kills[0].targetId,target.id);
 }
});

test('base casts cannot acquire upgraded kill names when purchased during flight',()=>{
 const {store,room}=setup(),[actor,target]=room.players;room.players.length=2;target.health=1;
 const shot=launchProjectile(room,actor.id,'lightning',target.id,'one',now);actor.loadout.skills.lightning=2;
 const hit=impactProjectile(room,actor.id,shot.shotId,true,shot.impactAt),kills=[];scoreContinuousHit(room,store,hit,1,k=>kills.push(k));
 assert.equal(kills[0].spell,'lightning');assert.equal(kills[0].attackName,'Lightning');
});

test('each multi-hit kill carries its own victim and the same purchased attack name',()=>{
 const {store,room}=setup(),[actor,target,near]=room.players;actor.loadout.skills.lightning=2;target.health=near.health=1;
 const shot=launchProjectile(room,actor.id,'lightning',target.id,'one',now),hit=impactProjectile(room,actor.id,shot.shotId,true,shot.impactAt),kills=[];
 for(const event of [hit,...hit.secondaryHits])scoreContinuousHit(room,store,event,1,k=>kills.push(k));
 assert.deepEqual(kills.map(k=>k.targetId),[target.id,near.id]);assert.ok(kills.every(k=>k.spell==='lightning'&&k.attackName==='Chain Lightning'));
 assert.equal(store.standings().find(p=>p.id===actor.id).coins,2*COINS_PER_KILL);
});

test('poison and skeleton DOT kills retain the attack name and caster life recorded at launch',()=>{
 for(const [spell,startingHealth] of [['poison',9],['skeletonArmy',1]]){
  const {store,room}=setup('witch'),[actor,target]=room.players;room.players.length=2;actor.loadout.skills[spell]=2;target.health=startingHealth;
  const shot=launchProjectile(room,actor.id,spell,target.id,'one',now);actor.loadout=freshLoadout();actor.persona='mage';
  impactProjectile(room,actor.id,shot.shotId,true,shot.impactAt);assert.ok(target.health>0);
  const ticks=settleRoom(room,shot.impactAt+1000),kills=[];
  for(const tick of ticks)creditContinuous(room,store,tick,k=>kills.push(k));
  assert.equal(kills.length,1,spell);assert.equal(kills[0].attackName,ATTACKS[spell].upgrade);assert.equal(kills[0].spell,spell);assert.equal(kills[0].actorId,actor.id);
  assert.equal(ticks[0].actorLife,1);assert.equal(ticks[0].attackName,ATTACKS[spell].upgrade);
 }
});

test('plague secondary DOT kills identify Plague instead of anonymous damage',()=>{
 const {store,room}=setup('witch'),[actor,target,near]=room.players;actor.loadout.skills.poison=2;near.health=5;
 const shot=launchProjectile(room,actor.id,'poison',target.id,'one',now);impactProjectile(room,actor.id,shot.shotId,true,shot.impactAt);
 const kills=[];for(const tick of settleRoom(room,shot.impactAt+1000))creditContinuous(room,store,tick,k=>kills.push(k));
 assert.equal(kills.length,1);assert.equal(kills[0].targetId,near.id);assert.equal(kills[0].spell,'poison');assert.equal(kills[0].attackName,'Plague');
});

test('orbital kills carry an explicit Orbital Airstrike name and never attribute victims to their old DOT',()=>{
 const {store,room}=setup(),[actor,target]=room.players;actor.airstrikeCharges=1;room.players.length=2;
 target.poison={by:'some-other-player',startedAt:now,until:now+10000,perSecond:1,applied:0};
 const result=launchOrbital(room,actor,target.location,now);assert.equal(result.error,undefined);assert.equal(result.strike.attackName,'Orbital Airstrike');
 const kills=[];const hits=resolveOrbitals(room,result.strike.endsAt,hit=>creditContinuous(room,store,hit,k=>kills.push(k)));
 assert.equal(hits.length,1);assert.equal(kills.length,1);assert.equal(kills[0].spell,'orbital');assert.equal(kills[0].attackName,'Orbital Airstrike');assert.equal(kills[0].actorId,actor.id);assert.equal(target.poison,null);
});

test('duplicate lethal reports cannot emit a second kill attribution or award',()=>{
 const {store,room}=setup(),[actor,target]=room.players,kills=[];target.health=0;
 const hit={actorId:actor.id,targetId:target.id,actorLife:1,amount:70,lethal:true,spell:'meteor',attackName:'Extinction'};
 creditContinuous(room,store,hit,k=>kills.push(k));creditContinuous(room,store,hit,k=>kills.push(k));
 assert.equal(kills.length,1);assert.equal(kills[0].attackName,'Extinction');assert.equal(store.standings().find(p=>p.id===actor.id).coins,COINS_PER_KILL);
});

test('confirmed kills broadcast attack and portrait to everyone once, without repeating portraits in announcement history',async t=>{
 const {WebSocket}=await import('ws'),{createGameServer}=await import('../server/index.js');
 const {encodeDescriptor,DESCRIPTOR_LENGTH}=await import('../dist/face-id.js');
 const game=createGameServer({continuous:true});await new Promise(r=>game.server.listen(0,'127.0.0.1',r));t.after(()=>game.close());
 const base=`http://127.0.0.1:${game.server.address().port}`;
 async function join(name){
  const ws=new WebSocket(base.replace('http:','ws:')+'/ws'),messages=[];t.after(()=>ws.terminate());ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise(r=>ws.on('open',r));
  const send=m=>ws.send(JSON.stringify(m));
  async function next(type,predicate=()=>true){for(let n=0;n<500;n++){const i=messages.findIndex(m=>m.type===type&&predicate(m));if(i>=0)return messages.splice(i,1)[0];await new Promise(r=>setTimeout(r,5));}throw Error(`Missing ${type}: ${name}`);}
  send({type:'join',name});const welcome=await next('welcome');send({type:'face',samples:[encodeDescriptor(Array.from({length:DESCRIPTOR_LENGTH},()=>1/Math.sqrt(DESCRIPTOR_LENGTH)))]});return {...welcome,send,next};
 }
 const a=await join('Ada'),b=await join('Bo'),observer=await join('Cy');
 await a.next('state',m=>m.room.players.length===3&&m.room.players.every(p=>p.faceReady));
 const avatar='data:image/jpeg;base64,'+Buffer.from('kill portrait fixture').toString('base64');a.send({type:'avatar',image:avatar});await b.next('avatars',m=>m.avatars[a.id]===avatar);
 const room=game.rooms.get('ARENA'),caster=room.players.find(p=>p.id===a.id),target=room.players.find(p=>p.id===b.id);caster.loadout.skills.lightning=2;target.health=1;target.healthRegenAt=Date.now();
 a.send({type:'cast',spell:'lightning',targetId:b.id});const shot=await a.next('spell');a.send({type:'impact',shotId:shot.shotId,tracked:true});
 for(const client of [a,b,observer]){
  const kill=await client.next('arena-event',m=>m.kind==='kill');assert.equal(kill.spell,'lightning');assert.equal(kill.attackName,'Chain Lightning');assert.equal(kill.killerAvatar,avatar);assert.equal(kill.text,'Ada killed Bo using Chain Lightning');
  const state=await client.next('state',m=>m.room.announcements.some(e=>e.kind==='kill'));assert.ok(!JSON.stringify(state.room.announcements).includes(avatar));
 }
 const live=await(await fetch(base+'/api/live')).json();assert.equal(live.kills[0].attackName,'Chain Lightning');assert.equal(live.events.find(e=>e.kind==='kill').text,'Ada killed Bo using Chain Lightning');assert.ok(!JSON.stringify(live.kills).includes(avatar));assert.ok(!JSON.stringify(live.events).includes(avatar));
});
