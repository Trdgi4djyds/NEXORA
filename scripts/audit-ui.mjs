#!/usr/bin/env node
// NEXORA #045 : audit de mise en page de l'aperçu (débordements, textes coupés, chevauchements), espace par espace et
// à plusieurs tailles de fenêtre (NEXORA accepte au minimum 760 × 520).
//   pnpm audit:ui [écrans…] [--tailles 1440x900,1280x800,1024x700,880x600] [--theme sombre] [--json]
// Écrans : accueil, responsive, browser, dev, apps, studio, design, securite, desktop (défaut : tous).
// Relevés (éléments visibles seulement) :
//   - fenêtre : élément qui sort de la fenêtre sans conteneur qui défile ou qui le coupe ;
//   - coupé : texte coupé par son conteneur sans points de suspension ;
//   - déborde : élément dans le flux qui sort de son parent (carte, barre, bouton) ;
//   - chevauche : deux éléments voisins dans le flux qui se recouvrent.
// Code de sortie 1 s'il reste un relevé.
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROME_PATH || "/usr/bin/chromium"
const URL = process.env.NX_URL || "http://localhost:3000/"
const SPACES = {
  accueil: "home",
  responsive: "preview",
  browser: "browser",
  dev: "dev",
  apps: "android",
  studio: "studio",
  design: "design",
  securite: "security",
  desktop: "desktop",
}
const args = process.argv.slice(2)
const opt = (name, def) => {
  const i = args.indexOf(name)
  return i >= 0 ? args[i + 1] : def
}
const sizes = opt("--tailles", "1440x900,1280x800,1024x700,880x600")
  .split(",")
  .map((s) => s.split("x").map(Number))
const dark = opt("--theme", "") === "sombre"
const json = args.includes("--json")
const wanted = args.filter(
  (a, i) =>
    !a.startsWith("--") &&
    !(i > 0 && args[i - 1].startsWith("--") && args[i - 1] !== "--json"),
)
const screens = wanted.length ? wanted : Object.keys(SPACES)

function inspect() {
  const W = innerWidth,
    H = innerHeight,
    out = []
  const short = (el) => {
    const parts = []
    for (
      let e = el;
      e && e !== document.body && parts.length < 4;
      e = e.parentElement
    ) {
      const cls = [...e.classList]
        .filter((c) => !/^(nxi|on|open)/.test(c))
        .slice(0, 2)
        .join(".")
      parts.unshift(
        e.tagName.toLowerCase() +
          (e.id ? `#${e.id}` : "") +
          (cls ? `.${cls}` : ""),
      )
    }
    return parts.join(" > ")
  }
  const text = (el) =>
    (el.innerText || el.getAttribute("aria-label") || el.title || "")
      .trim()
      .replace(/\s+/g, " ")
      .slice(0, 50)
  const visible = (el, cs, r) =>
    r.width > 0 &&
    r.height > 0 &&
    cs.visibility !== "hidden" &&
    cs.display !== "none" &&
    parseFloat(cs.opacity) > 0.05
  const clipAncestor = (el) => {
    for (
      let e = el.parentElement;
      e && e !== document.documentElement;
      e = e.parentElement
    ) {
      const cs = getComputedStyle(e)
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") return e
    }
    return null
  }
  const hiddenByAncestor = (el) => {
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e)
      if (
        cs.display === "none" ||
        cs.visibility === "hidden" ||
        parseFloat(cs.opacity) < 0.05
      )
        return true
      if (e.hasAttribute("hidden") || e.getAttribute("aria-hidden") === "true")
        return true
    }
    return false
  }
  const all = [...document.body.querySelectorAll("*")].filter(
    (el) =>
      !el.closest(
        "svg, canvas, webview, iframe, .monaco-editor, .nxi, [data-audit-ignore], .sheet-backdrop:not(.open)",
      ),
  )
  for (const el of all) {
    const cs = getComputedStyle(el)
    const r = el.getBoundingClientRect()
    if (!visible(el, cs, r) || hiddenByAncestor(el)) continue
    const fixed = cs.position === "fixed"
    // Sort de la fenêtre.
    if (
      (r.right > W + 1 || r.bottom > H + 1 || r.left < -1) &&
      !clipAncestor(el) &&
      !fixed
    )
      out.push({
        type: "fenêtre",
        where: short(el),
        text: text(el),
        rect: [r.left, r.top, r.width, r.height].map(Math.round),
      })
    // Texte coupé sans points de suspension.
    const hasText = [...el.childNodes].some(
      (n) => n.nodeType === 3 && n.data.trim(),
    )
    if (
      hasText &&
      (cs.overflowX !== "visible" || cs.overflowY !== "visible") &&
      cs.overflowX !== "auto" &&
      cs.overflowX !== "scroll"
    ) {
      if (
        el.scrollWidth > el.clientWidth + 1 &&
        cs.textOverflow !== "ellipsis" &&
        cs.whiteSpace !== "normal"
      )
        out.push({
          type: "coupé",
          where: short(el),
          text: text(el),
          rect: [r.left, r.top, r.width, r.height].map(Math.round),
        })
      if (
        el.scrollHeight > el.clientHeight + 3 &&
        cs.overflowY !== "auto" &&
        cs.overflowY !== "scroll" &&
        !/-webkit-box/.test(cs.display)
      )
        out.push({
          type: "coupé",
          where: short(el),
          text: text(el),
          rect: [r.left, r.top, r.width, r.height].map(Math.round),
        })
    }
    // Sort de son parent (éléments dans le flux).
    const p = el.parentElement
    if (p && cs.position !== "absolute" && !fixed && cs.position !== "sticky") {
      const pr = p.getBoundingClientRect(),
        pcs = getComputedStyle(p)
      // Débordement vertical : relevé seulement s'il sort d'un bloc visible (fond, contour) ; un conteneur de mise en
      // page transparent dans une zone qui défile ne se voit pas.
      const boxed =
        (pcs.backgroundColor !== "rgba(0, 0, 0, 0)" &&
          pcs.backgroundColor !== "transparent") ||
        parseFloat(pcs.borderTopWidth) > 0 ||
        /inset|0px 0px 0px [1-9]/.test(pcs.boxShadow)
      const closedDetails = p.tagName === "DETAILS" && !p.open
      if (
        pr.width > 0 &&
        pcs.display !== "contents" &&
        !closedDetails &&
        (r.right > pr.right + 2 || (boxed && r.bottom > pr.bottom + 2)) &&
        pcs.overflowX === "visible" &&
        pcs.overflowY === "visible"
      )
        out.push({
          type: "déborde",
          where: short(el),
          text: text(el),
          rect: [r.left, r.top, r.width, r.height].map(Math.round),
          parent: [pr.left, pr.top, pr.width, pr.height].map(Math.round),
        })
    }
  }
  // Voisins dans le flux qui se recouvrent.
  for (const p of new Set(all.map((e) => e.parentElement))) {
    if (!p) continue
    const kids = [...p.children].filter((c) => {
      const cs = getComputedStyle(c)
      return (
        cs.position !== "absolute" &&
        cs.position !== "fixed" &&
        cs.display !== "none" &&
        !c.closest("svg, .nxi")
      )
    })
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].getBoundingClientRect(),
          b = kids[j].getBoundingClientRect()
        if (!a.width || !b.width || !a.height || !b.height) continue
        const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left),
          oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)
        if (
          ox > 3 &&
          oy > 3 &&
          !hiddenByAncestor(kids[i]) &&
          !hiddenByAncestor(kids[j])
        )
          out.push({
            type: "chevauche",
            where: `${short(kids[i])}  ×  ${kids[j].tagName.toLowerCase()}.${[...kids[j].classList].slice(0, 2).join(".")}`,
            text: `${text(kids[i]).slice(0, 24)} | ${text(kids[j]).slice(0, 24)}`,
            rect: [Math.round(ox), Math.round(oy)],
          })
      }
  }
  return out
}

