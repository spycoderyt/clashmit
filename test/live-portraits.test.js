import test from 'node:test';
import assert from 'node:assert/strict';
import {createLivePortraitCache} from '../dist/live-map.js';
const jpeg='data:image/jpeg;base64,AA==',png='data:image/png;base64,BB==';
function setup(){
 const images=[];let redraws=0;
 const cache=createLivePortraitCache({makeImage(){const image={naturalWidth:120,naturalHeight:90,src:'',onload:null,onerror:null};images.push(image);return image;},onLoad(){redraws++;}});
 return{cache,images,get redraws(){return redraws;}};
}
test('unchanged map polls reuse the loaded player portrait',()=>{
 const state=setup(),players=[{id:'a',avatar:jpeg}];state.cache.sync(players);
 assert.equal(state.cache.get('a'),null);state.images[0].onload();
 for(let i=0;i<20;i++)state.cache.sync(players);
 assert.equal(state.images.length,1);assert.equal(state.cache.get('a'),state.images[0]);assert.equal(state.redraws,1);
});
test('replacement drops the old image and ignores its late load event',()=>{
 const state=setup();state.cache.sync([{id:'a',avatar:jpeg}]);const old=state.images[0],late=old.onload;
 state.cache.sync([{id:'a',avatar:png}]);assert.equal(old.src,'');assert.equal(old.onload,null);late();
 assert.equal(state.redraws,0);assert.equal(state.cache.get('a'),null);
 state.images[1].onload();assert.equal(state.cache.get('a'),state.images[1]);assert.equal(state.redraws,1);
});
test('departed players and map destruction release portraits',()=>{
 const state=setup();state.cache.sync([{id:'a',avatar:jpeg},{id:'b',avatar:png}]);state.images.forEach(image=>image.onload());
 state.cache.sync([{id:'b',avatar:png}]);assert.equal(state.cache.get('a'),null);assert.equal(state.images[0].src,'');
 state.cache.clear();assert.equal(state.cache.get('b'),null);assert.equal(state.images[1].src,'');assert.equal(state.images[1].onload,null);
});
test('missing, invalid and failed portraits use the initials fallback without poll retries',()=>{
 const state=setup();state.cache.sync([{id:'a'},{id:'b',avatar:'https://example.com/face.jpg'},{id:'c',avatar:jpeg}]);
 assert.equal(state.images.length,1);state.images[0].onerror();assert.equal(state.cache.get('c'),null);
 state.cache.sync([{id:'c',avatar:jpeg}]);assert.equal(state.images.length,1);
 state.cache.sync([{id:'c',avatar:null}]);assert.equal(state.images[0].src,'');assert.equal(state.cache.get('c'),null);
});
