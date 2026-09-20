import test from 'node:test';
import assert from 'node:assert/strict';
import {ATTACKS, CLASS_ATTACKS, freshLoadout, ruleFor} from '../dist/economy.js';
import {launchProjectile, impactProjectile, settleRoom} from '../dist/rules.js';

const now = 100000;
const location = (metres, at = now) => ({latitude:42 + metres / 111195, longitude:-71, accuracy:3, at});
function player(id, metres = 0) {
  return {id, name:id, connected:true, faceReady:true, health:70, economy:true, persona:'mage',
    life:1, loadout:freshLoadout(), mana:10, manaUpdatedAt:now, cooldowns:{}, location:location(metres)};
}
function arena(spell = 'lightning', upgraded = true) {
  const caster = player('caster', 0), target = player('target', 20);
  caster.persona = Object.keys(CLASS_ATTACKS).find(key => CLASS_ATTACKS[key][0] === spell);
  caster.loadout.skills[spell] = upgraded ? 2 : 1;
  return {phase:'playing', economy:true, continuous:true, enhanced:true, players:[caster,target], shots:[]};
}
function throwAtTarget(room, spell = 'lightning') {
  const shot = launchProjectile(room,'caster',spell,'target','cast-'+spell,now);
  assert.equal(shot.error,undefined);
  return shot;
}
const extras = hit => hit.secondaryHits || [];

test('only bought quick-attack upgrades expose the bounded multi-hit rule', () => {
  for (const [persona, deck] of Object.entries(CLASS_ATTACKS)) {
    const caster = player('caster'); caster.persona = persona;
    for (const spell of deck) {
      caster.loadout.skills[spell] = 1;
      assert.equal(ruleFor(caster,spell).multiHit,undefined,spell+' base');
      caster.loadout.skills[spell] = 2;
      if (spell === deck[0]) assert.deepEqual(ruleFor(caster,spell).multiHit,{radius:5,maxExtraTargets:2,damageScale:.5});
      else assert.equal(ruleFor(caster,spell).multiHit,undefined,spell+' heavy/ultimate');
    }
  }
});

test('all three upgraded quick attacks hit up to two nearby people for half direct damage', () => {
  for (const spell of ['lightning','poison','arrows']) {
    const room = arena(spell); room.players.push(player('near',21),player('next',23));
    const shot = throwAtTarget(room,spell);
    assert.deepEqual(shot.attackRule.multiHit,{radius:5,maxExtraTargets:2,damageScale:.5});
    // A cast keeps its purchased rule even if the player switches loadout while it is flying.
    room.players[0].loadout.skills[spell] = 1;
    const hit = impactProjectile(room,'caster',shot.shotId,true,shot.impactAt);
    assert.equal(hit.missed,false); assert.equal(hit.blocked,false);
    assert.equal(room.players[1].health,70-ATTACKS[spell].upDamage);
    assert.deepEqual(extras(hit).map(h=>h.targetId),['near','next']);
    for (const child of extras(hit)) {
      assert.equal(child.actorId,'caster'); assert.equal(child.spell,spell);
      assert.equal(child.healthBefore,70); assert.equal(child.missed,false); assert.equal(child.blocked,false);
      assert.equal(child.attackRule.damage,ATTACKS[spell].upDamage / 2);
      assert.equal(room.players.find(p=>p.id===child.targetId).health,70-ATTACKS[spell].upDamage / 2);
      assert.notEqual(child.shotId,shot.shotId);
    }
    assert.equal(new Set(extras(hit).map(h=>h.shotId)).size,2,'separate impact IDs for scoring and effects');
    assert.equal(room.shots.length,0,'secondary impacts do not spawn recursive projectiles');
    assert.equal(room.players[0].health,70,'caster excluded');
  }
});

test('multi-hit selects the nearest two within five metres of the primary, not the caster', () => {
  const room = arena();
  room.players.push(player('third',24),player('near-caster',1),player('second',22),player('outside',25.1),player('nearest',20.5));
  const shot = throwAtTarget(room), hit = impactProjectile(room,'caster',shot.shotId,true,shot.impactAt);
  assert.deepEqual(extras(hit).map(h=>h.targetId),['nearest','second']);
  for (const id of ['third','near-caster','outside']) assert.equal(room.players.find(p=>p.id===id).health,70,id);
});

test('missing, stale, invalid and future GPS cannot identify secondary targets; inactive players are excluded', () => {
  const room = arena(), shot = throwAtTarget(room);
  for (const id of ['offline','dead','no-face','stale','future','invalid','no-location','valid']) {
    const p = player(id,21); room.players.push(p);
    if (id==='offline') p.connected=false;
    if (id==='dead') p.health=0;
    if (id==='no-face') p.faceReady=false;
    if (id==='stale') p.location.at=shot.impactAt-10001;
    if (id==='future') p.location.at=shot.impactAt+1001;
    if (id==='invalid') p.location.latitude=NaN;
    if (id==='no-location') delete p.location;
  }
  const hit = impactProjectile(room,'caster',shot.shotId,true,shot.impactAt);
  assert.deepEqual(extras(hit).map(h=>h.targetId),['valid']);
  for (const p of room.players.slice(2).filter(p=>p.id!=='valid')) assert.equal(p.health,p.id==='dead'?0:70,p.id);
});

