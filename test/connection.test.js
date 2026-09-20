import test from 'node:test';
import assert from 'node:assert/strict';
import {createGameConnection} from '../dist/connection.js';

function setup(t){
 t.mock.timers.enable({apis:['setTimeout','setInterval','Date'],now:1000});
 const sockets=[],messages=[],errors=[],statuses=[];let token='initial';
 class Socket{
  constructor(){this.readyState=0;this.sent=[];sockets.push(this);}
  send(raw){this.sent.push(JSON.parse(raw));}
  close(){this.readyState=3;this.onclose?.({code:1000});}
  open(){this.readyState=1;this.onopen?.();}
  receive(message){this.onmessage?.({data:JSON.stringify(message)});}
  drop(code=1006){this.readyState=3;this.onclose?.({code});}
 }
 const connection=createGameConnection({url:()=> 'ws://test/ws',join:()=>({type:'join',name:'Mage',token}),WebSocketImpl:Socket,random:()=>.5,connectTimeoutMs:100,retryBaseMs:10,maxRetryMs:40,heartbeatMs:20,silenceMs:60,onMessage:m=>{messages.push(m);if(m.token)token=m.token;},onError:m=>errors.push(m),onStatus:s=>statuses.push(s)});
 t.after(()=>connection.stop());
 return {connection,sockets,messages,errors,statuses,tick:ms=>t.mock.timers.tick(ms)};
}

test('a stalled reconnect has its own deadline and stale sockets cannot alter the new session',t=>{
 const{connection,sockets,messages,tick}=setup(t);connection.start();const first=sockets[0];first.open();first.receive({type:'welcome',token:'resumable'});
 assert.equal(connection.ready,true);const staleMessage=first.onmessage;first.drop();assert.equal(connection.ready,false);tick(10);
 const second=sockets[1];second.open();assert.equal(second.sent[0].token,'resumable');
 // TCP opened but no welcome: this attempt must still time out.
 tick(100);assert.equal(second.readyState,3);tick(20);assert.equal(sockets.length,3);
 const third=sockets[2];third.open();third.receive({type:'welcome'});staleMessage({data:'{"type":"spell"}'});
 assert.equal(messages.filter(m=>m.type==='spell').length,0);assert.equal(connection.ready,true);
});

test('silent connections reconnect, keep the session token, and do not replay casts',t=>{
 const{connection,sockets,tick}=setup(t);connection.start();sockets[0].open();sockets[0].receive({type:'welcome',token:'saved'});
 connection.send({type:'cast',spell:'fireball'});tick(80);assert.equal(connection.ready,false);
 assert.equal(connection.send({type:'cast',spell:'lightning'}),false);tick(10);
 sockets[1].open();sockets[1].receive({type:'welcome'});
 assert.deepEqual(sockets[1].sent,[{type:'join',name:'Mage',token:'saved'}]);
});

test('join rejection and takeover stop retries, and stopping cancels pending reconnects',t=>{
 const{connection,sockets,errors,tick}=setup(t);connection.start();sockets[0].open();sockets[0].receive({type:'error',message:'Name already taken'});tick(1000);
 assert.equal(sockets.length,1);assert.deepEqual(errors,['Name already taken']);
 connection.start();sockets[1].open();sockets[1].receive({type:'welcome'});sockets[1].drop(4000);tick(1000);assert.equal(sockets.length,2);
 connection.start();sockets[2].drop();connection.stop();tick(1000);assert.equal(sockets.length,3);
});

test('repeated opening without a welcome increases backoff instead of resetting it',t=>{
 const{connection,sockets,tick}=setup(t);connection.start();sockets[0].open();sockets[0].drop();tick(10);
 sockets[1].open();sockets[1].drop();tick(10);assert.equal(sockets.length,2);tick(10);assert.equal(sockets.length,3);
});
