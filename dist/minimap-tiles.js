// Street-map background for the radar. Leaflet and its tiles load lazily, only
// after a player opts in to the map; if either fails the plain radar still works.
// The map is display-only: the radar keeps it centred on the player, scales it so
// the outer ring matches the radar range, and rotates it to the compass heading.
import {mapZoom} from './geo.js?v=map1';
// OpenStreetMap's standard tiles need no API key. Their usage policy allows light use with
// visible attribution; switch this URL to a keyed provider before any large event.
export const TILES={url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',maxNativeZoom:19,attribution:'Map © OpenStreetMap contributors'};
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
 let map=null,view='';
 return {
  attribution:TILES.attribution,
  async load(){if(map)return;const L=await loadLeaflet();if(map)return;map=L.map(element,{zoomSnap:0,zoomControl:false,attributionControl:false,dragging:false,touchZoom:false,scrollWheelZoom:false,doubleClickZoom:false,boxZoom:false,keyboard:false,fadeAnimation:false,zoomAnimation:false,inertia:false});L.tileLayer(TILES.url,{maxNativeZoom:TILES.maxNativeZoom,maxZoom:24,keepBuffer:1,referrerPolicy:'strict-origin-when-cross-origin'}).addTo(map);},
  // Returns false until the map can be drawn, so the caller keeps the plain radar look.
  update(position,ringMetres,ringPixels,facing){
   if(!map||!ringPixels)return false;
   const zoom=Math.min(24,Math.max(1,mapZoom(position.latitude,ringMetres/ringPixels))),next=`${position.latitude.toFixed(6)},${position.longitude.toFixed(6)},${zoom.toFixed(3)}`;
   if(next!==view){view=next;map.setView([position.latitude,position.longitude],zoom,{animate:false});}
   element.style.transform=`rotate(${(-(facing??0)).toFixed(1)}deg)`;return true;
  },
  resize(){view='';map?.invalidateSize({animate:false,pan:false});},
 };
}
