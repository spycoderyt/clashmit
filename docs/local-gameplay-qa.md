# Local gameplay overhaul — verification

Status: local changes only. Nothing committed or pushed. Production remains unchanged.

## Browser checks performed with CUA

The actual pages/components were opened and operated in the browser. Screenshots were inspected at a narrow viewport (about325 CSS pixels wide) and the normal desktop viewport. The preview modes use simulated players/positions; they do not prove real camera, GPS or speech-service behavior.

| Change | Browser check | Result |
| --- | --- | --- |
| Seven reference hearts | `/ ?test=hearts` (without the space), read exact65/70HP and inspect7 sprites |6 full+1 half, matching palette,18px sprites |
| Bottom resource layout | Measure and screenshot HUD | Coins/health left; icon inventory right on same row; no horizontal overflow |
| Top standings | Screenshot against header, map and target label | Standings below header, map separate right, target label below standings |
| Skill arrangement | Inspect HUD groups and stats | Three attacks, stacked Shield/Heal, mana beneath; damage/mana/delay icons |
| Class decks | Select Mage, Witch, Archer in actual shop | Lightning, Poison, Arrows first; heavy/ultimate locked initially |
| Unlock order | Attempt ultimate before heavy, then buy heavy60 | Ultimate initially disabled; then140 unlock offered |
| Upgrade | Buy Lightning upgrade80 | Chain Lightning,1.4 hearts, same1s delay; correct coin deduction |
| Inventory | Buy Shield30, Heal30, Flashbang50 | Stocks increment, balance deducted, retained on respawn |
| Respawn | Wait countdown; manually press Respawn after choosing Archer | Returns with70HP, chosen class and purchases |
| Death shop layout | Narrow screenshots before/after upgrade and purchase | Long names wrap; purchase controls and footer accessible via scrolling |
| Coins | Review pickup preview and automatic event route | Bundled recorded coin sound and coins fly toward bottom-left balance; sound playback logic covered by tests |
| Map | Auto-open far-player fixture; close and select orbital point | Direction arrows visible; tap selects circle without launching |
| Incoming orbital | Preview incoming strike |3D model, foreground warning, five-second countdown,10m message |
| Escape | Start danger preview, simulated location moves outside after1.3s | Warning changes to “Outside the blast zone” with4seconds remaining |
| Launcher orbital | Preview launcher; inspect mid-descent | Rocket arrives from sky toward selected map point, not toward camera |
| Front page | Screenshot and accessibility inspection | New Plex typography, video retained, usable join form and clean standings |
| Live page | `/live?demo=1`, inspect ranking/feed and scroll to footer | Coin totals, medals, kill feed, QR and website fit narrow layout |
| Runtime errors | Browser error log inspection | No JavaScript errors in final inspected previews |

The 0.8-second hold timer is tested with deterministic gesture tests (tap, move, cancel, threshold and once-only launch), rather than claiming a CUA long-press test that the browser API did not support.

## Gameplay and multiplayer tests

230 automated tests passed in the combined run. Coverage includes:

- FFA default,70HP, regeneration5HP per4s, no revival from regeneration.
- All9 attacks and upgrades; purchased names; mana costs; same upgrade cooldowns; no automatic supers.
- Shield protection except Lightning; stock/cooldowns; heal cap; Flashbang blind/stun.
- Consecutive unlocks, affordability, purchase persistence, class changes and non-FFA elimination.
-30coins per confirmed victim life; DOT and orbital payouts; duplicate reports cannot award twice.
- Orbital10m zone, five-second impact timing, escaping/entering, caster immunity, stale fixes and round cancellation.
- Inactive/reconnecting clients, preserved identity/purchases, no repeated portrait bytes in game snapshots.
- Forgiving owned-spell parsing including“heel”,“wild fire”,“flash bank”, and misspellings.
- Face box interpolation, skipped frozen camera frames, stale worker rejection and slower-device scheduling.
- Sound loading/playback lifecycle and clip mappings.

30 simultaneous loopback clients joined, received state and removed an inactive player successfully. The largest snapshot was20,844bytes; the join/state/departure check completed in86ms on this Mac. Another local transport test delivered600/600 replies with p95around1.4ms. These are local smoke-test results, **not mobile-network latency or a Railway capacity guarantee**.

## Balance pass

| Choice | Initial balance |
| --- | --- |
| Kill bounty |30coins; victim keeps their wallet |
| Heavy / ultimate unlock |60 /140coins |
| Quick / heavy / ultimate upgrade |80 /160 /240coins |
| Ultimates |10mana;60damage, upgraded67; cannot kill a full70HP player alone |
| Shield |30coins;7s duration;14s reuse delay |
| Heal |30coins;50HP;8s reuse delay |
| Flashbang |50coins;3s blind/stun within10m;8s reuse delay |

Longer consumable reuse delays prevent uninterrupted shielding and rapid heal/flash spam. These values still need a real group playtest for enjoyment and class win rates.

## Performance changes

- Do not repeatedly run recognition on the same frozen video frame.
- Let face recognition take priority over body fallback when inference is slow.
- Discard old body worker results after a restart.
- Smooth rendered boxes without weakening identification or extending hit freshness.
- Skip idle skeleton effects and their per-frame layout reads; cache HUD ground geometry.
- Cache inventory DOM; resolve repeated target lookup once per frame.
- Send portraits through avatar sync instead of embedding them in every leaderboard snapshot.
- Skip persistent score-file writes for nonlethal economy damage.
- Bundle small SVG icons, font files and rocket meshes locally; no UI plugin framework added.
- Load rocket rendering only when needed; cap its pixel ratio at1.5.

## Still requires physical devices

An iPhone12ProMax field test is needed for camera frame rate, face recognition at distance, browser ASR, audio, battery/heat, and GPS escape timing. A10m GPS circle is approximate, especially indoors. Browser screenshots cannot establish those results.

### HUD overlap regression

Phone-sized browser check at 325 CSS pixels wide: header ends at 68 px, coin leaderboard ends at 203 px, and simultaneous shield / streak / kill notices start at 215 px. No horizontal overflow. Alert components now share a vertical layout below the measured leaderboard and minimap; target labels also reserve that space. Preview: `http://localhost:3000/?test=hud-alerts`.

Coin pickup now holds delayed particles at their origin and sends them to the bottom-left coin icon rather than the center of the balance row.

### Multi-target attacks and kill messages

Upgraded first attacks can hit two extra opponents within 5m of the main target. Extra hits deal half damage. Tests cover shields, missed shots, location age, repeat impact reports, and coin credit for each kill. Shield costs 30 coins, Heal costs 30, and Flashbang costs 50.

Kill rewards show the coin amount and victim name at screen centre. A death card shows the killer and attack for 2.2 seconds before the shop. The respawn timer continues during the card. Killer photos use the existing avatar cache or the immediate kill event; repeated state messages do not include photo data.
