// `pnpm github:push` : envoie l'état actuel de l'espace de travail sur GitHub (branche main de
// Trdgi4djyds/NEXORA par défaut), sans l'historique interne de Figma Make et sans les secrets.
//
// Chaque envoi ajoute un commit au-dessus de la branche GitHub : son contenu est celui de
// l'espace de travail (fichiers suivis et nouveaux fichiers, selon .gitignore), moins les fichiers
// de SECRETS. Les fichiers lourds partent par Git LFS (.gitattributes).
//
// Options : --repo propriétaire/nom, --branche main, --message "…", --essai (prépare sans envoyer).
// Jeton : GITHUB_TOKEN, sinon le fichier local de jetons (scripts/local-secrets.mjs, portée « repo »).
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { ROOT } from "../preview/server.mjs"
import { githubToken, SECRETS_FILES, SECRETS_NAME } from "./local-secrets.mjs"

// Jamais envoyés sur GitHub, même s'ils sont suivis par Git dans Figma Make.
const SECRETS = [...SECRETS_FILES, ".env", ".env.local", ".env.production"]
const isSecret = (f) =>
  SECRETS.includes(f) ||
  SECRETS_NAME.test(path.basename(f)) ||
  /^\.env(\.|$)/.test(path.basename(f))
const LOCAL_REF = "refs/nexora-github/main"

function parseArgs(argv) {
  const opts = {
    repo: "Trdgi4djyds/NEXORA",
    branch: "main",
    message: "",
    dry: false,
  }
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i]
    if (a === "--repo") opts.repo = argv[++i]
    else if (a === "--branche") opts.branch = argv[++i]
    else if (a === "--message") opts.message = argv[++i]
    else if (a === "--essai") opts.dry = true
    else if (a !== "--") throw new Error(`Option inconnue : ${a}`)
  }
  return opts
}

function main() {
  const opts = parseArgs(process.argv.slice(2))
  const token = githubToken()
  if (!token)
    throw new Error("Jeton GitHub introuvable : définis GITHUB_TOKEN.")
  const url = `https://github.com/${opts.repo}.git`
  // En-tête limité à github.com : les fichiers LFS partent vers un stockage qui a sa propre signature.
  const auth = `http.https://github.com/.extraHeader=Authorization: Basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`
  const index = path.join(os.tmpdir(), `nexora-github-index-${process.pid}`)
  const env = {
    ...process.env,
    GIT_INDEX_FILE: index,
    GIT_TERMINAL_PROMPT: "0",
  }
  const git = (args, extra = {}) =>
    execFileSync("git", args, {
      cwd: ROOT,
      env: { ...env, ...extra },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 << 20,
    }).trim()
  const gitAuth = (args, extra) => git(["-c", auth, ...args], extra)

  try {
    // 1. Arbre de l'espace de travail, secrets retirés (index temporaire : l'index de Figma Make ne change pas).
    git(["read-tree", "HEAD"])
    git(["add", "-A"])
    const named = git(["ls-files"]).split("\n").filter(isSecret)
    git([
      "rm",
      "--cached",
      "-q",
      "--ignore-unmatch",
      "--",
      ...new Set([...SECRETS, ...named]),
    ])
    const tree = git(["write-tree"])
    const leaked = git(["ls-tree", "-r", "--name-only", tree])
      .split("\n")
      .filter(isSecret)
    if (leaked.length)
      throw new Error(`Secrets encore présents : ${leaked.join(", ")}`)
    // Dernier garde-fou : aucun fichier envoyé ne contient le jeton GitHub lui-même.
    try {
      const hits = execFileSync("git", ["grep", "-l", "-F", "-f", "-", tree], {
        cwd: ROOT,
        env,
        input: token,
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        maxBuffer: 64 << 20,
      }).trim()
      if (hits)
        throw new Error(
          `Jeton trouvé dans : ${hits.replaceAll(`${tree}:`, "").split("\n").join(", ")}`,
        )
    } catch (err) {
      if (err.status !== 1) throw err
    }

    // 2. Dernier commit de la branche GitHub, s'il existe.
    const remote =
      gitAuth(["ls-remote", url, `refs/heads/${opts.branch}`]).split(/\s/)[0] ||
      ""
    if (remote)
      gitAuth([
        "fetch",
        "-q",
        "--no-tags",
        url,
        `+refs/heads/${opts.branch}:${LOCAL_REF}`,
      ])
    if (remote && git(["rev-parse", `${remote}^{tree}`]) === tree) {
      console.log(`GitHub (${opts.repo}, ${opts.branch}) est déjà à jour.`)
      return
    }

    // 3. Commit de synchronisation.
    const subject =
      opts.message ||
      `Synchronisation depuis Figma Make : ${git(["log", "-1", "--format=%s"])}`
    const who = {
      GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME || "NEXORA (Figma Make)",
      GIT_AUTHOR_EMAIL:
        process.env.GIT_AUTHOR_EMAIL || "nexora@users.noreply.github.com",
    }
    const commit = git(
      ["commit-tree", tree, ...(remote ? ["-p", remote] : []), "-m", subject],
      {
        ...who,
        GIT_COMMITTER_NAME: who.GIT_AUTHOR_NAME,
        GIT_COMMITTER_EMAIL: who.GIT_AUTHOR_EMAIL,
      },
    )
    const files = git(["ls-tree", "-r", "--name-only", tree]).split("\n").length
    console.log(
      `Commit ${commit.slice(0, 10)} : ${files} fichiers${
        remote ? `, au-dessus de ${remote.slice(0, 10)}` : " (premier envoi)"
      }.`,
    )
    if (opts.dry) return console.log("Essai : rien n'a été envoyé.")

    // 4. Fichiers LFS, puis commit (sans le crochet pre-push de Figma Make).
    console.log("Envoi des fichiers Git LFS…")
    gitAuth(["lfs", "push", url, commit])
    console.log("Envoi du commit…")
    gitAuth(["push", "--no-verify", url, `${commit}:refs/heads/${opts.branch}`])
    git(["update-ref", LOCAL_REF, commit])
    console.log(`Envoyé : https://github.com/${opts.repo}/tree/${opts.branch}`)
  } finally {
    fs.rmSync(index, { force: true })
  }
}

try {
  main()
} catch (err) {
  const msg = String(err.stderr || err.message)
    .replace(/(ghp_|github_pat_)\w+/g, "$1***")
    .replace(/Basic [A-Za-z0-9+/=]+/g, "Basic ***")
  console.error(`Échec de l'envoi sur GitHub : ${msg.trim()}`)
  process.exitCode = 1
}
