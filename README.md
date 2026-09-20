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

**Joining.** Enter a name and tap Join game. The game asks for everything it needs straight away, one prompt after another: motion and compass, camera and microphone, then location. The face scan then opens by itself: a round selfie view with a ring that fills as it captures, and one instruction at a time (look straight, turn your head one way, then the other, then raise the phone as if aiming). It tells the player what to fix in plain words (move closer, centre your face, find brighter light), never waits more than a few seconds on a step, and closes itself with “You’re in!”. It takes about 10 seconds. **Scan face / Rescan face** in the top bar repeats it between rounds. The host can start once every player has scanned. Browsers cannot merge permission prompts into one, and iPhone asks for speech recognition separately the first time **Enable voice** is tapped.

**Playing.** Point the rear camera at another player. A box with their name and health appears once their face is recognised (“Face locked”); aim the reticle at it and cast. With more than two players, spells go to whoever is under the reticle. “Identifying… hold steady” means a face is seen but not yet named; “Too far to recognise” means it is under 32 px wide, so move closer. **Try face lock on my own first** on the join screen (or `/?test=face`) scans your own face and tracks you with the front camera, with no second player or server.

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
2. Follow the face scan. No photo is saved or uploaded.
3. The first player to join taps Start round once everyone has scanned.
4. Point the rear camera at another player. When their name and health appear, aim the reticle at them until it locks, then say Fireball (after enabling voice) or tap the spell.
5. Keep your target in view during the 1.4-second flight. The 3D fireball steers toward them. If their face is hidden the lock follows their body; if they are lost for more than 700 ms the hit is cancelled. Shield and Heal need no target.

### Personas

Each player picks a persona in the lobby. A persona is a deck of four spells in a fixed order: an attack a shield blocks, an attack it cannot block, then Shield and Heal, which are the same for everyone. Each spell is cast by saying the one word on its button; only the words of your own deck cast. The server enforces decks, and a returning player may change persona before a round but not during one.

| Persona | Slot 1 · blockable | Slot 2 · ignores Shield |
|---|---|---|
| Mage · burst | **Fireball**: 25 damage / 1.4 s flight / 1.8 s cooldown / 3 mana / splash | **Lightning**: 20 damage / 0.25 s flight / 2.5 s cooldown / 4 mana |
| Witch · attrition | **Poison**: 5 on impact then 3 per second for 5 s, 20 in all / 1.2 s flight / 2.5 s cooldown / 3 mana / splash | **Skeletons**: an army marches for 1.5 s and must be tracked like any flight; once it lands it deals 5 per second for 6 s, 30 in all, with no further aiming / 9 s cooldown / 4 mana |
| Archer · tempo | **Arrows**: 10 damage / 0.5 s flight / 0.6 s cooldown / 1 mana / splash | **Zap**: 8 damage / 0.15 s flight / 1.5 s cooldown / 2 mana / stuns for 0.5 s, during which the target cannot cast |

Shield: blocks every slot-1 attack for 3 seconds / 10-second cooldown / 3 mana. Heal: restores 20 / 12-second cooldown / 4 mana; it does not cure poison or remove skeletons. Skeletons on you are cleared at once by casting any splash spell (Fireball, Poison or Arrows), with or without a locked target. Re-applying poison or skeletons refreshes them; they do not stack. Lingering damage is settled by the server on its 500 ms tick, before it judges the round. Every attack has its own hit sound, and lingering damage ticks once a second. These numbers are untuned prototype values. Mana caps at 10 and continuously refills one unit every 1.5 seconds. Shield protection is evaluated at impact. A visible opponent gets a shield aura and your own shield adds a screen rim, both in the caster’s persona color. Incoming fireballs approach from the locally tracked attacker, with an intensifying all-edge warning when their position is unknown. Sound effects unlock on a tap and can be muted. Highest health wins on timeout; last survivor otherwise. Solo practice retains a clearly labeled simulated target and camera view.

## Round start and end

Whenever the host taps **Start round** or **New round**, every phone shows the same 5-4-3-2-1 countdown and then “GO!”. The server picks the start moment and each phone counts down to it on its synchronised clock, with a tick felt on each second. Nothing can be cast, and nobody new can join or rescan, until the round opens; if players drop out during the countdown so that fewer than two remain, it is abandoned and the arena returns to the lobby.

When a round ends the view darkens and a leaderboard appears: survivors first by remaining health, then everyone who was knocked out, latest first, with medals for the top three and the time each player went out. The server records the moment a player reaches zero health (`diedAt`) and the round's `startsAt`; the order comes from `rankPlayers` in `dist/rules.js` and the screens from `dist/round-overlay.js`. The bottom controls stay usable, so the host can start the next round from the leaderboard.

