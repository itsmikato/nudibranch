// sketch.js – p5.js
// Living specimen: the Nudibranch drawing as a creature in water.
//
// No poses are needed. Every point of the drawing turns a little around the body's
// spine, more at the tips of the limbs than near the body, and the turn travels along
// the body as a wave; beyond the middle of each limb a second, stronger bend makes the
// tips curl. Each part of the body has its own rhythm (a smooth field over the drawing,
// so a limb and its outline always move together), and the specimen floats slowly.
//
// Like a real nudibranch it reacts to being disturbed: stir fast and it pulls its limbs
// in, its pastel colours flare into strong warning colours (nudibranchs warn with colour,
// often of poison taken from their food), then it calms down and slowly unfolds again.
// A click or tap shows the next specimen of the field guide.

// the drawing: set by the page (<body data-drawing="…">), else the original in this repo
const SVG_FILE = document.body.dataset.drawing || '../dragon-violet/wing_up.svg';

// embedded in another page (?embed, e.g. the portfolio's project page): the page must
// still scroll on phones, so only sideways swipes stir there
const EMBEDDED = new URLSearchParams(location.search).has('embed');

// a still for the field-guide posters (?print=3&state=alarm): one fixed pose, no label,
// a transparent background, lines as thick as the canvas is large
const PRINT = new URLSearchParams(location.search).get('print');
const PRINT_TIME = 2.6;         // the moment of the motion the posters show (seconds)
const STEP = 3;                 // sample a point every 3 units along each outline

// the field guide (the six species, their names and colours): specimens.js

// the motion
const WAVE = {
    angle: 0.12,                // how far the limbs turn around the spine (radians)
    curl: 0.55,                 // extra bend of the outer half of each limb (radians)
    length: 2.2,                // waves along the body
    speed: 1.0,                 // radians per second
    sway: 0.016,                // the spine's own slow side-to-side motion
    breathe: 0.035,             // limbs reaching out and back
};
// how far each part of the body runs ahead of or behind the wave (radians). It's a shift
// that swings back and forth, never a different speed: different speeds would pull
// neighbouring points further apart every second until the drawing tears
const RHYTHM = 0.9;
const DRIFT = { offset: 0.035, turn: 0.07 };   // slow wandering in the frame (share of body, radians)

// the fright
const STARTLE_SPEED = 900;      // pointer speed (px/s) that starts a fright
const CONTRACT = 0.38;          // how far the limbs pull in when fully frightened
const CALM_DOWN = 0.55;         // how much fear is left after one second

// line widths on screen, in pixels: fine, like a pen line (the shapes' line is the finest)
const LINE = { outline: 0.8, shapes: 0.5 };

const PAPER = '#f2efe9';
const INK = '#141414';

let shapes = [];                // { outline, pts: [{ x, y, s, d, r, o1, o2 }] }
let axis = null;                // centre, direction along the body, and its normal
let bodyLength = 1, maxD = 1;
let specimen = 0;
let fear = 0;                   // 0 = calm, 1 = fully frightened
let last = null;                // previous pointer position, to measure its speed
let touching = false;           // on touch screens the pointer only counts while a finger is down
const touchScreen = window.matchMedia('(hover: none)').matches;

function setup() {
    const canvas = createCanvas(windowWidth, windowHeight);
    if (EMBEDDED) canvas.elt.style.touchAction = 'pan-y';
    pixelDensity(Math.min(2, window.devicePixelRatio || 1));
    if (PRINT) {
        specimen = Number(PRINT) - 1;
        fear = new URLSearchParams(location.search).get('state') === 'alarm' ? 1 : 0;
    }
    noiseSeed(7);               // the rhythms are the same on every visit

    fetch(SVG_FILE)
        .then((res) => res.text())
        .then(readDrawing)
        .catch((err) => console.error('Could not load the drawing', err));
}

/* every path as a list of points, then the body's axis from all of them */
function readDrawing(svgText) {
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    // the browser only measures paths that are part of a document
    const holder = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    holder.style.position = 'absolute';
    holder.style.visibility = 'hidden';
    document.body.appendChild(holder);

    doc.querySelectorAll('path').forEach((src) => {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', src.getAttribute('d'));
        holder.appendChild(path);
        const total = path.getTotalLength();
        const pts = [];
        for (let l = 0; l < total; l += STEP) {
            const p = path.getPointAtLength(l);
            pts.push({ x: p.x, y: p.y });
        }
        shapes.push({ outline: src.id === 'outline', pts });
    });
    holder.remove();

    findAxis();
}

