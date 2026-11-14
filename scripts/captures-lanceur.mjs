// NEXORA #083 : captures des fenêtres du lanceur NEXORA Devs Toolbox, rendues par le vrai code Windows sous Wine
// (écran virtuel Xvfb) : version de démonstration compilée avec l'étiquette nxdemo (launcher/demo_windows.go,
// jamais publiée), un écran par lancement, image recadrée sur la fenêtre.
//   node scripts/captures-lanceur.mjs [écrans…] [--label NNN-sujet] [--upload] [--dpi 144]
// Écrans : voir ALL (assistants d’installation et de désinstallation, démarrage, écrans de sécurité, messages).
// Environnement HORS du dépôt (aucun droit d'administrateur), décrit par un fichier shell (NX_WINE_ENV, défaut
// /tmp/wenv.sh) qui exporte PATH, LD_LIBRARY_PATH, WINEPREFIX et DISPLAY :
//   - Wine 11 « wow64 » portable (github.com/Kron4ek/Wine-Builds), Xvfb, xwd, ImageMagick et xdotool extraits des
//     paquets Debian (apt-get download, sources en HTTPS, dpkg -x) ; Xvfb lancé sur DISPLAY ;
//   - police Selawik (github.com/microsoft/Selawik, OFL, métriques de Segoe UI) dans le préfixe Wine, avec la
//     substitution « Segoe UI » → « Selawik » (Segoe UI n'est pas libre ; Windows a la vraie).
// NEXORA #121 : sans xwd, l'écran est lu par `import -window root` (ImageMagick du système).
// Les captures montrent le rendu sous Wine : sans les coins arrondis ni l'ombre de Windows 11 (DWM absent).
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { ROOT } from "../preview/server.mjs"

const ALL = ["assistant-bienvenue", "assistant-mise-a-jour", "assistant-installation", "assistant-termine", "assistant-erreur", "demarrage", "chargement", "telechargement", "integrite", "connexion", "version", "desinstallation", "desinstallation-progression", "desinstallation-ouvert", "desinstallation-terminee", "erreur"]
const args = process.argv.slice(2)
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : "")
const label = opt("--label") || "lanceur"
const dpi = Number(opt("--dpi")) || 96
const screens = args.filter((a, i) => !a.startsWith("--") && !["--label", "--dpi"].includes(args[i - 1]))
const env = process.env.NX_WINE_ENV || "/tmp/wenv.sh"
if (!fs.existsSync(env)) {
  console.error(`Environnement Wine absent (${env}) : voir l’en-tête du script.`)
  process.exit(1)
}
const sh = (cmd) => spawnSync("sh", ["-c", `. ${env}; ${cmd}`], { encoding: "utf8" })
const grab = sh("command -v xwd >/dev/null").status === 0 ? "xwd -root -silent | convert-im7.q16 xwd:-" : "import -window root png:- | convert-im7.q16 png:-"
const exe = path.join(process.env.TMPDIR || "/tmp", "nexora-launcher-demo.exe")
const go = [process.env.GO, "go", "/tmp/go/bin/go"].find((g) => g && spawnSync(g, ["version"], { stdio: "ignore" }).status === 0)
if (!go) {
  console.error("Go est introuvable.")
  process.exit(1)
}
const b = spawnSync(go, ["build", "-tags", "nxdemo", "-trimpath", "-ldflags", "-H windowsgui", "-o", exe, "."], {
  cwd: path.join(ROOT, "launcher"), stdio: "inherit", env: { ...process.env, GOOS: "windows", GOARCH: "amd64", CGO_ENABLED: "0" },
})
if (b.status !== 0) process.exit(1)
const day = new Date().toISOString().slice(0, 10)
const dir = path.join(ROOT, "captures", `${day}-${label}`)
fs.mkdirSync(dir, { recursive: true })
const reg = (v) => sh(`wineserver -k 2>/dev/null; sleep 1; wine reg add 'HKCU\\Control Panel\\Desktop' /v LogPixels /t REG_DWORD /d ${v} /f >/dev/null 2>&1; wineserver -w`)
if (dpi !== 96) reg(dpi)
const out = []
for (const s of screens.length ? screens : ALL) {
  if (!ALL.includes(s)) {
    console.error(`Écran inconnu : ${s}`)
    continue
  }
  const file = path.join(dir, `${s}${dpi !== 96 ? `-${dpi}dpi` : ""}.png`)
  sh(`wineserver -k 2>/dev/null; sleep 1; (wine '${exe}' --demo=${s} >/dev/null 2>&1 &); sleep ${["demarrage", "chargement"].includes(s) ? 7.7 : 7}; ${grab} -fuzz 1% -trim +repage -bordercolor '#e2e4e9' -border 40 '${file}'; wineserver -k 2>/dev/null`)
  if (fs.existsSync(file) && fs.statSync(file).size > 1000) {
    out.push(file)
    console.log(`Capture : ${path.relative(ROOT, file)}`)
  } else console.error(`Aucune fenêtre pour ${s}.`)
}
if (dpi !== 96) reg(96)
fs.rmSync(exe, { force: true })
if (args.includes("--upload")) {
  for (const f of out) {
    const r = spawnSync("figma", ["artifacts", "upload", f], { encoding: "utf8" })
    const ref = r.status === 0 && /figma-blob:\/\/\S+/.exec(r.stdout || "")?.[0]
    console.log(ref ? `![${path.basename(f, ".png")}](${ref})` : `Envoi impossible : ${f}`)
  }
}
