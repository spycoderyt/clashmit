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

test('face confirms a headband without needing a body, with body fallback',async()=>{
 const {confirmHeadbands}=await import('../dist/headband.js');
 const band={box:{originX:35,originY:25,width:22,height:5},area:100,match:.95,self:0},face={box:{originX:36,originY:32,width:20,height:24},score:.9};
 const result=confirmHeadbands([band],[face,{...face}],[]);assert.equal(result.length,1);assert.equal(result[0].validation,'face');
 assert.equal(confirmHeadbands([band],[],[person])[0].validation,'person');
 assert.equal(confirmHeadbands([{...band,box:{...band.box,originY:65}}],[face],[]).length,0);
 assert.equal(confirmHeadbands([band],[face],[person]).length,1);
});
test('close-up color tracking requires initial validation and resets on loss or ambiguity',async()=>{
 const {createBandContinuity}=await import('../dist/headband.js'),track=createBandContinuity(),band={box:{originX:35,originY:25,width:22,height:5},area:100,match:.95,self:0},confirmed={...person,band,match:.95,self:0,validation:'face'};
 assert.equal(track.update([band],[],0).length,0);
 track.update([band],[confirmed],100);assert.equal(track.update([band],[],200)[0].validation,'tracked band');
 assert.equal(track.update([band,band],[],300).length,0);assert.equal(track.update([band],[],400).length,0);
 track.update([band],[confirmed],500);assert.equal(track.update([band],[],1300).length,0);
 track.update([band],[confirmed],1400);assert.equal(track.update([],[],1500).length,0);assert.equal(track.update([band],[],1600).length,0);
});

test('a close-up headband can occupy more than twelve percent of the frame',()=>{
 const bands=findHeadbands(frame([[10,30,80,35,blue.rgb]]),blue,red);assert.equal(bands.length,1);assert.ok(bands[0].area>100*160*.12);
});
