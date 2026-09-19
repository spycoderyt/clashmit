# Next marker design: ordered two-color headbands

Players will gather at one venue. Each headband will have one solid color stripe on top and another on the bottom. The ordered pair identifies the player: red-over-blue differs from blue-over-red. This replaces the proposed shared red/blue team identity; each player can retain individual health.

This is the agreed direction, not implemented recognition yet. The current app still scans and tracks one red or blue color and selects one opponent. Do not expect a two-stripe band to be identified correctly by that version.

## How many IDs?

For N distinguishable colors, excluding same-color pairs, there are N × (N − 1) ordered IDs:

| Available colors | Distinct top/bottom IDs |
| --- | --- |
| Red and blue | 2 |
| Four colors | 12 |
| Six colors | 30 |

Six candidate colors are red, blue, green, yellow, cyan, and magenta. The actual palette must be confirmed and tested on the physical material and phones. Thirty combinations is a count of IDs, not a guarantee of camera reliability. More colors create more potential confusion under lighting changes. If only four reliably distinct colors are available, start with 12 IDs.

## Physical design and limits

Make two broad, solid stripes of roughly equal height, touching along a clear horizontal boundary. Wrap both stripes around the band so the ID survives side views. Use matte material and keep tape/glare from covering the colored area. Keep the top/bottom order consistent around the whole band.

Both stripes must remain resolvable in the image. A tiny, blurred, or occluded stripe prevents a reliable new identification; interpolation cannot restore missing identity evidence. More total marker height helps distant recognition, but maximum usable distance needs an actual field test. Turning a two-stripe band upside down changes its ID.

## Registration and tracking changes required

1. Register each player's **top and bottom** samples separately using two labeled scan guides. Preserve the order in a new profile format instead of averaging both colors into one sample. Reject identical stripes and duplicate ordered pairs at the server. Keep the existing wire format version separate so older single-color clients do not silently join the new mode.
2. Search camera frames for colored regions first, then pair adjacent regions with compatible width, scale, alignment, and shared boundary. Allow head tilt; do not rely solely on exact horizontal screen rows. Distinguish a stacked marker from two unrelated background objects. Face/body detections remain optional decoration.
3. Match both stripe colors, with hue/saturation tolerance and a clear margin over competing registered pairs. Reject ambiguity; do not assign the first other player in the roster.
4. Track the combined marker box at high frequency, with multiple independent tracks keyed to the ordered marker ID. Keep cropped native-resolution searches for small markers, periodic full-frame reacquisition, velocity smoothing, and bounded prediction.
5. Choose a confirmed enemy/player marker near the reticle. Bind each shot to that exact player ID; a different marker must not inherit a projectile. A brief occlusion can preserve the visual overlay, but firing/hit confirmation requires fresh evidence of the full ordered pair.
6. Show incoming spells from the detected sender when visible; otherwise use the growing border warning. A shared world map, GPS, compass, and UWB pairing are still unnecessary.

## Test before raising the player cap

- Close-up, side view, tilted head, approaching/receding, and outdoor shade/sun on actual phones.
- Red-over-blue versus blue-over-red, and two players sharing a top color but having different bottoms.
- Multiple visible bands crossing, one stripe covered, tiny markers, colored clothes/paper in the background, and lost/reacquired tracks.
- Duplicate pair registration, player reconnects, and every shot staying attached to its original target.

Co-locating players makes these tests easier and removes any campus-wide tracking requirement. Each phone can use its own internet connection; the entire group does not need to connect to the host’s hotspot. A remotely hosted single arena and one common HTTPS domain remain the intended hosting design.
