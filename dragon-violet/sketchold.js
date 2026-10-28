// sketch.js – p5.js
// Dragon-wing path morph, v11 (2025-07-11) – ADVANCED DEBUGGING
// ------------------------------------------------------------------
//  • Smart outline detection by largest bounding-box area
//  • Separate outline and membrane patch pairing
//  • Proper centroid-based pairing for membranes
//  • No-overlap fade for one-sided tails  (Solution 1)
//  • Even-odd fill rule for every shape  (fixes residual shimmer)
//  • COMPREHENSIVE DEBUGGING for flickering and visibility issues
// ------------------------------------------------------------------

let upSvgRaw, downSvgRaw;
let outlineMorph;
let patchMorphs = [];
let upOnlyMorphs = [];
let downOnlyMorphs = [];
let bbox = null;
let debugInfo = null;

// Debug variables
let debugMode = true;
let frameAnalysis = [];
let currentFrameDebug = {};
let pathProblems = [];

const cycleFrames      = 120;   // full flap ≈2 s @ 60 fps
const OPACITY_THRESHOLD = 0.15; // fade cutoff

function preload () {
    upSvgRaw   = loadStrings('wing_up.svg');
    downSvgRaw = loadStrings('wing_down.svg');
}

function setup () {
    createCanvas(windowWidth, windowHeight);
    frameRate(60);
    angleMode(RADIANS);

    const pathsUp   = extractPaths(upSvgRaw.join('\n'));
    const pathsDown = extractPaths(downSvgRaw.join('\n'));

    if (!pathsUp.length || !pathsDown.length) {
        console.error('✖ No <path> found in one of the SVGs');
        noLoop(); return;
    }

    // Debug path extraction
    console.log('🔍 Path extraction debug:');
    console.log(`Up paths: ${pathsUp.length}`, pathsUp.map(p => p.substring(0, 50) + '...'));
    console.log(`Down paths: ${pathsDown.length}`, pathsDown.map(p => p.substring(0, 50) + '...'));

    loadFlubber(() => {
        // Pair patches and separate extras
        const { paired, extraA, extraB } = pairPatches(pathsUp, pathsDown);

        // Debug pairing
        console.log('🔍 Pairing debug:');
        console.log(`Paired: ${paired.length}`, paired.map(([a, b]) => ({
            aLength: a.length,
            bLength: b.length,
            aCentroid: centroid(a),
            bCentroid: centroid(b)
        })));
        console.log(`Extra A: ${extraA.length}`, extraA.map(p => p.substring(0, 30) + '...'));
        console.log(`Extra B: ${extraB.length}`, extraB.map(p => p.substring(0, 30) + '...'));

        // Detect outline pair (largest combined length)
        let outlinePairIndex = 0, maxLen = 0;
        paired.forEach(([a, b], i) => {
            const len = a.length + b.length;
            if (len > maxLen) { maxLen = len; outlinePairIndex = i; }
        });

        const outlinePair   = paired[outlinePairIndex];
        const membranePairs = paired.filter((_, i) => i !== outlinePairIndex);

        console.log('🔍 Outline detection:');
        console.log(`Outline pair index: ${outlinePairIndex}, length: ${maxLen}`);
        console.log(`Membrane pairs: ${membranePairs.length}`);

        // Test morph creation
        try {
            outlineMorph = flubber.interpolate(outlinePair[0], outlinePair[1],
                { maxSegmentLength: 2 });
            console.log('✓ Outline morph created successfully');
        } catch (e) {
            console.error('✖ Outline morph creation failed:', e);
        }

        patchMorphs = membranePairs.map(([a, b], i) => {
            try {
                const morph = flubber.interpolate(a, b, { maxSegmentLength: 2 });
                console.log(`✓ Membrane morph ${i} created successfully`);
                return morph;
            } catch (e) {
                console.error(`✖ Membrane morph ${i} creation failed:`, e);
                pathProblems.push({ type: 'membrane', index: i, error: e.message });
                return null;
            }
        });

        upOnlyMorphs   = extraA.map((d, i) => {
            console.log(`✓ Up-only morph ${i} created`);
            return () => d;
        });
        downOnlyMorphs = extraB.map((d, i) => {
            console.log(`✓ Down-only morph ${i} created`);
            return () => d;
        });

        debugInfo = {
            outlineLen : `${outlinePair[0].length}/${outlinePair[1].length}`,
            membranes  : membranePairs.length,
            upOnly     : extraA.length,
            downOnly   : extraB.length,
            problems   : pathProblems.length
        };

        computeBBox([...pathsUp, ...pathsDown]);
        console.log('🔍 BBox computed:', bbox);
    });
}

