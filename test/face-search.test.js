import test from 'node:test';
import assert from 'node:assert/strict';
import {createFaceSearch,detectionTime,createVideoFrameGate} from '../dist/face-search.js';
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

test('frame gate only admits new decoded camera frames and resets when camera restarts',()=>{
 const gate=createVideoFrameGate(),video={currentTime:1,videoWidth:1920,videoHeight:1080};
 assert.equal(gate.take(video),true);assert.equal(gate.take(video),false);
 video.currentTime+=1/30;assert.equal(gate.take(video),true);assert.equal(gate.take(video),false);
 video.videoWidth=1080;video.videoHeight=1920;assert.equal(gate.take(video),true,'orientation change allows another look');
 gate.reset();assert.equal(gate.take(video),true,'camera restart cannot be stuck on the last timestamp');
 assert.equal(gate.take({}),true,'non-video sources remain supported');
});
test('frozen camera frames cannot keep a previously recognized target fresh',()=>{
 const gate=createVideoFrameGate(),tracks=createFaceTracks(),descriptor=Array(512).fill(0);descriptor[0]=1;
 const gallery=[{id:'a',name:'Ada',samples:[descriptor]}],face={box:{x:400,y:200,width:80,height:100},score:.9,pixels:80,descriptor};
 const video={currentTime:0,videoWidth:1920,videoHeight:1080};
 for(let at=0;at<=200;at+=100){video.currentTime=at/1000;if(gate.take(video))tracks.updateFaces([face],at,gallery);}
 assert.equal(tracks.list(200)[0].id,'a');
 for(let at=300;at<=900;at+=100){if(gate.take(video))tracks.updateFaces([face],at,gallery);}
 assert.equal(tracks.list(900)[0].fresh,false,'display coasting never grants a new hit window');
 assert.deepEqual(tracks.list(1500),[],'stalled camera eventually loses the box');
});
