# Fieldspell — two-player shirt recognition test

One shared arena, exactly two players, no room codes. The first connected player controls three-minute rounds. Everyone enters their own name and registers a shirt color using a selfie camera crop. No GPS, compass, badges, or manual identity pairing.

## Run and play

Node 22+: `npm ci`, `npm start`. Open http://localhost:3000 locally. Both phones need the same **HTTPS** game server URL, in Safari or Chrome. The temporary testing link works only while the Mac and its tunnel are running.

1. Wear distinctly different, mostly solid shirt colors. Start a few metres apart with torsos visible in similar lighting.
2. Enter a name, tap Register shirt, enable the selfie camera, and fill the outline with shirt fabric. Capture color and confirm the swatch. Photos are never saved or uploaded.
3. Repeat on the other phone. The first player taps Start round once both shirts are registered. Similar samples are rejected.
4. Point the rear camera at the opponent. Aim the reticle inside their detected outline until it locks, then say Fireball (after enabling voice) or tap the spell.
5. Keep the shirt visible near the reticle. If it reads “Shirt uncertain” or “Shirt too small,” move closer. Retake shirt samples when switching to this version; the swatch now uses the dominant fabric color.
6. Keep the opponent visible during the 1.4-second flight. The 3D fireball steers toward the current detected torso. Gameplay impact reporting runs independently of the renderer; rendering failures use a visible 2D fallback. Tracking gaps over 700ms cancel the hit; a fresh match is required at impact. Shield and Heal need no target.

Fireball: 25 damage / 1.8-second cooldown. Shield: blocks for 3 seconds / 10-second cooldown. Heal: restores 20 / 12-second cooldown. Shield protection is evaluated at impact. Highest health wins on timeout; last survivor otherwise. Solo practice retains a clearly labeled simulated target and camera view.

## One-person preview

Open `/?test=shirt` or tap **Test my shirt · 1 person**. Register your shirt, then step back so the front camera can see your upper body. This uses the real person detector and color-coverage matcher; the registered sample represents the test target. No second player or multiplayer connection is needed. The name, coverage score, homing fireball, and target health are visible. **Reset target** restores 100 HP. This test does not establish how well two competing shirt colors separate; use the two-player arena for that.

## Recognition and privacy

MediaPipe EfficientDet Lite0 detects people in an on-device Web Worker. Color is sampled from frames up to 1280px wide, with one full-frame detector inference in flight. No alternating zoom crops are used. Three overlapping upper-body patches are sampled. Each pixel contributes a soft color-match weight using hue/saturation tolerance for colored shirts and brightness-aware rules for neutral shirts. The best two agreeing patches supply a coverage score. Acquisition requires at least 50% coverage and a 15-point margin over the other shirt; competing similar candidates prevent a lock. These are prototype tuning values, not calibrated identity probabilities. Registration uses the dominant fabric color; the legacy 15-bin profile remains only for server registration compatibility. Two matching frames confirm an identity and coverage is smoothed over time. A single matching patch is insufficient. Brief gaps preserve that identity, ambiguous lookalikes clear it, and stale detections cannot begin a cast. Detection and shirt sampling happen locally; the server receives only names, numerical color profiles, health, and game events. No photos, video, GPS coordinates, or motion readings are transmitted by the game.

Voice uses the browser's speech recognition service, which may process audio remotely. Complete interim spell words trigger casts; final transcripts do not duplicate them. Browser support and Siri settings can affect availability.

**This is a hackathon prototype, not reliable identity recognition.** Similar clothes, lighting changes, patterned shirts, occlusion, bystanders in matching colors, and distant/small bodies can defeat matching. In particular, shirt color does not authenticate a person. Start close together and test on the actual phones. Visual projectile depth is artistic; there is no real-world distance, surface occlusion, or shared AR map. Detection and homing have been browser tested; two-phone outdoor tracking still needs a field test.

The server enforces player slots, round state, cooldowns, impact timing, shields, and health, but trusts the firing client to report whether tracking remained valid. It is not anti-cheat-secure. A disconnect or missing impact report causes no damage. Foreground camera tracking is required. In-memory state is lost on server restart.

## Hosting

One Node process serves the frontend and `/ws` multiplayer. Fly configuration is included: `fly launch --no-deploy`, `fly deploy --ha=false`, `fly scale count 1`. Choose the closest region. No database or Apple developer membership is needed. Use the same HTTPS link on both phones; Connection settings can override the backend for a separately hosted frontend. The existing owner-private Sites preview defaults to the temporary shared testing backend; update this URL when replacing the tunnel.

Optional `ALLOWED_ORIGINS` is a comma-separated browser origin allowlist; same origin is always allowed. Anyone with the public game URL can occupy a slot. This is for a small friends-only test. Deploy only one instance; multiple independent processes would create separate arenas.

## Verification

`npm test` covers color matching/ambiguity, screen crop coordinates, spell rules, tracking-loss misses, delayed impacts, shields at impact, replay/early-impact rejection, two-client WebSocket state, required shirt registration, two-player capacity, reconnection, host control, and streaming voice behavior.

Third-party assets: Three.js (MIT), MediaPipe Tasks Vision (Apache-2.0), Google's EfficientDet Lite0 model. See `dist/vendor/THREE-LICENSE.txt` and `dist/vendor/mediapipe/NOTICE.txt`.
