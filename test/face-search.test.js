import test from 'node:test';
import assert from 'node:assert/strict';
import {createFaceSearch,detectionTime} from '../dist/face-search.js';
import {createFaceTracks} from '../dist/face-tracks.js';
const scene={width:1920,height:1080,point:{x:960,y:432}};
test('full-frame misses still trigger native-resolution distant-face searches',()=>{
 const search=createFaceSearch();
 const first=search.next({...scene,at:0}),second=search.next({...scene,at:700}),third=search.next({...scene,at:1400});
 assert.equal(first.length,1);assert.equal(first[0].full,true);
 assert.equal(second.length,1);assert.equal(second[0].full,undefined);assert.equal(second[0].width,640);assert.equal(second[0].maxSize,640);assert.ok(second[0].x<scene.point.x&&second[0].x+second[0].width>scene.point.x);
 assert.equal(third[0].full,true);
 search.reset();assert.equal(search.next({...scene,at:1600})[0].full,true);
});
test('search crops stay within portrait and landscape camera frames',()=>{
 for(const [width,height] of [[1920,1080],[1080,1920],[3840,2160],[320,480]]){
  const search=createFaceSearch();for(let at=0;at<6;at++){const regions=search.next({width,height,point:{x:width*.98,y:height*.02},at});for(const r of regions){assert.ok(r.x>=0&&r.y>=0);assert.ok(r.x+r.width<=width&&r.y+r.height<=height);}}
 }
});
test('slow successful detections can earn identity votes and appear fresh after completion',()=>{
 const tracks=createFaceTracks(),descriptor=Array(512).fill(0);descriptor[0]=1;
 const gallery=[{id:'a',name:'Ada',samples:[descriptor]}],face={box:{x:400,y:200,width:80,height:100},score:.9,pixels:80,descriptor};
 for(let i=0;i<3;i++){const completed=detectionTime(i*750,i*750+700);tracks.updateFaces([face],completed,gallery);}
 assert.equal(tracks.list(2200)[0].id,'a');assert.equal(tracks.list(2200)[0].fresh,true);
 assert.equal(detectionTime(0,2100),null,'stalled results must not revive an old target');
});
test('an actual missing face still clears old votes after a gap',()=>{
 const tracks=createFaceTracks(),descriptor=Array(512).fill(0);descriptor[0]=1;const gallery=[{id:'a',name:'Ada',samples:[descriptor]}],face={box:{x:400,y:200,width:80,height:100},score:.9,pixels:80,descriptor};
 tracks.updateFaces([face],0,gallery);tracks.updateFaces([face],100,gallery);tracks.updateFaces([],300,gallery);tracks.updateFaces([face],700,gallery);
 assert.equal(tracks.list(700)[0].id,null);assert.equal(tracks.list(700)[0].votes,1);
});
