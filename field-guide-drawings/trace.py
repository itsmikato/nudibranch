"""
Turns Ernst Haeckel's nudibranch drawings (Kunstformen der Natur, 1904, public domain,
via Wikimedia Commons) into Mikatoa species in the style of the original Nudibranch
drawing (dragon-violet/wing_up.svg):

  1. the animal is cut out of the white page and traced with Potrace: its silhouette
     becomes the fine outline ("outline")
  2. Haeckel's own contour lines divide the animal into areas; the larger areas (a ceras,
     a gill, a fold of the body) each become one black form (p1, p2 …), the smaller
     ones (hatching, small cells) join the nearest larger form
  3. paper only where two forms meet, and as a rim to the outline, as in the original;
     forms with holes are cut open

    python trace.py <folder with the Haeckel images>
Needs: potrace (brew install potrace), Pillow, shapely, numpy.
"""
import json
import math
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter
from shapely import affinity
from shapely.geometry import LineString, MultiPolygon, Polygon, shape
from shapely.ops import unary_union

OUT = Path(__file__).parent
SIZE = 1000                     # viewBox 0 0 1000 1000, the animal fills about 85% of it
RIM = 8                         # paper between the outline and the black
GAP = 7                         # the paper lines that cut the black apart

# Mikatoa species ← Haeckel's drawing, then:
#   contrast  how much darker than its surroundings a pixel must be to count as a line
#   min_form  how large (in the 1000-unit square) an area between lines must be to stay
#             a form of its own; smaller ones join their neighbour: larger = fewer, bolder
SPECIES = [
    ("02-coral-flame",     "Facelina_auriculata.png", 0.05, 250),
    ("03-lavender-dancer", "Okenia_elegans.png",      0.05, 400),
    ("04-leaf-sleeper",    "Hermaea_bifida.png",      0.05, 250),
    ("05-sand-ember",      "Doto_coronata_2.png",     0.06, 500),
    ("06-ink-ghost",       "Ancula_gibbosa.png",      0.05, 300),
]


def load(image_path):
    img = Image.open(image_path).convert("RGB")
    img.thumbnail((1400, 1400))
    return np.asarray(img).astype(float) / 255


def trace(mask):
    """a boolean mask (True = shape) traced by Potrace, as shapely polygons in pixels"""
    img = Image.fromarray((~mask * 255).astype(np.uint8))           # potrace traces black
    with tempfile.TemporaryDirectory() as tmp:
        pgm, geo = Path(tmp) / "m.pgm", Path(tmp) / "m.json"
        img.save(pgm)
        subprocess.run(["potrace", "-b", "geojson", "-t", "30", "-a", "1.1", "-O", "0.5",
                        str(pgm), "-o", str(geo)], check=True)
        feats = json.loads(geo.read_text())["features"]
    h = mask.shape[0]
    # potrace measures y from the bottom
    return [affinity.scale(shape(f["geometry"]).buffer(0), 1, -1, origin=(0, h / 2)) for f in feats]


def otsu(values):
    """the threshold that best splits values into two groups"""
    hist, edges = np.histogram(values, bins=128, range=(0, 1))
    w = np.cumsum(hist); m = np.cumsum(hist * edges[:-1])
    total, mt = w[-1], m[-1]
    between = (mt * w - m * total) ** 2 / (w * (total - w) + 1e-9)
    return edges[np.argmax(between)]


def open_holes(g):
    """a shape with holes, cut open from each hole to the edge at the narrowest point
    (the drawing's paths can't hold holes; the cut leaves a small paper gap)"""
    from shapely.ops import nearest_points
    while g.geom_type == "Polygon" and g.interiors:
        hole = LineString(g.interiors[0].coords)
        a, b = nearest_points(hole, LineString(g.exterior.coords))
        g = g.difference(LineString([a, b]).buffer(GAP / 2, cap_style="flat"))
        if g.geom_type != "Polygon":
            return [x for part in g.geoms for x in open_holes(part)]
    return [g]


