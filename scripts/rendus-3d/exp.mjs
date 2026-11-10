import puppeteer from "puppeteer-core"
import fs from "node:fs"
const ids = process.argv.slice(2)
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] })
fs.mkdirSync("/tmp/mock/glb", { recursive: true })
for (const id of ids) {
  const p = await b.newPage()
  p.on("pageerror", (e) => console.log("pageerror:", e.message))
  await p.setViewport({ width: 900, height: 700 })
  await p.goto(`http://localhost:5199/?s=export&id=${id}`, { waitUntil: "networkidle0", timeout: 120000 })
  await p.waitForFunction(() => window.__glb, { timeout: 120000 })
  const r = await p.evaluate(() => window.__glb)
  fs.writeFileSync(`/tmp/mock/glb/${id}.glb`, Buffer.from(r.b64, "base64"))
  console.log(id, "écrans", r.screens, "triangles", r.tris, "taille", (r.size / 1024 / 1024).toFixed(2), "Mo", "renommés", r.renamed, r.bad.length ? "shaders: " + r.bad.join(",") : "")
  await p.close()
}
await b.close()
