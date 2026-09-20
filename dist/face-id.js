// Pure face-identity logic: no camera, DOM or model code, so it runs in tests and on
// the server if ever needed. A "descriptor" is the 512-number unit vector the ArcFace
// recogniser produces for one aligned face; two photos of one person give nearby vectors.
// Distance is Euclidean on those unit vectors: 0 is identical, about 1.41 is unrelated.
// The arena is a closed set of at most 12 enrolled players, so matching asks "which
// enrolled player is this, if any?" rather than general face recognition.
export const DESCRIPTOR_LENGTH=512;
// Measured with the bundled model on still photos: one person scores 0.2 to 0.35 at 56+ px face
// width, 0.4 to 0.6 at 44 px and 0.55 to 1.0 at 38 px, while different people score 1.2 to 1.4.
// The threshold sits well below the different-people range, a rival must be clearly farther
// away, faces under minFacePx are never identified, and several frames must agree (the voter
// below), so an unclear face reads as unknown rather than as the wrong player.
export const MATCH={threshold:1,margin:.15,minFacePx:32,minEnrolPx:90};
export function descriptorDistance(a,b){let sum=0;for(let i=0;i<a.length;i++){const d=a[i]-b[i];sum+=d*d;}return Math.sqrt(sum);}
export const validDescriptor=d=>!!d&&d.length===DESCRIPTOR_LENGTH&&Array.prototype.every.call(d,Number.isFinite);
// gallery: [{id,name,samples:[descriptor,...]}]. A person's score is their closest sample.
// Confident means close enough to someone AND clearly closer than to anyone else, on a face
// large enough to trust. facePx is the face box width in source pixels (omit to skip the gate).
export function matchFace(descriptor,gallery,{threshold=MATCH.threshold,margin=MATCH.margin,minFacePx=MATCH.minFacePx,facePx=Infinity}={}){
 const ranked=gallery.filter(p=>p.samples.length).map(p=>({id:p.id,name:p.name,distance:Math.min(...p.samples.map(s=>descriptorDistance(descriptor,s)))})).sort((a,b)=>a.distance-b.distance);
 if(!ranked.length)return {id:null,name:null,distance:Infinity,runnerUp:Infinity,confident:false,tooSmall:facePx<minFacePx};
 const [best,second]=ranked,runnerUp=second?.distance??Infinity,tooSmall=facePx<minFacePx;
 return {...best,runnerUp,tooSmall,confident:!tooSmall&&best.distance<=threshold&&runnerUp-best.distance>=margin};
}
// Upper-face matching, for players aiming with a phone in front of their nose and mouth. Measured with a
// phone-sized block drawn over 22 faces: the same person scores about 0.4 (0.55 at worst) on upper descriptors
// while the covered whole face drifts to about 0.9; different people score about 1.2 to 1.35 on upper descriptors.
// In the live pipeline a covered face scored 0.74 to 0.86 (the detector's box swells around the phone), so the
// threshold leaves room above that and asks for a wider lead over every other player instead.
export const UPPER={threshold:1,margin:.2};
// face: {descriptor, upper?}. gallery people may carry `upper` samples next to `samples`. The whole face is
// tried first. The upper face is only believed when the whole face has no clear opinion of its own, so a
// clearly visible different player is never overruled by a similar pair of eyes.
export function matchPlayer(face,gallery,{facePx=Infinity}={}){
 const full=matchFace(face.descriptor,gallery,{facePx});if(full.confident||!face.upper)return{...full,via:'full'};
 const uppers=gallery.filter(p=>p.upper?.length).map(p=>({id:p.id,name:p.name,samples:p.upper}));if(!uppers.length)return{...full,via:'full'};
 const upper=matchFace(face.upper,uppers,{threshold:UPPER.threshold,margin:UPPER.margin,facePx});
 if(upper.confident&&(full.id===upper.id||full.distance>MATCH.threshold))return{...upper,via:'upper',fullDistance:full.distance};
 return{...full,via:'full'};
}
// How far a face is from one particular player, on both signatures. Used to notice that a followed head
// no longer looks like the player whose name it carries.
export function distanceToPlayer(face,person){
 const nearest=(descriptor,samples)=>descriptor&&samples?.length?Math.min(...samples.map(s=>descriptorDistance(descriptor,s))):Infinity;
 return{full:nearest(face.descriptor,person?.samples),upper:nearest(face.upper,person?.upper)};
}
// One frame can be wrong; several in a row rarely are. Feed every frame's match for one tracked
// face and read back an identity only once `needed` of the last `window` frames confidently
// agree and none of them confidently named somebody else.
export function createIdentityVoter({window=5,needed=3}={}){
 let recent=[];
 const tally=()=>{const counts=new Map();for(const id of recent)if(id)counts.set(id,(counts.get(id)||0)+1);const [top]=[...counts].sort((a,b)=>b[1]-a[1]);return !top||counts.size>1||top[1]<needed?{id:null,votes:top?.[1]||0}:{id:top[0],votes:top[1]};};
 return {push(match){recent.push(match?.confident?match.id:null);if(recent.length>window)recent.shift();return tally();},reset(){recent=[];},get identity(){return tally();}};
}
// Enrolment keeps only samples that differ from the ones already stored, so a gallery covers
// head turns, the phone-raised pose and lighting changes instead of many copies of one frame.
export function addSample(person,descriptor,{max=8,minSpacing=.35}={}){
 if(!validDescriptor(descriptor)||person.samples.length>=max)return false;
 if(person.samples.some(s=>descriptorDistance(s,descriptor)<minSpacing))return false;
 person.samples.push(Array.from(descriptor));return true;
}
// Rough range from apparent face width. Assumes a 15 cm wide face and a typical phone lens.
export function estimateMetres(faceWidthPx,frameWidthPx,horizontalFovDeg=68,faceWidthMetres=.15){
 if(!(faceWidthPx>0)||!(frameWidthPx>0))return null;
 const focalPx=frameWidthPx/(2*Math.tan(horizontalFovDeg*Math.PI/360));return focalPx*faceWidthMetres/faceWidthPx;
}
const median=values=>{if(!values.length)return null;const sorted=[...values].sort((a,b)=>a-b),mid=sorted.length>>1;return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;};
// Summary of a recording, one entry per processed frame: how often a face was found, how often
// the voted identity was the expected person or somebody else, and typical score, size and speed.
// With expectedId null (a stranger in view) every identification counts as wrong.
export function summarize(frames,expectedId=null){
 const found=frames.filter(f=>f.found),named=found.filter(f=>f.id),right=named.filter(f=>expectedId!==null&&f.id===expectedId),rate=list=>frames.length?list.length/frames.length:0;
 return {frames:frames.length,detectRate:rate(found),rightRate:rate(right),wrongRate:rate(named)-rate(right),medianDistance:median(found.map(f=>f.distance).filter(Number.isFinite)),medianFacePx:median(found.map(f=>f.facePx)),medianMs:median(frames.map(f=>f.ms).filter(Number.isFinite))};
}
// Rows of the aligned 112x112 face kept for an upper-face descriptor: forehead, brows and eyes (the eyes sit near
// row 52, the nose tip near row 72). This is what stays visible when a player aims with the phone at their face.
export const UPPER_FACE_ROWS=62;
// Where ArcFace expects the eyes, nose and mouth corners inside its 112x112 input.
export const FACE_TEMPLATE=[[38.2946,51.6963],[73.5318,51.5014],[56.0252,71.7366],[41.5493,92.3655],[70.7299,92.2041]];
// Least-squares similarity transform (rotate, scale, move) taking the five landmarks onto the template.
export function alignmentTransform(landmarks,template=FACE_TEMPLATE){
 const mean=points=>points.reduce((m,p)=>[m[0]+p[0]/points.length,m[1]+p[1]/points.length],[0,0]),ms=mean(landmarks),mt=mean(template);let dot=0,cross=0,norm=0;
 landmarks.forEach((p,i)=>{const px=p[0]-ms[0],py=p[1]-ms[1],qx=template[i][0]-mt[0],qy=template[i][1]-mt[1];dot+=px*qx+py*qy;cross+=px*qy-py*qx;norm+=px*px+py*py;});
 const a=dot/norm,b=cross/norm;return {a,b,tx:mt[0]-(a*ms[0]-b*ms[1]),ty:mt[1]-(b*ms[0]+a*ms[1])};
}
// Wire format for sharing a player's samples: each unit descriptor is quantised to 512 signed
// bytes (steps of 1/400, far finer than the differences that matter) and base64 encoded, so eight
// samples fit in one small WebSocket message. Decoding re-normalises to a unit vector.
const QUANT=400,ENCODED_LENGTH=684;
export const MAX_SAMPLES=8;
export function encodeDescriptor(descriptor){let binary='';for(let i=0;i<DESCRIPTOR_LENGTH;i++)binary+=String.fromCharCode(Math.max(-127,Math.min(127,Math.round(descriptor[i]*QUANT)))&255);return btoa(binary);}
export function decodeDescriptor(text){
 if(typeof text!=='string'||text.length!==ENCODED_LENGTH)return null;let binary;try{binary=atob(text);}catch{return null;}if(binary.length!==DESCRIPTOR_LENGTH)return null;
 const values=new Array(DESCRIPTOR_LENGTH);let norm=0;for(let i=0;i<DESCRIPTOR_LENGTH;i++){const byte=binary.charCodeAt(i),v=(byte>127?byte-256:byte)/QUANT;values[i]=v;norm+=v*v;}
 norm=Math.sqrt(norm);if(!(norm>.5&&norm<1.5))return null;return values.map(v=>v/norm);
}
export const validEncodedSamples=samples=>Array.isArray(samples)&&samples.length>=1&&samples.length<=MAX_SAMPLES&&samples.every(s=>decodeDescriptor(s)!==null);
// How far the head is turned, from the five landmarks: the nose's sideways offset from the point
// between the eyes, in units of the distance between the eyes. About 0 facing the camera and
// beyond about 0.25 when clearly turned; the sign says which way.
export function headTurn(landmarks){const [leftEye,rightEye,nose]=landmarks,eyes=Math.hypot(rightEye[0]-leftEye[0],rightEye[1]-leftEye[1]);return eyes?(nose[0]-(leftEye[0]+rightEye[0])/2)/eyes:0;}
