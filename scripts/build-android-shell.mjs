// Reconstruit le code natif précompilé des applications de l'App Builder (NEXORA #018) :
//   nexora/app/android/shell/classes.dex  ←  nexora/app/android/shell/src/**/*.java
// Même chaîne que NEXORA sur le PC de l'utilisateur pour le kit de notifications : javac (--release 11)
// contre la plateforme Android, puis d8 (--min-api 24). twa.dex et les kits ne sont pas concernés.
//
// Usage : pnpm android:shell [--check]
//   --check   compile dans un dossier temporaire et compare les classes avec classes.dex, sans l'écrire
// Outils (téléchargés une fois dans ~/.cache/nexora-android s'ils manquent) : JDK 17, android.jar (API 36),
// d8 et dexdump (build-tools 36). Variables possibles : NEXORA_JDK, NEXORA_ANDROID_JAR, NEXORA_BUILD_TOOLS.
import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const SHELL = path.join(ROOT, "nexora", "app", "android", "shell")
const CACHE = path.join(os.homedir(), ".cache", "nexora-android")
const check = process.argv.includes("--check")

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 64e6, ...opts })
  if (r.status !== 0)
    throw new Error(
      `${path.basename(cmd)} : ${(r.stderr || r.stdout || "").slice(-2000)}`,
    )
  return r.stdout
}
const find = (dir, test) => {
  if (!fs.existsSync(dir)) return null
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (test(p, e)) return p
    if (e.isDirectory()) {
      const f = find(p, test)
      if (f) return f
    }
  }
  return null
}
function fetchTo(url, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  run("curl", ["-sSfL", "-o", file, url])
}
function tools() {
  let jdk = process.env.NEXORA_JDK
  if (!jdk) {
    jdk = find(CACHE, (p, e) => e.isDirectory() && /^jdk-17/.test(e.name))
    if (!jdk) {
      fetchTo(
        "https://api.adoptium.net/v3/binary/latest/17/ga/linux/x64/jdk/hotspot/normal/eclipse",
        path.join(CACHE, "jdk.tgz"),
      )
      run("tar", ["xzf", path.join(CACHE, "jdk.tgz"), "-C", CACHE])
      jdk = find(CACHE, (p, e) => e.isDirectory() && /^jdk-17/.test(e.name))
    }
  }
  let jar = process.env.NEXORA_ANDROID_JAR
  if (!jar) {
    jar = find(
      path.join(CACHE, "platform"),
      (p) => path.basename(p) === "android.jar",
    )
    if (!jar) {
      fetchTo(
        "https://dl.google.com/android/repository/platform-36_r02.zip",
        path.join(CACHE, "platform.zip"),
      )
      run("unzip", [
        "-qo",
        path.join(CACHE, "platform.zip"),
        "-d",
        path.join(CACHE, "platform"),
      ])
      jar = find(
        path.join(CACHE, "platform"),
        (p) => path.basename(p) === "android.jar",
      )
    }
  }
  let bt = process.env.NEXORA_BUILD_TOOLS
  if (!bt) {
    const d8 = find(
      path.join(CACHE, "build-tools"),
      (p) => path.basename(p) === "d8.jar",
    )
    if (d8) bt = path.dirname(path.dirname(d8))
    else {
      fetchTo(
        "https://dl.google.com/android/repository/build-tools_r36_linux.zip",
        path.join(CACHE, "build-tools.zip"),
      )
      run("unzip", [
        "-qo",
        path.join(CACHE, "build-tools.zip"),
        "-d",
        path.join(CACHE, "build-tools"),
      ])
      bt = path.dirname(
        path.dirname(
          find(
            path.join(CACHE, "build-tools"),
            (p) => path.basename(p) === "d8.jar",
          ),
        ),
      )
    }
  }
  return { jdk, jar, bt }
}

// Liste des classes, champs et méthodes d'un fichier dex (comparaison lisible, indépendante de l'ordre).
function classes(bt, dex) {
  const out = []
  let cls = ""
  for (const l of run(path.join(bt, "dexdump"), [dex]).split("\n")) {
    const c = /Class descriptor\s*:\s*'L([^;']+);'/.exec(l)
    if (c) {
      cls = c[1].replace(/\//g, ".")
      out.push(cls)
      continue
    }
    const n = /^\s+name\s*:\s*'([^']+)'/.exec(l)
    if (n && cls) out.push(`${cls}.${n[1]}`)
  }
  return out
}

const t = tools()
const work = fs.mkdtempSync(path.join(os.tmpdir(), "nexora-shell-"))
const srcs = []
const walk = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else if (p.endsWith(".java")) srcs.push(p)
  }
}
walk(path.join(SHELL, "src"))
fs.mkdirSync(path.join(work, "cls"))
run(path.join(t.jdk, "bin", "javac"), [
  "--release",
  "11",
  "-nowarn",
  "-encoding",
  "UTF-8",
  "-cp",
  t.jar,
  "-d",
  path.join(work, "cls"),
  ...srcs,
])
run(path.join(t.jdk, "bin", "jar"), [
  "cf",
  path.join(work, "shell.jar"),
  "-C",
  path.join(work, "cls"),
  ".",
])
fs.mkdirSync(path.join(work, "dex"))
run(path.join(t.jdk, "bin", "java"), [
  "-cp",
  path.join(t.bt, "lib", "d8.jar"),
  "com.android.tools.r8.D8",
  "--release",
  "--min-api",
  "24",
  "--lib",
  t.jar,
  "--output",
  path.join(work, "dex"),
  path.join(work, "shell.jar"),
])
const out = path.join(work, "dex", "classes.dex")
const target = path.join(SHELL, "classes.dex")
const before = new Set(classes(t.bt, target))
const after = new Set(classes(t.bt, out))
// Les lambdas générées par javac et d8 (numérotées) changent de nom dès qu'une méthode est ajoutée : ignorées.
const named = (x) => !/\$\$ExternalSyntheticLambda|\.lambda\$/.test(x)
const added = [...after].filter((x) => !before.has(x) && named(x))
const removed = [...before].filter((x) => !after.has(x) && named(x))
console.log(
  `${srcs.length} sources Java, ${fs.statSync(out).size} octets (actuel : ${fs.statSync(target).size}).`,
)
console.log(`Ajouts : ${added.length ? added.join(", ") : "aucun"}`)
console.log(`Retraits : ${removed.length ? removed.join(", ") : "aucun"}`)
if (!check) {
  fs.copyFileSync(out, target)
  console.log(`Écrit : ${path.relative(ROOT, target)}`)
}
fs.rmSync(work, { recursive: true, force: true })