function draw () {
    if (!outlineMorph || !bbox) return;

    background(255);

    const theta = (frameCount % cycleFrames) / cycleFrames * TWO_PI;
    const t     = 0.5 - 0.5 * cos(theta); // ease in-out

    // Debug current frame
    currentFrameDebug = {
        frame: frameCount,
        theta: theta,
        t: t,
        phase: t < 0.5 ? 'up-to-down' : 'down-to-up',
        upOnlyOpacity: t < 0.5 ? (1 - t * 2) : 0,
        downOnlyOpacity: t >= 0.5 ? ((t - 0.5) * 2) : 0,
        visiblePaths: 0,
        invisiblePaths: 0,
        morphErrors: []
    };

    const ctx = drawingContext;
    ctx.save();
    ctx.imageSmoothingEnabled = true;

    // Fit wing to canvas
    const margin = 0.9;
    const s = min(width  * margin / bbox.width,
        height * margin / bbox.height);
    ctx.translate(width / 2, height / 2);
    ctx.scale(s, s);
    ctx.translate(-(bbox.x + bbox.width  / 2),
        -(bbox.y + bbox.height / 2));

    // ── membrane patches (morphing) ───────────────────────────────
    ctx.fillStyle   = '#000';
    ctx.globalAlpha = 1;

    patchMorphs.forEach((fn, i) => {
        if (!fn) {
            currentFrameDebug.morphErrors.push(`Membrane ${i}: null function`);
            return;
        }

        try {
            const pathStr = fn(t);
            if (!pathStr || pathStr.length === 0) {
                currentFrameDebug.morphErrors.push(`Membrane ${i}: empty path`);
                currentFrameDebug.invisiblePaths++;
                return;
            }

            const path2d = new Path2D(pathStr);
            ctx.fill(path2d, 'evenodd');
            currentFrameDebug.visiblePaths++;

            // Debug: highlight problematic paths
            if (debugMode && pathProblems.some(p => p.type === 'membrane' && p.index === i)) {
                ctx.strokeStyle = '#ff0000';
                ctx.lineWidth = 3 / s;
                ctx.stroke(path2d);
            }
        } catch (e) {
            currentFrameDebug.morphErrors.push(`Membrane ${i}: ${e.message}`);
            currentFrameDebug.invisiblePaths++;
        }
    });

    // ── one-sided patches, zero overlap  (Solution 1) ──────────────
    if (t < 0.5) {                               // first half
        const f = 1 - t * 2;                     // 1 → 0
        if (f > OPACITY_THRESHOLD) {
            ctx.globalAlpha = f;
            upOnlyMorphs.forEach((m, i) => {
                try {
                    const pathStr = m();
                    if (pathStr && pathStr.length > 0) {
                        ctx.fill(new Path2D(pathStr), 'evenodd');
                        currentFrameDebug.visiblePaths++;
                    } else {
                        currentFrameDebug.morphErrors.push(`Up-only ${i}: empty path`);
                        currentFrameDebug.invisiblePaths++;
                    }
                } catch (e) {
                    currentFrameDebug.morphErrors.push(`Up-only ${i}: ${e.message}`);
                    currentFrameDebug.invisiblePaths++;
                }
            });
        } else {
            currentFrameDebug.invisiblePaths += upOnlyMorphs.length;
        }
    } else {                                     // second half
        const f = (t - 0.5) * 2;                 // 0 → 1
        if (f > OPACITY_THRESHOLD) {
            ctx.globalAlpha = f;
            downOnlyMorphs.forEach((m, i) => {
                try {
                    const pathStr = m();
                    if (pathStr && pathStr.length > 0) {
                        ctx.fill(new Path2D(pathStr), 'evenodd');
                        currentFrameDebug.visiblePaths++;
                    } else {
                        currentFrameDebug.morphErrors.push(`Down-only ${i}: empty path`);
                        currentFrameDebug.invisiblePaths++;
                    }
                } catch (e) {
                    currentFrameDebug.morphErrors.push(`Down-only ${i}: ${e.message}`);
                    currentFrameDebug.invisiblePaths++;
                }
            });
        } else {
            currentFrameDebug.invisiblePaths += downOnlyMorphs.length;
        }
    }
    ctx.globalAlpha = 1;                         // reset

    // ── outline (stroke only) ──────────────────────────────────────
    ctx.lineWidth   = 2 / s;
    ctx.strokeStyle = '#000';

    try {
        const outlineStr = outlineMorph(t);
        if (outlineStr && outlineStr.length > 0) {
            ctx.stroke(new Path2D(outlineStr));
            currentFrameDebug.visiblePaths++;
        } else {
            currentFrameDebug.morphErrors.push('Outline: empty path');
            currentFrameDebug.invisiblePaths++;
        }
    } catch (e) {
        currentFrameDebug.morphErrors.push(`Outline: ${e.message}`);
        currentFrameDebug.invisiblePaths++;
    }

    ctx.restore();

    // Store frame analysis
    if (frameAnalysis.length < 1000) { // Limit memory usage
        frameAnalysis.push({...currentFrameDebug});
    }

    // Display debug info
    if (debugMode) {
        displayDebugInfo();
    }

    // Log critical issues
    if (currentFrameDebug.morphErrors.length > 0) {
        console.warn(`Frame ${frameCount} errors:`, currentFrameDebug.morphErrors);
    }

    if (currentFrameDebug.invisiblePaths > currentFrameDebug.visiblePaths) {
        console.warn(`Frame ${frameCount}: More invisible paths (${currentFrameDebug.invisiblePaths}) than visible (${currentFrameDebug.visiblePaths})`);
    }
}

