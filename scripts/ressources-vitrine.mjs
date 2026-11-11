// NEXORA #086 : ressources du site vitrine tirées de sources libres, préparées une fois et rangées dans site/src/.
//   node scripts/ressources-vitrine.mjs [appareils] [logos] [carte]      (sans argument : tout)
// appareils : cadres photoréalistes de l'ensemble « Devices » de Meta redistribué par fastlane (frameit-frames)
//             et habillages officiels d'Android Studio déjà livrés avec NEXORA (vendor/skins, Apache 2.0),
//             réduits en WebP dans site/src/assets/appareils/ (mesures des dalles : site/src/lib/devices.ts).
// logos     : logos officiels des technologies citées par le site, « SVG Logos » (gilbarbara/logos, CC0), avec
//             une variante claire pour les logos noirs, illisibles sur le fond sombre (site/src/assets/logos/).
// carte     : masque des terres du globe (carte du monde du domaine public embarquée par la bibliothèque cobe),
//             256 × 128 points, écrit en base64 dans site/src/lib/worldmap.ts.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SITE = path.join(ROOT, "site", "src")
const SKINS = path.join(ROOT, "nexora", "app", "renderer", "vendor", "skins")
const FRAMEIT = "https://raw.githubusercontent.com/fastlane/frameit-frames/gh-pages/1772014847/"
const LOGOS = "https://raw.githubusercontent.com/gilbarbara/logos/main/logos/"
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "nx-vitrine-"))

async function download(url, file) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${url} : ${res.status}`)
  fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()))
  return file
}
function magick(args) {
  const r = spawnSync("magick", args, { encoding: "utf8" })
  if (r.status !== 0) throw new Error(`magick ${args.join(" ")} : ${r.stderr}`)
}

// Nom du fichier produit, source, échelle (les images sont affichées à 300–900 px de large, nettes en 2x).
const DEVICES = [
  ["iphone-17-pro.webp", { frameit: "Apple iPhone 17 Pro Silver.png" }, 0.5],
  ["iphone-17-pro-bleu.webp", { frameit: "Apple iPhone 17 Pro Deep Blue.png" }, 0.5],
  ["galaxy-s21-ultra.webp", { frameit: "Samsung Galaxy S21 Ultra 5G Black.png" }, 0.45],
  ["ipad-pro-12-9.webp", { frameit: "Apple iPad Pro (12.9-inch) (4th generation) Space Gray.png" }, 0.5],
  ["macbook-pro-16.webp", { frameit: "Apple Macbook Pro 16 Space Gray.png" }, 0.5],
  ["surface-pro-x.webp", { frameit: "Surface Pro X Black.png" }, 0.5],
  ["tv-4k.webp", { skin: "tv_4k/back.png" }, 0.4],
  ["voiture.webp", { skin: "automotive_1024/back.png" }, 0.6],
  ["montre.webp", { skin: "wearos_large_round/device_bezel.png" }, 1],
]

async function appareils() {
  const out = path.join(SITE, "assets", "appareils")
  for (const [name, src, scale] of DEVICES) {
    const file = src.frameit
      ? await download(FRAMEIT + encodeURIComponent(src.frameit), path.join(TMP, name + ".png"))
      : path.join(SKINS, src.skin)
    magick([file, "-resize", `${scale * 100}%`, "-quality", "88", "-define", "webp:alpha-quality=100", "-define", "webp:method=6", path.join(out, name)])
    console.log(`  appareils/${name} (${Math.round(fs.statSync(path.join(out, name)).size / 1024)} Ko)`)
  }
}

// Logos : nom du fichier source (gilbarbara/logos) → nom produit, et couleurs à remplacer pour le fond sombre.
const LIGHT = { "#000000": "#FFFFFF", "#000": "#FFFFFF", black: "#FFFFFF" }
const LOGO_LIST = [
  ["react"], ["nextjs-icon", "nextjs", { "#000000": "#FFFFFF", "#FFFFFF": "#000000" }], ["vue"], ["angular-icon", "angular"],
  ["svelte-icon", "svelte"], ["astro-icon", "astro", { "#17191E": "#FFFFFF", "#FFFFFF": "#17191E" }], ["expo-icon", "expo", { "#000020": "#FFFFFF" }],
  ["flutter-icon", "flutter"], ["laravel"], ["django-icon", "django"], ["rails"], ["hugo"], ["dotnet"], ["express", "express", { "#222222": "#FFFFFF" }],
  ["nodejs-icon", "nodejs"], ["pnpm", "pnpm", { "#4E4E4E": "#E8E8E8" }], ["yarn"], ["bun"], ["deno", "deno", { "#000000": "#FFFFFF", "#FFFFFF": "#000000" }],
  ["python"], ["php"], ["composer"], ["ruby"], ["go"], ["git-icon", "git"], ["typescript-icon", "typescript"], ["pwa", "pwa", { "#3D3D3D": "#FFFFFF" }],
  ["html-5", "html5"], ["css"], ["javascript"],
  ["claude-icon", "claude"], ["openai-icon", "openai", LIGHT], ["google-gemini-icon", "gemini"], ["mistral-ai-icon", "mistral"], ["ollama", "ollama", LIGHT],
  ["cloudflare-icon", "cloudflare"], ["vercel-icon", "vercel", LIGHT], ["netlify-icon", "netlify"], ["github-icon", "github", { "#161614": "#FFFFFF" }],
  ["android-icon", "android"], ["google-play-icon", "googleplay"], ["microsoft-windows-icon", "windows"], ["electron"], ["wearos"],
  ["supabase-icon", "supabase"], ["sqlite"], ["postgresql"], ["vitest"], ["jest"], ["playwright"], ["eslint"], ["docker-icon", "docker"],
]

async function logos() {
  const out = path.join(SITE, "assets", "logos")
  fs.mkdirSync(out, { recursive: true })
  for (const [src, name = src, swap] of LOGO_LIST) {
    const res = await fetch(LOGOS + src + ".svg")
    if (!res.ok) throw new Error(`logo ${src} : ${res.status}`)
    let svg = await res.text()
    svg = svg.replace(/<\?xml[^>]*>\s*/, "").replace(/<title>[^<]*<\/title>\s*/, "")
    if (swap) {
      // Remplacements simultanés (noir ↔ blanc sans collision), dans les attributs fill/stop-color et les styles.
      const keys = Object.keys(swap).sort((a, b) => b.length - a.length)
      const re = new RegExp(`((?:fill|stop-color)[=:]\\s*"?)(${keys.map((k) => k.replace("#", "\\#")).join("|")})(?![0-9A-Fa-f])`, "gi")
      svg = svg.replace(re, (_, pre, c) => pre + swap[keys.find((k) => k.toLowerCase() === c.toLowerCase())])
    }
    fs.writeFileSync(path.join(out, name + ".svg"), svg)
  }
  console.log(`  ${LOGO_LIST.length} logos dans site/src/assets/logos/`)
}