/* the body's direction: the main axis of all points (principal component) */
function findAxis() {
    const all = shapes.filter((sh) => !sh.outline).flatMap((sh) => sh.pts);
    const cx = all.reduce((a, p) => a + p.x, 0) / all.length;
    const cy = all.reduce((a, p) => a + p.y, 0) / all.length;
    let xx = 0, xy = 0, yy = 0;
    for (const p of all) {
        const dx = p.x - cx, dy = p.y - cy;
        xx += dx * dx; xy += dx * dy; yy += dy * dy;
    }
    const theta = 0.5 * Math.atan2(2 * xy, xx - yy);
    const ux = Math.cos(theta), uy = Math.sin(theta);
    axis = { cx, cy, ux, uy, nx: -uy, ny: ux };

    // each point's place along the body (s) and distance from the spine (d)
    let maxS = 0;
    for (const sh of shapes) {
        for (const p of sh.pts) {
            const dx = p.x - cx, dy = p.y - cy;
            p.s = dx * ux + dy * uy;
            p.d = dx * axis.nx + dy * axis.ny;
            maxS = Math.max(maxS, Math.abs(p.s));
            maxD = Math.max(maxD, Math.abs(p.d));
        }
    }
    bodyLength = 2 * maxS;
    for (const sh of shapes) {
        for (const p of sh.pts) {
            p.r = Math.abs(p.d) / maxD;
            // the rhythm comes from where a point is, not which shape it belongs to:
            // neighbouring points (a limb and the outline around it) share it
            const nx = p.s / bodyLength * 3, ny = p.d / maxD * 1.5;
            p.o1 = RHYTHM * (noise(nx, ny) * 2 - 1);
            p.o2 = RHYTHM * (noise(nx + 40, ny + 40) * 2 - 1);
        }
    }
}

function rotate2(x, y, a) {
    const c = Math.cos(a), s = Math.sin(a);
    return [x * c - y * s, x * s + y * c];
}

/* where a point of the drawing is at time t */
function place(p, t, breathe) {
    // the same speed everywhere, plus a bounded shift that drifts slowly over time
    const shift = p.o1 * Math.sin(t * 0.21) + p.o2 * Math.cos(t * 0.17);
    const phase = (p.s / bodyLength) * WAVE.length * TWO_PI - t * WAVE.speed + shift;
    const wave = Math.sin(phase);
    // a frightened specimen holds its limbs tight: smaller waves, pulled in
    const tense = 1 - 0.6 * fear;
    const d = p.d * breathe * (1 - CONTRACT * fear * Math.pow(p.r, 1.2));

    // 1. the whole limb turns around its spot on the spine
    let [ox, oy] = rotate2(axis.nx * d, axis.ny * d, WAVE.angle * tense * wave * Math.pow(p.r, 1.3));

    // 2. beyond the middle of the limb a second bend: the tips curl
    const knee = 0.45;
    if (p.r > knee) {
        const k = (p.r - knee) / (1 - knee);
        const px = ox * (knee / p.r), py = oy * (knee / p.r);
        const bend = WAVE.curl * tense * Math.sin(phase - 0.8) * k * k * Math.sign(p.d);
        const [bx, by] = rotate2(ox - px, oy - py, bend);
        ox = px + bx;
        oy = py + by;
    }

    // the spine sways gently; a fright adds a small shiver
    const sway = WAVE.sway * bodyLength * Math.sin(phase * 0.5 - t * 0.4)
        + fear * 0.004 * bodyLength * Math.sin(t * 40 + p.s * 0.05);
    return [
        axis.cx + axis.ux * p.s + ox + axis.nx * sway,
        axis.cy + axis.uy * p.s + oy + axis.ny * sway,
    ];
}

