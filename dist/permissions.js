// Asks for everything the game uses right after the player enters their name, so nothing interrupts
// them later: motion and compass (minimap heading), camera and microphone (face scan, aiming, voice spells)
// and location (minimap). Browsers show these as one prompt after another; there is no way to merge them.
// requestAllPermissions() must be called directly inside the tap or submit handler: iOS only grants compass
// access from a user gesture, so that request is started before anything is awaited.
export function requestAllPermissions({onLocation=()=>{}}={}){
 const result={motion:'unsupported',camera:'unsupported',microphone:'unsupported',location:'unsupported'};
 const Orientation=globalThis.DeviceOrientationEvent,media=globalThis.navigator?.mediaDevices,geolocation=globalThis.navigator?.geolocation;
 const motion=(async()=>{try{if(typeof Orientation?.requestPermission==='function')result.motion=await Orientation.requestPermission();else if(Orientation)result.motion='granted';}catch{result.motion='denied';}})();
 const release=stream=>stream.getTracks().forEach(track=>track.stop());
 // One request for both, so iOS shows a single "camera and microphone" prompt. The streams are closed at once:
 // this only obtains consent, and the face scan opens its own camera afterwards.
 const devices=motion.then(async()=>{
  if(!media?.getUserMedia)return;
  try{release(await media.getUserMedia({video:{facingMode:'user'},audio:true}));result.camera=result.microphone='granted';}
  catch{try{release(await media.getUserMedia({video:{facingMode:'user'},audio:false}));result.camera='granted';result.microphone='denied';}catch{result.camera=result.microphone='denied';}}
 });
 // Location can take several seconds to produce a first fix, so nothing waits for it.
 const located=devices.then(()=>new Promise(resolve=>{
  if(!geolocation){resolve();return;}
  geolocation.getCurrentPosition(()=>{result.location='granted';onLocation(true);resolve();},error=>{result.location=error.code===1?'denied':'granted';onLocation(error.code!==1);resolve();},{enableHighAccuracy:true,maximumAge:60000,timeout:20000});
 }));
 // ready: motion, camera and microphone have been answered, which is all the face scan needs.
 return{result,ready:devices.then(()=>result),done:located.then(()=>result)};
}
