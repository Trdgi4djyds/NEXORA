// NEXORA #083 : ressources du lanceur NEXORA Devs Toolbox (launcher/), à relancer après un changement de version
// du lanceur (var version de launcher/main.go), du logo ou des icônes :
//   1. launcher/assets/logo.png : image 256 × 256 de l'icône de NEXORA (nexora/app/build/icon.ico), dessinée dans
//      les fenêtres du lanceur ;
//   2. launcher/icons.go : tracés des icônes Lucide des fenêtres (mêmes icônes que NEXORA, licence ISC, voir
//      nexora/app/renderer/nx/icons/LICENCE.md), cercles, rectangles et lignes convertis en tracés ;
//   3. launcher/rsrc_windows_amd64.syso : icône de l'exécutable (Explorateur, barre des tâches, raccourcis),
//      informations de version (Société NEXORA, description, version) et manifeste (sans droits d'administrateur,
//      DPI par écran, contrôles communs 6), liés automatiquement par `go build` pour Windows x64.
// Outils installés HORS du dépôt :
//   go install github.com/tc-hib/go-winres@v0.3.3   (GOBIN=/tmp/gobin, ou WINRES=<chemin>)
//   mkdir -p /tmp/lucide && cd /tmp/lucide && echo '{}' > package.json && pnpm add @iconify-json/lucide
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { ROOT } from "../preview/server.mjs"

const fail = (m) => {
  console.error(`\n${m}`)
  process.exit(1)
}
const L = path.join(ROOT, "launcher")
const version = /var version = "([^"]+)"/.exec(fs.readFileSync(path.join(L, "main.go"), "utf8"))?.[1]
if (!version) fail("Version du lanceur introuvable dans launcher/main.go.")
const ico = fs.readFileSync(path.join(ROOT, "nexora/app/build/icon.ico"))

// 1. Logo : image PNG 256 × 256 de l'icône.
let png = null
for (let i = 0; i < ico.readUInt16LE(4); i++) {
  const o = 6 + 16 * i
  const size = ico.readUInt32LE(o + 8), off = ico.readUInt32LE(o + 12)
  if ((ico[o] || 256) === 256 && ico.subarray(off, off + 4).toString("hex") === "89504e47") png = ico.subarray(off, off + size)
}
if (!png) fail("Image 256 × 256 (PNG) absente de nexora/app/build/icon.ico.")
fs.mkdirSync(path.join(L, "assets"), { recursive: true })
fs.writeFileSync(path.join(L, "assets", "logo.png"), png)

// 2. Icônes Lucide.
const NAMES = {
  shieldCheck: "shield-check", shieldAlert: "shield-alert", wifiOff: "wifi-off", serverOff: "server-off",
  fileWarning: "file-warning", arrowUpCircle: "circle-arrow-up", trash: "trash-2", x: "x", check: "check",
  info: "info", alert: "triangle-alert", circleX: "circle-x", download: "download", refresh: "refresh-cw",
}
const require = createRequire(import.meta.url)
let SET
try {
  SET = require(path.join(process.env.LUCIDE_DIR || "/tmp/lucide", "node_modules/@iconify-json/lucide/icons.json"))
} catch {
  fail("Icônes Lucide introuvables : voir l’en-tête du script (@iconify-json/lucide hors du dépôt).")
}
const resolve = (n) => SET.icons[n] || (SET.aliases?.[n] && resolve(SET.aliases[n].parent))
const attr = (tag, k) => (new RegExp(`\\s${k}="([^"]*)"`).exec(tag) || [])[1]
const num = (tag, k, d = 0) => Number(attr(tag, k) ?? d)
function toPaths(body) {
  const out = []
  for (const [tag, name] of body.matchAll(/<(path|circle|ellipse|rect|line|polyline|polygon)\b[^>]*>/g)) {
    if (name === "path") out.push(attr(tag, "d"))
    else if (name === "circle" || name === "ellipse") {
      const cx = num(tag, "cx"), cy = num(tag, "cy"), rx = num(tag, "r", num(tag, "rx")), ry = num(tag, "r", num(tag, "ry"))
      out.push(`M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${2 * rx} 0a${rx} ${ry} 0 1 0 ${-2 * rx} 0z`)
    } else if (name === "rect") {
      const x = num(tag, "x"), y = num(tag, "y"), w = num(tag, "width"), h = num(tag, "height")
      const r = Math.min(num(tag, "rx", num(tag, "ry")), w / 2, h / 2)
      out.push(r > 0
        ? `M${x + r} ${y}H${x + w - r}a${r} ${r} 0 0 1 ${r} ${r}V${y + h - r}a${r} ${r} 0 0 1 ${-r} ${r}H${x + r}a${r} ${r} 0 0 1 ${-r} ${-r}V${y + r}a${r} ${r} 0 0 1 ${r} ${-r}z`
        : `M${x} ${y}h${w}v${h}h${-w}z`)
    } else if (name === "line") out.push(`M${num(tag, "x1")} ${num(tag, "y1")}L${num(tag, "x2")} ${num(tag, "y2")}`)
    else {
      const pts = (attr(tag, "points") || "").trim().split(/[\s,]+/).map(Number)
      let d = ""
      for (let i = 0; i + 1 < pts.length; i += 2) d += `${i ? "L" : "M"}${pts[i]} ${pts[i + 1]}`
      out.push(name === "polygon" ? d + "z" : d)
    }
  }
  return out
}
let go = `// Fichier généré par scripts/launcher-ressources.mjs (NEXORA #083) : ne pas modifier à la main.
// Icônes Lucide (https://lucide.dev, licence ISC), au trait sur la grille de 24, comme dans NEXORA.

package main

var lucide = map[string][]string{
`
for (const [k, n] of Object.entries(NAMES)) {
  const icon = resolve(n)
  if (!icon) fail(`Icône Lucide absente : ${n}`)
  go += `\t${JSON.stringify(k)}: {${toPaths(icon.body).map((d) => JSON.stringify(d)).join(", ")}},\n`
}
go += "}\n"
fs.writeFileSync(path.join(L, "icons.go"), go)
const gofmt = [process.env.GOFMT, "/tmp/go/bin/gofmt", "gofmt"].find((g) => g && spawnSync(g, ["-l", path.join(L, "icons.go")], { stdio: "ignore" }).status === 0)
if (gofmt) spawnSync(gofmt, ["-w", path.join(L, "icons.go")])

