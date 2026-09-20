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

### Test your own branch on your phone

Each developer runs their own server and tunnel. The phone sees the files in that developer’s checked-out branch, including uncommitted frontend edits. You do not need to push or merge into `main` to test on a phone.

**Install the tunnel tool once.** On macOS with Homebrew:

```bash
brew install cloudflared
cloudflared --version
```

For Windows or Linux, use the platform-specific installer from [Cloudflare’s downloads page](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/downloads/). Make sure `cloudflared --version` works in a new terminal. Quick Tunnels need no Cloudflare login or custom domain.

**Terminal 1: run your branch.** In your clone, switch to your existing feature branch (or create it with `git switch -c feature/my-feature`):

```bash
git switch feature/my-feature
git branch --show-current
npm ci
npm start
```

Check http://localhost:3000/health on the laptop; it should return `{"ok":true}`. Keep Terminal 1 running.

**Terminal 2: expose that local server over HTTPS.** Run:

```bash
cloudflared tunnel --url http://127.0.0.1:3000 --protocol http2 --edge-ip-version 4
```

Wait for the tunnel to report a registered connection, then copy its `https://…trycloudflare.com` URL. Leave Terminal 2 running as well.

**On your phone:** open that exact HTTPS URL in Safari or Chrome, allow camera/microphone access when prompted, and enter your name. In **Connection settings**, clear any saved Game server URL and save before joining; an empty override connects to this same tunnel. For a one-person tracking test, open `/?test=headband` on your tunnel URL or tap **Test my headband · 1 person**.

All phones testing the same multiplayer session must use the **same developer’s URL**. Different developers’ URLs lead to separate games. Do not use the shared demo or another teammate’s tunnel to test your branch. Camera and microphone access require HTTPS on phones; phone `localhost` refers to the phone, not the laptop.

After frontend edits, reload the phone page. After server edits or switching branches, stop Terminal 1 with Ctrl+C and run `npm start` again; the existing tunnel can stay running if the port stays 3000. Server restarts reset the arena. Stop both terminals with Ctrl+C when finished.

Keep that laptop awake, its server running, and its tunnel connected. If MIT Guest blocks the tunnel, connect the laptop to a phone hotspot. Phones only need internet access; they do not need to join that hotspot. The temporary URL may change when the tunnel restarts.

#### MIT Guest and other common tunnel problems

In our MIT Guest tests, the game worked locally but Cloudflare connections timed out or were reset; switching the host laptop to a phone hotspot restored the tunnel. A tunnel can print a public URL before its connection is usable. HTTP/2 uses TCP port 7844, so the command above cannot fix a network that blocks that port. QUIC uses UDP on the same port. See [Cloudflare’s firewall requirements](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/tunnel-with-firewall/).

| Symptom | What to check or do |
| --- | --- |
| Local `/health` does not load | Start `npm start` and check its terminal for errors before troubleshooting the tunnel. |
| Cloudflare error 1033, or repeated TLS resets/timeouts while local `/health` works | Switch the **host laptop** from MIT Guest to a phone hotspot. Keep the tunnel running while it retries; if it does not recover, restart it and share its new URL. |
| Cloudflare 502 / connection refused to the origin | The tunnel cannot reach the local game. Check that the server is running on the same port used by `--url`. |
| “Origin DNS error” or an old link fails | Verify both local `/health` and the current tunnel URL. Use the URL from your current tunnel terminal; do not assume an earlier shared address still works. |
| Page opens but players are in different games | Everyone must use the same tunnel URL. Clear saved Connection settings overrides and rejoin. |
| Phone still shows an older change | Verify `git branch --show-current`, restart the server if needed, then reload the phone page on your own tunnel URL. |
| Port 3000 is already in use | Stop your previous game server, or run on another port and update the tunnel to match. |

For a different port on macOS/Linux, run `PORT=3001 npm start`; in PowerShell, set `$env:PORT=3001` before `npm start`. Then use `--url http://127.0.0.1:3001` in Terminal 2. Do not stop another teammate’s or the demo’s server just to free a port.

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

