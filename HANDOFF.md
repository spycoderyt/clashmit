# Handoff: `feature/clash-style-hud`

Working notes for whoever merges this branch into `main`. Each section is one
self-contained change: what moved, why, how it was verified, and what is left.

Branch base: `42455fb` (Harden game connections and prepare tested Railway deployment).

---

## 1. Clash-style HUD (elixir bar and spell cards)

**Goal.** Make the elixir bar and spell icons read at arm's length on a phone,
closer to Clash Royale's proportions.

**Files.**

| File | Change |
| --- | --- |
| `dist/style.css` | Appended one override layer at the end of the file |
| `dist/index.html` | Cache buster `style.css?v=smooth1` -> `?v=clash1` |

**What changed.** The elixir track went 7px -> 26px tall, rounded, outlined, with
a purple gradient fill, an inset gloss and darker segment dividers so the ten
units read as chunks. Its counter went 0.6rem -> 1.1rem bold. Spell cards went
60px -> 88px with symbols 1.25rem -> 2.1rem, and the mana cost became a round
elixir-drop badge. `#toast` moved up 50px because the HUD grew by that much
(221px total).

**Merge notes.**

- `dist/style.css` is a stack of override layers appended over time; later rules
  win. The new layer is last, so it must **stay last** to take effect.
- The visible `MANA` text label is hidden (`.mana-row>span{display:none}`).
  Screen readers are unaffected: `#mana-track` already carries `aria-label="Mana"`.
- Card content is top-aligned under the cost badge (`padding-top`). Without it
  the badge overlaps the spell symbol on narrow cards - this was a real defect
  caught at 360px width, so do not "simplify" the padding away.
- A `@media(max-height:700px)` block scales the bar to 20px and cards to 74px.
  Re-check it if the HUD grows further.

**Verified.** Rendered at 375x812 and 360x640, full fill and partial fill.
52/52 tests pass (this change is presentational; no test covers CSS).

**Not done.** The app still says "Fieldspell" in the title, lobby header and
`package.json` name. Unrelated to this change.

---

## 2. Two-color headband recognition

**Goal.** Recognize the ordered two-stripe headbands from `stripes_30_pages.pdf`
instead of a single red-or-blue band. Implements the recognition half of
`docs/two-stripe-headbands.md`.

**Files (all new - no existing file was modified).**

| File | Purpose |
| --- | --- |
| `dist/palette.js` | The six printed colors, classification, the 30 pair IDs |
| `dist/headband-pair.js` | Stripe finding, stacking, ordered-pair resolution |
| `test/headband-pair.test.js` | 8 tests |

**The palette**, sampled directly from the PDF's fill operators (not eyeballed):

| Name | Hex | RGB | Hue |
| --- | --- | --- | --- |
| red | `#db0f0f` | 219, 15, 15 | 0 deg |
| orange | `#ff8000` | 255, 128, 0 | 30 deg |
| green | `#38ff14` | 56, 255, 20 | 111 deg |
| cyan | `#59bff5` | 89, 191, 245 | 201 deg |
| navy | `#0a1a73` | 10, 26, 115 | 231 deg |
| pink | `#ff6bbd` | 255, 107, 189 | 327 deg |

The PDF's 30 pages are exactly the 30 ordered pairs, each page A4 landscape with
six 35mm full-width bands alternating the two colors.

**How recognition works.**

1. `classifyColor(rgb)` maps a pixel to one of the six names or `null`. Hue alone
   cannot separate cyan from navy (30 deg apart) or red from pink (33 deg), so
   distance weights hue, saturation and value together. A result is returned only
   if the best match beats the runner-up by a margin; otherwise `null`.
2. `colorTable()` bakes that into a 32768-entry 5-bit-per-channel lookup, built
   once in ~8ms, so the frame loop costs one array read per pixel.
3. `findStripes(image, buffers)` runs connected components per color and keeps
   wide, well-filled regions.
4. `pairStripes(stripes)` groups stripes that are stacked (strong horizontal
   overlap, similar widths, shared boundary, tolerant of head tilt) and resolves
   a group of exactly two into an ordered `id` such as `red-cyan`.
5. `recognizePairs(image, buffers)` is the top-level call and returns only
   unambiguous markers.

**Design decisions worth keeping.**

