/**
 * 8 000 neon dots, 6 000 hops per frame, clipped to the dragon’s
 * original black regions. No pulse.
 */

let svgRoot, dotGroup, dots = [];
let blackShapes = [];              // {innerBox, area}
let cumulative = [], totalArea = 0;

const SIZE        = 600;
const DOT_COUNT   = 10000;
const DOT_JUMP    = 5000;
const DOT_MIN_R   = 15;
const DOT_MAX_R   = 50;
const MARGIN      = DOT_MAX_R + 1;       // keep off the visible stroke

const neon = ['#c800ff',   // electric violet
              '#00e5ff'];

function setup () {
  noCanvas();

  fetch('dragon.svg')
    .then(r => r.text())
    .then(raw => {
      /* ─────────────────  inject SVG  ───────────────────────── */
      svgRoot = new DOMParser()
                  .parseFromString(raw,'image/svg+xml').documentElement;
      Object.assign(svgRoot.style,{
        position:'absolute',width:SIZE+'px',height:SIZE+'px',
        left:'calc(50% - 300px)',top:'40px'
      });
      document.body.appendChild(svgRoot);

      /* ★ NEW: prepare a <defs><clipPath> we will clip dots against */
      const defs     = document.createElementNS(svgRoot.namespaceURI,'defs');
      const clipPath = document.createElementNS(svgRoot.namespaceURI,'clipPath');
      clipPath.id    = 'dotClip';
      clipPath.setAttribute('clipPathUnits','userSpaceOnUse');
      defs.appendChild(clipPath);
      svgRoot.prepend(defs);   // must be before we reference it later

      /* ─────────────────  find black shapes  ─────────────────── */
      svgRoot.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon')
        .forEach(el=>{
          const c = getFill(el);
          if (isBlack(c)){
            /* ★ NEW: clone node into the clipPath once (no stroke) */
            clipPath.appendChild(el.cloneNode(true));

            const b = el.getBBox();
            const inner = {
              x:b.x+MARGIN,
              y:b.y+MARGIN,
              width :Math.max(0,b.width -2*MARGIN),
              height:Math.max(0,b.height-2*MARGIN)
            };
            const area = inner.width*inner.height;
            if(area){
              blackShapes.push({box:inner,area});
              totalArea+=area;
              cumulative.push(totalArea);
            }
          }
        });

      if(!blackShapes.length){
        console.warn('⚠️  No black regions found – nothing to sparkle.');
        return;
      }

      /* ─────────────────  dot pool  ─────────────────────────── */
      const ns = 'http://www.w3.org/2000/svg';
      dotGroup = document.createElementNS(ns,'g');
      /* ★ NEW: clip everything in dotGroup to the black outline */
      dotGroup.setAttribute('clip-path','url(#dotClip)');
      svgRoot.appendChild(dotGroup);

      for(let i=0;i<DOT_COUNT;i++){
        const c = document.createElementNS(ns,'circle');
        dotGroup.appendChild(c);
        dots.push(c);
        randomiseDot(c);            // initial pos + colour
      }

      console.log(`✓ clipPath built from ${blackShapes.length} black shapes`);
      console.log(`dots ${DOT_COUNT}, jumps/frame ${DOT_JUMP}`);
    })
    .catch(err=>console.error('SVG load failed:',err));
}

function draw(){
  if(!totalArea) return;

  for(let i=0;i<DOT_JUMP;i++){
    randomiseDot(dots[(frameCount*DOT_JUMP+i)%DOT_COUNT]);
  }

  if(frameCount%60===0) console.log(`frame ${frameCount}`);
}

/* ────────────── helpers ─────────────── */

function getFill(el){
  const attr=(el.getAttribute('fill')||'').trim().toLowerCase();
  if(attr) return attr;
  const style=(el.getAttribute('style')||'').toLowerCase();
  const m=style.match(/fill\s*:\s*([^;]+)/);
  return m?m[1].trim():'';
}
function isBlack(c){
  return (
    c===''||c==='#000'||c==='#000000'||c==='black'||c.startsWith('rgb(0,0,0')
  );
}

function randomiseDot(dot){
  const pick=Math.random()*totalArea;
  const idx=cumulative.findIndex(c=>c>=pick);
  const b = blackShapes[idx].box;

  const x=b.x+Math.random()*b.width;
  const y=b.y+Math.random()*b.height;
  const r=DOT_MIN_R+Math.random()*(DOT_MAX_R-DOT_MIN_R);

  dot.setAttribute('cx',x);
  dot.setAttribute('cy',y);
  dot.setAttribute('r', r.toFixed(2));
  dot.setAttribute('fill',neon[Math.floor(Math.random()*neon.length)]);
}