**Current status:** GitHub stores `main`, but automatic deployment from it is not configured yet. The existing game backend runs on a laptop through a Cloudflare tunnel. The separately hosted Sites frontend is also not automatically updated by GitHub pushes. `clashmit.lol` was purchased through Porkbun but has not been connected. Merging a pull request currently updates source code only.

#### Deploy main manually for the shared demo

Give one person responsibility for the demo. Use a separate checkout/server running `main` so feature-branch edits do not change the demo unexpectedly. On the demo host, create this checkout once:

```bash
git clone https://github.com/spycoderyt/clashmit.git clashmit-demo
cd clashmit-demo
npm ci
npm test
npm start
```

Expose this server with its own tunnel using the phone-testing instructions above. If this laptop also runs a developer server, give the two servers different ports and point each tunnel to its corresponding port.

After reviewed changes are merged into `main`, wait until the current round ends, then stop the demo server with Ctrl+C. In the demo checkout:

```bash
git switch main
git pull --ff-only
npm ci
npm test
git rev-parse --short HEAD
npm start
```

Run these in order and stop if any command fails. The printed commit identifies the demo revision. Leave the existing tunnel running, verify `/health` through its HTTPS URL, then refresh the test phones and confirm they join the same arena. Each restart clears players, health, mana, and the current round because game state is in memory. This process updates only the server in this checkout; it does not publish the separate Sites frontend.

#### Planned automatic deployment from main

The intended flow is **feature branch → reviewed pull request → merge to `main` → hosting service deploys that commit → shared game URL updates**. Feature branches keep their own local tunnels and do not change the shared game.

Railway can provide this once the owner connects the repository:

1. Create a Railway service from `spycoderyt/clashmit`, grant repository access, and select `main` as its deployment branch.
2. Use the existing root `Dockerfile`, which serves both the frontend and WebSocket game server. Configure `/health` as the health-check path, public networking to the app’s listening port, and exactly **one running instance**. Multiple instances would create separate in-memory arenas.
3. Enable automatic deployments. To require passing tests before deploying, first add a GitHub Actions workflow running `npm ci` and `npm test` on pull requests and pushes to `main`, then enable Railway’s **Wait for CI**. That workflow and setting are not installed yet.
4. Verify a real deployment and multiplayer session at the Railway HTTPS URL before sharing it. Once the custom domain is configured, point `clashmit.lol` to this same service using the DNS values supplied by the host. Phones should leave Connection settings empty so both the frontend and game use that domain.