- **Unknown beats wrong.** Every rejection path returns `null` / `ambiguous`
  rather than a best guess. A misread ID attributes a hit to the wrong player,
  which is worse than a dropped frame. Tests assert dimmed cyan never becomes navy.
- **Repeating stacks are refused.** See the open issue below.
- Same-color pairs are rejected, per the design doc.

**Verified.** All 30 pairs recognized and unique; order reversal flips the ID;
two players told apart in one frame; speckles, huge fields, lone stripes,
side-by-side stripes and mismatched widths all rejected; reused buffers cannot
preserve a vanished marker. Benchmarked at **5.0ms per 960x540 frame** against
the pipeline's 33ms budget. 60/60 tests pass.

### Open issue: the printed sheet is ambiguous if cut wrong

Each PDF page repeats its two colors six times (ABABAB). A band cut across three
or more of those stripes **cannot be ordered** - ABA reads as both AB and BA.
`pairStripes` reports these as `{id:null, ambiguous:true, reason:'repeating stack'}`
and `recognizePairs` drops them.

**So the cutting instruction matters:** cut exactly **one** two-stripe pair
(two adjacent bands, 70mm tall) per headband. The repeats exist to get several
bands per sheet, not to be worn as one tall band.

If wearers want a taller marker, the sheet needs regenerating with a
non-repeating design (for example a thin white separator, or a 3-stripe grammar
where the middle stripe is always a fixed marker color).

### Wired into the live pipeline

Recognition now drives the app. Registration, the wire format, the server and
the detection loop all moved to ordered pairs in one step, because a half-moved
pipeline cannot run: the detector needs a pair id that only the new profile
carries.

| File | Change |
| --- | --- |
| `dist/shirt.js` | Added `bandProfile()`, `profileId()`, `validBandProfile()` |
| `dist/shirt-camera.js` | Captures two samples from a split guide |
| `dist/index.html` | Guide divider, two swatches, `?v=pair1` |
| `dist/style.css` | Split-guide and dual-swatch rules |
| `dist/detection.js` | Calls `findPairBands`, gates on pair id, sends only ids to the worker |
| `dist/color-worker.js` | Calls `findPairBands` |
| `dist/app.js` | `bandColor` -> `profileId` for gating and aim text |
| `server/index.js` | Validates v2, re-derives the id, rejects duplicate pairs |
| `test/game.test.js` | Registers v2 profiles; asserts v1 is refused |

**Wire format.** Profiles are now `{version:2, top:{bins,rgb}, bottom:{bins,rgb}, id}`.
The server **re-derives `id` from the pixel samples** and ignores whatever the
client sent, so a client cannot claim a pair it did not scan. A version 1
single-color profile is rejected outright, which is the version separation the
design doc asked for - an old client cannot silently join a two-stripe arena.

**Duplicate pairs** are refused at registration time (not at round start), with
the message naming the conflict, and round start re-checks across all players.

**Identity matching became exact.** `findPairBands` is a drop-in replacement for
`findHeadbands`: same band shape, same `match`/`self` fields, so face/person
confirmation and `createTargetTrack` are untouched. But `match` is now 1 or 0 on
an exact ordered-pair id rather than a color distance, so a shot cannot drift to
a player whose color merely looks similar.

**Verified.** 62/62 tests pass. Checked in a real browser against the served
files: no console or module errors, the scan guide renders split, the module
graph resolves through the `?v=pair1` query strings, registration produces the
expected ids, detection separates two bands in one frame with correct
`match`/`self`, a forged wire id is ignored, and the module worker loads and
reports `OffscreenCanvas` support.

### Follow-ups, not done here

- **Dead code.** `bandColor`, `findHeadbands` and `createBandContinuity` in
  `dist/headband.js` now have no caller in the live pipeline. They are still
  exercised by `test/headband.test.js`. Left in place deliberately rather than
  deleted in the same change; remove both together when you are confident.
- **Field testing.** None of the checks at the end of
  `docs/two-stripe-headbands.md` have been run on real phones with real fabric:
  side views, tilt, distance, shade and sun, crossing players, one stripe
  covered. Synthetic frames cannot stand in for any of that.
- **`docs/two-stripe-headbands.md`** still says recognition is unimplemented.
  Update it when this merges.
- The app is still named "Fieldspell" in the title, lobby and `package.json`.
