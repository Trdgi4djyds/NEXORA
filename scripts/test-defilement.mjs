#!/usr/bin/env node
// `pnpm test:defilement` (NEXORA #114) : essai de nexora/app/webview-preload.js sous un vrai Electron : état du
// défilement pour les barres des appareils, ordres de défilement, glissement à la souris (vertical, horizontal, élan),
// clic préservé, synchronisation des clics, de la saisie, du défilement et de la navigation, couleur du haut de page,
// barres dessinées dans la page et masquées pendant les captures.
//
// Electron est installé HORS du dépôt (même version que NEXORA) :
//   mkdir -p /tmp/el && cd /tmp/el && echo '{"pnpm":{"onlyBuiltDependencies":["electron"]}}' > package.json
//   pnpm add electron@45.0.0 && node node_modules/electron/install.js
// puis : pnpm test:defilement [--sortie <dossier>] (images barres.png et barres-capture.png)
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const ROOT = path.resolve(import.meta.dirname, "..")
const ELECTRON =
  process.env.ELECTRON || "/tmp/el/node_modules/electron/dist/electron"
if (!fs.existsSync(ELECTRON)) {
  console.error(
    `Electron introuvable (${ELECTRON}) : voir l'en-tête de scripts/test-defilement.mjs.`,
  )
  process.exit(1)
}
const i = process.argv.indexOf("--sortie")
const out = i > 0 ? path.resolve(process.argv[i + 1]) : ""
if (out) fs.mkdirSync(out, { recursive: true })
const r = spawnSync(
  ELECTRON,
  [
    "--no-sandbox",
    "--ozone-platform=headless",
    "--disable-gpu",
    path.join(ROOT, "scripts/essai-defilement/main.cjs"),
  ],
  {
    encoding: "utf8",
    timeout: 120000,
    env: {
      ...process.env,
      PRELOAD: path.join(ROOT, "nexora/app/webview-preload.js"),
      SORTIE: out,
    },
  },
)
const lines = `${r.stdout || ""}`
  .split("\n")
  .filter((l) => /^(OK|ÉCHEC)|vérification/.test(l))
console.log(lines.join("\n"))
if (r.status !== 0) {
  if (!lines.length) console.error((r.stderr || "").slice(-2000))
  process.exit(1)
}