function draw() {
    if (PRINT) clear();
    else background(PAPER);
    if (!axis) return;

    const t = PRINT ? PRINT_TIME : millis() / 1000;
    if (!PRINT) {
        const dt = Math.min(0.1, deltaTime / 1000);
        noticePointer(dt);
        fear *= Math.pow(CALM_DOWN, dt);
    }
    // the screen lines are set in pixels; a large print canvas scales them up
    const lineScale = PRINT ? Math.min(width, height) / 700 : 1;

    // the drawing fits into the space above the field-guide entry
    const room = height - (label ? label.elt.offsetHeight : 0);
    const fit = Math.min(width, room) * 0.82 / bodyLength;
    const breathe = 1 + WAVE.breathe * Math.sin(t * 0.7);
    const colours = currentColours();

    push();
    // float: wander and turn slowly around the middle of the frame
    translate(width / 2 + Math.sin(t * 0.13) * DRIFT.offset * bodyLength * fit,
              room / 2 + Math.cos(t * 0.11) * DRIFT.offset * bodyLength * fit);
    drawingContext.rotate(Math.sin(t * 0.09) * DRIFT.turn);
    scale(fit);
    translate(-axis.cx, -axis.cy);

    // body colour near the spine, tip colour towards the ends of the limbs; the
    // gradient pulls in with the limbs, so a frightened specimen keeps its warning tips
    const reach = maxD * breathe * (1 - CONTRACT * fear);
    const gradient = drawingContext.createLinearGradient(
        axis.cx - axis.nx * reach, axis.cy - axis.ny * reach,
        axis.cx + axis.nx * reach, axis.cy + axis.ny * reach);
    gradient.addColorStop(0.04, colours.tip);
    gradient.addColorStop(0.36, colours.body);
    gradient.addColorStop(0.64, colours.body);
    gradient.addColorStop(0.96, colours.tip);

    for (const sh of shapes) {
        if (sh.outline) {
            noFill();
            stroke(INK);
            strokeWeight(LINE.outline * lineScale / fit);
        } else {
            // the coloured shapes keep the drawing's black linework around them
            stroke(INK);
            strokeWeight(LINE.shapes * lineScale / fit);
            strokeJoin(ROUND);
            fill(colours.body);
            drawingContext.fillStyle = gradient;
        }
        beginShape();
        for (const p of sh.pts) {
            const [x, y] = place(p, t, breathe);
            vertex(x, y);
        }
        endShape(CLOSE);
    }
    pop();

    if (PRINT) {
        noLoop();
        document.body.dataset.ready = 'true';   // the poster waits for this
        return;
    }
    drawLabel();
}

/* the specimen's colours right now: pastel when calm, warning colours when frightened */
function currentColours() {
    const sp = SPECIMENS[specimen];
    const flare = Math.min(1, fear * 1.4);
    return {
        body: lerpColor(color(sp.calm[0]), color(sp.alarm[0]), flare).toString('#rrggbb'),
        tip: lerpColor(color(sp.calm[1]), color(sp.alarm[1]), flare).toString('#rrggbb'),
    };
}

/* a fast pointer (or finger) frightens the specimen */
function noticePointer(dt) {
    const onCanvas = mouseX > 0 && mouseY > 0 && mouseX < width && mouseY < height;
    const pointerHere = onCanvas && (!touchScreen || touching);
    if (pointerHere && last) {
        const speed = Math.hypot(mouseX - last.x, mouseY - last.y) / Math.max(dt, 0.001);
        if (speed > STARTLE_SPEED) fear = Math.min(1, fear + (speed / STARTLE_SPEED) * 0.35 * dt * 10);
    }
    last = pointerHere ? { x: mouseX, y: mouseY } : null;
}

/* the field guide entry, as HTML over the canvas (so the line wraps and is set in
   italics); only rewritten when the specimen or its state changes */
let label = null, shown = '';

function drawLabel() {
    if (!label) {
        label = createDiv('');
        label.addClass('entry');
        label.parent(document.body);
    }
    const sp = SPECIMENS[specimen];
    const state = fear > 0.25 ? 'alarmed' : 'calm';
    const key = specimen + state;
    if (key === shown) return;
    shown = key;
    const no = String(specimen + 1).padStart(2, '0');
    label.html(
        `<p class="entry-meta">No. ${no} · <i>${sp.latin}</i> · ${sp.name}</p>` +
        `<p class="entry-line">${sp.line}</p>` +
        `<p class="entry-meta">eats ${sp.eats} · <span class="entry-state">${state}</span>` +
        `<span class="entry-hint"> · stir fast to startle · tap: next</span></p>`
    );
}

function nextSpecimen() {
    specimen = (specimen + 1) % SPECIMENS.length;
}

// a click shows the next specimen
function mousePressed() {
    if (!touchScreen) nextSpecimen();
}

// on touch screens a finger stirs while it's down; only a short tap without moving
// shows the next specimen (p5 skips mousePressed for touches once these exist)
let tapStart = null;

function touchStarted() {
    touching = true;
    tapStart = { x: mouseX, y: mouseY, t: millis() };
    if (!EMBEDDED) return false;    // full page: no scrolling or zooming while stirring
}

function touchEnded() {
    touching = false;
    if (tapStart && millis() - tapStart.t < 300 && Math.hypot(mouseX - tapStart.x, mouseY - tapStart.y) < 12) nextSpecimen();
    tapStart = null;
    if (!EMBEDDED) return false;
}

function windowResized() {
    resizeCanvas(windowWidth, windowHeight);
}
