export function overlap(a,b){const w=Math.max(0,Math.min(a.originX+a.width,b.originX+b.width)-Math.max(a.originX,b.originX)),h=Math.max(0,Math.min(a.originY+a.height,b.originY+b.height)-Math.max(a.originY,b.originY));const intersection=w*h;return intersection/(a.width*a.height+b.width*b.height-intersection||1);}
// Preserve one identity through brief detector gaps, but never through ambiguity.
export function createTargetTrack(){
 let track=null,lastFrame=-1;
 return{
  reset(){track=null;lastFrame=-1;},
  update(detections,opponent,own,at,now=Date.now()){
   if(at===lastFrame)return;lastFrame=at;
   if(!opponent||now-at>1000){track=null;return;}
   const rows=detections.filter(d=>d.band&&Number.isFinite(d.match)&&Number.isFinite(d.self));
   const candidates=rows.filter(d=>d.match>=.5&&d.match-d.self>=.15).sort((a,b)=>b.match-a.match);
   if(candidates.length>1){track=null;return;}
   let best=candidates[0];
   if(!best&&track){if(rows.some(d=>overlap(d.box,track.box)>.3&&d.self>=d.match-.08)){track=null;return;}const nearby=rows.filter(d=>overlap(d.box,track.box)>.3&&d.match>=.4&&d.match-d.self>=.1);if(nearby.length===1)best=nearby[0];}
   if(!best){if(track&&now-track.seenAt>700)track=null;return;}
   const same=track&&at-track.seenAt<1000&&overlap(best.box,track.box)>.15;
   const box={...best.box};if(same)for(const key of ['originX','originY','width','height'])box[key]=track.box[key]*.3+box[key]*.7;
   const match=same?track.match*.35+best.match*.65:best.match;
   track={...best,match,rawBox:best.box,box,seenAt:at,firstAt:same?track.firstAt:at,hits:same?track.hits+1:1};
  },
  get(now=Date.now()){return track&&now-track.seenAt<=700?{...track,fresh:now-track.seenAt<=450,confirmed:track.hits>=2}:null;}
 };
}
export function aimContains(box,x=.5,y=.4){return x>=box.x-.065&&x<=box.x+box.width+.065&&y>=box.y-.065&&y<=box.y+box.height+.065;}
