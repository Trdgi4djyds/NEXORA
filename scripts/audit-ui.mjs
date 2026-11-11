#!/usr/bin/env node
// NEXORA #045 : audit de mise en page de l'aperçu (débordements, textes coupés, chevauchements), espace par espace et
// à plusieurs tailles de fenêtre (NEXORA accepte au minimum 760 × 520).
//   pnpm audit:ui [écrans…] [--tailles 1440x900,1280x800,1024x700,880x600] [--theme sombre] [--json]
// Écrans : accueil, responsive, browser, dev, apps, studio, design, securite, desktop (défaut : tous).
// Les fenêtres Nouveau, Réglages, Personnaliser, Connexion, IA et Nouveau projet sont aussi auditées.
// NEXORA #047 : la fenêtre « Mon compte » est auditée rubrique par rubrique avec le compte fictif
// (données de scripts/admin-demo.mjs, appels Supabase interceptés, comme `pnpm captures --compte demo`).
// Relevés (éléments visibles seulement) :
//   - fenêtre : élément qui sort de la fenêtre sans conteneur qui défile ou qui le coupe ;
//   - coupé : texte coupé par son conteneur sans points de suspension ;
//   - déborde : élément dans le flux qui sort de son parent (carte, barre, bouton) ;
//   - chevauche : deux éléments voisins dans le flux qui se recouvrent (sauf recouvrement voulu,
//     attribut data-audit-recouvre) ;
//   - masqué (#047, fenêtre « Mon compte ») : bloc qui coupe son contenu en hauteur sans le faire défiler.
// Code de sortie 1 s'il reste un relevé.
import fs from "node:fs"
import puppeteer from "puppeteer-core"

const CHROMIUM = process.env.CHROME_PATH || "/usr/bin/chromium"
// « ?app » : dans l'aperçu, la racine sans paramètre ouvre le site vitrine (#062).
const URL = process.env.NX_URL || "http://localhost:3000/?app"
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
// NEXORA #059 : version marquée comme vue (pas de fenêtre « Nouveautés » pendant l'audit).
const APP_VERSION = JSON.parse(
  fs.readFileSync(new globalThis.URL("../nexora/app/package.json", import.meta.url), "utf8"),
).version

