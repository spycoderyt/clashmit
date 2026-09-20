import test from 'node:test';
import assert from 'node:assert/strict';
import {relativePosition,wrap,validLocation,smoothHeading,pickRange,radarPoint,formatDistance,cameraHeading,mapZoom} from '../dist/geo.js';
const killian={latitude:42.3591,longitude:-71.0921,accuracy:5};
const near=(actual,expected,tolerance)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${actual} is not within ${tolerance} of ${expected}`);
test('distance and bearing between nearby players',()=>{
 const north=relativePosition(killian,{...killian,latitude:killian.latitude+.0009});near(north.distance,100,1);near(wrap(north.bearing),0,.5);
 const east=relativePosition(killian,{...killian,longitude:killian.longitude+.001});near(east.distance,82.2,1);near(east.bearing,90,.5);
 const southWest=relativePosition(killian,{latitude:killian.latitude-.0005,longitude:killian.longitude-.0005,accuracy:12});assert.ok(southWest.bearing>180&&southWest.bearing<270);near(southWest.error,13,.01);
 assert.equal(relativePosition(killian,killian).distance,0);
});
test('location validation rejects malformed or out-of-range fixes',()=>{
 assert.ok(validLocation(killian));assert.ok(validLocation({latitude:-90,longitude:180,accuracy:0}));
 for(const bad of [null,'here',[],{},{latitude:91,longitude:0,accuracy:5},{latitude:0,longitude:-181,accuracy:5},{latitude:0,longitude:0,accuracy:-1},{latitude:0,longitude:0},{latitude:'42',longitude:-71,accuracy:5},{latitude:NaN,longitude:0,accuracy:5},{latitude:0,longitude:0,accuracy:Infinity}])assert.equal(validLocation(bad),false);
});
test('radar projection is north-up without a compass and heading-up with one',()=>{
 const north=radarPoint(50,0,null,100);near(north.x,0,1e-9);near(north.y,-.5,1e-9);assert.equal(north.clamped,false);
 const east=radarPoint(50,90,null,100);near(east.x,.5,1e-9);near(east.y,0,1e-9);
 // Facing east, a player to the east is straight ahead and a player to the north is on the left.
 const ahead=radarPoint(50,90,90,100);near(ahead.x,0,1e-9);near(ahead.y,-.5,1e-9);
 const left=radarPoint(50,0,90,100);near(left.x,-.5,1e-9);near(left.y,0,1e-9);
 const far=radarPoint(400,180,null,100);assert.equal(far.clamped,true);near(Math.hypot(far.x,far.y),1,1e-9);near(far.y,1,1e-9);
});
test('radar range fits nearby players and headings smooth across north',()=>{
 assert.equal(pickRange([]),25);assert.equal(pickRange([10,20]),25);assert.equal(pickRange([24]),50);assert.equal(pickRange([35,140]),200);assert.equal(pickRange([1e6]),2500);assert.equal(pickRange([NaN,40]),50);
 // A straggler a kilometre away pins to the rim rather than shrinking the nearby fight to a point.
 assert.equal(pickRange([20,30,1000]),100);assert.equal(radarPoint(1000,0,null,100).clamped,true);
 assert.equal(smoothHeading(null,120),120);near(smoothHeading(350,10,.5),0,1e-9);near(smoothHeading(10,350,.5),0,1e-9);near(smoothHeading(90,100,.25),92.5,1e-9);
 assert.equal(formatDistance(42.4),'42 m');assert.equal(formatDistance(1250),'1.3 km');
});
test('compass heading prefers the iOS value and ignores unusable events',()=>{
 assert.equal(cameraHeading({webkitCompassHeading:270,webkitCompassAccuracy:10}),270);
 assert.equal(cameraHeading({webkitCompassHeading:270,webkitCompassAccuracy:-1,absolute:false}),null);
 assert.equal(cameraHeading({absolute:false,alpha:10,beta:80,gamma:0}),null);
 near(cameraHeading({absolute:true,alpha:0,beta:90,gamma:0}),0,1e-6);
});
test('map zoom matches the radar scale at the player latitude',()=>{
 near(mapZoom(0,156543.03392),0,1e-9);near(mapZoom(60,156543.03392/2),0,1e-9);near(mapZoom(0,156543.03392/8),3,1e-9);
 // A 100 m radar ring drawn 50 px from the centre at MIT is about zoom 16; halving the range zooms in one level.
 const campus=mapZoom(42.3591,100/50);assert.ok(campus>15.5&&campus<16.5);near(mapZoom(42.3591,50/50)-campus,1,1e-9);
});
