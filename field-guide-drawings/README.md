# Field-guide drawings

One drawing per Mikatoa species, used by the live specimen (`../living-specimen/`) and the
posters. `01-mint-drifter.svg` is the original Nudibranch drawing; the other five are made
with `trace.py` from Ernst Haeckel's nudibranch plates in *Kunstformen der Natur* (1904,
public domain, via Wikimedia Commons):

| Drawing | Haeckel's species |
|---|---|
| `02-coral-flame.svg` | *Facelina auriculata* |
| `03-lavender-dancer.svg` | *Okenia elegans* |
| `04-leaf-sleeper.svg` | *Hermaea bifida* |
| `05-sand-ember.svg` | *Doto coronata* |
| `06-ink-ghost.svg` | *Ancula gibbosa* |

`trace.py` takes Haeckel's contour lines, makes each larger area between them one black
form, lets small details join the nearest form, and leaves paper only where forms meet –
the technique of the original drawing. Settings per species are at the top of the file.

    python trace.py <folder with the Haeckel images>     # needs potrace, Pillow, shapely, numpy, scipy

`haeckel-before-after.png` shows Haeckel's drawings above the results.
