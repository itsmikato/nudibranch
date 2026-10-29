// render-posters.mjs – saves the six field-guide posters (poster.html) as A5 PNGs at 300 dpi.
//
//   node living-specimen/render-posters.mjs [output folder]      (default: field-guide/)
//
// Serves this repo on a local port, opens each poster in headless Google Chrome, waits
// until both stills are drawn and saves a screenshot. Needs Chrome in /Applications
// (or CHROME=/path/to/chrome) and Node 22 or newer.
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const REPO = path.resolve(import.meta.dirname, "..");
const OUT = path.resolve(process.argv[2] || path.join(REPO, "field-guide"));
const CHROME = process.env.CHROME || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SIZE = { width: 1748, height: 2480 };      // A5 at 300 dpi
const PORT = 8766, DEBUG_PORT = 9334;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// the specimens' names, for the file names
const SPECIMENS = new Function("window", fs.readFileSync(path.join(import.meta.dirname, "specimens.js"), "utf8") + "; return window.SPECIMENS;")({});

// a tiny static server for this repo
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".svg": "image/svg+xml", ".css": "text/css" };
const server = http.createServer((req, res) => {
    const file = path.join(REPO, decodeURIComponent(new URL(req.url, "http://x").pathname));
    if (!file.startsWith(REPO) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404).end();
        return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
}).listen(PORT);

const profile = fs.mkdtempSync(path.join(os.tmpdir(), "mikatoa-posters-"));
const chrome = spawn(CHROME, ["--headless=new", "--disable-gpu", "--hide-scrollbars",
    `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

try {
    let targets = [];
    for (let i = 0; i < 50 && !targets.length; i++) {
        try { targets = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).filter((t) => t.type === "page"); } catch {}
        await sleep(200);
    }
    const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
    let id = 0;
    const pending = new Map();
    ws.onmessage = (m) => {
        const d = JSON.parse(m.data);
        if (pending.has(d.id)) { pending.get(d.id)(d.result); pending.delete(d.id); }
    };
    await new Promise((r) => (ws.onopen = r));
    const send = (method, params = {}) => new Promise((r) => {
        pending.set(++id, r);
        ws.send(JSON.stringify({ id, method, params }));
    });

    await send("Emulation.setDeviceMetricsOverride", { ...SIZE, deviceScaleFactor: 1, mobile: false });
    await send("Page.enable");
    fs.mkdirSync(OUT, { recursive: true });

    for (const [i, sp] of SPECIMENS.entries()) {
        const n = i + 1;
        await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/living-specimen/poster.html?n=${n}` });
        let ready = false;
        for (let k = 0; k < 100 && !ready; k++) {
            await sleep(150);
            const r = await send("Runtime.evaluate", { expression: "document.body && document.body.dataset.ready === 'true'", returnByValue: true });
            ready = r.result.value;
        }
        if (!ready) throw new Error(`poster ${n} didn't finish drawing`);
        await sleep(300);           // fonts settle
        const shot = await send("Page.captureScreenshot", { format: "png", clip: { x: 0, y: 0, ...SIZE, scale: 1 } });
        const file = path.join(OUT, `${String(n).padStart(2, "0")}-${sp.latin.toLowerCase().replace(/\s+/g, "-")}.png`);
        fs.writeFileSync(file, Buffer.from(shot.data, "base64"));
        console.log("saved", path.relative(process.cwd(), file));
    }
    ws.close();
} finally {
    // Chrome keeps writing its profile until it has really exited
    await new Promise((r) => { chrome.once("exit", r); chrome.kill(); });
    server.close();
    fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