// Compte NEXORA fictif (#047) : session sous « nexora-auth » et réponses Supabase de démonstration.
async function useDemoAccount(page, dark) {
  const { demoResponse, demoSession } = await import("./admin-demo.mjs")
  await page.evaluateOnNewDocument(
    (s, d, v) => {
      if (window !== window.top) return
      if (!localStorage.getItem("nexora-auth"))
        localStorage.setItem("nexora-auth", s)
      if (!localStorage.getItem("nexora-preview:settings"))
        localStorage.setItem(
          "nexora-preview:settings",
          JSON.stringify({
            tourDone: true,
            setup: { done: true, chosen: [], pending: [] },
            nxSeenVersion: v,
            ...(d ? { appTheme: "dark" } : {}),
          }),
        )
    },
    JSON.stringify(demoSession()),
    dark,
    APP_VERSION,
  )
  await page.setRequestInterception(true)
  page.on("request", (req) => {
    if (req.isInterceptResolutionHandled()) return
    if (!/\.supabase\.co\//.test(req.url()) || /realtime\/v1/.test(req.url()))
      return req.continue()
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
      "access-control-expose-headers": "content-range",
    }
    if (req.method() === "OPTIONS")
      return req.respond({ status: 204, headers: cors })
    const res = demoResponse(
      req.method(),
      req.url(),
      req.headers(),
      req.postData(),
    )
    if (!res) return req.continue()
    req.respond({
      status: res.status,
      headers: { ...cors, ...(res.headers || {}) },
      ...(req.method() === "HEAD" || res.status === 204
        ? {}
        : {
            body:
              typeof res.body === "string" || Buffer.isBuffer(res.body)
                ? res.body
                : JSON.stringify(res.body),
          }),
    })
  })
}

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
  // #047 : dans la fenêtre « Mon compte », un bloc qui coupe son contenu sans défiler cache du texte
  // (le relevé « coupé » ne voit que les textes sur une ligne).
  for (const el of all) {
    if (!el.closest("#sheet .nxc") || !el.children.length) continue
    const cs = getComputedStyle(el)
    if (!/hidden|clip/.test(cs.overflowY) || cs.webkitLineClamp !== "none")
      continue
    const r = el.getBoundingClientRect()
    if (!visible(el, cs, r) || el.scrollHeight - el.clientHeight <= 4) continue
    if (
      ![...el.querySelectorAll("*")].some(
        (k) =>
          k.getBoundingClientRect().bottom > r.bottom + 2 &&
          (k.innerText || "").trim(),
      )
    )
      continue
    out.push({
      type: "masqué",
      where: short(el),
      text: text(el),
      rect: [r.left, r.top, r.width, r.height].map(Math.round),
    })
  }
  for (const p of new Set(all.map((e) => e.parentElement))) {
    if (!p) continue
    const kids = [...p.children].filter((c) => {
      const cs = getComputedStyle(c)
      return (
        cs.position !== "absolute" &&
        cs.position !== "fixed" &&
        cs.display !== "none" &&
        // #047 : un mot en gras coupé sur deux lignes a un rectangle englobant qui recouvre ses voisins
        // sans aucun chevauchement visible.
        !(cs.display === "inline" && c.getClientRects().length > 1) &&
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
          !hiddenByAncestor(kids[j]) &&
          // #047 : recouvrement voulu, déclaré par data-audit-recouvre (photo de profil posée sur la bannière).
          !kids[i].hasAttribute("data-audit-recouvre") &&
          !kids[j].hasAttribute("data-audit-recouvre")
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
    await page.evaluateOnNewDocument((d, v) => {
      if (window !== window.top) return
      if (!localStorage.getItem("nexora-preview:settings"))
        localStorage.setItem(
          "nexora-preview:settings",
          JSON.stringify({
            tourDone: true,
            setup: { done: true, chosen: [], pending: [] },
            nxSeenVersion: v,
            ...(d ? { appTheme: "dark" } : {}),
          }),
        )
    }, dark, APP_VERSION)
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
    // NEXORA #046 : les fenêtres sont la première source de régressions responsive. Les ouvrir avec
    // de vrais clics à chaque taille, puis appliquer le même audit que pour les espaces.
    const auditWindow = async (name, open) => {
      await page.goto(URL, { waitUntil: "load", timeout: 30000 })
      await new Promise((r) => setTimeout(r, 1400))
      if (!(await open())) return
      await new Promise((r) => setTimeout(r, 900))
      const found = await page.evaluate(inspect)
      const seen = new Set()
      const uniq = found.filter((f) => {
        const k = f.type + f.where
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      total += uniq.length
      report.push({
        taille: `${w}x${h}`,
        ecran: `fenetre-${name}`,
        releves: uniq,
      })
      if (!json) {
        console.log(
          `\nfenêtre ${name} ${w}×${h} : ${
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
    const click = async (selector) =>
      page.evaluate((s) => {
        const el = document.querySelector(s)
        if (!el) return false
        el.click()
        return true
      }, selector)
    await auditWindow("nouveau", () => click("#btnNew"))
    await auditWindow("reglages", () => click("#btnAppearance"))
    await auditWindow("personnaliser", async () => {
      if (!(await click("#btnAppearance"))) return false
      await new Promise((r) => setTimeout(r, 350))
      return click("#popover [data-ui-more]")
    })
    await auditWindow("connexion", () => click(".rail-acct"))
    await auditWindow("ia", () => click("#btnAI"))
    await auditWindow("nouveau-projet", async () => {
      if (!(await click('#modeSeg [data-mode="dev"]'))) return false
      await new Promise((r) => setTimeout(r, 1200))
      return click('#devlab [data-act="new"]')
    })
    await page.close()

    // NEXORA #047 : fenêtre « Mon compte », chaque rubrique, avec le compte fictif.
    const acc = await browser.newPage()
    await acc.setViewport({ width: w, height: h })
    await useDemoAccount(acc, dark)
    const accSettle = async () => {
      await acc.goto(URL, { waitUntil: "load", timeout: 30000 })
      await new Promise((r) => setTimeout(r, 2200))
      // Les annonces de démonstration (notifications) ne font pas partie de la fenêtre auditée.
      await acc.addStyleTag({
        content: "#toasts, .toasts, .nx-toasts { display: none !important; }",
      })
      const opened = await acc.evaluate(async () => {
        const btn = document.querySelector("#btnAccount")
        if (!btn) return false
        btn.click()
        await new Promise((r) => setTimeout(r, 350))
        const item = document.querySelector('#popover [data-acc="profile"]')
        if (!item) return false
        item.click()
        return true
      })
      if (opened) await new Promise((r) => setTimeout(r, 1400))
      return opened
    }
    if (await accSettle()) {
      const tabs = await acc.evaluate(() =>
        [...document.querySelectorAll("#sheet [data-tab]")].map(
          (b) => b.dataset.tab,
        ),
      )
      for (const tab of [...new Set(tabs)]) {
        await acc.evaluate(
          (t) => document.querySelector(`#sheet [data-tab="${t}"]`)?.click(),
          tab,
        )
        await new Promise((r) => setTimeout(r, 1200))
        const found = await acc.evaluate(inspect)
        const seen = new Set()
        const uniq = found.filter((f) => {
          const k = f.type + f.where
          if (seen.has(k)) return false
          seen.add(k)
          return true
        })
        total += uniq.length
        report.push({
          taille: `${w}x${h}`,
          ecran: `compte-${tab}`,
          releves: uniq,
        })
        if (!json) {
          console.log(
            `\ncompte ${tab} ${w}×${h} : ${
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
    } else {
      total += 1
      report.push({
        taille: `${w}x${h}`,
        ecran: "compte",
        releves: [{ type: "absente", where: "fenêtre Mon compte" }],
      })
      if (!json) console.log(`\ncompte ${w}×${h} : fenêtre introuvable`)
    }
    await acc.close()
  }
} finally {
  await browser.close()
}
if (json) console.log(JSON.stringify(report, null, 2))
else console.log(`\nTotal : ${total} relevé(s).`)
process.exitCode = total ? 1 : 0