function displayDebugInfo() {
    // Reset canvas transform for UI
    push();
    resetMatrix();

    // Semi-transparent background
    fill(0, 0, 0, 150);
    rect(10, 10, 400, 200);

    // Text styling
    fill(255);
    textAlign(LEFT, TOP);
    textSize(12);

    let y = 25;
    const lineHeight = 15;

    // Basic info
    text(`Frame: ${frameCount} | Phase: ${currentFrameDebug.phase}`, 20, y);
    y += lineHeight;
    text(`t: ${currentFrameDebug.t.toFixed(3)} | θ: ${currentFrameDebug.theta.toFixed(3)}`, 20, y);
    y += lineHeight;

    // Visibility info
    text(`Visible paths: ${currentFrameDebug.visiblePaths}`, 20, y);
    y += lineHeight;
    text(`Invisible paths: ${currentFrameDebug.invisiblePaths}`, 20, y);
    y += lineHeight;

    // Opacity info
    text(`Up-only opacity: ${currentFrameDebug.upOnlyOpacity.toFixed(3)}`, 20, y);
    y += lineHeight;
    text(`Down-only opacity: ${currentFrameDebug.downOnlyOpacity.toFixed(3)}`, 20, y);
    y += lineHeight;

    // Path counts
    if (debugInfo) {
        text(`Outline: ${debugInfo.outlineLen}`, 20, y);
        y += lineHeight;
        text(`Membranes: ${debugInfo.membranes} | Up-only: ${debugInfo.upOnly} | Down-only: ${debugInfo.downOnly}`, 20, y);
        y += lineHeight;
    }

    // Error summary
    if (currentFrameDebug.morphErrors.length > 0) {
        fill(255, 100, 100);
        text(`Errors: ${currentFrameDebug.morphErrors.length}`, 20, y);
        y += lineHeight;

        // Show first few errors
        for (let i = 0; i < Math.min(3, currentFrameDebug.morphErrors.length); i++) {
            text(`• ${currentFrameDebug.morphErrors[i]}`, 25, y);
            y += lineHeight;
        }
    }

    // Controls
    fill(255, 255, 100);
    text('Press D to toggle debug | Press S to save analysis', 20, height - 40);

    pop();
}

function keyPressed() {
    if (key === 'd' || key === 'D') {
        debugMode = !debugMode;
        console.log(`Debug mode: ${debugMode ? 'ON' : 'OFF'}`);
    }

    if (key === 's' || key === 'S') {
        saveAnalysis();
    }

    if (key === 'r' || key === 'R') {
        // Reset analysis
        frameAnalysis = [];
        pathProblems = [];
        console.log('Analysis reset');
    }
}

