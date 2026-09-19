import test from 'node:test';
import assert from 'node:assert/strict';
import {colorProfile} from '../dist/shirt.js';
import {coverage,scorePatches,torsoPatches} from '../dist/shirt-coverage.js';
import {createTargetTrack} from '../dist/target-track.js';
const pixels=(...groups)=>new Uint8ClampedArray(groups.flatMap(([rgb,count])=>Array.from({length:count},()=>[...rgb,255]).flat()));
const red=colorProfile(pixels([[220,30,30],100])),blue=colorProfile(pixels([[30,30,220],100]));
const patch=data=>({data}),box={originX:10,originY:10,width:50,height:120};
test('coverage measures shirt-colored fraction instead of whole-histogram similarity',()=>{
 const mixed=pixels([[200,35,25],65],[[25,210,30],35]);
 assert.ok(Math.abs(coverage(mixed,red)-.65)<.01);assert.equal(coverage(mixed,blue),0);
});
test('nearby hues and moderate lighting shifts match while unrelated colors do not',()=>{
 assert.ok(coverage(pixels([[150,25,30],100]),red)>.9);
 assert.ok(coverage(pixels([[235,75,65],100]),red)>.9);
 assert.equal(coverage(pixels([[30,210,30],100]),red),0);
 assert.equal(coverage(pixels([[20,20,20],100]),red),0);
 assert.equal(coverage(pixels([[245,245,245],100]),red),0);
});
test('neutral shirts use brightness rather than undefined hue',()=>{
 const black=colorProfile(pixels([[30,30,30],100])),white=colorProfile(pixels([[230,230,230],100]));
 assert.ok(coverage(pixels([[45,45,45],100]),black)>.9);
 assert.equal(coverage(pixels([[230,230,230],100]),black),0);
 assert.ok(coverage(pixels([[200,200,200],100]),white)>.9);
 assert.equal(coverage(pixels([[35,35,35],100]),white),0);
});
test('registration selects dominant shirt color instead of blending it with background',()=>{
 const mixed=colorProfile(pixels([[220,30,30],70],[[20,210,20],30]));
 assert.deepEqual(mixed.rgb,[220,30,30]);
});
test('two torso patches must agree; a small isolated matching patch cannot identify',()=>{
 const r=patch(pixels([[220,30,30],100])),g=patch(pixels([[20,210,20],100]));
 assert.equal(scorePatches([r,g,g],red,blue).match,0);
 const mix=patch(pixels([[220,30,30],60],[[20,210,20],40]));
 assert.ok(scorePatches([r,mix,g],red,blue).match>.79);
 const a=torsoPatches({...box,width:100,height:164}),b=torsoPatches({...box,width:100,height:166});
 assert.ok(Math.abs(a[1].y-b[1].y)<2);
});
test('matching both shirts remains uncertain and a visible identity contradiction drops lock',()=>{
 const r=patch(pixels([[220,30,30],100])),b=patch(pixels([[30,30,220],100])),track=createTargetTrack();
 track.update([{box,patches:[r,r]}],red,blue,100,100);track.update([{box,patches:[r,r]}],red,blue,200,200);assert.equal(track.get(200).confirmed,true);
 track.update([{box,patches:[b,b]}],red,blue,300,300);assert.equal(track.get(300),null);
 const both=patch(pixels([[220,30,30],50],[[30,30,220],50]));track.update([{box,patches:[both,both]}],red,blue,400,400);assert.equal(track.get(400),null);
});
test('one-person preview can track the registered shirt without a competing player profile',()=>{
 const track=createTargetTrack(),r=patch(pixels([[200,35,25],100]));
 track.update([{box,patches:[r,r]}],red,null,100,100);track.update([{box,patches:[r,r]}],red,null,250,250);
 assert.equal(track.get(250).confirmed,true);assert.equal(track.get(250).self,0);
});