const browser = await puppeteer.launch({
  executablePath: CHROMIUM,
  args: ["--no-sandbox", "--disable-gpu", "--disable-dev-shm-usage"],
})
let total = 0
const report = []
try {
  for (const [w, h] of sizes) {
    const page = await browser.newPage()
    await page.setViewport({ width: w, height: h })
    await page.evaluateOnNewDocument((d) => {
      if (window !== window.top) return
      if (!localStorage.getItem("nexora-preview:settings"))
        localStorage.setItem(
          "nexora-preview:settings",
          JSON.stringify({
            tourDone: true,
            setup: { done: true, chosen: [], pending: [] },
            ...(d ? { appTheme: "dark" } : {}),
          }),
        )
    }, dark)
    await page.goto(URL, { waitUntil: "load", timeout: 30000 })
    await new Promise((r) => setTimeout(r, 2500))
    for (const name of screens) {
      const btn = await page.$(`#modeSeg button[data-mode="${SPACES[name]}"]`)
      if (!btn) continue
      await btn.click()
      await new Promise((r) => setTimeout(r, name === "studio" ? 3500 : 1600))
      const found = await page.evaluate(inspect)
      // Un même défaut répété (listes) ne compte qu'une fois.
      const seen = new Set(),
        uniq = found.filter((f) => {
          const k = f.type + f.where
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
      total += uniq.length
      report.push({ taille: `${w}x${h}`, ecran: name, releves: uniq })
      if (!json) {
        console.log(
          `\n${name} ${w}×${h} : ${
            uniq.length ? `${uniq.length} relevé(s)` : "aucun relevé"
          }`,
        )
        for (const f of uniq)
          console.log(
            `  ${f.type.padEnd(9)} ${f.where}${
              f.text ? ` « ${f.text} »` : ""
            } ${JSON.stringify(f.rect)}${
              f.parent ? ` dans ${JSON.stringify(f.parent)}` : ""
            }`,
          )
      }
    }
    await page.close()
  }
} finally {
  await browser.close()
}
if (json) console.log(JSON.stringify(report, null, 2))
else console.log(`\nTotal : ${total} relevé(s).`)
process.exitCode = total ? 1 : 0
