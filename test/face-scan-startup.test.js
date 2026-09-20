import test from 'node:test';
import assert from 'node:assert/strict';
import {prepareFaceScan} from '../dist/face-scan.js';
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const flush=async()=>{for(let i=0;i<8;i++)await Promise.resolve();};
test('model progress remains visible after the camera starts',async()=>{
 const engine=deferred(),progress=[];let report,playing=false;
 const ready=prepareFaceScan({loadEngine:callback=>{report=callback;return engine.promise;},getCamera:async()=>({getTracks:()=>[]}),startVideo:async()=>{playing=true;},onProgress:text=>progress.push(text)});
 await flush();assert.equal(playing,true);report('Face recogniser: 5.2 / 14.0 MB');assert.deepEqual(progress,['Face recogniser: 5.2 / 14.0 MB']);engine.resolve();await ready;
});
test('engine failure is handled while camera permission is pending and late streams are stopped',async()=>{
 const camera=deferred();let stopped=0,played=0;
 await assert.rejects(prepareFaceScan({loadEngine:async()=>{throw Error('Download stopped');},getCamera:()=>camera.promise,startVideo:()=>played++}),/Download stopped/);
 camera.resolve({getTracks:()=>[{stop(){stopped++;}}]});await flush();assert.equal(stopped,1);assert.equal(played,0);
});
test('blocked video playback has a deadline and stops the camera',async()=>{
 let stopped=0;await assert.rejects(prepareFaceScan({loadEngine:async()=>{},getCamera:async()=>({getTracks:()=>[{stop(){stopped++;}}]}),startVideo:()=>new Promise(()=>{}),cameraTimeoutMs:10}),/Camera did not start/);assert.equal(stopped,1);
});
test('camera rejection suppresses late engine progress and cancelled scans release late permission streams',async()=>{
 const engine=deferred(),progress=[];let report;
 await assert.rejects(prepareFaceScan({loadEngine:callback=>{report=callback;return engine.promise;},getCamera:async()=>{throw Error('Camera denied');},startVideo:async()=>{},onProgress:text=>progress.push(text)}),/Camera denied/);report('Downloading');engine.resolve();await flush();assert.deepEqual(progress,[]);
 let stopped=0,played=0;await prepareFaceScan({loadEngine:async()=>{},getCamera:async()=>({getTracks:()=>[{stop(){stopped++;}}]}),startVideo:()=>played++,isCurrent:()=>false});assert.equal(stopped,1);assert.equal(played,0);
});
