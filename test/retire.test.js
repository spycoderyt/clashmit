import test from 'node:test';
import assert from 'node:assert/strict';
import {retirePlayer,spawnPlayer,requestRespawn,selectRespawnPersona} from '../dist/respawn.js';
import {launchProjectile,impactProjectile,settleRoom} from '../dist/rules.js';
import {freshLoadout} from '../dist/economy.js';
function fixture(){
 const players=['a','b','c'].map(id=>({id,name:id,token:`token-${id}`,connected:true,faceReady:true,economy:true,persona:'mage',loadout:freshLoadout()}));
 for(const p of players)spawnPlayer(p,1000);
 return{continuous:true,economy:true,phase:'playing',players,shots:[],faces:{a:{samples:['saved']}},avatars:{a:'portrait'},eventRound:{mode:'ffa'}};
}
test('retire preserves identity, face, purchases and connection through manual respawn',()=>{
 const room=fixture(),p=room.players[0],saved={token:p.token,loadout:p.loadout,face:room.faces.a,avatar:room.avatars.a};
 assert.deepEqual(retirePlayer(room,p,2000),{retired:true});assert.equal(p.health,0);assert.equal(p.respawnAt,12000);assert.equal(p.life,1);assert.equal(p.connected,true);assert.equal(p.faceReady,true);
 assert.ok(requestRespawn(room,p,11999).error);assert.deepEqual(selectRespawnPersona(room,p,'witch',3000),{});assert.deepEqual(requestRespawn(room,p,12000),{});
 assert.equal(p.health,70);assert.equal(p.life,2);assert.equal(p.persona,'witch');assert.equal(p.token,saved.token);assert.equal(p.name,'a');assert.equal(p.loadout,saved.loadout);assert.equal(room.faces.a,saved.face);assert.equal(room.avatars.a,saved.avatar);
});
test('repeated retire keeps the deadline and clears owned effects without touching unrelated combat',()=>{
 const room=fixture(),[a,b,c]=room.players;
 room.shots=[{shotId:'out',actorId:'a',targetId:'b'},{shotId:'in',actorId:'b',targetId:'a'},{shotId:'other',actorId:'b',targetId:'c'}];room.airstrikes=[{actorId:'a'},{actorId:'b'}];
 a.poison={by:'b'};b.poison={by:'a'};b.swarm={by:'c'};c.swarm={by:'a'};a.airstrikeCharges=2;a.actionLockUntil=99999;
 retirePlayer(room,a,2000);assert.deepEqual(retirePlayer(room,a,9000),{retired:false});assert.equal(a.respawnAt,12000);assert.equal(a.diedAt,2000);assert.equal(a.koScoredLife,1);
 assert.deepEqual(room.shots.map(s=>s.shotId),['other']);assert.deepEqual(room.airstrikes,[{actorId:'b'}]);assert.equal(a.poison,null);assert.equal(b.poison,null);assert.equal(c.swarm,null);assert.deepEqual(b.swarm,{by:'c'});assert.equal(a.airstrikeCharges,0);assert.equal(a.actionLockUntil,0);
});
test('retiring in other modes cannot enable the FFA shop or respawn',()=>{
 const room=fixture(),a=room.players[0];room.eventRound={mode:'koth',players:{a:{}}};
 retirePlayer(room,a,2000);assert.equal(a.eliminated,true);assert.equal(room.eventRound.players.a.eliminated,true);assert.equal(a.respawnAt,null);assert.ok(requestRespawn(room,a,99999).error);assert.ok(selectRespawnPersona(room,a,'witch',99999).error);
});
test('retire rejects players who have not joined a life',()=>{
 for(const change of [{connected:false},{faceReady:false},{life:0}]){const room=fixture(),a=Object.assign(room.players[0],change);assert.ok(retirePlayer(room,a,2000).error);assert.equal(a.health,70);}
});
test('retired players cannot cast and removed projectiles cannot damage a later life',()=>{
 const room=fixture(),[a,b]=room.players;
 const shot=launchProjectile(room,'a','lightning','b','shot',1100);assert.ok(!shot.error);
 retirePlayer(room,a,1200);assert.ok(launchProjectile(room,'a','lightning','b','dead',1300).error);assert.ok(impactProjectile(room,'a',shot.shotId,true,3000).error);
 requestRespawn(room,a,11200);assert.ok(impactProjectile(room,'a',shot.shotId,true,11201).error);settleRoom(room,11201);assert.equal(b.health,70);
});
