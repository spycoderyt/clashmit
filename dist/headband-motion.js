// The gameplay identity follows one colored band. Display prediction never
// refreshes the timestamp used to authorize a cast or impact.
export function createHeadbandMotion(){
 let track=null,lastAt=-Infinity;
 const center=b=>({x:b.originX+b.width/2,y:b.originY+b.height/2});
 function get(now=Date.now()){
  if(!track||now-track.seenAt>400)return null;
  const dt=Math.min(80,Math.max(0,now-track.seenAt)),cx=track.cx+track.vx*dt,cy=track.cy+track.vy*dt,box={originX:cx-track.width/2,originY:cy-track.height/2,width:track.width,height:track.height};
  return{...track,box,band:{...track.band,box},fresh:now-track.seenAt<=180,confirmed:track.hits>=2};
 }
 return{get,reset(){track=null;lastAt=-Infinity;},update(bands,at=Date.now()){
  if(at<=lastAt)return get(at);lastAt=at;
  const rows=bands.filter(b=>b?.box&&b.box.width>=3&&b.box.height>=1&&b.match>=.55&&b.match-(b.self||0)>=.15);
  if(track&&at-track.seenAt>250)track=null;
  let ranked;
  if(track){const old=center(track.rawBox),dt=Math.min(80,at-track.seenAt),px=old.x+track.vx*dt,py=old.y+track.vy*dt;
   ranked=rows.map(b=>{const p=center(b.box),ratio=b.box.width/track.rawBox.width,distance=Math.hypot(p.x-px,p.y-py);return{b,cost:distance/Math.max(20,track.rawBox.width)+Math.abs(Math.log(ratio))*.4,distance,ratio};}).filter(x=>x.ratio>=.4&&x.ratio<=2.5&&x.distance<=Math.max(40,track.rawBox.width*1.5)).sort((a,b)=>a.cost-b.cost);
   if(ranked.length>1&&ranked[1].cost-ranked[0].cost<.12){track=null;return null;}
  }else{ranked=rows.map(b=>({b,cost:-(b.priority??b.match)})).sort((a,b)=>a.cost-b.cost);if(ranked.length>1&&ranked[1].cost-ranked[0].cost<.12)return null;}
  const band=ranked[0]?.b;if(!band)return get(at);
  const c=center(band.box),same=!!track,dt=same?Math.max(1,at-track.seenAt):1;
  let vx=0,vy=0,cx=c.x,cy=c.y,width=band.box.width,height=band.box.height;
  if(same){const previous=center(track.rawBox),dx=c.x-previous.x,dy=c.y-previous.y,speed=Math.hypot(dx,dy)/dt,alpha=Math.min(.9,.35+speed*.6);
   vx=track.vx*.5+dx/dt*.5;vy=track.vy*.5+dy/dt*.5;
   const predictedX=track.cx+track.vx*Math.min(80,dt),predictedY=track.cy+track.vy*Math.min(80,dt);cx=predictedX+(c.x-predictedX)*alpha;cy=predictedY+(c.y-predictedY)*alpha;width=track.width*.25+width*.75;height=track.height*.25+height*.75;
  }
  track={band,rawBox:{...band.box},match:band.match,self:band.self||0,cx,cy,width,height,vx,vy,seenAt:at,hits:same?track.hits+1:1};return get(at);
 }};
}
