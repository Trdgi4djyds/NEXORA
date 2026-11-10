import puppeteer from "puppeteer-core"
const [,, scene = "hero", w = "1600", h = "1000", out = `/tmp/mock/${scene}.png`] = process.argv
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox", "--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"] })
const p = await b.newPage()
p.on("console", (m) => { if (m.type() === "error" || m.type() === "warning") console.log("console:", m.text().slice(0, 200)) })
p.on("pageerror", (e) => console.log("pageerror:", e.message))
await p.setViewport({ width: +w, height: +h, deviceScaleFactor: 1 })
await p.goto(`http://localhost:5199/?s=${scene}${process.env.Q ? "&" + process.env.Q : ""}`, { waitUntil: "networkidle0", timeout: 120000 })
await new Promise((r) => setTimeout(r, 6000))
await p.screenshot({ path: out, omitBackground: true })
await b.close()
console.log("ok", out)
