import test from 'node:test';
import assert from 'node:assert/strict';
import {targetLabelPosition} from '../dist/target-overlay.js';
test('reward label stays inside portrait edges even when the face box is tiny',()=>{
 const viewport={width:390,height:844},label={width:220,height:100};
 for(const x of [-10,0,180,380,400]){
  const result=targetLabelPosition({x,y:300,width:15,height:20},viewport,label);
  assert.ok(result.center-label.width/2>=8);assert.ok(result.center+label.width/2<=382);
  assert.equal(result.bottom,293);
 }
});
test('multi-line target name, reward and crown stay below the top edge',()=>{
 const result=targetLabelPosition({x:100,y:5,width:20,height:20},{width:320,height:640},{width:240,height:195},180);
 assert.equal(result.bottom,203);assert.ok(result.bottom-195>=8);
});
test('a face near the lower edge cannot push its label below the arena',()=>{
 const result=targetLabelPosition({x:100,y:900,width:10,height:10},{width:390,height:844},{width:150,height:85},180);
 assert.equal(result.bottom,836);
});
