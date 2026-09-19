# Fieldspell — first GPS field test

One shared arena. Each player enters their own name. The first player becomes the controller and starts three-minute rounds. If the controller disconnects, control passes to another connected player. Supports up to 12 players. No room codes, badges, identity pairing, or accounts.

## Run

Requires Node 22 or later. `npm ci`, then `npm start`. Open http://localhost:3000 on the computer. `npm test` exercises spell rules, bearing math, and actual multiplayer WebSocket connections.

Phones must access an **HTTPS** address to use the sensors. A laptop's plain HTTP LAN address will not suffice. For the field test, deploy this same app to Fly.io. One server hosts both the interface and multiplayer connection. No paid frontend service, database, domain, or Apple membership is required.

## Host on Fly.io

Create a Fly.io account and install its CLI. From this folder:

1. `fly auth login`
2. `fly launch --no-deploy` — choose a unique app name and the region closest to the field. Keep the included configuration; decline databases and other add-ons.
3. `fly deploy --ha=false` — avoid creating an extra machine. All arena state lives in one process.
4. `fly scale count 1` — verify exactly one machine. A restart ends the match; this prototype does not persist matches.
5. `fly open` — everyone opens this same HTTPS URL in Safari. Leave Connection settings empty when the interface is served by this server.

Budget approximately $10–20/month for this small field-test setup, depending on region and usage. This is an estimate, not a billing cap. Do not add a database, dedicated IPv4 address, or volume. The provided config keeps the machine awake during games.

If using the separately hosted Sites interface, enter the Fly HTTPS address under Connection settings on every phone. Sites access remains owner-private unless deliberately shared. The Fly URL serves the complete app directly and is the simplest way to test together.

Optional `ALLOWED_ORIGINS` is a comma-separated browser origin allowlist; the same origin is always allowed. The server defaults to allowing browser connections so the separate preview works. The public arena has no admission password and names are not verified identities: anyone who learns the address can join. This is for an informal friends-only field test, not public competitive play. It includes bounded messages and rate limits, but no comprehensive abuse prevention.

## Play

1. Each player enters a unique name and joins the shared arena.
2. Tap Enable camera. Allow camera, Motion & Orientation, and precise location when the browser asks. Location is shared with everyone in the arena. Frames are not uploaded.
3. Hold the phone upright in portrait. Spread out outdoors, initially roughly 20–50 metres apart. Each player should check their displayed GPS accuracy.
4. The first player taps Start round. Aim at a GPS label for about 0.35 seconds, then tap Fireball or tap Enable voice once, then say “Fireball”. Shield and Heal work without a target. Voice stays on in the foreground until you tap to stop it; the app shows recognized words and specific speech errors. Voice recognition support varies; Safari can require Siri enabled. The browser's speech provider may process audio remotely. No paid speech API is configured.
5. Fireball does 25 damage, Shield blocks hits for 3 seconds, Heal restores 20 health. The server enforces health, cooldowns, round timing and nearby/fresh locations for attacks. Last surviving player wins; after 3 minutes the highest health wins, including ties.

## What this experiment can and cannot establish

Labels are **fixed-height directional GPS markers, not health bars attached to detected heads**. No person recognition, shared AR map, UWB or Bluetooth ranging is used. High accuracy is a browser request, not a centimetre-level guarantee. Direction and distance include errors from both phones. The combined error shown is a heuristic using reported accuracy, not a validated relative-position confidence bound. Magnetic compass errors and true/magnetic north differences can cause additional drift.

The browser uses Apple's heading on iPhone, with absolute orientation as a fallback where supported. It smooths heading and requires an upright portrait phone. Device-specific camera/heading alignment needs a real iPhone field test; no claim of accurate world-locked AR is made. Labels can appear through obstacles, since GPS supplies no visibility information.

Fireball uses a coarse directional selection within 10 degrees, maximum 150m, fresh positions under 10 seconds old, reported accuracy at most 20m per phone, and a conservative overlap check. It pauses when players are too close relative to estimated error. Label placement assumes a broad 96-degree display span rather than a calibrated camera lens. These defaults are for finding failure modes, not reliable physical hit adjudication. Shield and Heal are server-verified; aim is client-trusted.

Keep the browser foregrounded and screen awake. Backgrounded iPhones can suspend the connection and sensors. Reconnection preserves identity for up to 60 seconds; stale positions are removed from aim selection. Player location stops sharing when Stop or Leave is tapped. Server-side location expires for targeting after 10 seconds, clears on disconnect, and match state exists only in memory. Browser session storage holds a reconnect token; local storage holds the chosen name/server address.

Solo practice opens the rear camera, with a permission prompt if needed, and places a simulated target over the live view. It requires no location or compass access. Camera permission failures leave an Enable camera retry button. The target remains simulated: practice does not validate real-world GPS accuracy or multiplayer network quality.

## Field acceptance checks still required

Test on two iPhones before assembling six players: compass alignment in all four cardinal directions, GPS label drift at 10/25/50m, crossing and overlapping players, permission denial, spoken spell reliability, interrupted connectivity and resume. Measure observed cast delay and compare the displayed connection round-trip time. This project has not yet been tested with physical phones in a park.

## 3D fireball visual

Fireballs use a locally bundled Three.js perspective scene over the camera: a near launch, receding glowing projectile, particle trail, and impact burst. This is visual depth only, with compressed distances and an estimated endpoint fixed at cast time. It does not provide AR world tracking, real occlusion, or physically dodgeable projectile collisions; server hit timing remains immediate. Browsers without WebGL fall back to 2D feedback. Reduced Motion uses a static spell label instead of moving or flashing effects.

## Early voice casting

The browser now casts when a complete spell name first appears in an interim transcript, without waiting for the final transcript or the end of an utterance. Duplicate interim updates, corrected spell names in the same command slot, and finalization do not re-cast that slot. Additional spell names in a growing utterance can cast separately, subject to normal game cooldowns. This is speculative: a recognition error can trigger a spell before the transcript is corrected. It cannot bypass the browser speech engine’s time to first partial result; no device latency improvement is claimed until measured on a phone. The listener remains active between casts.
