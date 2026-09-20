// Street map under the minimap markers, drawn from vector data so it is sharp at every zoom and rotation and
// carries no text at all: only land, water, green space, buildings and roads, in the colors of a theme.
// MapLibre GL and the tiles load lazily, only after a player shares their location; if either fails the markers
// still work on a plain background. Two ways of using it:
//   follow()         the small corner view: display only, centred on the player, scaled to a fixed radius and
//                    turned to the compass heading
//   setInteractive() the full-screen view: north up, dragged and pinched like any map
import {mapZoom} from './geo.js?v=map1';
// OpenFreeMap serves OpenStreetMap data as vector tiles with no API key or usage limit.
const SOURCE='https://tiles.openfreemap.org/planet';
export const ATTRIBUTION='OpenFreeMap © OpenMapTiles · Data © OpenStreetMap';
// A theme is just colors; every theme draws the same few shapes.
export const THEMES={
 midnight:{name:'Midnight',land:'#0d1524',water:'#0a2740',green:'#10261f',building:'#223150',edge:'#34486f',path:'#1f2c46',minor:'#33456a',major:'#5a78ad',rail:'#1c2840'},
 neon:{name:'Neon',land:'#05070c',water:'#04121f',green:'#07150f',building:'#0e1828',edge:'#1d3a5a',path:'#0a3340',minor:'#0f7d95',major:'#25e6ff',rail:'#10202b'},
 ember:{name:'Ember',land:'#101216',water:'#0b1a26',green:'#151d17',building:'#242830',edge:'#3a404c',path:'#2a2420',minor:'#57402f',major:'#ff9958',rail:'#23262d'},
 blueprint:{name:'Blueprint',land:'#0c2f6a',water:'#082350',green:'#0f3b76',building:'#15408a',edge:'#8fb9ff',path:'#2f5fb0',minor:'#a9c8ff',major:'#ffffff',rail:'#3f6cb8'},
 paper:{name:'Paper',land:'#e9ebef',water:'#c6dcf5',green:'#d7e8d4',building:'#d9dde5',edge:'#c3c9d4',path:'#f6f7f9',minor:'#ffffff',major:'#ffffff',rail:'#cfd3da'},
};
export const DEFAULT_THEME='midnight';
const width=(at13,at16,at19,at22)=>['interpolate',['exponential',1.5],['zoom'],12,at13,15,at16,18,at19,21,at22];
const roads=classes=>['all',['in',['get','class'],['literal',classes]],['!=',['get','brunnel'],'tunnel']];
export function mapStyle(theme=DEFAULT_THEME){
 const c=THEMES[theme]||THEMES[DEFAULT_THEME],line={'line-cap':'round','line-join':'round'};
 return{version:8,sources:{map:{type:'vector',url:SOURCE}},layers:[
  {id:'land',type:'background',paint:{'background-color':c.land}},
  {id:'green',type:'fill',source:'map','source-layer':'landcover',filter:['in',['get','class'],['literal',['grass','wood']]],paint:{'fill-color':c.green}},
  {id:'park',type:'fill',source:'map','source-layer':'park',paint:{'fill-color':c.green}},
  {id:'water',type:'fill',source:'map','source-layer':'water',paint:{'fill-color':c.water}},
  {id:'stream',type:'line',source:'map','source-layer':'waterway',layout:line,paint:{'line-color':c.water,'line-width':width(.5,1.5,4,10)}},
  {id:'building',type:'fill',source:'map','source-layer':'building',minzoom:12,paint:{'fill-color':c.building,'fill-outline-color':c.edge}},
  {id:'rail',type:'line',source:'map','source-layer':'transportation',filter:roads(['rail','transit']),layout:line,paint:{'line-color':c.rail,'line-width':width(.4,1,2.5,6)}},
  // Footpaths are kept faint and thin: on a campus or in a park there are a great many of them.
  {id:'path',type:'line',source:'map','source-layer':'transportation',filter:roads(['path','pedestrian','track']),minzoom:15,layout:line,paint:{'line-color':c.path,'line-width':width(.2,.6,2,6)}},
  {id:'minor',type:'line',source:'map','source-layer':'transportation',filter:roads(['minor','service','tertiary']),layout:line,paint:{'line-color':c.minor,'line-width':width(.5,2.4,9,26)}},
  {id:'major',type:'line',source:'map','source-layer':'transportation',filter:roads(['motorway','trunk','primary','secondary']),layout:line,paint:{'line-color':c.major,'line-width':width(1.1,4.2,15,40)}},
 ]};
}
let library;
function loadMapLibre(){
 library??=(async()=>{
  const link=document.createElement('link');link.rel='stylesheet';link.href='vendor/maplibre/maplibre-gl.css';document.head.append(link);
  const maplibre=await import('./vendor/maplibre/maplibre-gl.js');maplibre.setWorkerUrl(new URL('./vendor/maplibre/maplibre-gl-worker.js',import.meta.url).href);return maplibre;
 })().catch(error=>{library=undefined;throw error;});
 return library;
}
// MapLibre counts zoom in 512 px tiles, one less than the 256 px convention used by mapZoom().
const zoomFor=(latitude,halfMetres,halfPixels)=>Math.min(21,Math.max(2,mapZoom(latitude,halfMetres/halfPixels)-1));
const GESTURES=['dragPan','scrollZoom','touchZoomRotate','doubleClickZoom'];
export function createTileMap(host,{theme=DEFAULT_THEME}={}){
 const element=document.createElement('div');element.className='minimap-map';host.prepend(element);
 let map=null,ready=false,view='',current=theme;const moved=new Set(),grabbed=new Set();
 return {
  attribution:ATTRIBUTION,
  get ready(){return ready;},
  async load(){
   if(map)return;const maplibre=await loadMapLibre();if(map)return;
   map=new maplibre.Map({container:element,style:mapStyle(current),interactive:true,attributionControl:false,center:[0,0],zoom:2,fadeDuration:0,pitchWithRotate:false,dragRotate:false,touchPitch:false,keyboard:false,boxZoom:false,renderWorldCopies:false,maxZoom:21});
   for(const name of GESTURES)map[name].disable();
   map.on('move',()=>{for(const listener of moved)listener();});
   // Only the player's own fingers (or mouse) take the map out of follow mode, not our own recentring.
   for(const type of ['dragstart','zoomstart'])map.on(type,e=>{if(e.originalEvent)for(const listener of grabbed)listener();});
   await new Promise(resolve=>map.once('load',resolve));ready=true;
  },
  // Corner view. Returns false until the map can be drawn. halfMetres is drawn across halfPixels from the centre,
  // and the map is turned so that `facing` (degrees from north, or null) points up.
  follow(position,halfMetres,halfPixels,facing){
   if(!ready||!halfPixels)return false;
   const zoom=zoomFor(position.latitude,halfMetres,halfPixels),bearing=facing??0,next=`${position.latitude.toFixed(6)},${position.longitude.toFixed(6)},${zoom.toFixed(3)},${bearing.toFixed(1)}`;
   if(next!==view){view=next;map.jumpTo({center:[position.longitude,position.latitude],zoom,bearing});}return true;
  },
  // Full-screen view: centre on a position, optionally setting the scale, otherwise keeping the player's zoom.
  centerOn(position,halfMetres,halfPixels){if(!ready)return;view='';map.jumpTo({center:[position.longitude,position.latitude],zoom:halfMetres&&halfPixels?zoomFor(position.latitude,halfMetres,halfPixels):map.getZoom(),bearing:0});},
  setInteractive(on){view='';if(!map)return;for(const name of GESTURES)map[name][on?'enable':'disable']();if(on){map.touchZoomRotate.disableRotation();map.setBearing(0);}},
  // Where a coordinate falls inside the map element, in CSS pixels, and how many metres one pixel covers there.
  project(latitude,longitude){if(!ready)return null;const point=map.project([longitude,latitude]);return{x:point.x,y:point.y};},
  unproject(x,y){if(!ready)return null;const p=map.unproject([x,y]);return{latitude:p.lat,longitude:p.lng};},
  metresPerPixel(latitude){return ready?156543.03392*Math.cos(latitude*Math.PI/180)/2**(map.getZoom()+1):null;},
  setTheme(next){if(!THEMES[next]||next===current)return;current=next;map?.setStyle(mapStyle(next));},
  onMove(listener){moved.add(listener);},onGrab(listener){grabbed.add(listener);},
  resize(){view='';map?.resize();},
 };
}
