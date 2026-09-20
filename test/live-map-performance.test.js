import test from 'node:test';
import assert from 'node:assert/strict';
import {createLiveMap} from '../dist/live-map.js';
import {withLiveMapHarness,liveMapFixture} from './helpers/live-map-harness.js';
test('busy spectator map measures labels once and shares cast endpoint projections each frame',async()=>{
 await withLiveMapHarness(createLiveMap,async({controller,stats,advance,flush})=>{
  controller.update(liveMapFixture(),1000);await flush();await advance(30);
  assert.equal(stats.paints,30);assert.equal(stats.measures,30,'30 names, not 900 per second');assert.equal(stats.projects,900,'30 unique coordinates per frame, not 110');
  assert.equal(stats.dimensions,2,'load completion does not resize unchanged canvas backing store');
 });
});
test('name and font changes refresh measurements; removed player labels do not accumulate',async()=>{
 await withLiveMapHarness(createLiveMap,async({controller,stats,fonts,advance,flush})=>{
  const data=liveMapFixture();controller.update(data,1000);await flush();await advance();assert.equal(stats.measures,30);
  data.players[0].name='Renamed Mage';controller.update(data,1000);await advance();assert.equal(stats.measures,31);assert.ok(stats.text.includes('RM'));assert.ok(stats.text.includes('Renamed Mage'));
  fonts.dispatchEvent(new Event('loadingdone'));await advance();assert.equal(stats.measures,61);
  const removed=data.players.shift();controller.update(data,1000);await advance();data.players.push(removed);controller.update(data,1000);await advance();assert.equal(stats.measures,62);
 });
});
test('projection reuse expires every frame so moving players and targets remain current',async()=>{
 await withLiveMapHarness(createLiveMap,async({controller,stats,advance,flush})=>{
  const data=liveMapFixture();controller.update(data,1000);await flush();await advance();stats.points=[];
  data.players[1].location={...data.players[1].location,latitude:42.01};data.casts[0].to={...data.players[1].location};controller.update(data,1000);await advance();
  assert.ok(stats.points.some(p=>p.latitude===42.01),'new endpoint is projected');assert.ok(stats.points.some(p=>p.latitude>42.00002&&p.latitude<42.01),'player still moves smoothly toward updated GPS');
 });
});
test('hidden map does not paint and destruction ignores late tile completion or font callbacks',async()=>{
 await withLiveMapHarness(createLiveMap,async({controller,stats,tiles,fonts,frames,advance,flush})=>{
  let complete;tiles.load=()=>new Promise(resolve=>complete=resolve);controller.update(liveMapFixture(),1000);controller.setVisible(false);await advance(20);assert.equal(stats.paints,0);
  controller.setVisible(true);await advance();assert.equal(stats.paints,1);controller.destroy();const resizes=stats.resizes;complete();await flush();fonts.dispatchEvent(new Event('loadingdone'));controller.update(liveMapFixture(),1000);controller.setVisible(true);await advance();assert.equal(stats.resizes,resizes);assert.equal(stats.paints,1);assert.equal(frames.size,0);
 });
});
