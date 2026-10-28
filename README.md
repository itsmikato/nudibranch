# nudibranch

All code for the Nudibranch project (2025): the drawing's limbs move between two
poses, `wing_up.svg` and `wing_down.svg`.

| Folder | What |
|---|---|
| `wing-flap/` | Python (PyTorch) scripts: a small network learns how each point of the outline moves from one pose to the other and writes the in-between frames and GIFs |
| `dragon-violet/` | p5.js sketch (with flubber) that morphs the two poses live in the browser – the two-second up/down loop |
| `dragon-violet-v2/` | p5.js variant with the full drawing (`dragon.svg` / `dragon_down.svg`) |

Artwork and exports live in iCloud: `iCloud Drive/Dokumente_Mac/10_Creative/01_Projects/2025_nudibranch/`
(the rendered loop is `exports/wing-flap-loop.gif` / `.mp4`).
