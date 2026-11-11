// `pnpm pack:windows` : reconstruit l'application Windows à partir des sources de nexora/app.
//   1. vérifie le code du processus principal (main.js, preload.js, src/) et les fichiers indispensables ;
//   2. empaquette nexora/app dans nexora/NEXORA-win32-x64/resources/app.asar ;
//   3. recrée nexora/NEXORA-portable.zip avec tout le dossier NEXORA-win32-x64/, comme l'original.
// NEXORA.exe (Electron 45) ne vérifie pas l'intégrité d'app.asar : une archive reconstruite est acceptée.
//
// Options :
//   --check          vérifie seulement le code, sans rien écrire (`pnpm check`)
//   --out <dossier>  écrit app.asar et NEXORA-portable.zip dans ce dossier au lieu de nexora/
//   --no-zip         reconstruit seulement app.asar
import { createPackageWithOptions, listPackage } from "@electron/asar"
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import yazl from "yazl"
import { APP_DIR, ROOT } from "../preview/server.mjs"

const NEXORA_DIR = path.join(ROOT, "nexora")
const RUNTIME_NAME = "NEXORA-win32-x64"
const RUNTIME_DIR = path.join(NEXORA_DIR, RUNTIME_NAME)
const ASAR_ENTRY = `${RUNTIME_NAME}/resources/app.asar`
const REQUIRED_FILES = [
  "package.json",
  "main.js",
  "preload.js",
  "webview-preload.js",
  "renderer/index.html",
  "renderer/dist/main.js",
]

const mb = (bytes) => `${(bytes / 1048576).toFixed(1)} Mo`
const shownPath = (file) =>
  path.relative(ROOT, file).startsWith("..") ? file : path.relative(ROOT, file)

function sourceFiles(dir = APP_DIR) {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      path.relative(APP_DIR, path.join(entry.parentPath, entry.name)),
    )
}

function checkSources() {
  const errors = []
  for (const rel of REQUIRED_FILES) {
    if (!fs.existsSync(path.join(APP_DIR, rel)))
      errors.push(`${rel} : fichier manquant`)
  }
  try {
    JSON.parse(fs.readFileSync(path.join(APP_DIR, "package.json"), "utf8"))
  } catch (err) {
    errors.push(`package.json : ${err.message}`)
  }
  const scripts = [
    "main.js",
    "preload.js",
    // Script des sites affichés dans les appareils (#114).
    "webview-preload.js",
    "renderer/audit.js",
    ...sourceFiles(path.join(APP_DIR, "src")),
    // Modèle des logiciels de bureau générés par le Desktop Builder (#023).
    ...sourceFiles(path.join(APP_DIR, "desktop")),
  ].filter(
    (rel) => rel.endsWith(".js") && fs.existsSync(path.join(APP_DIR, rel)),
  )
  for (const rel of scripts) {
    const result = spawnSync(
      process.execPath,
      ["--check", path.join(APP_DIR, rel)],
      { encoding: "utf8" },
    )
    if (result.status !== 0)
      errors.push(`${rel}\n${(result.stderr || "").trim()}`)
  }
  return { checked: scripts.length, errors }
}

async function buildAsar(dest) {
  const tmp = `${dest}.tmp`
  fs.rmSync(tmp, { force: true })
  await createPackageWithOptions(APP_DIR, tmp, { dot: true })
  const packed = new Set(
    listPackage(tmp, { isPack: false }).map((p) =>
      p.replace(/\\/g, "/").replace(/^\//, ""),
    ),
  )
  const missing = sourceFiles().filter(
    (rel) => !packed.has(rel.split(path.sep).join("/")),
  )
  if (missing.length) {
    fs.rmSync(tmp, { force: true })
    throw new Error(
      `fichiers absents d'app.asar : ${missing.slice(0, 5).join(", ")}`,
    )
  }
  fs.renameSync(tmp, dest)
}

function buildZip(asarFile, dest) {
  return new Promise((resolve, reject) => {
    const zip = new yazl.ZipFile()
    let files = 0
    const walk = (dir, entryDir) => {
      zip.addEmptyDirectory(entryDir)
      for (const entry of fs
        .readdirSync(dir, { withFileTypes: true })
        .sort((a, b) => a.name.localeCompare(b.name))) {
        const entryPath = `${entryDir}/${entry.name}`
        if (entry.isDirectory()) walk(path.join(dir, entry.name), entryPath)
        else if (entry.isFile()) {
          zip.addFile(
            entryPath === ASAR_ENTRY ? asarFile : path.join(dir, entry.name),
            entryPath,
          )
          files += 1
        }
      }
    }
    walk(RUNTIME_DIR, RUNTIME_NAME)
    const tmp = `${dest}.tmp`
    const out = fs.createWriteStream(tmp)
    out.on("error", reject)
    out.on("close", () => {
      fs.renameSync(tmp, dest)
      resolve(files)
    })
    zip.outputStream.on("error", reject).pipe(out)
    zip.end()
  })
}

async function main() {
  const args = process.argv.slice(2)
  const outIndex = args.indexOf("--out")
  if (outIndex >= 0 && !args[outIndex + 1])
    throw new Error("--out attend un dossier de destination.")
  const outDir = outIndex >= 0 ? path.resolve(args[outIndex + 1]) : null

  const { checked, errors } = checkSources()
  if (errors.length) {
    console.error(
      `Code de NEXORA invalide, rien n'a été reconstruit :\n\n${errors.join("\n\n")}`,
    )
    process.exitCode = 1
    return
  }
  console.log(`Code vérifié : ${checked} fichiers JavaScript, aucune erreur.`)
  if (args.includes("--check")) return

  if (!fs.existsSync(path.join(RUNTIME_DIR, "NEXORA.exe")))
    throw new Error(`${RUNTIME_NAME}/NEXORA.exe introuvable dans nexora/.`)
  if (outDir) fs.mkdirSync(outDir, { recursive: true })
  const asarFile = outDir
    ? path.join(outDir, "app.asar")
    : path.join(RUNTIME_DIR, "resources", "app.asar")
  await buildAsar(asarFile)
  console.log(
    `app.asar reconstruit (${mb(fs.statSync(asarFile).size)}) : ${shownPath(asarFile)}`,
  )

  if (args.includes("--no-zip")) return
  const zipFile = path.join(outDir ?? NEXORA_DIR, "NEXORA-portable.zip")
  const files = await buildZip(asarFile, zipFile)
  console.log(
    `NEXORA-portable.zip recréé (${files} fichiers, ${mb(fs.statSync(zipFile).size)}) : ${shownPath(zipFile)}`,
  )
}

main().catch((err) => {
  console.error(`Échec de la reconstruction : ${err.message}`)
  process.exitCode = 1
})