async function carte() {
  const meta = await (await fetch("https://registry.npmjs.org/cobe/2.0.1")).json()
  const tgz = await download(meta.dist.tarball, path.join(TMP, "cobe.tgz"))
  spawnSync("tar", ["xzf", tgz, "-C", TMP])
  const js = fs.readFileSync(path.join(TMP, "package", "dist", "index.esm.js"), "utf8")
  const b64 = /data:image\/png;base64,([A-Za-z0-9+/=]+)/.exec(js)?.[1]
  if (!b64) throw new Error("carte introuvable dans cobe")
  const png = path.join(TMP, "carte.png")
  fs.writeFileSync(png, Buffer.from(b64, "base64"))
  const raw = spawnSync("magick", [png, "-depth", "8", "gray:-"], { maxBuffer: 1 << 24 }).stdout
  if (raw.length !== 256 * 128) throw new Error(`carte : ${raw.length} octets`)
  const bits = Buffer.alloc(raw.length / 8)
  for (let i = 0; i < raw.length; i += 1) if (raw[i] > 127) bits[i >> 3] |= 1 << (7 - (i & 7))
  const ts = [
    "// NEXORA #086 : masque des terres du globe, 256 × 128 points (équirectangulaire, ligne par ligne, 1 = terre).",
    "// Carte du monde du domaine public (Wikimedia, « World map blank without borders ») embarquée par la bibliothèque",
    "// cobe (MIT) ; extraite par `node scripts/ressources-vitrine.mjs carte`.",
    "export const MAP_W = 256",
    "export const MAP_H = 128",
    `export const MAP_BITS = "${bits.toString("base64")}"`,
    "",
  ].join("\n")
  fs.writeFileSync(path.join(SITE, "lib", "worldmap.ts"), ts)
  console.log("  lib/worldmap.ts")
}

const wanted = process.argv.slice(2)
const all = !wanted.length
try {
  if (all || wanted.includes("appareils")) await appareils()
  if (all || wanted.includes("logos")) await logos()
  if (all || wanted.includes("carte")) await carte()
} finally {
  fs.rmSync(TMP, { recursive: true, force: true })
}