function saveAnalysis() {
    const analysis = {
        timestamp: new Date().toISOString(),
        debugInfo: debugInfo,
        pathProblems: pathProblems,
        frameAnalysis: frameAnalysis.slice(-120), // Last 2 seconds
        summary: {
            totalFrames: frameAnalysis.length,
            avgVisiblePaths: frameAnalysis.reduce((sum, f) => sum + f.visiblePaths, 0) / frameAnalysis.length,
            avgInvisiblePaths: frameAnalysis.reduce((sum, f) => sum + f.invisiblePaths, 0) / frameAnalysis.length,
            totalErrors: frameAnalysis.reduce((sum, f) => sum + f.morphErrors.length, 0),
            problematicFrames: frameAnalysis.filter(f => f.morphErrors.length > 0).length
        }
    };

    console.log('📊 Analysis Summary:', analysis.summary);

    // Save to file (if running locally)
    if (typeof saveJSON !== 'undefined') {
        saveJSON(analysis, 'dragon_wing_debug_analysis.json');
    } else {
        console.log('Full analysis:', analysis);
    }
}

/* ───────────────────────── helpers ───────────────────────────── */

function extractPaths (src) {
    const out = [];
    const re  = /<path[^>]*d="([^"]+)"/ig; let m;
    while ((m = re.exec(src))) {
        const path = m[1].trim();
        if (path.length > 0) {
            // Validate path has non-zero bounding box
            if (isValidPath(path)) {
                out.push(path);
            } else {
                console.warn('Invalid/degenerate path filtered out:', path.substring(0, 50) + '...');
            }
        } else {
            console.warn('Empty path found in SVG');
        }
    }
    return out;
}

function isValidPath(d) {
    try {
        // First check: path must have actual drawing commands
        if (!d || d.length < 3) return false;

        // Check if path has meaningful drawing commands (not just M or Z)
        const hasDrawingCommands = /[LlHhVvCcSsQqTtAa]/.test(d);
        if (!hasDrawingCommands) {
            console.warn('Path has no drawing commands (only M/Z)');
            return false;
        }

        // Create SVG element with proper stroke for bounding box calculation
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '1000');
        svg.setAttribute('height', '1000');
        document.body.appendChild(svg);

        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('stroke', 'black');
        p.setAttribute('stroke-width', '2');
        p.setAttribute('fill', 'none');
        svg.appendChild(p);

        const b = p.getBBox();
        svg.remove();

        // More lenient validation - allow paths with some dimension
        const minSize = 0.1; // very small threshold
        const isValid = b.width >= minSize && b.height >= minSize;

        if (!isValid) {
            console.warn(`Path too small: ${b.width.toFixed(2)}x${b.height.toFixed(2)}px`);
        }

        return isValid;
    } catch (e) {
        console.warn('Path validation error:', e.message);
        // If we can't validate, assume it's valid rather than losing data
        return true;
    }
}

function loadFlubber (done) {
    if (window.flubber) { done(); return; }
    const s = document.createElement('script');
    s.src   = 'https://cdn.jsdelivr.net/npm/flubber@0.4.2/dist/flubber.min.js';
    s.onload = done;
    s.onerror = () => {
        console.error('Failed to load flubber library');
        pathProblems.push({ type: 'library', error: 'Failed to load flubber' });
    };
    document.head.appendChild(s);
}

/* ── pairing ----------------------------------------------------- */

