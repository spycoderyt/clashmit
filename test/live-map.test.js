import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveMap} from '../server/live-map.js';
const player=(id,now=1000)=>({id,name:id,persona:'mage',connected:true,faceReady:true,health:70,token:'private',location:{latitude:42.36,longitude:-71.09,accuracy:4,at:now}});
test('spectator map exposes only active players with recent valid positions',()=>{
 const map=createLiveMap(),room={players:[player('a'),{...player('dead'),health:0},{...player('gone'),connected:false},{...player('unready'),faceReady:false},{...player('stale'),location:{latitude:42,longitude:-71,at:-20000}},{...player('invalid'),location:{latitude:200,longitude:0,at:1000}}]};
 const data=map.snapshot(room,1000);assert.deepEqual(data.players.map(p=>p.id),['a']);assert.equal(data.players[0].token,undefined);
});
test('short spells survive polling, positions are snapshots, and events expire',()=>{
 const map=createLiveMap(),room={players:[player('a'),player('b')]};
 map.record(room,{type:'spell',actorId:'a',targetId:'b',spell:'lightning',at:1000,flightMs:250},1000);
 room.players[1].location.latitude=43;
 const data=map.snapshot(room,1500);assert.equal(data.casts.length,1);assert.equal(data.casts[0].to.latitude,42.36);assert.equal(data.casts[0].flightMs,250);assert.deepEqual(map.snapshot(room,10000).casts,[]);
});
test('heal pulses, secondary impacts, reflections and orbitals use stable distinct ids',()=>{
 const map=createLiveMap(),room={players:[player('a'),player('b')]};
 map.record(room,{type:'spell',actorId:'a',spell:'heal'},1000);
 map.record(room,{type:'impact',actorId:'a',targetId:'b',spell:'lightning',resolvedAt:1000,secondaryHits:[{type:'impact',actorId:'a',targetId:'b',spell:'lightning',resolvedAt:1000}],reflection:{actorId:'b',targetId:'a',spell:'fireball',at:1000,flightMs:450}},1000);
 map.record(room,{type:'orbital',strike:{actorId:'a',point:{latitude:42,longitude:-71},startsAt:1000,endsAt:6000,radius:10}},1000);
 const events=map.snapshot(room,1100).casts;assert.equal(events.length,5);assert.equal(new Set(events.map(e=>e.id)).size,5);assert.deepEqual(map.snapshot(room,1200).casts.map(e=>e.id),events.map(e=>e.id));assert.deepEqual(events[0].from,events[0].to);assert.equal(events[4].flightMs,5000);
});
test('history is bounded and isolated by room; missing GPS makes no invented path',()=>{
 const map=createLiveMap(),room={players:[player('a')]},other={players:[player('a')]};
 map.record(room,{type:'spell',actorId:'missing',targetId:'a',spell:'fireball'},1000);assert.equal(map.snapshot(room,1000).casts.length,0);
 for(let i=0;i<100;i++)map.record(room,{type:'spell',actorId:'a',spell:'shield'},1000);
 assert.equal(map.snapshot(room,1000).casts.length,80);assert.equal(map.snapshot(other,1000).casts.length,0);
});

test('live map includes only current valid portraits without recognition descriptors',()=>{
 const map=createLiveMap(),portrait='data:image/jpeg;base64,/9j/AA==',room={players:[player('a'),player('b')],avatars:{a:portrait,b:'https://untrusted.invalid/face.jpg'},faces:{a:{samples:['private']}}};
 const data=map.snapshot(room,1000);assert.equal(data.players[0].avatar,portrait);assert.equal(data.players[1].avatar,null);assert.equal(data.players[0].samples,undefined);assert.equal(data.players[0].faces,undefined);
 delete room.avatars.a;assert.equal(map.snapshot(room,1000).players[0].avatar,null);
});
