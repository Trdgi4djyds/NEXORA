import puppeteer from "puppeteer-core"
const [,, route, sel, out, wait = "3500", w = "1440", h = "900"] = process.argv
const b = await puppeteer.launch({ executablePath: "/usr/bin/chromium", args: ["--no-sandbox"] })
const p = await b.newPage()
await p.setViewport({ width: Number(w), height: Number(h) })
await p.goto("http://localhost:3000/site/" + route, { waitUntil: "networkidle2" })
await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)) } })
await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: "center" }), sel)
await new Promise((r) => setTimeout(r, Number(wait)))
await p.screenshot({ path: out })
await b.close()
