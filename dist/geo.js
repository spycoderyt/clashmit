// Pure location math shared by the minimap, the server, and tests.
const R=6371000,rad=Math.PI/180;
export const RANGES=[25,50,75,100,150,200,300,500,750,1000,1500,2500];
export const wrap=a=>((a+180)%360+360)%360-180;
export function validLocation(l){return !!l&&typeof l==='object'&&Number.isFinite(l.latitude)&&Math.abs(l.latitude)<=90&&Number.isFinite(l.longitude)&&Math.abs(l.longitude)<=180&&Number.isFinite(l.accuracy)&&l.accuracy>=0&&l.accuracy<=100000;}
export function relativePosition(a,b){
 const dLat=(b.latitude-a.latitude)*rad,dLon=(b.longitude-a.longitude)*rad,l1=a.latitude*rad,l2=b.latitude*rad;
 const h=Math.sin(dLat/2)**2+Math.cos(l1)*Math.cos(l2)*Math.sin(dLon/2)**2;
 const distance=2*R*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
 const bearing=(Math.atan2(Math.sin(dLon)*Math.cos(l2),Math.cos(l1)*Math.sin(l2)-Math.sin(l1)*Math.cos(l2)*Math.cos(dLon))/rad+360)%360;
 return {distance,bearing,error:Math.hypot(a.accuracy||0,b.accuracy||0)};
}
// Compass heading of the rear camera. iOS reports it directly; elsewhere it is
// derived from an absolute orientation event while the phone is held upright.
export function cameraHeading(event){
 if(Number.isFinite(event.webkitCompassHeading)&&!(event.webkitCompassAccuracy<0))return event.webkitCompassHeading;
 if(!event.absolute||!Number.isFinite(event.alpha)||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return null;
 const a=event.alpha*rad,b=event.beta*rad,g=event.gamma*rad;
 const x=-Math.cos(a)*Math.sin(g)-Math.sin(a)*Math.sin(b)*Math.cos(g);
 const y=-Math.sin(a)*Math.sin(g)+Math.cos(a)*Math.sin(b)*Math.cos(g);
 if(Math.hypot(x,y)<.2)return null;
 return (Math.atan2(x,y)/rad+360)%360;
}
// Circular low-pass filter so the radar does not jitter or spin through 0/360.
export function smoothHeading(previous,next,factor=.25){return previous===null||previous===undefined?next:((previous+wrap(next-previous)*factor)%360+360)%360;}
// Smallest radar range that keeps the farthest player inside the rim, capped at
// four times the nearest player so one distant straggler cannot collapse everyone
// else onto the centre. Stragglers pin to the rim instead.
export function pickRange(distances){const d=distances.filter(Number.isFinite);if(!d.length)return RANGES[0];const target=Math.min(Math.max(...d),Math.max(Math.min(...d),5)*4);return RANGES.find(r=>target<=r*.9)||RANGES[RANGES.length-1];}
// Radar coordinates in [-1,1] with +x right and +y down. `heading` is the way
// the viewer faces (null draws north-up). Players beyond the range pin to the rim.
export function radarPoint(distance,bearing,heading,range){
 const angle=(bearing-(heading??0))*rad,r=Math.min(1,distance/range);
 return {x:Math.sin(angle)*r,y:-Math.cos(angle)*r,clamped:distance>range};
}
// Fractional web-mercator zoom (256px tiles) at which one CSS pixel spans
// `metresPerPixel` at this latitude, so map tiles line up with the radar scale.
export function mapZoom(latitude,metresPerPixel){return Math.log2(156543.03392*Math.cos(latitude*rad)/metresPerPixel);}
export function chooseTarget(candidates){
 const valid=candidates.filter(p=>p.fresh&&p.distance>=Math.max(6,p.error)&&p.distance<=150&&p.accuracy<=20&&p.ownAccuracy<=20).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta));
 if(!valid.length||Math.abs(valid[0].delta)>10)return {id:null,reason:'Aim at a player’s GPS label.'};
 const first=valid[0];const uncertainty=Math.min(25,Math.atan2(first.error,first.distance)/rad);
 if(valid.slice(1).some(p=>Math.abs(wrap(p.delta-first.delta))<Math.max(12,uncertainty)))return {id:null,reason:'Players overlap. Spread farther apart.'};
 return {id:first.id,reason:`Rough aim: ${first.name} · ${Math.round(first.distance)}m`};
}
export const formatDistance=m=>m<1000?`${Math.round(m)} m`:`${(m/1000).toFixed(1)} km`;

// A five-metre return margin prevents GPS noise from repeatedly opening the map.
export const NEARBY_RADIUS=100;
export const noPlayersNearby=(distance,alreadyOpen=false)=>distance>(alreadyOpen?NEARBY_RADIUS-5:NEARBY_RADIUS);
