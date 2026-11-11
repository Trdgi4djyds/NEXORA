// NEXORA #068 : captures des planches de direction artistique (scripts/vitrine/directions/*.html).
//   node scripts/directions-vitrine.mjs
import fs from "node:fs"
import http from "node:http"
import path from "node:path"
import { fileURLToPath } from "node:url"
import puppeteer from "puppeteer-core"
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const OUT = process.argv[2] || path.join(ROOT, "captures", "directions")
const MIME = { ".html": "text/html; charset=utf-8", ".webp": "image/webp", ".png": "image/png", ".woff2": "font/woff2", ".css": "text/css" }
const server = http.createServer((req, res) => {
  const file = path.join(ROOT, decodeURIComponent(new URL(req.url, "http://x").pathname))
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return res.writeHead(404).end()
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" })
  fs.createReadStream(file).pipe(res)
})
await new Promise((ok) => server.listen(4192, ok))
fs.mkdirSync(OUT, { recursive: true })
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || "/usr/bin/chromium", headless: true, args: ["--no-sandbox", "--disable-gpu"] })
for (const f of fs.readdirSync(path.join(ROOT, "scripts", "vitrine", "directions")).filter((n) => n.endsWith(".html"))) {
  const page = await browser.newPage()
  await page.setViewport({ width: 1440, height: 900 })
  await page.goto(`http://localhost:4192/scripts/vitrine/directions/${f}`, { waitUntil: "networkidle0" })
  await page.evaluate(() => document.fonts.ready)
  const out = path.join(OUT, f.replace(".html", ".png"))
  await page.screenshot({ path: out, fullPage: true })
  await page.screenshot({ path: out.replace(".png", "-haut.png") })
  console.log(out)
}
await browser.close()
server.close()
