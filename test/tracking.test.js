import test from 'node:test';
import assert from 'node:assert/strict';
import {createTargetTrack,aimContains} from '../dist/target-track.js';
import {createFlight} from '../dist/projectile-flight.js';
import {colorProfile} from '../dist/shirt.js';
const color=rgb=>colorProfile(new Uint8ClampedArray([...rgb,255]));
const red=color([220,20,20]),blue=color([20,20,220]);
const person=(x=10)=>({box:{originX:x,originY:10,width:20,height:60},profile:red});
test('small targets retain identity across one missed frame, but stale identities expire',()=>{
 const track=createTargetTrack();track.update([person()],red,blue,100,100);assert.equal(track.get(100).confirmed,false);
 track.update([person(11)],red,blue,300,300);assert.equal(track.get(300).confirmed,true);
 track.update([],red,blue,450,450);assert.equal(track.get(450).confirmed,true);
 assert.equal(track.get(800).fresh,false);assert.equal(track.get(1001),null);
 track.update([person()],red,blue,2000,3100);assert.equal(track.get(3100),null);
});
test('another same-color person clears lock rather than inheriting identity',()=>{
 const track=createTargetTrack();track.update([person()],red,blue,100,100);track.update([person()],red,blue,300,300);
 track.update([person(),person(100)],red,blue,400,400);assert.equal(track.get(400),null);
});
test('reticle tolerance does not disappear for a small distant body',()=>{
 assert.equal(aimContains({x:.51,y:.42,width:.02,height:.05}),true);
 assert.equal(aimContains({x:.75,y:.42,width:.02,height:.05}),false);
});
test('gameplay impacts do not depend on a render callback and are emitted once',()=>{
 const flight=createFlight({startedAt:0});
 for(let at=0;at<1400;at+=100)assert.equal(flight.step(at,true),null);
 assert.deepEqual(flight.step(1440,true),{tracked:true,cancelled:false});
 assert.equal(flight.step(1500,true),null);
});
test('tracking gaps and backgrounding cannot award damage',()=>{
 const flight=createFlight({startedAt:0});flight.step(100,true);flight.step(900,false);
 assert.equal(flight.step(1400,true).tracked,false);
 const hidden=createFlight({startedAt:0});assert.equal(hidden.step(400,true,false).cancelled,true);
 const stalled=createFlight({startedAt:0});assert.equal(stalled.step(2500,true).tracked,false);
});
