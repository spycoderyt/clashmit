// Street map under the minimap markers. Leaflet and its tiles load lazily, only after a player shares their
// location; if either fails the markers still work on a plain background. Two ways of using it:
//   follow()         the small corner view: display only, centred on the player, scaled to a fixed radius and
//                    rotated to the compass heading
//   setInteractive() the full-screen view: north up, dragged and pinched like any map
import {mapZoom} from './geo.js?v=map1';
// OpenStreetMap's standard tiles need no API key. Their usage policy allows light use with visible attribution;
// switch this URL to a keyed provider before any large event. Tiles are requested one zoom level lower and shown
// at double size, which leaves out most small labels, icons and building detail for a calmer, flatter map.
export const TILES={url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',maxNativeZoom:20,attribution:'Map © OpenStreetMap contributors'};
const GESTURES=['dragging','touchZoom','doubleClickZoom','scrollWheelZoom'];
let leaflet;
function loadLeaflet(){
 leaflet??=new Promise((resolve,reject)=>{
  if(globalThis.L)return resolve(globalThis.L);
  const link=document.createElement('link');link.rel='stylesheet';link.href='vendor/leaflet/leaflet.css';document.head.append(link);
  const script=document.createElement('script');script.src='vendor/leaflet/leaflet.js';script.onload=()=>globalThis.L?resolve(globalThis.L):reject(Error('Leaflet unavailable'));script.onerror=()=>{leaflet=undefined;script.remove();reject(Error('Leaflet failed to load'));};document.head.append(script);
 });
 return leaflet;
}
export function createTileMap(host){
 const element=document.createElement('div');element.className='minimap-map';host.prepend(element);
 let map=null,view='',interactive=false;const moved=new Set(),grabbed=new Set();
 return {
  attribution:TILES.attribution,
  get ready(){return !!map;},
  async load(){
   if(map)return;const L=await loadLeaflet();if(map)return;
   // zoomAnimation is off so the marker overlay can follow every frame of a pinch exactly.
   map=L.map(element,{zoomSnap:0,zoomControl:false,attributionControl:false,dragging:false,touchZoom:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,fadeAnimation:false,zoomAnimation:false,inertia:true,bounceAtZoomLimits:false,minZoom:3,maxZoom:22});
   L.tileLayer(TILES.url,{tileSize:512,zoomOffset:-1,maxNativeZoom:TILES.maxNativeZoom,maxZoom:22,keepBuffer:1,referrerPolicy:'strict-origin-when-cross-origin'}).addTo(map);
   map.on('move zoom',()=>{for(const listener of moved)listener();});
   // Only the player's own fingers (or mouse) take the map out of follow mode, not our own recentring.
   map.on('dragstart',()=>{for(const listener of grabbed)listener();});element.addEventListener('touchstart',e=>{if(interactive&&e.touches.length>1)for(const listener of grabbed)listener();},{passive:true});element.addEventListener('wheel',()=>{if(interactive)for(const listener of grabbed)listener();},{passive:true});
  },
  // Corner view. Returns false until the map can be drawn. halfMetres is drawn across halfPixels from the centre.
  follow(position,halfMetres,halfPixels,facing){
   if(!map||!halfPixels)return false;
   const zoom=Math.min(22,Math.max(3,mapZoom(position.latitude,halfMetres/halfPixels))),next=`${position.latitude.toFixed(6)},${position.longitude.toFixed(6)},${zoom.toFixed(3)}`;
   if(next!==view){view=next;map.setView([position.latitude,position.longitude],zoom,{animate:false});}
   element.style.transform=`rotate(${(-(facing??0)).toFixed(1)}deg)`;return true;
  },
  // Full-screen view: centre on a position, optionally setting the scale, keeping whatever zoom the player chose otherwise.
  centerOn(position,halfMetres,halfPixels){if(!map)return;view='';const zoom=halfMetres&&halfPixels?Math.min(22,Math.max(3,mapZoom(position.latitude,halfMetres/halfPixels))):map.getZoom();map.setView([position.latitude,position.longitude],zoom,{animate:false});},
  setInteractive(on){interactive=on;element.style.transform='';view='';if(!map)return;for(const name of GESTURES)map[name]?.[on?'enable':'disable']();},
  // Where a coordinate falls inside the map element, in CSS pixels, and how many metres one pixel covers there.
  project(latitude,longitude){if(!map)return null;const point=map.latLngToContainerPoint([latitude,longitude]);return{x:point.x,y:point.y};},
  metresPerPixel(latitude){return map?156543.03392*Math.cos(latitude*Math.PI/180)/2**map.getZoom():null;},
  onMove(listener){moved.add(listener);},onGrab(listener){grabbed.add(listener);},
  resize(){view='';map?.invalidateSize({animate:false,pan:false});},
 };
}
