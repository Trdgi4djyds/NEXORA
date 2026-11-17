import puppeteer from "puppeteer-core"
import http from "node:http"; import fs from "node:fs"; import path from "node:path"
const ROOT = "/workspaces/default/code"
const T = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".woff": "font/woff", ".glb": "model/gltf-binary" }
const srv = http.createServer((q, r) => { const f = path.join(ROOT, decodeURIComponent(new URL(q.url, "http://x").pathname)); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); r.end(); console.log("404", q.url); return } r.writeHead(200, { "Content-Type": T[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(r) })
await new Promise((r) => srv.listen(0, "127.0.0.1", r))
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
const p = await b.newPage(); await p.setViewport({ width: 1920, height: 1080 })
p.on("console", (m) => console.log("console:", m.text()))
await p.goto(`http://127.0.0.1:${srv.address().port}/scripts/video/presentation.html`)
await p.waitForFunction(() => window.__ready instanceof Promise, { timeout: 60000 }); await p.evaluate(() => window.__ready)
const out = await p.evaluate(() => { window.seek(1); const w = document.querySelector(".chw"); const r = w.getBoundingClientRect(); const l = w.parentElement; const lr = l.getBoundingClientRect(); return { r: [r.x, r.y, r.width, r.height], tf: w.style.transform, layer: [lr.x, lr.y, lr.width, lr.height], persp: getComputedStyle(l).perspective, po: getComputedStyle(l).perspectiveOrigin, pos: [getComputedStyle(w).left, getComputedStyle(w).top] } })
console.log(JSON.stringify(out, null, 1))
await b.close(); srv.close()
