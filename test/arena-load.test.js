import test from 'node:test';
import assert from 'node:assert/strict';
import {WebSocket} from 'ws';
import {createGameServer} from '../server/index.js';

test('30 simultaneous local clients receive compact state and immediate player departures',async t=>{
 const game=createGameServer({continuous:true});await new Promise(resolve=>game.server.listen(0,'127.0.0.1',resolve));t.after(()=>game.close());
 const url=`ws://127.0.0.1:${game.server.address().port}/ws`,clients=[];
 const wait=async predicate=>{const deadline=Date.now()+5000;while(!predicate()){if(Date.now()>deadline)throw Error('State delivery timed out');await new Promise(r=>setTimeout(r,10));}};
 const started=performance.now();
 await Promise.all(Array.from({length:30},async(_,i)=>{
  const ws=new WebSocket(url),client={ws,state:null,bytes:0};clients.push(client);t.after(()=>ws.terminate());
  ws.on('message',data=>{const message=JSON.parse(data);if(message.type==='state'){client.state=message.room;client.bytes=data.length;}});
  await new Promise(resolve=>ws.once('open',resolve));ws.send(JSON.stringify({type:'join',name:`Load tester ${i}`}));
 }));
 await wait(()=>clients.every(c=>c.state?.players.length===30));
 const maxBytes=Math.max(...clients.map(c=>c.bytes));assert.ok(maxBytes<64000,`30-player snapshot: ${maxBytes} bytes`);
 for(const c of clients){assert.equal(c.state.eventRound.mode,'ffa');assert.equal(c.state.economy,true);}
 const removed=clients[0];removed.ws.send(JSON.stringify({type:'inactive'}));await wait(()=>clients.slice(1).every(c=>c.state.players.length===29));
 t.diagnostic(`30 clients joined and received state in ${Math.round(performance.now()-started)}ms; max snapshot ${maxBytes} bytes. Local smoke test, not a WAN/iPhone benchmark.`);
});
