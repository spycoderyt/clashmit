import test from 'node:test';
import assert from 'node:assert/strict';
import {createServerClock} from '../dist/server-clock.js';
test('snapshot time bootstraps once and ping midpoint removes one-way transit bias',()=>{
 let local=1000;const clock=createServerClock(()=>local);clock.bootstrap(1900);assert.equal(clock.now(),1900);
 local=1500;clock.bootstrap(2350);assert.equal(clock.now(),2400);
 assert.equal(clock.pong(2450,1400,1500),true);assert.equal(clock.now(),2500);
 local=1600;clock.bootstrap(2400);assert.equal(clock.now(),2600);
});
test('high latency and invalid samples cannot displace a better clock estimate',()=>{
 let local=1100;const clock=createServerClock(()=>local);clock.pong(2050,1000,1100);assert.equal(clock.now(),2100);
 assert.equal(clock.pong(2000,900,1100),false);assert.equal(clock.now(),2100);
 assert.equal(clock.pong(NaN,1000,1100),false);assert.equal(clock.pong(2000,1200,1100),false);
 assert.equal(clock.pong(2075,1050,1100),true);assert.equal(clock.now(),2100);
 clock.reset();assert.equal(clock.now(),1100);clock.bootstrap(2200);assert.equal(clock.now(),2200);
});
