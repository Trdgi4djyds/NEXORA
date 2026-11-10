// NEXORA #096 : `pnpm indexnow` : signale aux moteurs IndexNow (Bing, Yandex, Seznam, Naver…) les adresses du plan du
// site publié, juste après une publication. La clé publique (site/seo.json) est publiée par la construction à
// https://nexoradevs.online/<clé>.txt ; Google n'utilise pas IndexNow (Search Console lit sitemap.xml).
//   pnpm indexnow [--site https://nexoradevs.online]
import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const { indexNowKey } = JSON.parse(fs.readFileSync(path.join(ROOT, "site", "seo.json"), "utf8"))
const i = process.argv.indexOf("--site")
const site = (i > 0 ? process.argv[i + 1] : "https://nexoradevs.online").replace(/\/+$/, "")
const host = new URL(site).host

const key = await fetch(`${site}/${indexNowKey}.txt`).then((r) => (r.ok ? r.text() : ""))
if (key.trim() !== indexNowKey) throw new Error(`Clé IndexNow introuvable à ${site}/${indexNowKey}.txt : publier d’abord le site.`)
const xml = await fetch(`${site}/sitemap.xml`).then((r) => r.text())
const urlList = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1])
const res = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: { "content-type": "application/json; charset=utf-8" },
  body: JSON.stringify({ host, key: indexNowKey, keyLocation: `${site}/${indexNowKey}.txt`, urlList }),
})
console.log(`IndexNow : ${urlList.length} adresses envoyées, réponse ${res.status} ${res.statusText}`)
if (res.status >= 400) process.exitCode = 1
