# Fieldspell — two-player headband test

One shared arena, exactly two players, no room codes. The first connected player controls three-minute rounds. Everyone enters their own name and scans a red or blue headband using the selfie camera. No GPS, compass, badges, or manual identity pairing.

## Run and play

Node 22+: `npm ci`, `npm start`. Open http://localhost:3000 locally. Both phones need the same **HTTPS** game server URL, in Safari or Chrome. The temporary testing link works only while the Mac and its tunnel are running.

1. Wear one red and one blue headband. Use a broad, solid band across the forehead and start a few metres apart with headbands and faces visible.
2. Enter a name, tap Scan headband, enable the selfie camera, and fill the narrow outline with headband fabric. Capture color and confirm the swatch. Photos are never saved or uploaded.
3. Repeat on the other phone. The first player taps Start round once both bands are registered. Two bands of the same color are rejected.
4. Point the rear camera at the opponent. Aim the reticle inside their validated target outline until it locks, then say Fireball (after enabling voice) or tap the spell.
5. Keep the headband visible. Initial acquisition needs a nearby face or a person; a continuously visible, previously confirmed band can keep tracking in close-up. Rescan both bands when switching from the shirt version.
6. Keep the opponent visible during the 1.4-second flight. The 3D fireball steers toward the current detected target. Gameplay impact reporting runs independently of the renderer; rendering failures use a visible 2D fallback. Tracking gaps over 700ms cancel the hit; a fresh match is required at impact. Shield and Heal need no target.

Fireball: 25 damage / 1.4-second flight / 1.8-second cooldown / 3 mana. Lightning: 20 damage / 0.25-second flight / 2.5-second cooldown / 4 mana; bypasses shields. Shield: blocks every damaging spell except lightning for 3 seconds / 10-second cooldown / 3 mana. Heal: restores 20 / 12-second cooldown / 4 mana. Mana caps at 10 and continuously refills one unit every 1.5 seconds. Shield protection is evaluated at impact. A visible opponent gets a shield aura; your own shield adds a blue screen rim. Incoming fireballs approach from the locally tracked attacker, with an intensifying all-edge warning when their position is unknown. Sound effects unlock on a tap and can be muted. Highest health wins on timeout; last survivor otherwise. Solo practice retains a clearly labeled simulated target and camera view.

## One-person preview

Open `/?test=headband` or tap **Test my headband · 1 person**. Scan your headband, then frame your headband and face in the front camera. This uses the actual color-first pipeline and face/person confirmation; the sample represents the test target. No second player or multiplayer connection is needed. The name, headband confirmation, homing fireball, and target health are visible. **Reset target** restores 100 HP. This test does not establish how well two different headband colors separate; use the two-player arena for that.

## Recognition and privacy

Identity comes from a scanned red or blue headband. The camera is first searched for connected pixels close to the registered opponent color, with hue/saturation tolerance and a margin over the player's own color. Tiny speckles, very large regions, and shapes unlike a band are filtered. If there is no candidate color region, no person inference is run for that frame.

The four largest color candidates guide small head-region crops for MediaPipe BlazeFace. A band must sit above exactly one detected face with plausible proportions. Face detection confirms placement, not personal identity. EfficientDet Lite0 supplies a fallback when a face is turned down/away but the band aligns with the top of a detected person. Multiple matching targets prevent lock. Two validated observations establish a track. Once established, the same continuously overlapping band can remain tracked through a close-up with no face or body; disappearance, ambiguity, or a long processing gap requires fresh confirmation. Color alone cannot start a new lock. Fireballs home toward the confirmed target region.

Local regression checks on the three supplied photos and three head/face crops found one blue target in each, all confirmed by the face model, with zero red-paper targets. These are still-image checks, not a distance, motion, or outdoor accuracy benchmark.

The scan uses a narrow guide and accepts red or blue fabric. One player must use red and the other blue. The numerical color profile still uses the legacy `shirt` wire field for compatibility, but no shirt or torso color is used for identification. The small outline over the band shows the actual detected color region. All image processing remains on the device; only names, numerical color samples, and game events are shared.

Voice uses the browser's speech recognition service, which may process audio remotely. Complete interim spell words trigger casts; final transcripts do not duplicate them. Browser support and Siri settings can affect availability.

**This is a hackathon prototype, not reliable identity recognition.** Lighting changes, head turns, hidden/thin headbands, bystanders in matching bands, and distant/small bodies can defeat matching. A similar red/blue object near someone’s head can still produce a false match. Headband color does not authenticate a person. Start close together and test on the actual phones. Visual projectile depth is artistic; there is no real-world distance, surface occlusion, or shared AR map. The headband pipeline still needs testing on the actual bands and phones outdoors.

The server enforces player slots, round state, cooldowns, impact timing, shields, and health, but trusts the firing client to report whether tracking remained valid. It is not anti-cheat-secure. A disconnect or missing impact report causes no damage. Foreground camera tracking is required. In-memory state is lost on server restart.

## Hosting

One Node process serves the frontend and `/ws` multiplayer. Fly configuration is included: `fly launch --no-deploy`, `fly deploy --ha=false`, `fly scale count 1`. Choose the closest region. No database or Apple developer membership is needed. Use the same HTTPS link on both phones; Connection settings can override the backend for a separately hosted frontend. The existing owner-private Sites preview defaults to the temporary shared testing backend; update this URL when replacing the tunnel.

Optional `ALLOWED_ORIGINS` is a comma-separated browser origin allowlist; same origin is always allowed. Anyone with the public game URL can occupy a slot. This is for a small friends-only test. Deploy only one instance; multiple independent processes would create separate arenas.

## Verification

`npm test` covers color matching/ambiguity, connected regions, headband/person association, screen crop coordinates, spell rules, tracking-loss misses, delayed impacts, shields at impact, replay/early-impact rejection, two-client WebSocket state, required headband registration, two-player capacity, reconnection, host control, and streaming voice behavior.

Third-party assets: Three.js (MIT), MediaPipe Tasks Vision (Apache-2.0), Google's EfficientDet Lite0 and BlazeFace short-range models. See `dist/vendor/THREE-LICENSE.txt` and `dist/vendor/mediapipe/NOTICE.txt`.
