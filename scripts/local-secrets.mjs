// Jetons d'accès pour les scripts (jamais écrits dans le dépôt envoyé sur GitHub) : variable
// d'environnement d'abord, sinon le fichier local de jetons fourni par l'utilisateur
// (« token_proj_nexora.txt », ou l'ancien nom « token proj nexora.txt »).
import fs from "node:fs"
import path from "node:path"
import { ROOT } from "../preview/server.mjs"

/** Noms possibles du fichier de jetons (le fichier a été renommé, A-010) : tous exclus de GitHub. */
export const SECRETS_FILES = ["token_proj_nexora.txt", "token proj nexora.txt"]
/** Tout fichier dont le nom ressemble à celui du fichier de jetons, quelle que soit la graphie. */
export const SECRETS_NAME = /token[ _-]?proj[ _-]?nexora/i
export const SECRETS_FILE =
  SECRETS_FILES.find((f) => fs.existsSync(path.join(ROOT, f))) ||
  SECRETS_FILES[0]

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
