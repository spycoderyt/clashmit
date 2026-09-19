# Fast headband tracking checks

The browser ran the production color worker and motion filter on a generated 1280×720, 30fps video with a blue band moving around the aiming point. A larger blue rectangle remained elsewhere in the frame as a distractor. No face or body model was used.

| Stage | Processed observations | Confirmed observations |
| --- | ---: | ---: |
| 12px-wide moving band | 40 | 39 |
| Growing from 12px to ~242px | 44 | 44 |
| ~242px close band | 44 | 44 |
| Shrinking toward 17px | 51 | 51 |

179 observations over about 6.1 seconds: approximately 29 updates/second. Capture-to-color-result time on this Mac: median 3ms, 95th percentile 5ms. The first observation intentionally does not confirm a target. These are generated-video desktop measurements, not iPhone or real outdoor performance measurements.

Eight motion tests cover small bands, scale changes, distractors, crossing ambiguity, timestamp ordering, reacquisition, and bounded visual prediction. The complete 43-test suite also covers live WebSocket rules and the existing combat features. Browser smoke check confirms the persistent target health overlay and four spell controls load without model inference.
