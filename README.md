# Fieldspell — two-player shirt recognition test

One shared arena, exactly two players, no room codes. The first connected player controls three-minute rounds. Everyone enters their own name and registers a shirt color using a selfie camera crop. No GPS, compass, badges, or manual identity pairing.

## Run and play

Node 22+: `npm ci`, `npm start`. Open http://localhost:3000 locally. Both phones need the same **HTTPS** game server URL, in Safari or Chrome. The temporary testing link works only while the Mac and its tunnel are running.

1. Wear distinctly different, mostly solid shirt colors. Start a few metres apart with torsos visible in similar lighting.
2. Enter a name, tap Register shirt, enable the selfie camera, and fill the outline with shirt fabric. Capture color and confirm the swatch. Photos are never saved or uploaded.
3. Repeat on the other phone. The first player taps Start round once both shirts are registered. Similar samples are rejected.
4. Point the rear camera at the opponent. Aim the reticle inside their detected outline until it locks, then say Fireball (after enabling voice) or tap the spell.
5. Keep the opponent visible during the 1.4-second flight. The 3D fireball steers toward the current detected torso. Losing the match for over 450ms cancels the hit. Shield and Heal need no target.

Fireball: 25 damage / 1.8-second cooldown. Shield: blocks for 3 seconds / 10-second cooldown. Heal: restores 20 / 12-second cooldown. Shield protection is evaluated at impact. Highest health wins on timeout; last survivor otherwise. Solo practice retains a clearly labeled simulated target and camera view.

## Recognition and privacy

MediaPipe EfficientDet Lite0 detects people in an on-device Web Worker. Frames are sampled at 640px width with one inference in flight. A central torso region supplies a 15-bin color histogram. The opponent must match better than the player's own shirt, and competing similar candidates prevent a lock. Stale detections cannot target. Detection and shirt sampling happen locally; the server receives only names, numerical color profiles, health, and game events. No photos, video, GPS coordinates, or motion readings are transmitted by the game.

Voice uses the browser's speech recognition service, which may process audio remotely. Complete interim spell words trigger casts; final transcripts do not duplicate them. Browser support and Siri settings can affect availability.

**This is a hackathon prototype, not reliable identity recognition.** Similar clothes, lighting changes, patterned shirts, occlusion, bystanders in matching colors, and distant/small bodies can defeat matching. In particular, shirt color does not authenticate a person. Start close together and test on the actual phones. Visual projectile depth is artistic; there is no real-world distance, surface occlusion, or shared AR map. Detection and homing have been browser tested; two-phone outdoor tracking still needs a field test.

The server enforces player slots, round state, cooldowns, impact timing, shields, and health, but trusts the firing client to report whether tracking remained valid. It is not anti-cheat-secure. A disconnect or missing impact report causes no damage. Foreground camera tracking is required. In-memory state is lost on server restart.

## Hosting

One Node process serves the frontend and `/ws` multiplayer. Fly configuration is included: `fly launch --no-deploy`, `fly deploy --ha=false`, `fly scale count 1`. Choose the closest region. No database or Apple developer membership is needed. Use the same HTTPS link on both phones; Connection settings can override the backend for a separately hosted frontend. The existing owner-private Sites preview defaults to the temporary shared testing backend; update this URL when replacing the tunnel.

Optional `ALLOWED_ORIGINS` is a comma-separated browser origin allowlist; same origin is always allowed. Anyone with the public game URL can occupy a slot. This is for a small friends-only test. Deploy only one instance; multiple independent processes would create separate arenas.

## Verification

`npm test` covers color matching/ambiguity, screen crop coordinates, spell rules, tracking-loss misses, delayed impacts, shields at impact, replay/early-impact rejection, two-client WebSocket state, required shirt registration, two-player capacity, reconnection, host control, and streaming voice behavior.

Third-party assets: Three.js (MIT), MediaPipe Tasks Vision (Apache-2.0), Google's EfficientDet Lite0 model. See `dist/vendor/THREE-LICENSE.txt` and `dist/vendor/mediapipe/NOTICE.txt`.