def species(image_path, line_contrast, min_form):
    from scipy import ndimage as ndi
    a = load(image_path)
    lo, hi = a.min(axis=2), a.max(axis=2)
    animal = (lo < 0.91) | (hi - lo > 0.07)
    animal = ndi.binary_fill_holes(ndi.median_filter(animal, 5))
    keep = ndi.label(animal)[0]
    animal = keep == np.argmax(np.bincount(keep.ravel())[1:]) + 1        # the animal only

    # 1. Haeckel's contour lines (clearly darker than their surroundings), specks removed
    lum = a.mean(axis=2)
    lines = animal & ((ndi.gaussian_filter(lum, 6) - lum) > line_contrast)
    lab, n = ndi.label(lines, structure=np.ones((3, 3)))
    lines = np.isin(lab, np.flatnonzero(np.bincount(lab.ravel()) >= 30)) & (lab > 0)
    lines = ndi.binary_dilation(lines)                                    # close small gaps

    # the scale: the animal will fill 85% of the 1000-unit square
    ys, xs = np.nonzero(animal)
    k = SIZE * 0.85 / max(np.ptp(xs), np.ptp(ys))
    # the rim stays narrow in Haeckel's pixels, or his thin cerata would vanish under it
    rim, gap = 3, max(1, round(GAP / k / 2))
    inside = ndi.binary_erosion(animal, iterations=rim)

    # 2. the forms: areas between the lines, the larger ones each a form of its own
    forms, n = ndi.label(inside & ~lines)
    size = np.bincount(forms.ravel())
    big = np.flatnonzero(size >= min_form / (k * k))
    big = big[big > 0]
    bigmask = np.isin(forms, big)
    # 3. everything else (lines, hatching, small cells) joins the nearest larger form
    _, (iy, ix) = ndi.distance_transform_edt(~bigmask, return_indices=True)
    owner = np.where(inside, forms[iy, ix], 0)
    # 4. paper only where two forms meet
    edge = np.zeros_like(inside)
    edge[:, 1:] |= owner[:, 1:] != owner[:, :-1]
    edge[1:, :] |= owner[1:, :] != owner[:-1, :]
    edge = ndi.binary_dilation(edge, iterations=gap) & inside
    black = ndi.median_filter(inside & ~edge, 5)

    outline = unary_union(trace(animal))
    if isinstance(outline, MultiPolygon):
        outline = max(outline.geoms, key=lambda g: g.area)
    outline = Polygon(outline.exterior)
    black = unary_union(trace(black))

    minx, miny, maxx, maxy = outline.bounds
    dx = (SIZE - (maxx - minx) * k) / 2 - minx * k
    dy = (SIZE - (maxy - miny) * k) / 2 - miny * k
    fit = lambda g: affinity.translate(affinity.scale(g, k, k, origin=(0, 0)), dx, dy)
    outline, black = fit(outline), fit(black)

    pieces = []
    for g in getattr(black, "geoms", [black]):
        if g.area >= 80:
            pieces += [h for h in open_holes(g) if h.area >= 80]
    return sorted(pieces, key=lambda g: -g.area), outline


def main_axis(poly):
    """the line through a shape's longest direction"""
    xy = np.array(poly.exterior.coords)
    c = xy.mean(axis=0)
    _, _, vt = np.linalg.svd(xy - c)
    d = vt[0]
    return LineString([c - d * SIZE, c + d * SIZE])


def write_svg(name, pieces, sil):
    def path(poly):
        xy = list(Polygon(poly.exterior).simplify(0.5).exterior.coords)
        return "M" + "L".join(f"{x:.1f},{y:.1f}" for x, y in xy) + "Z"
    lines = ['<?xml version="1.0" encoding="UTF-8"?>',
             f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {SIZE} {SIZE}">',
             '<defs><style>.cls-1{fill:none;stroke:#000;stroke-miterlimit:10;}</style></defs>']
    lines += [f'<path id="p{i}" d="{path(g)}"/>' for i, g in enumerate(pieces, 1)]
    lines.append(f'<path id="outline" class="cls-1" d="{path(sil)}"/>')
    lines.append("</svg>")
    (OUT / f"{name}.svg").write_text("\n".join(lines))
    print(f"{name}.svg: {len(pieces)} black areas")


if __name__ == "__main__":
    src = Path(sys.argv[1])
    for name, file, contrast, min_form in SPECIES:
        pieces, outline = species(src / file, contrast, min_form)
        write_svg(name, pieces, outline)
