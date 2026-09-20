# UI audit — 20 September 2026

Ran through CUA in a separate hidden browser tab on localhost:3000. These are actual UI observations; preview fixtures are simulated and do not prove camera recognition, voice permissions, or networked combat on a physical phone.

| Check | Steps and observed outcome |
| --- | --- |
| Death countdown | Opened `/?test=respawn`: health 0/70, Respawn disabled with 10s countdown; became enabled after deadline. |
| Initial skill only | Mage had Lightning; Fireball unlock60; Meteor disabled with “Unlock the previous skill.” |
| Consecutive purchases | Clicked Fireball unlock60:750→690 coins; Meteor unlock140 enabled. Clicked Meteor:610→470 after the quick upgrade below. |
| Upgrade | Clicked Lightning upgrade80:690→610, name became Chain Lightning, damage1→1.4 hearts, delay remained1s in both shop and HUD. |
| Consumables | Clicked Shield15, Heal15, Flashbang20:470→455→440→420; corresponding inventory rows each became1×; displayed10s Shield and5-heart Heal. |
| Class selection | Clicked Witch: Poison/Skeletons/Soul Reaper; clicked Archer: Arrows/Bomb Arrow/Ballista. Each starter owned and ultimate gated behind heavy. |
| Respawn retention | Respawned as Archer: health70/70, coin420, each consumable1× retained; shop disappeared; FFA Live displayed; Arrows first. |
| Stats | Damage/mana/delay shown on each skill. Corrected shop rounding of Arrows0.65s (previously0.7s). Added descriptive accessible stat labels. |
| Shop visuals | Screenshot: contained dark panel, teal active class and respawn, restrained purple upgrades; plain sentence case. Added requested Orbital Strike Cannon five-kill tip below Respawn. |
| Live standings | Opened `/live?demo=1`: descending coins1020/983/946, medals1–3, Kills/Deaths, FFA Live, five killfeed rows. Added30coin rewards to the demo feed so it previews actual reward content. |
| Live visuals | Screenshot: coin totals are primary, QR and ClashMIT.lol lower-right; table/feed have simple separators without all-caps. Lower rows scroll at720px height. |
| Front leaderboard | Opened `/`: Coins/Kills/Deaths columns, fetched current ranking with “Ranked by coins”; current local test profile0coins. No fabricated scores injected. |
| Errors | Fresh front load caught a transient syntax error while another agent edited face-tracker.js. Reported it; vision agent fixed it. Reload verified persona options and leaderboard now initialize. |
| Accessibility | Final shop reload verifies separate named Buy Shield/Heal/Flashbang buttons, full stat labels, exact five-kill tip, and initial disabled countdown. |

Added3 automated component behavior tests in `test/respawn-shop.test.js` (all passed): countdown/manual respawn callbacks; consecutive unlocks/affordability/upgrade stats; planned class starter and inventory99 cap. Shop full stock now disables purchase rather than relying solely on server rejection.

Remaining physical-device validation: actual camera/face detection, spoken commands, audible sound quality, phone sleep/rejoin and real GPS accuracy. The CUA shop tests use the actual shop component with preview data, not a real multiplayer session. Server combat/persistence tests are owned by the main agent and combat agent.

## Screenshot follow-up

A later request asked for fresh narrow-screen shop/top-bottom and front/live screenshots. CUA's browser connection was unavailable at that time (`getState` returned no browsers; opening the in-app browser also failed). Earlier screenshots above were desktop1280×720, not phone-width screenshots. Do not claim a new mobile screenshot pass until browser reconnection.

Static mobile audit found the live footer's QR/wordmark could exceed a325px viewport; added a≤420px layout with smaller QR/logo, wrapping header/status, and wrapping feed metadata. Awaiting narrow CUA verification.
