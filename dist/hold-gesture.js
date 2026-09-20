// Tap selects; a stationary hold commits. Pointer movement and cancellation never launch.
export function createHoldGesture({onHold,delay=800,tolerance=12}){
 let timer=null,start=null;
 const cancel=()=>{clearTimeout(timer);timer=null;start=null;};
 return{begin(point){cancel();start={...point};timer=setTimeout(()=>{timer=null;start=null;onHold();},delay);},move(point){if(start&&Math.hypot(point.x-start.x,point.y-start.y)>tolerance)cancel();},cancel};
}