// 3. Ressources Windows (icône, version, manifeste).
const winres = process.env.WINRES || [path.join(process.env.GOBIN || "/tmp/gobin", "go-winres"), "go-winres"].find((p) => spawnSync(p, ["help"], { stdio: "ignore" }).status === 0)
if (!winres) fail("go-winres introuvable : voir l’en-tête du script.")
const work = fs.mkdtempSync(path.join(os.tmpdir(), "nx-winres-"))
fs.writeFileSync(path.join(work, "icon.ico"), ico)
const v4 = [...version.split(".").map((n) => parseInt(n, 10) || 0), 0, 0, 0].slice(0, 4).join(".")
const info = {
  CompanyName: "NEXORA", FileDescription: "NEXORA Devs Toolbox", FileVersion: v4, InternalName: "NEXORA-Devs-Toolbox",
  LegalCopyright: "© NEXORA", OriginalFilename: "NEXORA-Devs-Toolbox.exe", ProductName: "NEXORA Devs Toolbox", ProductVersion: v4,
  Comments: "Lanceur et mises à jour vérifiées de NEXORA",
}
fs.writeFileSync(path.join(work, "winres.json"), JSON.stringify({
  RT_GROUP_ICON: { APP: { "0000": "icon.ico" } },
  RT_MANIFEST: {
    "#1": {
      "0409": {
        identity: { name: "NEXORA.DevsToolbox", version: v4 },
        description: "NEXORA Devs Toolbox",
        "minimum-os": "win10",
        "execution-level": "as invoker",
        "ui-access": false,
        "auto-elevate": false,
        "dpi-awareness": "per monitor v2",
        "disable-theming": false,
        "disable-window-filtering": false,
        "high-resolution-scrolling-aware": false,
        "ultra-high-resolution-scrolling-aware": false,
        "long-path-aware": true,
        "printer-driver-isolation": false,
        "gdi-scaling": false,
        "segment-heap": false,
        "use-common-controls-v6": true,
      },
    },
  },
  RT_VERSION: { "#1": { "0000": { fixed: { file_version: v4, product_version: v4 }, info: { "040c": info } } } },
}, null, 2))
const r = spawnSync(winres, ["make", "--in", path.join(work, "winres.json"), "--arch", "amd64", "--out", path.join(L, "rsrc")], { cwd: work, stdio: "inherit" })
fs.rmSync(work, { recursive: true, force: true })
if (r.status !== 0) fail("go-winres a échoué.")
console.log(`Ressources du lanceur ${version} : launcher/assets/logo.png (${png.length} octets), launcher/icons.go (${Object.keys(NAMES).length} icônes), launcher/rsrc_windows_amd64.syso.`)
