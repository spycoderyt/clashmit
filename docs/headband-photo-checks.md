# Historical headband/face regression check

These checks apply to the earlier face-gated version. The current fast gameplay tracker follows color and motion directly; do not use these results as its false-positive benchmark.

The browser ran the production color filter, face crops, MediaPipe BlazeFace model, body fallback, and spatial association on the three user-supplied photos locally. A single blue color sample from photo 1 (`[32,100,195]`) was reused for all checks. The red profile was `[220,25,25]`.

| Input | Blue confirmed targets | Confirmation | Red confirmed targets |
| --- | ---: | --- | ---: |
| Photo 1, full | 1 | Face | 0 |
| Photo 2, full | 1 | Face | 0 |
| Photo 3, full | 1 | Face | 0 |
| Photo 1, head/face crop | 1 | Face | 0 |
| Photo 2, head/face crop | 1 | Face | 0 |
| Photo 3, head/face crop | 1 | Face | 0 |

Extra blue material did not become another confirmed target. Red paper in the full photos did not become a confirmed target. Tight crops retain the headband and face but remove most of the body.

The first close-up pass exposed an overly restrictive maximum color-region area (12% of the image). Allowing a plausible band up to 45% fixed those missed candidates while retaining the face/person validation requirement. Unit checks cover cold-start rejection of color alone, face association, body fallback, ambiguity, loss/reacquisition, and a large close-up band.

These checks are six still-image cases, not measured distance, outdoor lighting, moving-camera, or phone-performance results. A first view containing only a band and no face/body cannot establish a new lock; an already-verified band may continue through an uninterrupted close-up. No supplied photos are included in this repository or deployment.
