import {relativePosition,validLocation} from './geo.js';
export const ORBITAL={streakStep:3,radius:25,durationMs:5000,freshMs:10000};
export function inOrbitalZone(strike,location,at=Date.now()){
 return validLocation(location)&&Number.isFinite(location.at)&&at-location.at<=ORBITAL.freshMs&&relativePosition(strike.point,location).distance<=(strike.radius||ORBITAL.radius);
}
// A quadratic arc: upward and across the screen, then down and toward the camera.
export function rocketPath(progress,aspect=1){
 const t=Math.max(0,Math.min(1,progress)),u=1-t;
 const a=[-2.3*Math.min(aspect,1.6),-4,-9],b=[2.9*Math.min(aspect,1.6),6,-8],c=[0,-.4,-.8];
 return {position:a.map((v,i)=>u*u*v+2*u*t*b[i]+t*t*c[i]),tangent:a.map((v,i)=>2*u*(b[i]-v)+2*t*(c[i]-b[i]))};
}

// Launcher view: an overhead descent onto a map coordinate, never into the camera.
export function rocketMapPath(progress,aspect=1,target={x:.5,y:.55}){
 const t=Math.max(0,Math.min(1,progress)),u=1-t,half=Math.tan(26*Math.PI/180)*7;
 const c=[(target.x-.5)*2*half*aspect,(.5-target.y)*2*half,-7];
 const a=[c[0]-3*aspect,c[1]+7,-12],b=[c[0]+2*aspect,c[1]+5,-10];
 return {position:a.map((v,i)=>u*u*v+2*u*t*b[i]+t*t*c[i]),tangent:a.map((v,i)=>2*u*(b[i]-v)+2*t*(c[i]-b[i]))};
}
