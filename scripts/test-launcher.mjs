// NEXORA #076 : `pnpm test:launcher` lance les essais du lanceur NEXORA Devs Toolbox (launcher/, Go) puis vérifie
// qu'il se construit pour Windows (64 bits, interface graphique, 10 Mo au plus). Go 1.23 doit être installé
// (hors du dépôt : GO=<chemin> ou go dans le PATH).
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { ROOT } from "../preview/server.mjs"

const go = [process.env.GO, "go", "/tmp/go/bin/go"].find((g) => g && spawnSync(g, ["version"], { stdio: "ignore" }).status === 0)
if (!go) {
  console.error("Go est introuvable : installe Go 1.23 hors du dépôt (ou indique GO=<chemin>).")
  process.exit(1)
}
const cwd = path.join(ROOT, "launcher")
const env = { ...process.env, GOCACHE: process.env.GOCACHE || path.join(os.tmpdir(), "nexora-gocache"), CGO_ENABLED: "0" }
const run = (args, extra = {}) => spawnSync(go, args, { cwd, stdio: "inherit", env: { ...env, ...extra } }).status === 0
let ok = run(["vet", "./..."]) && run(["vet", "./..."], { GOOS: "windows", GOARCH: "amd64" })
ok = ok && run(["test", "-count=1", "-v", "./..."])
const exe = path.join(os.tmpdir(), "nexora-launcher-test.exe")
ok = ok && run(["build", "-trimpath", "-ldflags", "-s -w -H windowsgui", "-o", exe, "."], { GOOS: "windows", GOARCH: "amd64" })
if (ok) {
  const b = fs.readFileSync(exe)
  const pe = b.readUInt32LE(0x3c)
  const machine = b.readUInt16LE(pe + 4)
  const subsystem = b.readUInt16LE(pe + 24 + 68)
  const size = b.length
  fs.rmSync(exe, { force: true })
  // NEXORA #083 : logo de NEXORA et informations de version dans l'exécutable (launcher/rsrc_windows_amd64.syso,
  // pnpm launcher:ressources), plus aucun script ni outil en ligne de commande lancé par le lanceur.
  const ico = fs.readFileSync(path.join(cwd, "..", "nexora", "app", "build", "icon.ico"))
  let logo = null
  for (let i = 0; i < ico.readUInt16LE(4); i++) {
    const o = 6 + 16 * i, off = ico.readUInt32LE(o + 12)
    if ((ico[o] || 256) === 256) logo = ico.subarray(off, off + ico.readUInt32LE(o + 8))
  }
  const u16 = (s) => Buffer.from(s, "utf16le")
  const launcherVersion = /var version = "([^"]+)"/.exec(fs.readFileSync(path.join(cwd, "main.go"), "utf8"))[1]
  const v4 = [...launcherVersion.split("."), "0", "0", "0"].slice(0, 4).join(".")
  const lower = b.toString("latin1").toLowerCase()
  const lower16 = b.toString("utf16le").toLowerCase()
  const checks = [
    [b.subarray(0, 2).toString() === "MZ" && b.subarray(pe, pe + 4).toString("latin1") === "PE\0\0", "exécutable Windows (PE)"],
    [machine === 0x8664, "64 bits (x64)"],
    [subsystem === 2, "interface graphique (aucune console)"],
    [size <= 10 * 1048576, `taille ${(size / 1048576).toFixed(1)} Mo (10 Mo au plus)`],
    [!!logo && b.includes(logo), "icône de NEXORA intégrée (Explorateur, barre des tâches, raccourcis)"],
    [b.includes(u16("NEXORA Devs Toolbox")) && b.includes(u16(v4)) && b.includes(u16("CompanyName")), `informations de version (NEXORA, ${v4})`],
    [!lower.includes("powershell") && !lower16.includes("powershell") && !lower.includes("reg.exe"), "aucun PowerShell ni reg.exe (aucune console)"],
  ]
  for (const [pass, label] of checks) console.log(`${pass ? "OK  " : "ÉCHEC"} ${label}`)
  ok = checks.every(([pass]) => pass)
}
console.log(ok ? "\nLanceur : essais et construction Windows réussis." : "\nLanceur : échec.")
process.exit(ok ? 0 : 1)