function pairPatches (listA, listB) {
    const paired = [], restA = [], restB = [...listB];

    // exact duplicates
    listA.forEach(d => {
        const j = restB.findIndex(x => x.trim() === d.trim());
        if (j !== -1) {
            paired.push([d, d]);
            restB.splice(j, 1);
            console.log(`✓ Exact match found: ${d.substring(0, 30)}...`);
        } else {
            restA.push(d);
        }
    });

    // greedy closest-centroid matching
    while (restA.length && restB.length) {
        const areas = restA.map((d, i) => ({ i, area: bboxArea(d) }));
        areas.sort((p, q) => q.area - p.area);

        const idxA = areas[0].i;
        const dA   = restA[idxA];

        try {
            const cA   = centroid(dA);

            let bestJ = 0, bestDist = Infinity;
            restB.forEach((d, j) => {
                try {
                    const dist = sqDist(cA, centroid(d));
                    if (dist < bestDist) { bestDist = dist; bestJ = j; }
                } catch (e) {
                    console.warn(`Centroid calculation failed for path ${j}:`, e);
                }
            });

            // Additional validation: avoid pairing identical or degenerate paths
            if (bestDist === 0 && dA === restB[bestJ]) {
                console.log(`✓ Identical path pair confirmed: ${dA.substring(0, 30)}...`);
            } else if (bestDist === 0) {
                console.warn(`⚠️ Zero-distance pairing detected but paths differ - potential issue`);
            }

            paired.push([dA, restB[bestJ]]);
            console.log(`✓ Paired by centroid: dist=${Math.sqrt(bestDist).toFixed(2)}, areas=${bboxArea(dA).toFixed(1)}/${bboxArea(restB[bestJ]).toFixed(1)}`);
            restA.splice(idxA, 1);
            restB.splice(bestJ, 1);
        } catch (e) {
            console.error(`Failed to pair path:`, e);
            pathProblems.push({ type: 'pairing', error: e.message });
            restA.splice(idxA, 1); // Remove problematic path
        }
    }

    return { paired, extraA: restA, extraB: restB };
}

function centroid (d) {
    try {
        // Create SVG element with proper stroke for bounding box calculation
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '1000');
        svg.setAttribute('height', '1000');
        document.body.appendChild(svg);

        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('stroke', 'black');
        p.setAttribute('stroke-width', '2');
        p.setAttribute('fill', 'none');
        svg.appendChild(p);

        const b = p.getBBox();
        svg.remove();

        if (b.width === 0 || b.height === 0) {
            console.warn('Zero-size bounding box detected after stroke adjustment');
            return [0, 0];
        }

        return [b.x + b.width / 2, b.y + b.height / 2];
    } catch (e) {
        console.error('Centroid calculation failed:', e);
        return [0, 0];
    }
}

const sqDist = ([x1, y1], [x2, y2]) => (x1 - x2)**2 + (y1 - y2)**2;

/* ── bbox -------------------------------------------------------- */

function bboxArea (d) {
    try {
        // Create SVG element with proper stroke for bounding box calculation
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', '1000');
        svg.setAttribute('height', '1000');
        document.body.appendChild(svg);

        const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', d);
        p.setAttribute('stroke', 'black');
        p.setAttribute('stroke-width', '2');
        p.setAttribute('fill', 'none');
        svg.appendChild(p);

        const b = p.getBBox();
        svg.remove();

        const area = b.width * b.height;

        if (area <= 0) {
            console.warn('Zero or negative area detected after stroke adjustment');
        }

        return area;
    } catch (e) {
        console.error('BBox area calculation failed:', e);
        return 0;
    }
}

function computeBBox (paths) {
    // Create SVG element with proper stroke for bounding box calculation
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '2000');
    svg.setAttribute('height', '2000');
    document.body.appendChild(svg);

    paths.forEach((d, i) => {
        try {
            const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            p.setAttribute('d', d);
            p.setAttribute('stroke', 'black');
            p.setAttribute('stroke-width', '2');
            p.setAttribute('fill', 'none');
            svg.appendChild(p);
        } catch (e) {
            console.error(`Failed to create path ${i}:`, e);
            pathProblems.push({ type: 'bbox', index: i, error: e.message });
        }
    });

    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    svg.querySelectorAll('path').forEach((p, i) => {
        try {
            const b = p.getBBox();
            x0 = min(x0, b.x);             y0 = min(y0, b.y);
            x1 = max(x1, b.x + b.width);   y1 = max(y1, b.y + b.height);
        } catch (e) {
            console.error(`Failed to get bbox for path ${i}:`, e);
        }
    });

    bbox = { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
    svg.remove();

    if (bbox.width <= 0 || bbox.height <= 0) {
        console.error('Invalid bounding box calculated:', bbox);
        pathProblems.push({ type: 'bbox', error: 'Invalid dimensions' });
    }
}

function windowResized () {
    resizeCanvas(windowWidth, windowHeight);
}