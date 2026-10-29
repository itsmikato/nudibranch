# nudibranch

All code for the Nudibranch project (2025): the drawing's limbs move between two
poses, `wing_up.svg` and `wing_down.svg`.

| Folder | What |
|---|---|
| `wing-flap/` | Python (PyTorch) scripts: a small network learns how each point of the outline moves from one pose to the other and writes the in-between frames and GIFs |
| `dragon-violet/` | p5.js sketch (with flubber) that morphs the two poses live in the browser – the two-second up/down loop |
| `living-specimen/` | p5.js: the drawing as a living creature – limbs ripple and curl, a fast pointer startles it (limbs pull in, pastel colours flare into warning colours); six specimens. Open through a local server, e.g. `python3 -m http.server 8765` → `localhost:8765/living-specimen/`. A copy runs on the portfolio's Nudibranch page |
| `dragon-violet-v2/` | p5.js variant with the full drawing (`dragon.svg` / `dragon_down.svg`) |

Artwork and exports live in iCloud: `iCloud Drive/Dokumente_Mac/10_Creative/01_Projects/2025_nudibranch/`
(the rendered loop is `exports/wing-flap-loop.gif` / `.mp4`).
