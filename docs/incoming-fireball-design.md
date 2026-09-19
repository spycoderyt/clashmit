# Incoming fireballs: recommended next increment

Investigated and implemented on 2026-09-19. `dist/incoming-fireball.js` now owns the incoming shot lifecycle and warning; `dist/fireball.js` supports an approaching perspective projectile and elapsed-time compensation. App/protocol integration is maintained alongside this work. The investigation notes below explain the design and remaining limitations.

## Recommendation

Use a shared **shot identity and timeline**, with each phone drawing its own camera-relative view. When the receiving phone reliably sees the attacker's registered headband, show a small fireball near that detected head/upper-body region and animate it toward the camera, growing through perspective. If the attacker is not reliably visible, show an amber/orange warning around **all four edges**, increasing in intensity as arrival approaches. Do not guess an offscreen bearing.

This fits the two-player, headband-based browser game. It does not need GPS, compass, pairing, or a shared AR map. The projectile is a convincing gameplay visualization, not a surveyed trajectory through the park. Seeing a player in an image gives a screen position, not a shared metric 3D position; both phones can agree on who attacked whom and when without agreeing on physical coordinates.

## Baseline at investigation start

- `dist/rules.js`: `launchFireball()` creates a unique `shotId`, `actorId`, `targetId`, server `at`, and `flightMs` (currently 1,400 ms).
- `server/index.js`: the launch event goes to both players immediately over the existing WebSocket. No new connection infrastructure is required.
- `dist/app.js`: only launches whose `actorId === myId` currently start a flight. The receiver gets a flash after the impact event, but no incoming-flight animation.
- `dist/fireball.js`: the transparent Three.js overlay already supplies perspective, a glowing sphere, trail, and impact burst. An incoming path can reuse these assets.
- `dist/app.js`: `matchedPerson()` identifies the sole opponent and provides camera-overlay coordinates. Reuse its image-to-screen mapping; do not send the attacker's camera coordinates to the receiver, because they refer to different views.

## Receiver presentation

1. On a fireball launch addressed to `myId`, create one incoming effect keyed by `shotId`. Draw a light edge warning immediately, even when the attacker is visible.
2. If the current opponent match is confirmed and fresh, use its visible head/upper-body position as the source. Reuse the same object-fit/crop mapping as the target indicator. A detected head is adequate; avoid requiring a full-body or hand position.
3. Animate a perspective path from an illustrative far depth to a point close to the camera. Keep the arrival near the center or slightly below it, preserve shield-button visibility, and make the growing size and trail communicate approach. The depth is an artistic parameter, not a distance measurement.
4. Smooth source-coordinate updates while the attacker remains visible. Do not repeatedly restart the shot or reset its progress. Camera motion cannot be fully compensated from the opponent's 2D coordinates; accept this limitation for the prototype.
5. If tracking disappears, allow a brief visual grace of about 150–250 ms, then fade the spatial projectile into the all-edge warning. A border-only warning is preferable to leaving a fireball attached to an incorrect position after the phone turns. This visual grace should be separate from gameplay's existing 700 ms tracking grace.
6. If the attacker reappears early in flight, blend back into a projectile at the **current** progress. Very late in the flight, keep the edge warning so a newly acquired source does not cause a distracting teleport.
7. Ramp border intensity using normalized progress, for example `0.15 + 0.65 * progress²`, with an `Incoming fireball` label. Use smooth glow, not rapid flashing. Maintain a modest warning during any short wait for the server's outcome.
8. Only the resolved server event chooses the result: hit = impact flash and health change; blocked = shield ripple; missed = fade/fizzle. A predicted arrival alone must not declare damage. Supply the edge warning and result feedback when WebGL is unavailable or reduced motion is enabled.

Never interpret loss of the attacker's image on the receiver as a dodge or cancelled shot. In the present game, the caster's continued target tracking controls whether the projectile can hit. Turning away must not make the receiver immune.

## Timing and network coordination

The current sender starts a new full 1.4-second timer when its launch acknowledgment arrives. That shifts its impact later than `at + flightMs`. The existing clock offset also uses `serverTime - receiveTime`, which includes network transit delay. Correct these before attempting tight two-phone synchronization.

Suggested small protocol update:

- Include `roundId`, `shotId`, `actorId`, `targetId`, `launchedAt`, and `impactAt` in each launch. `impactAt = launchedAt + flightMs` is enough for this prototype; physical distance need not affect speed.
- Use the existing ping/pong timestamps to estimate RTT and server-clock offset: `offset ≈ serverTime - (clientSendTime + clientReceiveTime) / 2`. Prefer recent low-RTT samples and smooth changes. This assumes roughly symmetric transit; it reduces error but is not exact synchronization.
- On receiving a shot, calculate elapsed time from the estimated server clock and start midway through the animation if necessary. Both outgoing and incoming rendering must use that same shot timeline.
- Convert the remaining duration once to a local monotonic `performance.now()` deadline so later clock-offset adjustments do not make an in-flight animation jump.
- Keep health authoritative on the server. For the smallest change, retain the caster's current `impact` report, but send it at the shared deadline and let the receiver wait for the resolved event. Retain server validation and a bounded expiry; explicitly broadcast expired/cancelled shots rather than silently pruning them. A future server-scheduled resolver with recent caster tracking updates would give more predictable resolution, but is a larger rules change.
- Add active shots to snapshots (currently `view(room)` omits them). On reconnection, recreate only shots with future deadlines, deduplicate by `shotId`, and clear all effects on round change. Do not replay old shots or old damage flashes after returning from a background tab.
- Include an actual `resolvedAt` and explicit outcome in impact events. The current impact event reuses the shot's original `at`, which denotes launch, not resolution.

The existing WebSocket is adequate for this small event payload. A different transport will not create shared spatial coordinates or fix rendering-clock drift. Late delivery should shorten the visible warning, not silently move the authoritative hit time; if latency becomes large enough to make shielding unfair, address a consistent server reaction window as a separate gameplay choice.

## Shield and future attack rules

Show a shield aura around a visible, identified opponent while their server `shieldUntil` is active; use a blue rim on the local screen for the player's own shield. Resolve protection on the server at impact, through one common damage path, so future attacks cannot accidentally bypass it.

The user resolved the rules explicitly: an active shield blocks everything **except lightning**. Lightning pierces the shield. Incoming lightning uses a fast blue warning and a short camera-relative bolt when the attacker is visible; it still waits for the server's impact outcome before reporting a hit.

## Acceptance checks before shipping

- Two phones see the same `shotId`; sender and receiver reach predicted arrival at approximately the same time under injected delivery delay.
- A visible attacker produces an approaching projectile; an untracked attacker produces a growing warning without an invented direction.
- Turning the receiver's camera away mid-flight changes presentation but does not change damage rules.
- Reacquisition blends without restarting the timer; stale or ambiguous identity never anchors the projectile to another colored object.
- Shield activated during flight produces a blocked outcome according to server time; simultaneous shield/impact ordering is defined and tested.
- Duplicate events, round restarts, reconnects, backgrounding, expiry, and WebGL failure neither duplicate damage nor leave permanent effects.

Implemented visual behavior is covered by focused tests for delayed delivery, one-shot handling, tracking loss, awaiting an authoritative outcome, offscreen lightning, expiry, and cleanup. Physical two-phone viewing still needs validation. Full shared-world AR would require a separate localization/calibration system and is not necessary for this interaction.
