// `pnpm supabase <commande>` : configuration du projet Supabase de NEXORA par l'API de gestion,
// depuis un terminal (même configuration que la section « Supabase » du back office).
//
//   types      régénère admin/src/database.types.ts à partir de la base
//   verifier   état du projet, de l'authentification et des fonctions Edge
//   auth       applique l'adresse du site et les redirections de supabase/nexora.json
//              (--admin <adresse> ajoute l'adresse publiée du back office)
//   migrer     applique les fichiers de supabase/migrations/ (idempotents)
//
// Jeton : SUPABASE_ACCESS_TOKEN, sinon le fichier local de jetons (scripts/local-secrets.mjs).
// Dans le bac à sable de Figma Make, seules les lectures passent (types, verifier) : les écritures
// (auth, migrer) se font depuis le back office ou un terminal ordinaire.
import fs from "node:fs"
import path from "node:path"
import { ROOT } from "../preview/server.mjs"
import { supabaseToken } from "./local-secrets.mjs"

const setup = JSON.parse(
  fs.readFileSync(path.join(ROOT, "supabase", "nexora.json"), "utf8"),
)
const API = `https://api.supabase.com/v1/projects/${setup.projectRef}`

async function api(token, p, init = {}) {
  const res = await fetch(`${API}${p}`, {
    ...init,
    // Content-Type seulement avec un corps : le proxy du bac à sable refuse une lecture qui l'annonce.
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  })
  const text = await res.text()
  if (!res.ok)
    throw new Error(
      `${init.method || "GET"} ${p} : ${res.status} ${text.slice(0, 300)}`,
    )
  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

async function main() {
  const [command, ...args] = process.argv.slice(2).filter((a) => a !== "--")
  const token = supabaseToken()
  if (!token)
    throw new Error(
      "Jeton Supabase introuvable : définis SUPABASE_ACCESS_TOKEN.",
    )

  if (command === "types") {
    const { types } = await api(token, "/types/typescript")
    const file = path.join(ROOT, "admin", "src", "database.types.ts")
    fs.writeFileSync(
      file,
      "// Types de la base Supabase de NEXORA, générés par l'API de gestion (`pnpm supabase types`).\n// Ne pas modifier à la main.\n" +
        types,
    )
    console.log(`Types écrits dans ${path.relative(ROOT, file)}.`)
  } else if (command === "verifier") {
    const [project, auth, fns] = await Promise.all([
      api(token, ""),
      api(token, "/config/auth"),
      api(token, "/functions"),
    ])
    const allow = (auth.uri_allow_list || "").split(",").filter(Boolean)
    console.log(
      `Projet : ${project.name} (${project.region}) — ${project.status}`,
    )
    console.log(
      `Adresse du site : ${auth.site_url}${
        /localhost|127\.0\.0\.1/.test(auth.site_url)
          ? "  ← à corriger (NEXORA attend " + setup.siteUrl + ")"
          : ""
      }`,
    )
    for (const u of setup.redirectUrls)
      console.log(
        `Redirection ${u} : ${allow.includes(u) ? "autorisée" : "MANQUANTE"}`,
      )
    for (const f of setup.functions) {
      const fn = fns.find((x) => x.slug === f)
      console.log(
        `Fonction ${f} : ${fn ? `${fn.status} (v${fn.version})` : "ABSENTE"}`,
      )
    }
    console.log(
      `Inscriptions Supabase : ${
        auth.disable_signup ? "fermées" : "ouvertes"
      } · SMTP : ${auth.smtp_host || "serveur de Supabase"}`,
    )
  } else if (command === "auth") {
    const i = args.indexOf("--admin")
    const extra =
      i >= 0 && args[i + 1] ? [`${args[i + 1].replace(/\/?$/, "/")}**`] : []
    const auth = await api(token, "/config/auth")
    const allow = [
      ...new Set([
        ...(auth.uri_allow_list || "").split(",").filter(Boolean),
        ...setup.redirectUrls,
        ...extra,
      ]),
    ]
    const patch = { uri_allow_list: allow.join(",") }
    if (/localhost|127\.0\.0\.1/.test(auth.site_url))
      patch.site_url = setup.siteUrl
    await api(token, "/config/auth", {
      method: "PATCH",
      body: JSON.stringify(patch),
    })
    console.log(`Authentification mise à jour : ${JSON.stringify(patch)}`)
  } else if (command === "migrer") {
    const dir = path.join(ROOT, "supabase", "migrations")
    for (const f of fs
      .readdirSync(dir)
      .filter((x) => x.endsWith(".sql"))
      .sort()) {
      await api(token, "/database/query", {
        method: "POST",
        body: JSON.stringify({
          query: fs.readFileSync(path.join(dir, f), "utf8"),
        }),
      })
      console.log(`Migration appliquée : ${f}`)
    }
  } else {
    throw new Error("Commande attendue : types, verifier, auth ou migrer.")
  }
}

main().catch((err) => {
  console.error(`Échec : ${err.message}`)
  process.exitCode = 1
})
