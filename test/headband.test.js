import test from 'node:test';
import assert from 'node:assert/strict';
import {findHeadbands,bandColor,associateHeadbands,personSearchRegion,mapBand} from '../dist/headband.js';
import {createTargetTrack} from '../dist/target-track.js';
const red={rgb:[220,25,25]},blue={rgb:[25,25,220]},green={rgb:[25,220,25]};
function frame(rects=[]){const width=100,height=160,data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4){data[i]=data[i+1]=data[i+2]=80;data[i+3]=255;}for(const [x,y,w,h,rgb]of rects)for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++)data.set([...rgb,255],(yy*width+xx)*4);return{data,width,height};}
const person={box:{originX:20,originY:20,width:60,height:130},score:.9};
test('color candidates are found without person detections and distinguish red from blue',()=>{
 const image=frame([[35,25,22,5,red.rgb],[10,100,18,4,blue.rgb]]),bands=findHeadbands(image,red,blue);
 assert.equal(bands.length,1);assert.equal(bands[0].box.originX,35);assert.ok(bands[0].match>.9);
 assert.equal(findHeadbands(image,red,red).length,0);assert.equal(findHeadbands(image,green,blue).length,0);
 assert.equal(bandColor(red.rgb),'red');assert.equal(bandColor(blue.rgb),'blue');assert.equal(bandColor(green.rgb),null);
});
test('speckles and large color fields do not count as headbands',()=>{
 assert.equal(findHeadbands(frame([[5,5,2,2,red.rgb]]),red,blue).length,0);
 assert.equal(findHeadbands(frame([[0,0,100,100,red.rgb]]),red,blue).length,0);
});
test('color alone is insufficient; band must align with a detected head region',()=>{
 const band=findHeadbands(frame([[35,25,22,5,red.rgb]]),red,blue)[0];
 assert.equal(associateHeadbands([band],[]).length,0);
 assert.equal(associateHeadbands([band],[person]).length,1);
 const chest={...band,box:{...band.box,originY:75}};assert.equal(associateHeadbands([chest],[person]).length,0);
 const background={...band,box:{...band.box,originX:82}};assert.equal(associateHeadbands([background],[person]).length,0);
 assert.equal(associateHeadbands([band],[person,{...person}]).length,0);
});
test('candidate crop and coordinates remain bounded and preserve association',()=>{
 const band=findHeadbands(frame([[35,25,22,5,red.rgb]]),red,blue)[0],mapped=mapBand(band,2,2),crop=personSearchRegion([mapped],200,320);
 assert.equal(mapped.box.originX,70);assert.ok(crop.x>=0&&crop.y>=0&&crop.x+crop.width<=200&&crop.y+crop.height<=320);
 assert.deepEqual(personSearchRegion([band,band],200,320),{x:0,y:0,width:200,height:320});
});
test('person tracking needs a validated band, including in the one-person preview',()=>{
 const track=createTargetTrack();track.update([person],red,null,100,100);assert.equal(track.get(100),null);
 const band=findHeadbands(frame([[35,25,22,5,red.rgb]]),red,null)[0],linked=associateHeadbands([band],[person]);
 track.update(linked,red,null,200,200);track.update(linked,red,null,300,300);assert.equal(track.get(300).confirmed,true);
 track.update([...linked,{...linked[0],box:{...person.box,originX:100}}],red,null,400,400);assert.equal(track.get(400),null);
});
test('reused color buffers cannot preserve a vanished headband',()=>{
 const buffers={};assert.equal(findHeadbands(frame([[35,25,22,5,red.rgb]]),red,blue,buffers).length,1);
 assert.equal(findHeadbands(frame(),red,blue,buffers).length,0);
});
