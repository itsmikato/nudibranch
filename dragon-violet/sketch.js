// sketch.js – p5.js
// Dragon-wing path morph, v13 (2025-07-13)
// ------------------------------------------------------------------
//  • ID-based patch pairing (p1–p18 + outline) ✅
//  • Removed centroid-based pairing entirely
//  • Preserves debug, morph, draw logic
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

function preload() {
    upSvgRaw   = loadStrings('wing_up.svg');
    downSvgRaw = loadStrings('wing_down.svg');
}

function setup() {
    createCanvas(windowWidth, windowHeight);
    frameRate(60);
    angleMode(RADIANS);

    const srcUp   = upSvgRaw.join('\n');
    const srcDown = downSvgRaw.join('\n');

    // Parse and extract all paths with their IDs
    const parser = new DOMParser();
    const upDoc   = parser.parseFromString(srcUp, 'image/svg+xml');
    const downDoc = parser.parseFromString(srcDown, 'image/svg+xml');

    const pathsUpById = {};
    upDoc.querySelectorAll('path').forEach(p => {
        const id = p.id;
        const d  = p.getAttribute('d') || '';
        if (id) pathsUpById[id] = d;
    });

    const pathsDownById = {};
    downDoc.querySelectorAll('path').forEach(p => {
        const id = p.id;
        const d  = p.getAttribute('d') || '';
        if (id) pathsDownById[id] = d;
    });

    // Define exact ID matching order
    const idOrder = [
        'p1','p2','p3','p4','p5','p6','p7','p8','p9',
        'p10','p11','p12','p13','p14','p15','p16','p17','p18', // swapped if needed
        'outline'
    ];

    const paired = [];
    const extraUp = [];
    const extraDown = [];
    idOrder.forEach(id => {
        const upD = pathsUpById[id];
        const dnD = pathsDownById[id];
        if (upD && dnD) {
            paired.push([upD, dnD]);
        } else {
            console.warn(`SVG ID missing: ${id}`, upD, dnD);
            if (upD)   extraUp.push(upD);
            if (dnD)   extraDown.push(dnD);
        }
    });

    // Last pairing is outline
    const outlinePair    = paired.pop();
    const membranePairs  = paired;

    // Build morph functions
    loadFlubber(() => {
        try {
            outlineMorph = flubber.interpolate(outlinePair[0], outlinePair[1], { maxSegmentLength: 2 });
        } catch(e) {
            console.error('Outline morph failed', e);
        }

        patchMorphs = membranePairs.map(([u, d], i) => {
            try {
                return flubber.interpolate(u, d, { maxSegmentLength: 2 });
            } catch(e) {
                console.error(`Membrane morph ${i} failed`, e);
                return null;
            }
        });

        upOnlyMorphs   = extraUp.map(d => () => d);
        downOnlyMorphs = extraDown.map(d => () => d);

        debugInfo = {
            outlineLen: `${outlinePair[0].length}/${outlinePair[1].length}`,
            membranes: membranePairs.length,
            upOnly: extraUp.length,
            downOnly: extraDown.length
        };

        // Compute overall bbox for scaling
        computeBBox([...Object.values(pathsUpById), ...Object.values(pathsDownById)]);
    });
}

function draw() {
    if (!outlineMorph || !bbox) return;
    background(255);

    const theta = (frameCount % cycleFrames) / cycleFrames * TWO_PI;
    const t     = 0.5 - 0.5 * cos(theta);

    currentFrameDebug = { frame: frameCount, t, visiblePaths: 0, invisiblePaths: 0, morphErrors: [] };

    const ctx = drawingContext;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    // scale and center
    const m = 0.9;
    const s = min(width * m / bbox.width, height * m / bbox.height);
    ctx.translate(width/2, height/2);
    ctx.scale(s, s);
    ctx.translate(-(bbox.x + bbox.width/2), -(bbox.y + bbox.height/2));

    // draw membranes
    ctx.fillStyle = '#000'; ctx.globalAlpha = 1;
    patchMorphs.forEach((fn,i) => {
        if (!fn) { currentFrameDebug.invisiblePaths++; return; }
        try { ctx.fill(new Path2D(fn(t)), 'evenodd'); currentFrameDebug.visiblePaths++; }
        catch(e) { currentFrameDebug.morphErrors.push(`m${i}`); currentFrameDebug.invisiblePaths++; }
    });

    // draw one-sided
    const first = t<0.5;
    const f = first ? 1-t*2 : (t-0.5)*2;
    if (f>OPACITY_THRESHOLD) {
        ctx.globalAlpha = f;
        (first?upOnlyMorphs:downOnlyMorphs).forEach((m,i)=>{
            try{ctx.fill(new Path2D(m()),'evenodd'); currentFrameDebug.visiblePaths++;}
            catch{currentFrameDebug.invisiblePaths++;}
        });
    }
    ctx.globalAlpha = 1;

    // draw outline
    ctx.lineWidth = 2/s; ctx.strokeStyle='#000';
    try{ctx.stroke(new Path2D(outlineMorph(t))); currentFrameDebug.visiblePaths++;}
    catch{currentFrameDebug.invisiblePaths++;}

    ctx.restore();
    if(debugMode) displayDebugInfo();
}

function displayDebugInfo(){
    push(); resetMatrix(); fill(0,150); rect(10,10,300,120);
    fill(255); textSize(12); let y=20;
    text(`Frame ${currentFrameDebug.frame} t=${currentFrameDebug.t.toFixed(2)}`,20,y);
    y+=16; text(`Vis ${currentFrameDebug.visiblePaths} Invis ${currentFrameDebug.invisiblePaths}`,20,y);
    y+=16; text(`Outline: ${debugInfo.outlineLen}`,20,y);
    y+=16; text(`Mem: ${debugInfo.membranes} Up-only:${debugInfo.upOnly}`,20,y);
    y+=16; text(`Down-only:${debugInfo.downOnly}`,20,y);
    pop();
}

function loadFlubber(done){
    if(window.flubber) return done();
    const s=document.createElement('script'); s.src='https://cdn.jsdelivr.net/npm/flubber@0.4.2/dist/flubber.min.js'; s.onload=done; document.head.appendChild(s);
}

function computeBBox(arr){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'); document.body.appendChild(svg);
    let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
    arr.forEach(d=>{const p=document.createElementNS(svg.namespaceURI,'path');p.setAttribute('d',d);svg.appendChild(p);const b=p.getBBox();x0=min(x0,b.x);y0=min(y0,b.y);x1=max(x1,b.x+b.width);y1=max(y1,b.y+b.height);} );
    bbox={x:x0,y:y0,width:x1-x0,height:y1-y0}; svg.remove();
}

function windowResized(){ resizeCanvas(windowWidth,windowHeight); }
