import test from 'node:test';import assert from 'node:assert/strict';
import {spellsFromText,spellFromText} from '../dist/voice.js';
import {deckWords,SPELL_INFO,PERSONA_INFO} from '../dist/personas.js';
import {PERSONAS,SPELLS} from '../dist/rules.js';

test('every spell and persona has presentation data',()=>{
 for(const id of Object.keys(SPELLS)){const info=SPELL_INFO[id];assert.ok(info?.label&&info.symbol&&info.blurb&&info.words.length,id);}
 for(const id of Object.keys(PERSONAS))assert.ok(PERSONA_INFO[id]?.name&&PERSONA_INFO[id].accent,id);
});
test('only the words of the supplied deck cast',()=>{
 const witch=deckWords(PERSONAS.witch),mage=deckWords(PERSONAS.mage),archer=deckWords(PERSONAS.archer);
 assert.deepEqual(spellsFromText('poison',witch),['poison']);assert.deepEqual(spellsFromText('poison',mage),[]);
 assert.deepEqual(spellsFromText('fireball',witch),[]);assert.deepEqual(spellsFromText('zap then arrows',archer),['zap','arrows']);
 assert.deepEqual(spellsFromText('heal and shield',witch),['heal','shield']);
});
test('skeleton army is one command however the recognizer phrases it',()=>{
 const witch=deckWords(PERSONAS.witch);
 for(const said of ['skeleton army','Skeleton Army','skeletons','skeleton','send the skeleton army now'])assert.deepEqual(spellsFromText(said,witch),['skeletonArmy'],said);
 assert.deepEqual(spellsFromText('skeleton army skeletons',witch),['skeletonArmy','skeletonArmy']);
});
test('with no deck supplied the original four words still cast',()=>{
 assert.equal(spellFromText('fire ball'),'fireball');assert.equal(spellFromText('cast lightning'),'lightning');assert.equal(spellFromText('lightningbolt'),null);assert.equal(spellFromText('poison'),null);
});
test('every tactic can be cast by saying one single word, and the hint advertises that word',()=>{
 for(const [persona,deck] of Object.entries(PERSONAS))for(const id of deck){
  const single=SPELL_INFO[id].words.filter(w=>!/\s/.test(w)||w==='fire ball');
  assert.ok(single.length,`${id} needs a one-word form`);
  assert.ok(!/\s/.test(SPELL_INFO[id].label),`${id} label must be the one word players say`);
  assert.deepEqual(spellsFromText(SPELL_INFO[id].label,deckWords(deck)),[id],`${persona}: saying “${SPELL_INFO[id].label}” must cast ${id}`);
 }
});
test('an interim “skeleton” followed by the full phrase is still one cast',()=>{
 const witch=deckWords(PERSONAS.witch);
 assert.equal(spellsFromText('skeleton',witch).length,1);assert.equal(spellsFromText('skeleton army',witch).length,1);
});
