const R=6371000,rad=Math.PI/180;
export const wrap = a => ((a+180)%360+360)%360-180;
export function relativePosition(a,b){
 const dLat=(b.latitude-a.latitude)*rad,dLon=(b.longitude-a.longitude)*rad,l1=a.latitude*rad,l2=b.latitude*rad;
 const h=Math.sin(dLat/2)**2+Math.cos(l1)*Math.cos(l2)*Math.sin(dLon/2)**2;
 const distance=2*R*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
 const bearing=(Math.atan2(Math.sin(dLon)*Math.cos(l2),Math.cos(l1)*Math.sin(l2)-Math.sin(l1)*Math.cos(l2)*Math.cos(dLon))/rad+360)%360;
 return {distance,bearing,error:Math.hypot(a.accuracy||0,b.accuracy||0)};
}
export function cameraHeading(event){
 if(Number.isFinite(event.webkitCompassHeading)&&!(event.webkitCompassAccuracy<0))return event.webkitCompassHeading;
 if(!event.absolute||!Number.isFinite(event.alpha)||!Number.isFinite(event.beta)||!Number.isFinite(event.gamma))return null;
 const a=event.alpha*rad,b=event.beta*rad,g=event.gamma*rad;
 const x=-Math.cos(a)*Math.sin(g)-Math.sin(a)*Math.sin(b)*Math.cos(g);
 const y=-Math.sin(a)*Math.sin(g)+Math.cos(a)*Math.sin(b)*Math.cos(g);
 if(Math.hypot(x,y)<.2)return null;
 return (Math.atan2(x,y)/rad+360)%360;
}
export function chooseTarget(candidates){
 const valid=candidates.filter(p=>p.fresh&&p.distance>=Math.max(6,p.error)&&p.distance<=150&&p.accuracy<=20&&p.ownAccuracy<=20).sort((a,b)=>Math.abs(a.delta)-Math.abs(b.delta));
 if(!valid.length||Math.abs(valid[0].delta)>10)return {id:null,reason:'Aim at a player’s GPS label.'};
 const first=valid[0];const uncertainty=Math.min(25,Math.atan2(first.error,first.distance)/rad);
 if(valid.slice(1).some(p=>Math.abs(wrap(p.delta-first.delta))<Math.max(12,uncertainty)))return {id:null,reason:'Players overlap. Spread farther apart.'};
 return {id:first.id,reason:`Rough aim: ${first.name} · ${Math.round(first.distance)}m`};
}