See [Railway’s GitHub autodeploy instructions](https://docs.railway.com/deployments/github-autodeploys). Once configured, deployments run remotely and no laptop or Cloudflare tunnel is needed for the shared game. Deployments still restart the in-memory arena, so coordinate merges outside demo rounds. The included `fly.toml` is an alternative manual deployment template, not an active GitHub deployment workflow.

## Multiplayer capacity work in progress

The lobby now accepts up to 12 connections, with a regression test for the limit. This is capacity plumbing only: camera targeting still selects one opponent, and red/blue bands cannot distinguish multiple individual players wearing the same color. Keep gameplay tests to two players until team health or unique player colors and multi-target tracking are implemented. The 12-player UI labels do not indicate complete multiplayer support.

One shared arena, exactly two players, no room codes. The first connected player controls three-minute rounds. Everyone enters their own name and scans a red or blue headband using the selfie camera. No badges or manual identity pairing. GPS and compass are used only by the optional minimap, never for identity or aiming.

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

## Face lock (experimental, on the `feature/face-lock` branch)

On this branch players are identified by face instead of by a red or blue headband, so nothing has to be handed out and the arena is no longer limited to two colors. The headband instructions elsewhere in this README describe `main`; the headband code is still in the repo but unused here.

**Joining.** Enter a name and tap Enter arena. The face scan opens by itself: a round selfie view with a ring that fills as it captures, and one instruction at a time (look straight, turn your head one way, then the other, then raise the phone as if aiming). It tells the player what to fix in plain words (move closer, centre your face, find brighter light), never waits more than a few seconds on a step, and closes itself with “You’re in!”. It takes about 10 seconds. **Scan face / Rescan face** in the top bar repeats it between rounds. The host can start once every player has scanned.

**Playing.** Point the rear camera at another player. A box with their name and health appears once their face is recognised (“Face locked”); aim the reticle at it and cast. With more than two players, spells go to whoever is under the reticle. “Identifying… hold steady” means a face is seen but not yet named; “Too far to recognise” means it is under 32 px wide, so move closer. **Test face lock · 1 person** (or `/?test=face`) scans your own face and tracks you with the front camera, with no second player or server.

**Keeping the lock when the face is hidden.** Recognition needs a clear, large enough face, but following does not. Once three of five frames agree on who someone is, the name stays on that tracked head even in profile, where it can no longer be recognised. If the face disappears altogether (head turned away, phone raised in front of it), the person detector is woken up, the lock moves to the body that face belonged to, and the head position is estimated from the body box (“Following · face hidden”). When a face reappears there it is re-checked on fresh frames: the same player carries on, anyone else loses the name at once. A body alone holds a lock for at most six seconds, with no body the lock coasts for about a second, and a name never transfers by position alone.

**Phone in front of the face.** Players aim with the phone held up to their face, so opponents often see only the eyes and forehead. Every scan therefore also stores an *upper-face signature*: the same frames aligned on the two eyes alone, with everything below the eyes blanked. In play the whole face is tried first; when it has no clear opinion, the upper face is compared with those signatures instead. With a phone-sized block drawn over 22 sample faces the same person scored about 0.4 on the upper signature while the covered whole face drifted to about 0.9, and in the live pipeline 0.74 to 0.86 against 1.1; different people score about 1.2 to 1.35. A clearly visible different player is never overruled by similar eyes. The detector is also allowed a much lower score for a face it is already following than for a new one.

**People crossing in front.** A followed head is matched from frame to frame by position, so someone running past could briefly be mistaken for it. A hand-over that looks wrong (a jump of more than 0.6 face widths, a sudden size change, or two faces competing for one track) marks the track suspect: it is re-checked on the very next frame instead of once a second, and its last trusted position is kept. One clear look at another player, or two clear frontal looks that resemble the named player on neither signature, means it is not them: the intruder is split off into a track of their own and the named track returns to where the player was, carried by the body that was bound while their face was still visible. A body that suddenly differs in height by more than 40 percent is treated as someone nearer the camera, not the same person. Profiles and small faces never count against a name, a fast camera pan just triggers one immediate re-check, and an unresolvable suspicion lapses after two seconds.

**How it works.** `dist/face-engine.js` runs the SCRFD-500M detector and an ArcFace MobileFaceNet recogniser with ONNX Runtime Web inside `dist/face-worker.js`, so recognition never stalls the camera view or effects. `dist/face-tracker.js` feeds it cheap native-resolution windows around faces it is already following, a full-frame search every 0.7 s, and a zoomed search around the reticle for distant faces, and runs the MediaPipe person detector only while a named player’s face is hidden. `dist/face-tracks.js` holds the lock logic and `dist/face-id.js` the matching, voting and wire format, both with tests. `dist/face-scan.js` is the guided scan. Each player’s scan is up to eight 512-number signatures, sent once to the server as about 5 KB and relayed to the other players in a `faces` message rather than in the twice-a-second state broadcast. `/face-test.html` is a separate measuring page for range: enrol people, then record detection, right/wrong identification, score, face pixels and speed at set distances.

**Accuracy and range.** On still photos the same person scores 0.2 to 0.35 when the face is 56 px or wider, 0.4 to 0.6 at 44 px and 0.55 to 1.0 at 38 px, while different people score 1.2 to 1.4 (0 is identical, about 1.41 unrelated). A match needs a score under 1.0, a clear lead over every other player, a face at least 32 px wide and three of five frames in agreement, so an unclear face reads as unknown rather than as the wrong player. The game now asks the camera for 1080p; 35 px is roughly 6 m in the best case, and real blur, lighting and head angle will cost range. An earlier attempt with face-api’s dlib-based recogniser was dropped because it confused different people.

**Privacy and licence.** Camera frames never leave the phone. Face signatures are biometric data: the server keeps them in memory only, shares them only with players in the arena, and deletes them when a player leaves or times out; phones drop them on leaving. **The InsightFace model weights are licensed for non-commercial research only** (`dist/models/face/NOTICE.txt`): fine for this prototype, but they must be replaced, for example with OpenCV’s Apache-2.0 SFace and YuNet, before any commercial use. The runtime and models are about 30 MB, downloaded on the first scan and kept in the browser’s Cache Storage afterwards.

**Verified so far** only on a laptop with a simulated camera built from sample photos: the automatic scan after joining, recognition between two players, a spell landing on the recognised player, the lock holding through sideways movement and a fully hidden face, a steady “Face locked” for 4 s with everything below the eyes covered, re-identification from the eyes alone after a full reset, and the lock staying on the player while a larger person crossed in front. Not yet tested on phones: real lighting and distance, speed and heat on an iPhone, the phone-in-front-of-face case, and more than two players.

## Haptics and hit feedback

iPhone Safari has no vibration API, and since iOS 26.5 a web page cannot fire the Taptic Engine from code at all. What a player gets therefore depends on the phone:

| Phone | Spell button tap | Casts, hits and damage |
| --- | --- | --- |
| Android (Chrome) | short vibration | Real vibration patterns: a distinct rhythm per spell, a hit confirmation, a 1.4 s slam-stutter-slam when hit by a fireball, a jagged crackle for lightning, a shield-block buzz and a 2.8 s fading death pattern. |
| iPhone, iOS 26.5 or later | one faint native tick (fixed by iOS) | **Speaker rumble** with the same rhythms: a loud low-frequency growl that makes the phone buzz in the hand. Needs the ringer on and the volume up, and follows the Sound toggle. |
| iPhone, iOS 18 to 26.4 | one native tick | Speaker rumble plus tick-rhythm patterns from a hidden switch toggled by code. |

Taking damage also flashes a red vignette and briefly shakes the camera feed on every phone; the HUD stays still, and the shake is skipped for reduced-motion users. Damage feedback always overrides lighter feedback. The iPhone tap tick comes from an invisible native switch laid over each spell button and needs **Settings → Sounds & Haptics → System Haptics**. Stronger or longer Taptic feedback on iPhone would need a native app wrapper with Core Haptics. Everything lives in `dist/haptics.js`; open `/?test=haptics` to try each pattern on a phone.

## Minimap (opt-in location sharing)

The multiplayer arena shows a small round map in the top-right corner. Tap it and allow **Location** (and **Motion & Orientation** on iPhone) to share your position and see every other player who has done the same. A real street map (OpenStreetMap) is drawn under the radar, centred on you and scaled so the outer ring is the stated radius. You are at the centre; other players are dots in their scanned headband color with a faint circle for GPS uncertainty. With a compass the radar is heading-up (the arrow is the way your camera faces and the orange **N** moves around the rim); without one it says “north up”. Tap the map again to enlarge it with names, distances, **− / Auto zoom / +** buttons and a **Stop sharing** button. The range adjusts automatically unless you zoom by hand, and players beyond it pin to the rim as smaller dots. If the map library or tiles cannot load (for example on a blocked network), the plain radar keeps working.

Location is never required to play. A player’s position is sent about once a second only after they tap the radar, is held in server memory only, and is cleared when they tap Stop sharing, leave, or disconnect. Dots fade after 10 seconds without an update and disappear after 30. Anyone in the arena can see the positions of players who opted in, so share the game URL only with people you trust. Solo practice and the one-person headband test never show the map. Map images come from `tile.openstreetmap.org`, so that service sees the phone’s IP address and which map squares it requested; no names or game data are sent to it. No API key is needed. OpenStreetMap’s tile policy allows light use with the attribution shown under the enlarged map; change `TILES` in `dist/minimap-tiles.js` to a keyed provider before a large event.

Expect roughly ±3–10 m outdoors and ±10–50 m indoors, so players standing a few metres apart will overlap; the map is for finding each other across a field, not for aiming. Browsers stop location updates when the page is in the background. The map lives in `dist/minimap.js`, `dist/minimap-tiles.js`, `dist/minimap.css` and `dist/geo.js`; `dist/app.js` only creates it and passes it server state, and the server stores positions from `location` messages.

## Recognition and privacy

Identity comes from a scanned red or blue headband. The camera is first searched for connected pixels close to the registered opponent color, with hue/saturation tolerance and a margin over the player's own color. Tiny speckles, very large regions, and shapes unlike a band are filtered. If there is no candidate color region, no person inference is run for that frame.

A lightweight color worker follows the band, independently of face/body models. Once a track is established, searches stay around its predicted location at native resolution for small bands; a full-frame scan every 750ms supports recovery. The loop targets approximately 30 updates per second with one frame in flight and no inference backlog. Actual speed depends on the phone. The overlay renders on animation frames and reuses its DOM nodes. Health bar, aim, and projectiles use the same band position.

Two observations establish a lock. Position and velocity smoothing, an 80ms prediction cap, and scale-relative association retain small/moving bands without jumping to a larger distant color patch. Ambiguous nearby candidates clear the lock. Visuals may persist for 400ms after an observation, but casting and impact require a confirmed observation no older than 180ms. Face/body models are retained for possible decoration but do not run in the gameplay tracking path.

Removing the face/body gate means matching-color paper or another similar object can be acquired as a band. Keep spare colored material out of the play area. This is a two-color game target, not authenticated person recognition. The earlier photo checks documented the face-gated version; they do not establish false-positive performance for this new color-only path.

The scan uses a narrow guide and accepts red or blue fabric. One player must use red and the other blue. The numerical color profile still uses the legacy `shirt` wire field for compatibility, but no shirt or torso color is used for identification. The small outline over the band shows the actual detected color region. All image processing remains on the device; only names, numerical color samples, game events, and the position of players who opt in to the minimap are shared.

Voice uses the browser's speech recognition service, which may process audio remotely. Complete interim spell words trigger casts; final transcripts do not duplicate them. Browser support and Siri settings can affect availability.

**This is a hackathon prototype, not reliable identity recognition.** Lighting changes, head turns, hidden/thin headbands, bystanders in matching bands, and distant/small bodies can defeat matching. A similar red/blue object near someone’s head can still produce a false match. Headband color does not authenticate a person. Start close together and test on the actual phones. Visual projectile depth is artistic; there is no real-world distance, surface occlusion, or shared AR map. The headband pipeline still needs testing on the actual bands and phones outdoors.

The server enforces player slots, round state, cooldowns, impact timing, shields, and health, but trusts the firing client to report whether tracking remained valid. It is not anti-cheat-secure. A disconnect or missing impact report causes no damage. Foreground camera tracking is required. In-memory state is lost on server restart.

## Hosting

One Node process serves the frontend and `/ws` multiplayer. Fly configuration is included: `fly launch --no-deploy`, `fly deploy --ha=false`, `fly scale count 1`. Choose the closest region. No database or Apple developer membership is needed. Use the same HTTPS link on both phones; Connection settings can override the backend for a separately hosted frontend. The existing owner-private Sites preview defaults to the temporary shared testing backend; update this URL when replacing the tunnel.

Optional `ALLOWED_ORIGINS` is a comma-separated browser origin allowlist; same origin is always allowed. Anyone with the public game URL can occupy a slot. This is for a small friends-only test. Deploy only one instance; multiple independent processes would create separate arenas.

## Verification

`npm test` covers color matching/ambiguity, connected regions, headband/person association helpers, fast headband motion/scale changes and ambiguity, screen crop coordinates, spell rules, tracking-loss misses, delayed impacts, shields at impact, replay/early-impact rejection, two-client WebSocket state, required headband registration, two-player capacity, reconnection, host control, streaming voice behavior, face matching, frame voting, alignment, enrolment, signature encoding, lock-on tracking through hidden faces, face registration on the server, haptic pattern priorities, minimap distance/bearing/radar math, and opt-in location sharing with clearing on stop and disconnect.

Third-party assets: Three.js (MIT), ONNX Runtime Web 1.30.0 (MIT), InsightFace buffalo_sc face models (non-commercial research only, `dist/models/face/NOTICE.txt`), Leaflet 1.9.4 (BSD-2-Clause, `dist/vendor/leaflet/LICENSE`), map data © OpenStreetMap contributors (ODbL), MediaPipe Tasks Vision (Apache-2.0), Google's EfficientDet Lite0 and BlazeFace short-range models. See `dist/vendor/THREE-LICENSE.txt` and `dist/vendor/mediapipe/NOTICE.txt`.
