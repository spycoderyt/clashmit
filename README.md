# ClashMIT — browser spell tag

## Team setup

Repository: [spycoderyt/clashmit](https://github.com/spycoderyt/clashmit). The app currently displays the original Fieldspell name.

The repository is private. The owner invites teammates through [Settings → Collaborators](https://github.com/spycoderyt/clashmit/settings/access) with write access. Each teammate must accept the invitation and authenticate Git with their own GitHub account before cloning. Do not share account credentials.

Install Git and Node.js 22 or newer (including npm). Each new teammate runs:

```bash
git clone https://github.com/spycoderyt/clashmit.git
cd clashmit
npm ci
git switch -c feature/my-feature
npm start
```

Use a descriptive, unique branch name in place of `feature/my-feature`. Open http://localhost:3000 to test. Every laptop runs an independent game and can use port 3000. The owner’s existing checkout is already connected to this repository and does not need to be cloned again; start a feature branch in that checkout before editing.

### Test on phones

Install `cloudflared` separately. Keep `npm start` running and open another terminal in the project folder:

```bash
cloudflared tunnel --url http://127.0.0.1:3000 --protocol http2 --edge-ip-version 4
```

Open the HTTPS URL printed by the tunnel on each test phone. All phones testing the same multiplayer session must use the **same developer’s URL**. Different developers’ URLs lead to separate games. In Connection settings, leave the server override empty when opening the tunnel URL so the browser connects to that same server. Camera and microphone access require HTTPS on phones; phone `localhost` refers to the phone, not the laptop.

Keep that laptop awake, its server running, and its tunnel connected. If MIT Guest blocks the tunnel, connect the laptop to a phone hotspot. Phones only need internet access; they do not need to join that hotspot. The temporary URL may change when the tunnel restarts.

### Share changes and merge into main

Work on your own feature branch. Coordinate ownership of files, especially `dist/app.js`, to reduce merge conflicts. Before sharing a change:

```bash
npm test
git status
git add <changed-files>
git commit -m "Describe the change"
git push -u origin feature/my-feature
```

Replace `<changed-files>` with the files you intend to commit, and use your actual branch name. Open a pull request on GitHub from your branch into `main`. Have a teammate review it, resolve any conflicts, then merge it. These are team conventions; branch protection and required checks are not configured yet.

After a merge, commit unfinished work on your feature branch before switching. Everyone, including the owner, can update and start their next task with:

```bash
git switch main
git pull --ff-only
npm ci
git switch -c feature/next-feature
```

Restart `npm start` after server changes and refresh the browser after frontend changes. Frontend files in `dist/` are edited directly; no build step is required.

### Shared demo and deployment

Use a separate checkout/server running `main` for the shared demo so feature-branch edits do not change the demo unexpectedly. Each developer’s local server serves files from their current checkout. Pushing or merging code does **not** automatically update a running server. Automatic deployment from `main` and the `clashmit.lol` custom domain are not configured yet.

## Multiplayer capacity work in progress

The lobby now accepts up to 12 connections, with a regression test for the limit. This is capacity plumbing only: camera targeting still selects one opponent, and red/blue bands cannot distinguish multiple individual players wearing the same color. Keep gameplay tests to two players until team health or unique player colors and multi-target tracking are implemented. The 12-player UI labels do not indicate complete multiplayer support.

One shared arena, exactly two players, no room codes. The first connected player controls three-minute rounds. Everyone enters their own name and scans a red or blue headband using the selfie camera. No GPS, compass, badges, or manual identity pairing.

## Run and play

Node 22+: `npm ci`, `npm start`. Open http://localhost:3000 locally. Both phones need the same **HTTPS** game server URL, in Safari or Chrome. The temporary testing link works only while the Mac and its tunnel are running.

1. Wear one red and one blue headband. Use a broad, solid band across the forehead and start a few metres apart with headbands visible.
2. Enter a name, tap Scan headband, enable the selfie camera, and fill the narrow outline with headband fabric. Capture color and confirm the swatch. Photos are never saved or uploaded.
3. Repeat on the other phone. The first player taps Start round once both bands are registered. Two bands of the same color are rejected.
4. Point the rear camera at the opponent. Aim the reticle inside their validated target outline until it locks, then say Fireball (after enabling voice) or tap the spell.
5. Keep the headband visible. Headband color and motion drive acquisition directly; no face or body is required. Rescan both bands when switching from the shirt version.
6. Keep the opponent visible during the 1.4-second flight. The 3D fireball steers toward the current detected target. Gameplay impact reporting runs independently of the renderer; rendering failures use a visible 2D fallback. Tracking gaps over 700ms cancel the hit; a fresh match is required at impact. Shield and Heal need no target.

Fireball: 25 damage / 1.4-second flight / 1.8-second cooldown / 3 mana. Lightning: 20 damage / 0.25-second flight / 2.5-second cooldown / 4 mana; bypasses shields. Shield: blocks every damaging spell except lightning for 3 seconds / 10-second cooldown / 3 mana. Heal: restores 20 / 12-second cooldown / 4 mana. Mana caps at 10 and continuously refills one unit every 1.5 seconds. Shield protection is evaluated at impact. A visible opponent gets a shield aura; your own shield adds a blue screen rim. Incoming fireballs approach from the locally tracked attacker, with an intensifying all-edge warning when their position is unknown. Sound effects unlock on a tap and can be muted. Highest health wins on timeout; last survivor otherwise. Solo practice retains a clearly labeled simulated target and camera view.

## One-person preview

Open `/?test=headband` or tap **Test my headband · 1 person**. Scan your headband, then frame your headband in the front camera. This uses the actual color and motion tracking pipeline; the sample represents the test target. No second player or multiplayer connection is needed. The name, headband confirmation, homing fireball, and target health are visible. **Reset target** restores 100 HP. This test does not establish how well two different headband colors separate; use the two-player arena for that.

## Recognition and privacy

Identity comes from a scanned red or blue headband. The camera is first searched for connected pixels close to the registered opponent color, with hue/saturation tolerance and a margin over the player's own color. Tiny speckles, very large regions, and shapes unlike a band are filtered. If there is no candidate color region, no person inference is run for that frame.

A lightweight color worker follows the band, independently of face/body models. Once a track is established, searches stay around its predicted location at native resolution for small bands; a full-frame scan every 750ms supports recovery. The loop targets approximately 30 updates per second with one frame in flight and no inference backlog. Actual speed depends on the phone. The overlay renders on animation frames and reuses its DOM nodes. Health bar, aim, and projectiles use the same band position.

Two observations establish a lock. Position and velocity smoothing, an 80ms prediction cap, and scale-relative association retain small/moving bands without jumping to a larger distant color patch. Ambiguous nearby candidates clear the lock. Visuals may persist for 400ms after an observation, but casting and impact require a confirmed observation no older than 180ms. Face/body models are retained for possible decoration but do not run in the gameplay tracking path.

Removing the face/body gate means matching-color paper or another similar object can be acquired as a band. Keep spare colored material out of the play area. This is a two-color game target, not authenticated person recognition. The earlier photo checks documented the face-gated version; they do not establish false-positive performance for this new color-only path.

The scan uses a narrow guide and accepts red or blue fabric. One player must use red and the other blue. The numerical color profile still uses the legacy `shirt` wire field for compatibility, but no shirt or torso color is used for identification. The small outline over the band shows the actual detected color region. All image processing remains on the device; only names, numerical color samples, and game events are shared.

Voice uses the browser's speech recognition service, which may process audio remotely. Complete interim spell words trigger casts; final transcripts do not duplicate them. Browser support and Siri settings can affect availability.

**This is a hackathon prototype, not reliable identity recognition.** Lighting changes, head turns, hidden/thin headbands, bystanders in matching bands, and distant/small bodies can defeat matching. A similar red/blue object near someone’s head can still produce a false match. Headband color does not authenticate a person. Start close together and test on the actual phones. Visual projectile depth is artistic; there is no real-world distance, surface occlusion, or shared AR map. The headband pipeline still needs testing on the actual bands and phones outdoors.

The server enforces player slots, round state, cooldowns, impact timing, shields, and health, but trusts the firing client to report whether tracking remained valid. It is not anti-cheat-secure. A disconnect or missing impact report causes no damage. Foreground camera tracking is required. In-memory state is lost on server restart.

## Hosting

One Node process serves the frontend and `/ws` multiplayer. Fly configuration is included: `fly launch --no-deploy`, `fly deploy --ha=false`, `fly scale count 1`. Choose the closest region. No database or Apple developer membership is needed. Use the same HTTPS link on both phones; Connection settings can override the backend for a separately hosted frontend. The existing owner-private Sites preview defaults to the temporary shared testing backend; update this URL when replacing the tunnel.

Optional `ALLOWED_ORIGINS` is a comma-separated browser origin allowlist; same origin is always allowed. Anyone with the public game URL can occupy a slot. This is for a small friends-only test. Deploy only one instance; multiple independent processes would create separate arenas.

## Verification

`npm test` covers color matching/ambiguity, connected regions, headband/person association helpers, fast headband motion/scale changes and ambiguity, screen crop coordinates, spell rules, tracking-loss misses, delayed impacts, shields at impact, replay/early-impact rejection, two-client WebSocket state, required headband registration, two-player capacity, reconnection, host control, and streaming voice behavior.

Third-party assets: Three.js (MIT), MediaPipe Tasks Vision (Apache-2.0), Google's EfficientDet Lite0 and BlazeFace short-range models. See `dist/vendor/THREE-LICENSE.txt` and `dist/vendor/mediapipe/NOTICE.txt`.
