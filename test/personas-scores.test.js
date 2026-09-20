import test from 'node:test';import assert from 'node:assert/strict';
import {settleRoom,launchProjectile,impactProjectile} from '../dist/rules.js';
import {startScoring,recordScore,recordLingering,POINTS} from '../server/scores.js';

const make=(id,persona)=>({id,name:id,persona,health:100,mana:10,manaUpdatedAt:0,shieldUntil:0,cooldowns:{},connected:true});
const arena=(...personas)=>{const room={phase:'playing',endsAt:1e9,players:personas.map((p,i)=>make('abc'[i],p)),shots:[]};startScoring(room);return room;};
// What the server does around a hit: settle and credit lingering damage, measure health, resolve, score the hit.
function land(room,actor,spell,target,at,id=spell+at){
 const shot=launchProjectile(room,actor,spell,target,id,at);assert.equal(shot.error,undefined,shot.error);
 for(const dealt of settleRoom(room,shot.impactAt))recordLingering(room,dealt);
 const before=room.players.find(p=>p.id===target).health,hit=impactProjectile(room,actor,id,true,shot.impactAt);recordScore(room,hit,before);return hit;
}
const tick=(room,at)=>{for(const dealt of settleRoom(room,at))recordLingering(room,dealt);};

test('settling reports lingering damage with who cast it, and flags the point that kills',()=>{
 const room=arena('witch','mage'),[,b]=room.players;b.health=12;const hit=land(room,'a','poison','b',1000),t=hit.resolvedAt;
 assert.deepEqual(settleRoom(room,t+1000),[{actorId:'a',targetId:'b',amount:3,lethal:false}]);
 const rest=settleRoom(room,t+5000);assert.equal(rest.length,1);assert.deepEqual(rest[0],{actorId:'a',targetId:'b',amount:4,lethal:true},'only the 4 health that was left can be dealt');
 assert.deepEqual(settleRoom(room,t+9000),[],'nothing is reported once the effect is over');
});
test('a witch is paid for skeleton and poison damage, not only for what lands on impact',()=>{
 const room=arena('witch','mage'),[a,b]=room.players;
 const army=land(room,'a','skeletonArmy','b',1000);assert.equal(a.roundPoints,0,'the march itself deals nothing');
 tick(room,army.resolvedAt+6000);assert.equal(b.health,70);assert.equal(a.roundPoints,30*POINTS.damage,'all 30 skeleton damage is credited');
 const poison=land(room,'a','poison','b',army.resolvedAt+7000);tick(room,poison.resolvedAt+5000);
 assert.equal(b.health,50);assert.equal(a.roundPoints,50*POINTS.damage,'5 on impact and 15 lingering');
});
test('a kill by lingering damage earns the knockout, exactly once',()=>{
 const room=arena('witch','mage'),[a,b]=room.players;b.health=8;const hit=land(room,'a','poison','b',1000);
 assert.equal(b.health,3);tick(room,hit.resolvedAt+600);assert.equal(b.health,2);assert.equal(a.roundKnockouts,0);
 tick(room,hit.resolvedAt+5000);assert.equal(b.health,0);assert.equal(a.roundKnockouts,1);assert.equal(a.roundPoints,8*POINTS.damage+POINTS.knockout);
 tick(room,hit.resolvedAt+9000);assert.equal(a.roundKnockouts,1,'a dead player is not knocked out again');
});
test('a hit is credited only with its own damage, not with poison another player is owed',()=>{
 const room=arena('witch','mage','mage'),[a,b,c]=room.players;
 const poison=land(room,'a','poison','c',1000),t=poison.resolvedAt;                 // a poisons c
 const fire=land(room,'b','fireball','c',t+600);                                     // b's fireball lands 2s later, 6 poison owed
 assert.equal(fire.resolvedAt,t+2000);assert.equal(c.health,100-5-6-25);
 assert.equal(b.roundPoints,25*POINTS.damage,'b is paid for the fireball alone');assert.equal(a.roundPoints,(5+6)*POINTS.damage,'a is paid for the poison');
});
test('lingering damage respects the per-opponent cap and ignores strangers to the round',()=>{
 const room=arena('witch','mage'),[a,b]=room.players;
 recordLingering(room,{actorId:'a',targetId:'b',amount:POINTS.damageCap+40,lethal:false});assert.equal(a.roundPoints,POINTS.damageCap*POINTS.damage);
 recordLingering(room,{actorId:'a',targetId:'b',amount:10,lethal:false});assert.equal(a.roundPoints,POINTS.damageCap*POINTS.damage,'capped');
 for(const bad of [{actorId:'ghost',targetId:'b',amount:5},{actorId:'a',targetId:'a',amount:5},{actorId:'a',targetId:'b',amount:0},{actorId:null,targetId:'b',amount:5}])recordLingering(room,bad);
 assert.equal(a.roundPoints,POINTS.damageCap*POINTS.damage);assert.equal(b.roundPoints,0);
});