## One-person preview

Open `/?test=face` or tap **Try face lock on my own first**. Scan your face, then prop the phone up and step back in view of the front camera. This uses the real recognition and lock-on pipeline with yourself as the target. No second player or server is needed. **Reset target** restores 100 HP.

Open `/?test=solo&vs=witch` (or `vs=mage`, `vs=archer`) to play your chosen persona against a simulated opponent that casts its own deck back. It needs no camera, second player or server, and shows every incoming effect, status and clear on one device.

## Haptics and hit feedback

iPhone Safari has no vibration API, and since iOS 26.5 a web page cannot fire the Taptic Engine from code at all. What a player gets therefore depends on the phone:

| Phone | Spell button tap | Casts, hits and damage |
| --- | --- | --- |
| Android (Chrome) | short vibration | Real vibration patterns: a distinct rhythm per spell, a hit confirmation, a 1.4 s slam-stutter-slam when hit by a fireball, a jagged crackle for lightning, a shield-block buzz and a 2.8 s fading death pattern. |
| iPhone, iOS 26.5 or later | one faint native tick (fixed by iOS) | **Speaker rumble** with the same rhythms: a loud low-frequency growl that makes the phone buzz in the hand. Needs the ringer on and the volume up, and follows the Sound toggle. |
| iPhone, iOS 18 to 26.4 | one native tick | Speaker rumble plus tick-rhythm patterns from a hidden switch toggled by code. |

Taking damage also flashes a red vignette and briefly shakes the camera feed on every phone; the HUD stays still, and the shake is skipped for reduced-motion users. Damage feedback always overrides lighter feedback. The iPhone tap tick comes from an invisible native switch laid over each spell button and needs **Settings → Sounds & Haptics → System Haptics**. Stronger or longer Taptic feedback on iPhone would need a native app wrapper with Core Haptics. Everything lives in `dist/haptics.js`; open `/?test=haptics` to try each pattern on a phone.

## Minimap (opt-in location sharing)

The multiplayer arena shows a small round map in the top-right corner. Tap it and allow **Location** (and **Motion & Orientation** on iPhone) to share your position and see every other player who has done the same. Players who allowed location when they joined are sharing already. A real street map (OpenStreetMap, recolored to a dark navy that matches the HUD) is drawn under the radar, centred on you and scaled so the outer ring is the stated radius. Every player is a round face marker: the photo taken during their face scan inside a ring of their own color, or their initial until a photo arrives, with a faint circle for GPS uncertainty. You are at the centre in a white ring, drawn beneath the others so you never hide a nearby player. With a compass the radar is heading-up (the arrow is the way your camera faces and the orange **N** moves around the rim); without one it says “north up”. Tap the map again to enlarge it with names, distances, **− / Auto zoom / +** buttons and a **Stop sharing** button. The range adjusts automatically unless you zoom by hand, and players beyond it pin to the rim as smaller dots. If the map library or tiles cannot load (for example on a blocked network), the plain radar keeps working.

Location is never required to play. A player’s position is sent about once a second only after they allow location on joining or tap the radar, is held in server memory only, and is cleared when they tap Stop sharing, leave, or disconnect. Dots fade after 10 seconds without an update and disappear after 30. Anyone in the arena can see the positions of players who opted in, so share the game URL only with people you trust. The one-person face test never shows the map. Map images come from `tile.openstreetmap.org`, so that service sees the phone’s IP address and which map squares it requested; no names or game data are sent to it. No API key is needed. OpenStreetMap’s tile policy allows light use with the attribution shown under the enlarged map; change `TILES` in `dist/minimap-tiles.js` to a keyed provider before a large event.

Expect roughly ±3–10 m outdoors and ±10–50 m indoors, so players standing a few metres apart will overlap; the map is for finding each other across a field, not for aiming. Browsers stop location updates when the page is in the background. The map lives in `dist/minimap.js`, `dist/minimap-tiles.js`, `dist/minimap.css` and `dist/geo.js`; `dist/app.js` only creates it and passes it server state, and the server stores positions from `location` messages.

## Limits of this prototype

Voice uses the browser's speech recognition service, which may process audio remotely. Complete interim spell words trigger casts; final transcripts do not duplicate them. Browser support and Siri settings can affect availability.

**This is a hackathon prototype, not reliable identity recognition.** Lighting changes, distance, head angle and look-alikes can defeat matching, and a face signature does not authenticate a person. Start close together and test on the actual phones. Visual projectile depth is artistic; there is no real-world distance, surface occlusion, or shared AR map.

The server enforces player slots, round state, cooldowns, impact timing, shields, and health, but trusts the firing client to report whether tracking remained valid. It is not anti-cheat-secure. A disconnect or missing impact report causes no damage. Foreground camera tracking is required. In-memory state is lost on server restart.

