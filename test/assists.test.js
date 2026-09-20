import test from 'node:test';
import assert from 'node:assert/strict';
import {createScoreStore} from '../server/scores.js';
import {creditContinuous,scoreContinuousHit} from '../server/continuous-scores.js';
import {spawnPlayer} from '../dist/respawn.js';
import {freshLoadout,COINS_PER_KILL,ASSIST_COINS,ASSIST_WINDOW_MS} from '../dist/economy.js';
import {settleRoom} from '../dist/rules.js';
import {launchOrbital,resolveOrbitals} from '../server/orbital.js';
function setup(t){
 t.mock.timers.enable({apis:['Date'],now:100000});
 const store=createScoreStore(null,{ranking:'coins'}),players=['Killer','Victim','Helper','Other helper'].map(name=>({...store.register(name),economy:true,persona:'mage',connected:true,faceReady:true,loadout:freshLoadout()}));
 for(const p of players)spawnPlayer(p,Date.now());
 const [killer,victim,helper,other]=players,room={economy:true,continuous:true,phase:'playing',players,shots:[]},events=[];
 const credit=(actor,amount=1,lethal=false,extra={})=>creditContinuous(room,store,{actorId:actor.id,targetId:victim.id,amount,lethal,actorLife:actor.life,targetLife:victim.life,...extra},event=>events.push(event));
 const score=p=>store.standings().find(s=>s.id===p.id);
 return{store,killer,victim,helper,other,room,events,credit,score};
}

test('positive contributors each earn 20 coins, without knockout or streak credit; killer and victim earn no assist',t=>{
 const {store,killer,victim,helper,other,credit,events,score}=setup(t);
 credit(helper,1);credit(helper,9);credit(other,2);credit(killer,2);credit(victim,2);
 assert.equal(score(helper).coins,0,'damage alone does not persist an award');
 credit(killer,10,true);
 assert.equal(score(killer).coins,COINS_PER_KILL);assert.equal(score(killer).knockouts,1);
 for(const p of [helper,other]){assert.equal(score(p).coins,ASSIST_COINS);assert.equal(score(p).knockouts,0);assert.equal(score(p).currentStreak,0);assert.equal(score(p).points,0);}
 assert.equal(score(victim).coins,0);assert.equal(events[0].assists.length,2);
 credit(killer,10,true);credit(other,1,true);assert.equal(events.length,1);assert.equal(score(helper).coins,ASSIST_COINS);assert.equal(score(killer).coins,COINS_PER_KILL);
});

test('assist window includes 10 seconds but excludes older damage, with no ledger in serialized state',t=>{
 const {room,killer,helper,other,credit,events,score}=setup(t);
 credit(helper);t.mock.timers.tick(1);credit(other);t.mock.timers.tick(ASSIST_WINDOW_MS);
 credit(killer,10,true);assert.equal(score(helper).coins,0);assert.equal(score(other).coins,ASSIST_COINS);assert.equal(events[0].assists[0].actorId,other.id);
 assert.ok(!JSON.stringify(room).includes('contributions'));assert.ok(!JSON.stringify(room).includes('assist'));
});

test('blocked, missed, stale, zero, invalid, and unchanged-health damage creates no assist',t=>{
 const {room,store,killer,victim,helper,credit,score}=setup(t);
 for(const extra of [{blocked:true},{missed:true},{error:'No hit'},{targetLife:victim.life-1},{actorLife:helper.life-1}])credit(helper,10,false,extra);
 for(const amount of [0,-1,NaN,Infinity])credit(helper,amount);
 scoreContinuousHit(room,store,{actorId:helper.id,targetId:victim.id,spell:'lightning'},victim.health);
 credit(killer,10,true);assert.equal(score(helper).coins,0);
});

test('new victim life drops old contributors but a helper death does not erase valid earlier damage',t=>{
 const {killer,victim,helper,other,credit,score}=setup(t);
 credit(helper);spawnPlayer(victim,Date.now());credit(other);spawnPlayer(other,Date.now());credit(killer,10,true);
 assert.equal(score(helper).coins,0);assert.equal(score(other).coins,ASSIST_COINS);
});

for(const route of ['poison','orbital'])test(`${route} kill pays an existing valid contributor through the shared scorer`,t=>{
 const {room,store,killer,victim,helper,credit,score}=setup(t);credit(helper,2);
 if(route==='poison'){
  victim.health=1;victim.poison={by:killer.id,life:killer.life,spell:'poison',startedAt:Date.now(),until:Date.now()+3000,perSecond:2,applied:0};
  t.mock.timers.tick(1000);for(const hit of settleRoom(room,Date.now()))creditContinuous(room,store,hit);
 }else{
  killer.airstrikeCharges=1;for(const p of [killer,victim])p.location={latitude:42.36,longitude:-71.09,accuracy:2,at:Date.now()};
  const launch=launchOrbital(room,killer,killer.location,Date.now());assert.equal(launch.error,undefined);t.mock.timers.tick(5000);
  resolveOrbitals(room,Date.now(),hit=>creditContinuous(room,store,hit));
 }
 assert.equal(victim.health,0);assert.equal(score(helper).coins,ASSIST_COINS);assert.equal(score(killer).coins,COINS_PER_KILL);
});
