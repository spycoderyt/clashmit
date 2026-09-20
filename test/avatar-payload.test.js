import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/index.js';

test('live state sends leader IDs without repeating portraits, while avatar sync and public pages retain them',async t=>{
 const game=createGameServer({continuous:true});await new Promise(resolve=>game.server.listen(0,'127.0.0.1',resolve));t.after(()=>game.close());
 const base=`http://127.0.0.1:${game.server.address().port}`;
 async function join(name){const ws=new WebSocket(base.replace('http:','ws:')+'/ws'),messages=[];t.after(()=>ws.terminate());ws.on('message',raw=>messages.push(JSON.parse(raw)));await new Promise(resolve=>ws.on('open',resolve));
  const next=async(type,predicate=()=>true)=>{for(let i=0;i<250;i++){const at=messages.findIndex(m=>m.type===type&&predicate(m));if(at>=0)return messages.splice(at,1)[0];await new Promise(resolve=>setTimeout(resolve,10));}throw Error(`Missing ${type} for ${name}`);};
  const send=data=>ws.send(JSON.stringify(data));send({type:'join',name});const welcome=await next('welcome');return{ws,messages,next,send,id:welcome.id};
 }
 const a=await join('Avatar Ada'),b=await join('Avatar Bob');
 // Transport-only fixture: no image decoder runs in this test.
 const avatar='data:image/jpeg;base64,'+Buffer.from('avatar fixture '.repeat(250)).toString('base64');
 a.send({type:'avatar',image:avatar});assert.equal((await b.next('avatars',m=>m.avatars[a.id])).avatars[a.id],avatar);
 b.messages.length=0; // Require a newly serialized tick, never a queued pre-avatar snapshot.
 const state=await b.next('state',m=>m.room.leaders.some(p=>p.id===a.id));
 assert.ok(state.room.leaders.every(p=>!Object.hasOwn(p,'avatar')));
 assert.ok(!JSON.stringify(state).includes(avatar));
 assert.ok(state.room.leaders.every(p=>typeof p.name==='string'&&Number.isFinite(p.coins)));
 const late=await join('Avatar Cy');assert.equal((await late.next('avatars',m=>m.avatars[a.id])).avatars[a.id],avatar);
 for(const path of ['/api/live','/api/leaderboard']){const data=await(await fetch(base+path)).json();assert.equal(data.players.find(p=>p.id===a.id).avatar,avatar);}
 a.send({type:'inactive'});assert.equal((await b.next('avatars',m=>Object.hasOwn(m.avatars,a.id))).avatars[a.id],null);
});
