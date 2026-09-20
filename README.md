# ClashMIT — browser spell tag

For remote hosting, costs, deployment from `main`, and step-by-step Porkbun DNS setup for **clashmit.lol**, see [Hosting and custom domain](docs/hosting-and-domain.md).

## Team setup

Repository: [spycoderyt/clashmit](https://github.com/spycoderyt/clashmit). The app is branded ClashMIT.

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

**On your phone:** open that exact HTTPS URL in Safari or Chrome, allow camera/microphone access when prompted, and enter your name. The game automatically connects to the server at this same URL; old saved server overrides are ignored. For a one-person tracking test, open `/?test=face` on your tunnel URL or tap **Try face lock on my own first**.

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
| Page opens but players are in different games | Everyone must use the same tunnel URL. Rejoin through that same URL; the server is selected automatically. |
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

Replace `<changed-files>` with the files you intend to commit, and use your actual branch name. Open a pull request on GitHub from your branch into `main`. Have a teammate review it, resolve any conflicts, then merge it. GitHub Actions runs tests and builds the container for pull requests and pushes to `main`. Branch protection and required checks are not configured yet; the team should review the check results before merging.

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
2. Use the existing root `Dockerfile`, which serves both the frontend and WebSocket game server. The included `railway.json` configures `/health`, restart retries, one replica, and no sleeping. Configure public networking to the app’s listening port and keep exactly **one running instance in one region**. Multiple instances would create separate in-memory arenas.
3. Enable automatic deployments. To require passing tests before deploying, enable Railway’s **Wait for CI** for the included GitHub Actions **Tests** workflow. The workflow is checked in; the Railway connection and setting still need to be enabled.
4. Verify a real deployment and multiplayer session at the Railway HTTPS URL before sharing it. Once the custom domain is configured, point `clashmit.lol` to this same service using the DNS values supplied by the host. Both the frontend and game automatically use that domain.

See [Railway’s GitHub autodeploy instructions](https://docs.railway.com/deployments/github-autodeploys). Once configured, deployments run remotely and no laptop or Cloudflare tunnel is needed for the shared game. Deployments still restart the in-memory arena, so coordinate merges outside demo rounds. The included `fly.toml` is an alternative manual deployment template, not an active GitHub deployment workflow.

## Face lock: how players are identified

Players are identified by their face, scanned once when they join. Nothing has to be worn or handed out, any number of people can play, and spells go to whoever is under the reticle.

**Joining.** Enter a name and tap Join game. The game asks for everything it needs straight away, one prompt after another: motion and compass, camera and microphone, then location. The face scan then opens by itself: a round selfie view with a ring that fills as it captures, and one instruction at a time (look straight, turn your head one way, then the other, then raise the phone as if aiming). It tells the player what to fix in plain words (move closer, centre your face, find brighter light), never waits more than a few seconds on a step, and closes itself with “You’re in!”. It takes about 10 seconds. Two skippable tips teach voice casting: aim and say an attack spell, then say Shield or Heal. They appear only for new players on this browser; skipping or finishing records the choice locally. They do not require an extra activation tap. The face scan opens automatically on joining; there are no Sound on or Rescan face buttons in the arena. Voice starts from the Join gesture, pauses for the face scan and while the page is hidden, resumes afterwards, and restarts when a speech session ends. Browsers still require microphone/speech permissions and may refuse speech on unsupported devices; the compact voice status explains errors. There is no Enable voice or Retry tracking button. Leave the arena to stop the microphone. The host's name appears in the waiting message.

**Playing.** Point the rear camera at another player. A box with their name and health appears once their face is recognised (“Face locked”); aim the reticle at it and cast. With more than two players, spells go to whoever is under the reticle. “Identifying… hold steady” means a face is seen but not yet named; “Too far to recognise” means it is under 32 px wide, so move closer. The legacy `/?test=face` route scans your own face and tracks you with the front camera, with no second player or server.

**Keeping the lock when the face is hidden.** Recognition needs a clear, large enough face, but following does not. Once three of five frames agree on who someone is, the name stays on that tracked head even in profile, where it can no longer be recognised. If the face disappears altogether (head turned away, phone raised in front of it), the person detector is woken up, the lock moves to the body that face belonged to, and the head position is estimated from the body box (“Following · face hidden”). When a face reappears there it is re-checked on fresh frames: the same player carries on, anyone else loses the name at once. A body alone holds a lock for at most six seconds, with no body the lock coasts for about a second, and a name never transfers by position alone.

**Phone in front of the face.** Players aim with the phone held up to their face, so opponents often see only the eyes and forehead. Every scan therefore also stores an *upper-face signature*: the same frames aligned on the two eyes alone, with everything below the eyes blanked. In play the whole face is tried first; when it has no clear opinion, the upper face is compared with those signatures instead. With a phone-sized block drawn over 22 sample faces the same person scored about 0.4 on the upper signature while the covered whole face drifted to about 0.9, and in the live pipeline 0.74 to 0.86 against 1.1; different people score about 1.2 to 1.35. A clearly visible different player is never overruled by similar eyes. The detector is also allowed a much lower score for a face it is already following than for a new one.

**People crossing in front.** A followed head is matched from frame to frame by position, so someone running past could briefly be mistaken for it. A hand-over that looks wrong (a jump of more than 0.6 face widths, a sudden size change, or two faces competing for one track) marks the track suspect: it is re-checked on the very next frame instead of once a second, and its last trusted position is kept. One clear look at another player, or two clear frontal looks that resemble the named player on neither signature, means it is not them: the intruder is split off into a track of their own and the named track returns to where the player was, carried by the body that was bound while their face was still visible. A body that suddenly differs in height by more than 40 percent is treated as someone nearer the camera, not the same person. Profiles and small faces never count against a name, a fast camera pan just triggers one immediate re-check, and an unresolvable suspicion lapses after two seconds.

**How it works.** `dist/face-engine.js` runs the SCRFD-500M detector and an ArcFace MobileFaceNet recogniser with ONNX Runtime Web inside `dist/face-worker.js`, so recognition never stalls the camera view or effects. `dist/face-tracker.js` feeds it cheap native-resolution windows around faces it is already following, a full-frame search every 0.7 s, and a zoomed search around the reticle for distant faces, and runs the MediaPipe person detector only while a named player’s face is hidden. `dist/face-tracks.js` holds the lock logic and `dist/face-id.js` the matching, voting and wire format, both with tests. `dist/face-scan.js` is the guided scan. Each player’s scan is up to eight 512-number signatures, sent once to the server as about 5 KB and relayed to the other players in a `faces` message rather than in the twice-a-second state broadcast. `/face-test.html` is a separate measuring page for range: enrol people, then record detection, right/wrong identification, score, face pixels and speed at set distances.

**Accuracy and range.** On still photos the same person scores 0.2 to 0.35 when the face is 56 px or wider, 0.4 to 0.6 at 44 px and 0.55 to 1.0 at 38 px, while different people score 1.2 to 1.4 (0 is identical, about 1.41 unrelated). A match needs a score under 1.0, a clear lead over every other player, a face at least 32 px wide and three of five frames in agreement, so an unclear face reads as unknown rather than as the wrong player. The game now asks the camera for 1080p; 35 px is roughly 6 m in the best case, and real blur, lighting and head angle will cost range. An earlier attempt with face-api’s dlib-based recogniser was dropped because it confused different people.

**Privacy and licence.** Camera video never leaves the phone. Two things from the scan are shared with the other players in the arena: the numeric face signatures, and one small face photo (96 px, cropped from the first straight-on frame) used as the player's marker on the minimap. Both are relayed once rather than in the state broadcast. The server accepts only a small base64 JPEG for the photo, so nothing scriptable can be passed to other players' pages. Face signatures are biometric data: the server keeps both in memory only, shares them only with players in the arena, and deletes them when a player leaves or times out; phones drop them on leaving. **The InsightFace model weights are licensed for non-commercial research only** (`dist/models/face/NOTICE.txt`): fine for this prototype, but they must be replaced, for example with OpenCV’s Apache-2.0 SFace and YuNet, before any commercial use. The runtime and models are about 30 MB, downloaded on the first scan and kept in the browser’s Cache Storage afterwards.

**Verified so far** only on a laptop with a simulated camera built from sample photos: the automatic scan after joining, recognition between two players, a spell landing on the recognised player, the lock holding through sideways movement and a fully hidden face, a steady “Face locked” for 4 s with everything below the eyes covered, re-identification from the eyes alone after a full reset, and the lock staying on the player while a larger person crossed in front. Not yet tested on phones: real lighting and distance, speed and heat on an iPhone, the phone-in-front-of-face case, and more than two players.

The earlier color-marker tracker (`dist/headband*.js`, `dist/shirt*.js`, `dist/color-worker.js`, `dist/palette.js`) and its design notes in `docs/` are still in the repository and the server still accepts its samples, but the game no longer uses them.

## Run and play

Node 22+: `npm ci`, `npm start`. Open http://localhost:3000 locally. Every phone needs the same **HTTPS** game URL, in Safari or Chrome. A temporary tunnel link works only while the host computer and its tunnel are running.

1. Enter a name and tap Join game, then allow the permission prompts.
2. Follow the face scan. A small face avatar and face signatures are shared with players in the arena, in memory only.
3. Enter the live arena immediately after scanning. There is no host start, round time limit, or last-player-standing ending.
4. Point the rear camera at another player. When their name and health appear, aim the reticle at them until it locks, then say your unlocked spell (Lightning, Poison or Arrows). Voice starts automatically on joining after permissions are allowed. All spells, including Shield and Heal, are voice-only; the spell cards display mana costs and cooldowns and cannot be tapped to cast. Both “heal” and the speech transcription “heel” activate Heal.
5. Keep your target in view during the 1.4-second flight. The 3D fireball steers toward them. If their face is hidden the lock follows their body; if they are lost for more than 700 ms the hit is cancelled. Shield and Heal need no target.

### Personas

Choose Mage, Witch or Archer. You start with Lightning, Poison or Arrows respectively. Each has a purchasable heavy attack and ultimate, plus shared consumable Shield, Heal and Flashbang. See **Coins, skills, kills and deaths** below for current damage, prices and delays. Voice-only attack cards show damage in hearts, mana, and cooldown. Mana caps at 10 and regenerates one unit every 1.5s. Shield protection is evaluated at impact; Lightning is the only normal shield-piercing spell. A well-timed shield can parry. Splash attacks clear skeletons on you with or without a locked opponent.

## Continuous arena and respawn

`npm start` and Railway start a continuous arena. Players can join and scan at any time; there is no host button, countdown to start, round deadline, last-standing winner, or end-of-round interruption. Railway's checked-in settings disable application sleeping and restart a failed process. Run one replica with a persistent volume for scores; active combat remains in memory and resets on a process restart.

On FFA death, the server sets a **10-second minimum respawn deadline** and opens the shop. After the countdown, press Respawn to return with 70 HP, full mana, and no lingering effects or cooldowns. Bought skills, upgrades, unused consumables and coins persist. Switching character is allowed while dead. Other modes eliminate you until the next round; reconnecting cannot revive you. Projectiles from a previous life cannot damage a new life. Open `/?test=respawn` for a sensor-free preview.

The original round mode remains available to internal callers of `createGameServer({continuous:false})` and its regression tests; the production entry point explicitly selects continuous mode.

## One-person preview

Open the legacy `/?test=face` test. Scan your face, then prop the phone up and step back in view of the front camera. This uses the real recognition and lock-on pipeline with yourself as the target. No second player or server is needed. **Reset target** restores 100 HP.

Open `/?test=solo&vs=witch` (or `vs=mage`, `vs=archer`) to play your chosen persona against a simulated opponent that casts its own deck back. It needs no camera, second player or server, and shows every incoming effect, status and clear on one device.

## Haptics and hit feedback

iPhone Safari has no vibration API, and since iOS 26.5 a web page cannot fire the Taptic Engine from code at all. What a player gets therefore depends on the phone:

| Phone | Spell button tap | Casts, hits and damage |
| --- | --- | --- |
| Android (Chrome) | short vibration | Real vibration patterns: a distinct rhythm per spell, a hit confirmation, a 1.4 s slam-stutter-slam when hit by a fireball, a jagged crackle for lightning, a shield-block buzz and a 2.8 s fading death pattern. |
| iPhone, iOS 26.5 or later | one faint native tick (fixed by iOS) | **Speaker rumble** with the same rhythms: a loud low-frequency growl that makes the phone buzz in the hand. Needs the ringer on and the volume up, and follows the Sound toggle. |
| iPhone, iOS 18 to 26.4 | one native tick | Speaker rumble plus tick-rhythm patterns from a hidden switch toggled by code. |

Taking damage also flashes a red vignette and briefly shakes the camera feed on every phone; the HUD stays still, and the shake is skipped for reduced-motion users. Damage feedback always overrides lighter feedback. Spell cards have no tap switches or click-to-cast handlers. The separate haptics test panel can still demonstrate an iPhone tap tick with **Settings → Sounds & Haptics → System Haptics** enabled. Stronger or longer Taptic feedback on iPhone would need a native app wrapper with Core Haptics. Everything lives in `dist/haptics.js`; open `/?test=haptics` to try each pattern on a phone.

**HUD preview.** Open `/?test=hud` for a sensor-free in-game preview with simulated players, automatic health changes, and example map positions. It does not join the server or request camera, microphone, or location access.

**Passive healing.** During live rounds, living connected players regenerate 5 HP (half a heart) every 4 seconds, up to 70 HP. It costs no mana, does not revive knocked-out players, and stops outside the round. Damage over time is resolved before each healing tick.

**Health HUD.** Seven pixel hearts (10 HP each) show your health with partial fills. Coin balance sits above them; skill cards sit above mana. The top-left panel shows the three richest active players with medals/portraits, and the bottom-right panel lists consumable stocks. The target health meter turns from green through yellow to red.

## Minimap

Location starts automatically after the Join permission prompts, whether permission or the server connection finishes first. Players who allow location share their position about once a second and see everyone else who does. Every player is a round face marker: the photo taken during their face scan inside a ring of their own color, or their initial until a photo arrives, with a faint circle for GPS uncertainty. A knocked-out player's marker turns grey with a red cross.

**Corner map.** A small rounded square in the top-right corner of the arena, alongside the header, centred on you and showing 50 m to each side. It turns with your compass heading (the orange **N** moves around it; without a compass it says “north up”), and players farther than 50 m pin to its edge as smaller markers. Your own marker sits in the middle in a white ring, under the others so it never hides a nearby player.

**Full-screen map.** Tap the corner map. It fills the screen, north up, and is dragged and pinched like any other map; there are no zoom buttons. It opens at the same 50 m scale and follows you until you move it, after which a **◎** button brings it back to you. Names appear under the markers, your marker's pointer shows which way your camera faces, **✕** closes it and **Stop sharing** ends location sharing.

**Style.** The map is drawn from vector data (OpenFreeMap tiles of OpenStreetMap data, rendered by MapLibre GL), not from map images, so it is sharp at every zoom and rotation and turns natively with the compass. The style has no text or icon layers at all: only land, water, green space, buildings and roads, with footpaths kept faint. Colors come from a theme in `dist/minimap-tiles.js`; **Midnight** (dark navy, slate-blue roads) is the default, and Neon, Ember, Blueprint and Paper are also defined. `/map-styles.html` shows them side by side and `?map=<theme>` on the game URL tries one in play. The first view of a new area takes a few seconds to arrive. If the map library or tiles cannot load (for example on a blocked network), the markers still work on a plain background.

Location is never required to play. Positions are held in server memory only and cleared when a player taps Stop sharing, leaves, or disconnects; markers fade after 10 seconds without an update and disappear after 30. Anyone in the arena can see the positions of players who are sharing, so share the game URL only with people you trust. The one-person face test never shows the map. Map data comes from `tiles.openfreemap.org`, so that service sees the phone’s IP address and which map squares it requested; no names or game data are sent to it. No API key is needed and the service sets no usage limit; its attribution is shown on the full-screen map.

Expect roughly ±3–10 m outdoors and ±10–50 m indoors, so players standing a few metres apart will overlap; the map is for finding each other across a field, not for aiming. Browsers stop location updates when the page is in the background. The map lives in `dist/minimap.js`, `dist/minimap-tiles.js`, `dist/minimap.css` and `dist/geo.js`; `dist/app.js` only creates it and passes it server state and face photos, and the server stores positions from `location` messages.

## Limits of this prototype

Voice uses the browser's speech recognition service, which may process audio remotely. Complete interim spell words trigger casts; final transcripts do not duplicate them. Browser support and Siri settings can affect availability.

**This is a hackathon prototype, not reliable identity recognition.** Lighting changes, distance, head angle and look-alikes can defeat matching, and a face signature does not authenticate a person. Start close together and test on the actual phones. Visual projectile depth is artistic; there is no real-world distance, surface occlusion, or shared AR map.

The server enforces player slots, round state, cooldowns, impact timing, shields, and health, but trusts the firing client to report whether tracking remained valid. It is not anti-cheat-secure. A disconnect or missing impact report cancels ordinary projectile damage; an already-launched orbital strike still resolves. Foreground camera tracking is required. In-memory state is lost on server restart.

## Hosting

One Node process serves the frontend and `/ws` multiplayer. Fly configuration is included: `fly launch --no-deploy`, `fly deploy --ha=false`, `fly scale count 1`. Choose the closest region. No database or Apple developer membership is needed. Use the same HTTPS link on both phones; The game connects to the same origin automatically. The legacy Sites preview uses the Railway production backend.

Optional `ALLOWED_ORIGINS` is a comma-separated browser origin allowlist; same origin is always allowed. Anyone with the public game URL can occupy a slot. This is for a small friends-only test. Deploy only one instance; multiple independent processes would create separate arenas.

## Verification

`npm test` covers knock-out detection, face-photo validation and relay for map markers, the shared round countdown, knock-out times and leaderboard order, face matching, frame voting, upper-face matching behind a raised phone, alignment, enrolment, signature encoding, lock-on through hidden faces and people crossing in front, face registration on the server, haptic pattern priorities, minimap distance/bearing/radar math, opt-in location sharing with clearing on stop and disconnect, screen crop coordinates, spell rules, tracking-loss misses, delayed impacts, shields at impact, replay/early-impact rejection, two-client WebSocket state, 31-player lobby admission, a 30-client infrastructure check, reconnection deadlines and silent sockets, slow-client backpressure, graceful server restarts, host control, streaming voice behavior, and the dormant color-marker helpers.

Third-party assets: Three.js (MIT), ONNX Runtime Web 1.30.0 (MIT), InsightFace buffalo_sc face models (non-commercial research only, `dist/models/face/NOTICE.txt`), MapLibre GL JS 6.10.0 (BSD-3-Clause, `dist/vendor/maplibre/LICENSE.txt`), map tiles by OpenFreeMap © OpenMapTiles with data © OpenStreetMap contributors (ODbL), MediaPipe Tasks Vision (Apache-2.0), Google's EfficientDet Lite0 and BlazeFace short-range models. See `dist/vendor/THREE-LICENSE.txt` and `dist/vendor/mediapipe/NOTICE.txt`.


## Coins, skills, kills and deaths

The front page, in-game top-left panel, and `/live` rank players by **current coin balance**. Players start at zero; a confirmed kill grants **50 coins**, once per victim life, including damage-over-time and orbital kills. This is a bounty, not a transfer: the victim keeps their balance for shopping. Face labels show the current kill reward. Spending reduces your rank. Trophies/Elo are removed; older profiles keep their identities and stats but start with zero coins unless they already have a coin balance.

Production players have **7 hearts / 70 HP**. Each class starts with only its quick attack; unlock the second attack for 60 coins, then the ultimate for 140. Upgrades cost 80 / 160 / 240 coins and add damage while keeping cooldown and flight delay unchanged. Purchases persist across lives and class changes. There are no automatic third-cast supers, and consumables have no upgrades.

| Class | Quick: damage / mana / cooldown | Heavy | Ultimate |
| --- | --- | --- | --- |
| Mage | Lightning: 10 / 2 / 1s | Fireball: 25 / 4 / 2.4s | Meteor: 60 / 10 / 15s |
| Witch | Poison: 5 + 6 over 3s / 1 / 1s | Skeletons: 25 over 5s / 4 / 5s | Soul Reaper: 60 / 10 / 15s |
| Archer | Arrows: 8 / 1 / 0.65s | Bomb Arrow: 25 / 4 / 2.4s | Ballista: 60 / 10 / 15s |

Paid names: Chain Lightning (14), Wildfire (32), Extinction (67); Plague (8 + 6 lingering), Bone Legion (35 lingering), Grim Reaper (67); Arrow Storm (12), Explosive Arrow (32), Railgun (67). Numbers are HP. Ultimates require and spend all 10 mana. Voice accepts base and upgraded names, common aliases including “heel” and “flash bank”, and bounded spelling variation; locked attacks and empty consumables remain server-rejected.

The FFA death screen is a shop with a 10-second minimum wait. Buy or upgrade skills, choose a character, and buy Shield (30 coins, 7s), Heal (30 coins, restores 50 HP, capped at 70), or Flashbang (50 coins, 3s blind/stun for other unshielded players within 10m of the caster; fresh GPS required). Press **Respawn** when ready after the countdown. Shield blocks all normal attacks/ultimates and Flashbang except Lightning, and clears poison/skeletons. Orbital Airstrike ignores shields. Inventory appears bottom-right, skills above mana, and coin balance above your hearts.

Every 5 consecutive kills earns one **Orbital Airstrike** charge. Tap the red button, tap a point on the full-screen map to see the **10m radius**, then hold for 0.8s to launch. Players inside see “Incoming orbital airstrike — get out of the 10m radius!” with **5 seconds to escape**. Movement and casting stay enabled. At impact the server checks the latest fresh locations, kills players still inside (including those who entered during the countdown), spares the caster, and awards each bounty once. Disconnecting preserves a warned player's last location for that strike; it does not cancel it. GPS uncertainty applies, particularly indoors: the on-screen radius is approximate and escaping depends on timely location updates.

The actual 3D rocket uses the CC0 modular meshes from [Kenney Space Kit](https://kenney.nl/assets/space-kit), bundled locally under `dist/models/rocket` with its license. Three.js animates a quadratic arc with perspective, tangent-aligned rotation and the caster's portrait near the tip. The warning leaves the camera visible and does not intercept movement controls.

When no active opponent with a fresh location is within 10m, the map opens with directions toward the nearest players. It closes below 8m to avoid GPS jitter repeatedly toggling it. Closing it manually pauses auto-opening for 15s. Unknown/stale locations are not treated as nearby. No location access means no automatic distance map or orbital targeting.

Backgrounding, leaving, and socket closure remove a player from public game state and clear their face/map markers. If a phone vanishes without sending a message, the server times out its heartbeat after about 8 seconds. The original browser token restores the same identity, balance, and purchases; a short private reconnect record does not appear in the arena. Non-FFA disconnects forfeit that round. No web app can guarantee receipt of a final message when the OS kills it.

Your current streak increases on each kill and resets on death. Each increase pops up the new streak number on screen. Every kill reaching streak 3 or higher also broadcasts the player name and new streak to everyone in the arena. The top three leaderboard ranks have gold, silver and bronze medals. Your best streak remains saved. A kill from an earlier life or after dying still counts as a kill but does not advance your new streak. A reconnect to the same life preserves the streak; a fresh life after a server restart or reconnect expiry resets the current streak without losing the best.

Kills, deaths, and best streaks are calculated and saved by the server immediately. Hit tracking still comes from the firing phone. Legacy points and Wins remain in the save file for compatibility; no last-standing or round-finish bonuses are awarded in continuous mode. Older leaderboard files retain names, points and reconnect identities; new death and streak fields start at zero because previous streaks cannot be reconstructed from total kills.

The normal server saves names, scores and hashed reconnect tokens atomically in `data/leaderboard.json`. No face signatures, avatars or locations are saved in that file. Keep `data/` private and out of Git. Tests default to an isolated in-memory score store. The browser keeps its private player token in local storage so leaving, refreshing and returning preserves the same score identity. Clearing site data or changing browsers loses that identity; a name alone cannot claim someone else's score. Reusing that name then requires the original browser or a different name.

**Railway persistence:** the ordinary container filesystem is temporary across deployments. To retain scores across redeploys, attach a persistent volume at `/app/data` (or set `DATA_DIR` to another mounted path), keep exactly one replica, and ensure the mounted directory is writable by the image's `node` user (UID/GID 1000). Creating the directory in the Docker image does not change permissions of a mounted volume. Railway mounts volumes as root; its documented quick setup for this non-root image is service variable `RAILWAY_RUN_UID=0` (runs the container process as root). Alternatively, arrange volume ownership for UID 1000. In the Railway project canvas use **New → Volume**, select the ClashMIT service, set mount path `/app/data`, then add service variables `DATA_DIR=/app/data` and `RAILWAY_RUN_UID=0`, and deploy the pending changes. See https://docs.railway.com/volumes. Back up `leaderboard.json`; do not share it publicly. Until the volume is configured, scores last only as long as Railway retains that container filesystem. The running round is still in memory and is not recovered after restart.

### Live spectator display

Open `/live` (for example, https://clashmit.lol/live) on a projector or another screen. It refreshes every second with the coin leaderboard, online count, and confirmed kills, including lingering damage. It never joins as a player or asks for camera, microphone, or location permissions. The bottom-right QR code opens https://clashmit.lol/ on players’ phones. `/live?demo=1` previews the layout with clearly labeled sample data.

The latest 100 kills are held in server memory and reset on a restart/deploy; leaderboard statistics continue to use the persistent score file. The read-only `/api/live` endpoint exposes only names, public statistics, online status, and kill events. It excludes face descriptors, locations, and player tokens. Tiny face portraits for the top three and current king are public on the leaderboard/live page; the scan screen explains this. Photos remain in memory and disappear when players leave or the server restarts.


## Local feature previews and round administration

- `/sounds.html`: recorded online meme clips, normal/upgraded casts, coin collection, airstrikes, impacts, volume and stop controls. Source/author links are shown below the buttons; licenses and edits are documented in `dist/media/memes/CREDITS.md`. Clips are bundled locally, preloaded after an audio gesture, and never fetched from a soundboard during combat.
- `/?test=airstrike`: sensor-free targeting and cinematic preview.
- `/effects.html`: choose a local photo and tap a face to preview the 50% red damage silhouette. The photo is never uploaded. Hold the tint to inspect its edges.
- `/?test=respawn`: FFA death shop with simulated coins, purchases, character selection and manual respawn.
- `/?test=eliminated`: non-FFA elimination screen.
- `/live?demo=1`: spectator layout using sample coin balances.

Set **`ADMIN_PASSWORD`** to a strong private password in Railway service variables before deploying the admin feature. For local testing, export it in the terminal before `npm start`. Never put it in frontend code, the README, or Git. Open `/admin`, sign in, and choose **Start FFA**, **Start King of the Hill**, **End round**, or **Mana surge**. Without that variable, the admin API is disabled. Sessions use HttpOnly/SameSite cookies, expire after eight hours and reset on server restart; wrong-password attempts are rate-limited. Starting a mode immediately resets current combat state and broadcasts the change. Ending a round stops combat and broadcasts results. Coins and purchases persist across all these transitions.

**FFA is the default stage.** FFA deaths get the normal 10-second respawn countdown. Choose Mage, Witch or Archer and shop while waiting; press Respawn after the countdown. The server applies the selection without shortening the delay. You cannot change persona while alive. In KOTH and future non-FFA modes, death eliminates you for the rest of the round. There is no respawn or character switch; reconnecting cannot revive that identity. Late arrivals spectate until the next round starts.

**King of the Hill** lasts three minutes and needs at least two scanned, connected players. A random living player starts with the crown; killing them transfers it to the living killer. On disconnect it transfers to another living player. The crown holder accumulates time; the most time wins, with kills/deaths breaking ties. The crown appears above the tracked face and beside the top-left coin standings. Round results rank KOTH by crown time. Global coin rankings remain on the front/live leaderboards.

**Upgrades replace supers:** buy them in the FFA death shop; there is no automatic cast counter. See the balance table above.

A blockable projectile hitting within **350ms** of raising a shield is **parried**: it reflects once, costs no extra mana, credits the defender, and cannot be parried again. Killing your previous killer grants **revenge**, a public announcement and 2 mana. The admin’s **Mana surge** event doubles mana regeneration for 20 seconds. Public kill/streak/round/crown/revenge announcements are sent to all players and the spectator screen. Other possible event additions: low-gravity projectiles, double-coin minute, or a rotating bounty; these are ideas, not active rules.

**Damage tint:** only the attacker receives a server-confirmed damage event, including damage-over-time. A separate CPU worker builds a small body silhouette, shown red at 50% opacity for 240ms. It never affects targeting or whether damage counts. Mask work runs only around an outgoing shot/damage, with one request in flight. Fresh tracking aligns the mask; stale masks are discarded. A face-only tint is used until a reliable body mask is ready. Segmentation can be imperfect at distance, with occlusion or overlapping people; test on the actual target iPhones. Camera frames and masks remain local.

**Slow-phone box motion:** display-only adaptive smoothing runs every animation frame, independently of recognition. Slow inference reduces optional body detection and full-scene search frequency while retaining follow crops. This does not extend target freshness or grant damage from stale locks. Test on actual iPhones under movement and low light; desktop tests only verify smoothing behavior and scheduling.

**Share card:** the home page title is “ClashMIT: Fireball your friends”. Open Graph/Twitter metadata use `media/social-gameplay-v1.jpg`, a 1200×630 composition from the supplied gameplay video. Preview services may cache the previous card until they fetch it again after deployment.

### Interface and device checks (local overhaul)

The HUD keeps the top coin standings left and the minimap right. Your coin balance and seven pixel hearts sit bottom-left, with icon-labeled consumables opposite them. Skills precede the mana bar. The front page, shop and live view share flat surfaces and locally bundled [IBM Plex Sans](https://www.ibm.com/plex/) typography. UI stat/consumable icons are from [Lucide](https://lucide.dev/) and the font/icon license files ship alongside the assets. No UI framework or remote font request is required at runtime.

Shield lasts 7s with a14s reuse delay; Heal restores50HP with an8s reuse delay; Flashbang disables nearby unshielded opponents for3s within10m with an8s reuse delay. Purchased attack upgrades retain their original delays. These values are a first balancing pass, not a substitute for a live playtest.

The face tracker skips repeated camera frames, rejects stale worker results after restarts, and deprioritizes body detection on slow devices. Overlay interpolation does not alter recognition confidence or hit freshness. Physical iPhone12 camera/ASR performance must still be measured on-device.

Upgraded first attacks (Chain Lightning, Plague, Arrow Storm) hit the locked target at full damage, then up to two nearest eligible opponents within 5 metres of that target at 50% damage. Plague spreads at half poison damage per second for the same duration. Extra hits require fresh location data; no GPS means the main hit still works without spread. Shields block spread except Chain Lightning. A miss, blocked primary, parry, or reflection cannot start a spread.

### Attack and melee previews

- `/upgrades.html`: play all base attacks, upgrades, and consumable effects with sound. The page uses the game renderers and shared balance data. It does not join the arena.
- `/melee.html`: test hand-controlled melee with a rear or front camera. The sword follows a hand anywhere in the camera view. Swing through a face box to hit. Each hit removes 5 HP from a local target, with a 1-second cooldown. Demo buttons test center/top swings, consecutive hits, misses, and a stationary hand. `Check tracking engine` loads and runs both models without opening the camera. Phone camera access requires HTTPS.
- Melee is an experiment. Face detection is not player identification. It sends no attacks to the game. Hand and face frames stay in a local worker. Screen overlap does not establish physical distance.
- Reaper image attribution: [MesserWoland / 1ur1, CC BY 2.0](https://commons.wikimedia.org/wiki/File:The_death.svg). See `dist/media/SOUL-REAPER-CREDITS.md`. Hand model source and license are in `dist/models/HAND-LANDMARKER-NOTICE.txt`.

### Coin progression and bounties

A normal kill pays 50 coins. Bounties increase with the victim's streak: 3–4 kills pay 100 coins, 5–6 pay 150, 7–8 pay 200, and 9–10 pay 250. Each further two kills adds 50 coins. This uses the victim's streak before death resets it. Projectiles, lingering damage, and orbital strikes use the same payment rule. Duplicate hit reports cannot pay twice. Kill, streak, bounty, and round notices go to every connected player.

Active combat also pays 10 coins per 30 eligible seconds (20 per minute). A server-accepted attack against an active opponent or damage refreshes a 60-second combat window. Payment requires another living player and a fresh connection. The required FFA respawn wait counts; idle shop time, offline time, lobby time, and heartbeats alone do not. Long server stalls do not award catch-up income. Paid coins persist; an unpaid partial interval can be lost on a server restart.

Both additional attacks cost 200 coins per class (60 + 140). Ten active minutes plus zero, three, or seven normal kills earns about 200, 350, or 550 coins. This targets all three attacks in one class within ten minutes if unlocks take priority. Consumables and upgrades use the same balance and can delay this. Full class upgrades cost another 480 coins. A 150-coin bounty adds 100 above the normal kill reward. Assists pay 20 coins to each non-killer who dealt damage within the previous 10 seconds of that victim’s current life. Each helper receives a private reward message.

The live display uses half the desktop screen for a GPS map. It shows active player positions and recent spell paths, impacts, and orbital zones. The leaderboard, kill feed, logo, and join QR use the other half. On phones, the sections stack. `/live?demo=1` shows test data; `/live` uses the real arena. Visible pages poll every 500 ms and pause when hidden. The public `/api/live` response includes recent player locations for this display. Positions and paths are GPS estimates, not camera tracking.