## Hosting

One Node process serves the frontend and `/ws` multiplayer. Fly configuration is included: `fly launch --no-deploy`, `fly deploy --ha=false`, `fly scale count 1`. Choose the closest region. No database or Apple developer membership is needed. Use the same HTTPS link on both phones; The game connects to the same origin automatically. The legacy Sites preview uses the Railway production backend.

Optional `ALLOWED_ORIGINS` is a comma-separated browser origin allowlist; same origin is always allowed. Anyone with the public game URL can occupy a slot. This is for a small friends-only test. Deploy only one instance; multiple independent processes would create separate arenas.

## Verification

`npm test` covers face-photo validation and relay for map markers, the shared round countdown, knock-out times and leaderboard order, face matching, frame voting, upper-face matching behind a raised phone, alignment, enrolment, signature encoding, lock-on through hidden faces and people crossing in front, face registration on the server, haptic pattern priorities, minimap distance/bearing/radar math, opt-in location sharing with clearing on stop and disconnect, screen crop coordinates, spell rules, tracking-loss misses, delayed impacts, shields at impact, replay/early-impact rejection, two-client WebSocket state, 31-player lobby admission, a 30-client infrastructure check, reconnection deadlines and silent sockets, slow-client backpressure, graceful server restarts, host control, streaming voice behavior, and the dormant color-marker helpers.

Third-party assets: Three.js (MIT), ONNX Runtime Web 1.30.0 (MIT), InsightFace buffalo_sc face models (non-commercial research only, `dist/models/face/NOTICE.txt`), Leaflet 1.9.4 (BSD-2-Clause, `dist/vendor/leaflet/LICENSE`), map data © OpenStreetMap contributors (ODbL), MediaPipe Tasks Vision (Apache-2.0), Google's EfficientDet Lite0 and BlazeFace short-range models. See `dist/vendor/THREE-LICENSE.txt` and `dist/vendor/mediapipe/NOTICE.txt`.


## Points, Wins and leaderboard

The front page shows the public standings below the name form, refreshing every five seconds. Only display names and gameplay scores appear there. Every player has total points, Wins, knockouts, rounds played and an overall rank. Your HUD and target labels show overall rank; the end screen separately shows round placement, points earned, total points, Wins and overall rank.

- Damage: **1 point per actual HP removed**, capped at 100 per opponent per round. Overkill earns only the remaining HP; healing cannot farm extra damage points beyond that cap.
- Knockout: **50 points** for the hit that reduces an opponent to zero.
- Last player standing: **200 points + 1 Win**. Being ahead on health at the time limit does not count as a Win when other players are still alive.
- Finish: **25 points** for remaining through a completed round (including being knocked out). Leaving alive, or expiring after the 60-second reconnect grace period, forfeits this bonus. Earned damage/KO points still count.
- Misses, blocked hits, practice, abandoned countdowns and unfinished rounds on server shutdown earn no additional points. Completed results are credited once. Overall ranks sort total points, then Wins, then knockouts; exact ties share rank.

Scores are calculated on the server from accepted impacts. Existing tracking reports are still trusted from the firing phone; this does not add cheat-proof hit validation. Rankings use **completed rounds**; the HUD separately shows provisional points from the current round.

The normal server saves names, scores and hashed reconnect tokens atomically in `data/leaderboard.json`. No face signatures, avatars or locations are saved in that file. Keep `data/` private and out of Git. Tests default to an isolated in-memory score store. The browser keeps its private player token in local storage so leaving, refreshing and returning preserves the same score identity. Clearing site data or changing browsers loses that identity; a name alone cannot claim someone else's score. Reusing that name then requires the original browser or a different name.

**Railway persistence:** the ordinary container filesystem is temporary across deployments. To retain scores across redeploys, attach a persistent volume at `/app/data` (or set `DATA_DIR` to another mounted path), keep exactly one replica, and ensure the mounted directory is writable by the image's `node` user (UID/GID 1000). Creating the directory in the Docker image does not change permissions of a mounted volume. Railway mounts volumes as root; its documented quick setup for this non-root image is service variable `RAILWAY_RUN_UID=0` (runs the container process as root). Alternatively, arrange volume ownership for UID 1000. In the Railway project canvas use **New → Volume**, select the ClashMIT service, set mount path `/app/data`, then add service variables `DATA_DIR=/app/data` and `RAILWAY_RUN_UID=0`, and deploy the pending changes. See https://docs.railway.com/volumes. Back up `leaderboard.json`; do not share it publicly. Until the volume is configured, scores last only as long as Railway retains that container filesystem. The running round is still in memory and is not recovered after restart.