test('GPS freshness boundaries are inclusive and distance just outside five metres is excluded', () => {
  const room = arena(), shot = throwAtTarget(room);
  const old = player('old-boundary',21), future = player('future-boundary',22), outside = player('outside',25.01);
  old.location.at=shot.impactAt-10000; future.location.at=shot.impactAt+1000;
  room.players.push(old,future,outside);
  const hit = impactProjectile(room,'caster',shot.shotId,true,shot.impactAt);
  assert.deepEqual(extras(hit).map(h=>h.targetId),['old-boundary','future-boundary']);
  assert.equal(outside.health,70);
});

test('without a usable primary position a tracked primary still takes damage but nobody else is hit', () => {
  for (const state of ['missing','stale','future','invalid']) {
    const room = arena(); room.players.push(player('near',21));
    const shot = throwAtTarget(room);
    if (state==='missing') delete room.players[1].location;
    if (state==='stale') room.players[1].location.at=shot.impactAt-10001;
    if (state==='future') room.players[1].location.at=shot.impactAt+1001;
    if (state==='invalid') room.players[1].location.longitude=NaN;
    const hit=impactProjectile(room,'caster',shot.shotId,true,shot.impactAt);
    assert.equal(room.players[1].health,56,state); assert.equal(room.players[2].health,70,state);
    assert.deepEqual(extras(hit),[],state);
  }
});

test('base quick attacks remain single-target and replayed upgraded impacts cannot damage anyone twice', () => {
  for (const spell of ['lightning','poison','arrows']) {
    const base = arena(spell,false); base.players.push(player('near',21));
    const baseShot = throwAtTarget(base,spell), baseHit = impactProjectile(base,'caster',baseShot.shotId,true,baseShot.impactAt);
    assert.equal(baseShot.attackRule.multiHit,undefined); assert.deepEqual(extras(baseHit),[]); assert.equal(base.players[2].health,70);
    const upgraded=arena(spell); upgraded.players.push(player('near',21));
    const shot=throwAtTarget(upgraded,spell); impactProjectile(upgraded,'caster',shot.shotId,true,shot.impactAt);
    const health=upgraded.players.map(p=>p.health);
    assert.ok(impactProjectile(upgraded,'caster',shot.shotId,true,shot.impactAt+1).error);
    assert.deepEqual(upgraded.players.map(p=>p.health),health);
  }
});

test('secondary shields block arrows and plague but not chain lightning, and never cause parries', () => {
  for (const spell of ['lightning','poison','arrows']) {
    const room=arena(spell), shield=player('shielded',21); room.players.push(shield);
    const shot=throwAtTarget(room,spell); shield.shieldUntil=shot.impactAt+7000; shield.shieldStartedAt=shot.impactAt-50;
    const hit=impactProjectile(room,'caster',shot.shotId,true,shot.impactAt), child=extras(hit)[0];
    assert.ok(child); assert.equal(child.blocked,spell!=='lightning');
    assert.equal(shield.health,spell==='lightning'?63:70); assert.equal(shield.poison||null,null);
    assert.equal(child.parried||false,false); assert.equal(room.shots.length,0);
  }
});

test('a missed, blocked or parried primary creates no secondary hits, including its reflected return', () => {
  for (const outcome of ['miss','block','parry']) {
    const room=arena('arrows'); room.players.push(player('near-primary',21),player('near-caster',1));
    const shot=throwAtTarget(room,'arrows');
    if (outcome!=='miss') room.players[1].shieldUntil=shot.impactAt+7000;
    if (outcome==='parry') room.players[1].shieldStartedAt=shot.impactAt-50;
    const hit=impactProjectile(room,'caster',shot.shotId,outcome!=='miss',shot.impactAt);
    assert.deepEqual(extras(hit),[],outcome);
    assert.equal(room.players[2].health,70); assert.equal(room.players[3].health,70);
    if (outcome==='parry') {
      assert.equal(hit.parried,true);
      const reflected=impactProjectile(room,'target',hit.reflection.shotId,true,hit.reflection.impactAt);
      assert.equal(reflected.missed,false); assert.deepEqual(extras(reflected),[]);
      assert.equal(room.players[3].health,70,'no splash off a reflected shot');
    }
  }
});

test('plague secondaries receive half poison damage over the original duration and retain attribution', () => {
  const room=arena('poison'); room.players.push(player('near',21));
  const shot=throwAtTarget(room,'poison'), hit=impactProjectile(room,'caster',shot.shotId,true,shot.impactAt);
  const [actor,primary,secondary]=room.players, child=extras(hit)[0];
  assert.equal(secondary.health,66); assert.equal(secondary.poison.perSecond,1);
  assert.equal(secondary.poison.until-secondary.poison.startedAt,3000);
  assert.equal(secondary.poison.by,actor.id); assert.equal(secondary.poison.life,actor.life);
  assert.deepEqual(child.attackRule.dot,{perSecond:1,duration:3000});
  assert.equal(primary.poison.perSecond,2,'secondary scaling must not mutate the primary rule');
  const damage=settleRoom(room,shot.impactAt+3000);
  assert.equal(primary.health,56); assert.equal(secondary.health,63);
  assert.equal(damage.find(d=>d.targetId==='near').amount,3);
  assert.equal(damage.find(d=>d.targetId==='near').actorId,'caster');
  assert.equal(secondary.poison,null);
});
