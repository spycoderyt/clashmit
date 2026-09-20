import test from 'node:test';
import assert from 'node:assert/strict';
import {createFaceSearch,detectionTime,createVideoFrameGate,updateInferenceBudget} from '../dist/face-search.js';
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

test('discarded slow passes immediately reduce search work before a first face exists',()=>{
 const search=createFaceSearch(),budget=updateInferenceBudget(0,2500);
 assert.equal(detectionTime(0,2500),null);assert.equal(budget,2500);
 const first=search.next({...scene,at:2500,budgetMs:budget}),second=search.next({...scene,at:3000,budgetMs:budget});
 assert.equal(first.length,1);assert.equal(first[0].detectSize,320);assert.equal(first[0].full,true);
 assert.equal(second.length,1);assert.equal(second[0].width,480);assert.equal(second[0].detectSize,320);
 assert.equal(first[0].minScore,.45);assert.equal(second[0].minScore,.45,'confidence does not loosen under load');
 assert.ok(updateInferenceBudget(budget,100)<budget);assert.ok(updateInferenceBudget(budget,100)>800,'avoid bouncing immediately back to expensive searches');
});
test('slow tracked searches never stack a full-frame and follow detection in one pass',()=>{
 const search=createFaceSearch(),follow=[{x:400,y:100,width:200,height:200},{x:800,y:100,width:200,height:200}];
 const full=search.next({...scene,at:0,follow,budgetMs:450});assert.equal(full.length,1);assert.equal(full[0].full,undefined);assert.equal(full[0].detectSize,320);
 const next=search.next({...scene,at:500,follow,budgetMs:450});assert.equal(next.length,1);assert.equal(next[0].full,undefined);
});
test('1.5-second inferences retain consecutive identity votes while hiding expired boxes',()=>{
 const tracks=createFaceTracks(),descriptor=Array(512).fill(0);descriptor[0]=1;
 const gallery=[{id:'a',samples:[descriptor]}],face={box:{x:400,y:200,width:80,height:100},score:.9,pixels:80,descriptor};
 for(let pass=0;pass<3;pass++){
  const start=pass*1550,done=start+1500;tracks.beginFrame(start);
  if(pass){assert.equal(tracks.list(start+700).every(t=>!t.fresh),true);assert.deepEqual(tracks.list(start+1300),[],'expired boxes must not remain targetable during inference');}
  tracks.updateFaces([face],detectionTime(start,done),gallery);tracks.endFrame();
 }
 assert.equal(tracks.list(4600)[0].id,'a');assert.equal(tracks.list(4600)[0].votes,3);assert.equal(tracks.list(4600)[0].fresh,true);
});
test('a stalled inference cannot retain identity votes indefinitely',()=>{
 const tracks=createFaceTracks(),descriptor=Array(512).fill(0);descriptor[0]=1;
 const gallery=[{id:'a',samples:[descriptor]}],face={box:{x:400,y:200,width:80,height:100},score:.9,pixels:80,descriptor};
 tracks.updateFaces([face],0,gallery);tracks.updateFaces([face],100,gallery);tracks.beginFrame(110);
 assert.deepEqual(tracks.list(2200),[]);tracks.endFrame();tracks.updateFaces([face],2300,gallery);
 assert.equal(tracks.list(2300)[0].votes,1);assert.equal(tracks.list(2300)[0].id,null);
 for(const [start,end] of [[0,NaN],[Infinity,0],[100,90]])assert.equal(detectionTime(start,end),null);
});

test('slow phones keep a small face in close-up across overdue broad searches',()=>{
 const search=createFaceSearch(),follow=[{x:850,y:330,width:180,height:180}];
 for(const at of [0,500,1500,5000,10000]){
  const [region]=search.next({...scene,at,follow,budgetMs:700});
  assert.equal(region.full,undefined);assert.equal(region.width,180);
 }
 const [lost]=search.next({...scene,at:11000,budgetMs:700});
 assert.equal(lost.full,true,'loss restarts discovery instead of following an empty patch');
});
