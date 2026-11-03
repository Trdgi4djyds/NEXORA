// Jetons d'accès pour les scripts (jamais écrits dans le dépôt envoyé sur GitHub) : variable
// d'environnement d'abord, sinon le fichier local « token proj nexora.txt » fourni par l'utilisateur.
import fs from "node:fs"
import path from "node:path"
import { ROOT } from "../preview/server.mjs"

export const SECRETS_FILE = "token proj nexora.txt"

function fromFile(pattern) {
  try {
    return (
      pattern.exec(
        fs.readFileSync(path.join(ROOT, SECRETS_FILE), "utf8"),
      )?.[0] || ""
    )
  } catch {
    return ""
  }
}

/** Jeton GitHub (GITHUB_TOKEN ou ghp_… / github_pat_… du fichier local). */
export const githubToken = () =>
  process.env.GITHUB_TOKEN || fromFile(/\b(ghp_\w+|github_pat_\w+)/)

/** Jeton d'accès personnel Supabase (SUPABASE_ACCESS_TOKEN ou sbp_… du fichier local). */
export const supabaseToken = () =>
  process.env.SUPABASE_ACCESS_TOKEN || fromFile(/\bsbp_\w+/)
