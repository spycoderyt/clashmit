import test from 'node:test';
import assert from 'node:assert/strict';
import {createMeleeGame} from '../dist/melee-game.js';
import {withMeleeHarness} from './helpers/melee-harness.js';

test('stationary melee reuses capture storage and paints only new samples, not every animation frame',()=>withMeleeHarness(createMeleeGame,async h=>{
 h.controller.start();await h.flush();await h.advance(1000);
 assert.ok(h.stats.frameMessages>=7&&h.stats.frameMessages<=10,'inference cadence remains near nine samples per second');
 assert.equal(h.canvases[1].dimensionWrites,2,'capture storage allocated once at the stable resolution');
 assert.equal(h.stats.containerReads,h.stats.frameMessages,'drawing does not trigger layout reads');
 assert.equal(h.stats.videoReads,h.stats.frameMessages);
 assert.ok(h.stats.paints<=h.stats.frameMessages+1,'stationary sword does not burn a perpetual 60Hz render loop');
}));

test('moving sword keeps rendering between detector samples without requesting more layout',()=>withMeleeHarness(createMeleeGame,async h=>{
 h.controller.start();await h.flush();await h.advance(250);const before={...h.stats};h.setPose({x:.5,y:.5});await h.advance(200);
 assert.ok(h.stats.paints-before.paints>h.stats.frameMessages-before.frameMessages,'motion still interpolates at display cadence');
 assert.equal(h.stats.containerReads,h.stats.frameMessages);
}));

test('a frozen camera expires its sword even though stationary painting is paused',()=>withMeleeHarness(createMeleeGame,async h=>{
 h.controller.start();await h.flush();await h.advance(250);h.setFrozen(true);await h.advance(150);const count=h.stats.frameMessages;await h.advance(350);
 assert.equal(h.stats.frameMessages,count,'unchanged video frame is never inferred twice');assert.equal(h.frames.size,0,'stale sword does not keep repainting');assert.equal(h.stats.hits.length,0);
}));

test('hidden pages schedule no capture polling and resume promptly using new frames',()=>withMeleeHarness(createMeleeGame,async h=>{
 h.controller.start();await h.flush();await h.advance(250);h.doc.hidden=true;h.doc.dispatchEvent(new Event('visibilitychange'));const before=h.stats.frameMessages;
 await h.advance(1000);assert.equal(h.stats.frameMessages,before);assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);
 h.doc.hidden=false;h.doc.dispatchEvent(new Event('visibilitychange'));await h.flush();assert.equal(h.stats.frameMessages,before+1,'resume does not wait for an idle timer');
}));

test('resize invalidates in-flight geometry and disposal removes observers and scheduled work',()=>withMeleeHarness(createMeleeGame,async h=>{
 h.setAutoReply(false);h.controller.start();await h.flush();await h.advance(150);assert.equal(h.stats.frameMessages,1);
 h.resize({width:844,height:390});h.replyLast();await h.flush();assert.equal(h.frames.size,0,'old portrait camera geometry cannot draw a landscape hit');assert.equal(h.stats.hits.length,0);
 h.setAutoReply(true);await h.advance(200);assert.ok(h.stats.paints>0);
 h.controller.dispose();assert.equal(h.timers.size,0);assert.equal(h.frames.size,0);assert.ok(h.observers.every(o=>o.disconnected));assert.ok(h.canvases[0].removed);
}));

test('rapid hide/resume during bitmap capture cannot fork two polling loops',()=>withMeleeHarness(createMeleeGame,async h=>{
 let release;const bitmapFactory=globalThis.createImageBitmap;
 globalThis.createImageBitmap=canvas=>new Promise(resolve=>{release=()=>resolve({width:canvas.width,height:canvas.height,close(){}});});
 h.controller.start();await h.flush();await h.advance(150);assert.equal(typeof release,'function');
 h.doc.hidden=true;h.doc.dispatchEvent(new Event('visibilitychange'));h.doc.hidden=false;h.doc.dispatchEvent(new Event('visibilitychange'));await h.flush();
 release();await h.flush();globalThis.createImageBitmap=bitmapFactory;
 assert.equal(h.timers.size,1,'only one capture poll remains after the cancelled bitmap finishes');
 await h.advance(250);assert.ok(h.stats.frameMessages>0);
}));
