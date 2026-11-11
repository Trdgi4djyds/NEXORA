// NEXORA #052 : essais des outils du Dev Lab (canaux devx:*) sur le projet de démonstration de
// preview/demo-dev.mjs, avec le vrai code du processus principal : Problèmes, scripts, variables protégées,
// secrets, Git avancé, débogueur, client d'API, tests, dépendances, bases de données, assistant du projet.
// Lancement : pnpm test:devlab. Les fonctions qui demandent Electron (contrôles dans une fenêtre cachée) ou
// un compte externe (hébergeurs, GitHub) ne sont pas essayées ici.
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import { DEMO_DEV_ROOT, demoDevInvoke } from "../preview/demo-dev.mjs"

const root = DEMO_DEV_ROOT
let count = 0
let fails = 0
function ok(cond, label, detail) {
  count += 1
  if (!cond) fails += 1
  console.log(
    `${cond ? "OK  " : "ÉCHEC"} ${label}${
      !cond && detail !== undefined
        ? ` → ${
            typeof detail === "string"
              ? detail
              : JSON.stringify(detail).slice(0, 400)
          }`
        : ""
    }`,
  )
}
const call = (channel, args) => demoDevInvoke(channel, [{ root, ...args }])
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const info = await call("devx:info")
ok(info.git && info.node, "outils détectés (Git, Node)", info)

// Problèmes : erreur de type volontaire de src/panier.ts.
const pb = await call("devx:problems")
const tsErr = pb.items.find(
  (p) => p.rel === "src/panier.ts" && p.code === "TS2322",
)
ok(
  tsErr && tsErr.line === 12,
  "Problèmes : erreur TypeScript repérée à la bonne ligne",
  pb,
)

// Scripts : liste, lancement, adresse du serveur repérée, arrêt.
const tl = await call("devx:tasks")
ok(
  tl.pm === "npm" &&
    ["dev", "build", "test", "typecheck"].every((n) =>
      tl.tasks.some((t) => t.name === n),
    ),
  "Scripts : 4 scripts de package.json",
  tl.tasks.map((t) => t.name),
)
// Lancement réel du script « dev » : adresse du serveur repérée dans la sortie, page servie, arrêt.
const started = await call("devx:task-start", { task: { id: "npm:dev" } })
let running = []
for (let i = 0; i < 60; i += 1) {
  await sleep(200)
  running = (await call("devx:tasks")).running
  if (running[0] && running[0].url) break
}
const devUrl = running[0] && running[0].url
ok(
  devUrl === "http://localhost:4173",
  "Scripts : serveur lancé, adresse repérée",
  running,
)
const page = devUrl
  ? await fetch(devUrl)
      .then((r) => r.text())
      .catch(() => "")
  : ""
ok(/Boutique démo/.test(page), "Scripts : page servie par le script lancé")
await call("devx:task-stop", { id: started.id })
for (let i = 0; i < 30 && (await call("devx:tasks")).running.length; i += 1)
  await sleep(200)
ok((await call("devx:tasks")).running.length === 0, "Scripts : script arrêté")
const loc = await call("devx:locate", {
  text: "src/panier.ts(12,14): error TS2322",
})
ok(
  loc.length === 1 && loc[0].line === 12 && loc[0].col === 14,
  "Scripts : emplacement d'erreur reconnu dans la sortie",
  loc,
)

// Variables protégées.
let env = await call("devx:env-list")
ok(
  env.vars.length === 3 &&
    env.vars.find((v) => v.key === "DATABASE_URL").secret &&
    env.vars.find((v) => v.key === "DATABASE_URL").value === "",
  "Variables : secret masqué dans la liste",
  env.vars,
)
ok(
  (await call("devx:env-reveal", { key: "PAYMENT_API_KEY" })) ===
    "demo-paiement-0123456789",
  "Variables : valeur affichée sur demande",
)
const ex = await call("devx:env-example")
const exText = fs.readFileSync(ex.file, "utf8")
ok(
  /^DATABASE_URL=$/m.test(exText) &&
    /^PUBLIC_SITE_NAME="Boutique démo"$/m.test(exText) &&
    !/motdepasse/.test(exText),
  ".env.example sans aucune valeur secrète",
  exText,
)
let refused = false
try {
  await call("devx:env-set", { key: "1MAUVAIS", value: "x" })
} catch {
  refused = true
}
ok(refused, "Variables : nom invalide refusé")

// Recherche de secrets dans les fichiers modifiés.
const sc = await call("devx:secrets-scan")
ok(
  sc.findings.some(
    (f) =>
      f.file === "config.js" &&
      /Stripe/.test(f.rule) &&
      !f.preview.includes("51NexoraDemo0000"),
  ),
  "Secrets : clé repérée dans config.js, masquée",
  sc,
)
ok(
  !sc.findings.some((f) => f.file === "test/prix.test.js"),
  "Secrets : fichiers non modifiés ignorés",
)

// Git avancé.
const br = await call("devx:git-branches")
ok(
  br.current === "main" &&
    br.branches.some((b) => b.name === "fonction/paiement"),
  "Git : branches",
  br,
)
const st = await call("devx:git-stash-list")
ok(
  st.length === 1 && /Essai de taux de TVA/.test(st[0].message),
  "Git : mise de côté listée",
  st,
)
ok(
  /TVA = 0\.18/.test(await call("devx:git-stash-show", { ref: "stash@{0}" })),
  "Git : contenu de la mise de côté",
)
const bl = await call("devx:git-blame", { file: "README.md" })
ok(
  bl.lines.length >= 3 &&
    bl.lines[0].author === "Camille Laurent" &&
    bl.lines.some((l) => l.summary === "Documentation : lancement"),
  "Git : auteur de chaque ligne",
  bl.lines.slice(0, 4),
)
const gr = await call("devx:git-graph")
ok(
  gr.rows.filter((r) => r.hash).length === 3 &&
    !gr.rows.some((r) => (r.refs || []).includes("refs/stash")) &&
    gr.rows.some((r) => r.refs.some((x) => /fonction\/paiement/.test(x))),
  "Git : graphe des branches",
  gr.rows,
)
// Fusion avec conflit : deux branches modifient la même ligne.
const { execFileSync } = await import("node:child_process")
const g = (args) =>
  execFileSync("git", ["-c", "user.name=T", "-c", "user.email=t@t", ...args], {
    cwd: root,
    stdio: "pipe",
  }).toString()
g(["stash", "push", "-q", "--include-untracked", "-m", "essai"])
g(["checkout", "-qb", "essai-conflit"])
fs.writeFileSync(path.join(root, "public/index.html"), "<h1>Version A</h1>\n")
g(["commit", "-qam", "A"])
g(["checkout", "-q", "main"])
fs.writeFileSync(path.join(root, "public/index.html"), "<h1>Version B</h1>\n")
g(["commit", "-qam", "B"])
const mg = await call("devx:git-merge", { branch: "essai-conflit" })
ok(
  !mg.ok && mg.conflicts.includes("public/index.html"),
  "Git : conflit de fusion détecté",
  mg,
)
const cf = await call("devx:git-conflict", { file: "public/index.html" })
ok(
  /Version B/.test(cf.ours) &&
    /Version A/.test(cf.theirs) &&
    /<<<<<<</.test(cf.merged),
  "Git : versions « à toi » et « à fusionner »",
  cf,
)
refused = false
try {
  await call("devx:git-resolve", {
    file: "public/index.html",
    content: cf.merged,
  })
} catch {
  refused = true
}
ok(refused, "Git : résolution refusée s'il reste des marques de conflit")
const rs = await call("devx:git-resolve", {
  file: "public/index.html",
  content: "<h1>Version A et B</h1>\n",
})
ok(rs.conflicts.length === 0, "Git : conflit résolu", rs)
const mc = await call("devx:git-merge-continue")
ok(!mc.merging, "Git : fusion terminée", mc)
g(["stash", "pop", "-q", "stash@{0}"])

// Tests (exécuteur de Node) avec couverture.
const td = await call("devx:tests-detect")
ok(
  td.runners.some((r) => r.id === "node"),
  "Tests : exécuteur de Node détecté",
  td,
)
const tr = await call("devx:tests-run", { runner: "node", coverage: true })
ok(
  tr.totals.passed === 2 && tr.totals.failed === 1,
  "Tests : 2 réussis, 1 en échec",
  tr.totals,
)
ok(
  tr.files
    .flatMap((f) => f.tests)
    .find(
      (t) =>
        t.status === "failed" && /remise/.test(t.name) && /40/.test(t.message),
    ),
  "Tests : message de l'échec",
  tr.files,
)
ok(
  tr.coverage && tr.coverage.lines > 50,
  "Tests : couverture des lignes",
  tr.coverage,
)
const one = await call("devx:tests-run", {
  runner: "node",
  name: "prix TTC avec 18",
})
ok(
  one.totals.passed === 1 && one.totals.failed === 0,
  "Tests : relance d'un seul test",
  one.totals,
)

// Débogueur : point d'arrêt, variables, évaluation, reprise.
fs.writeFileSync(
  path.join(root, "debug-essai.js"),
  "const panier = [{ prix: 10 }, { prix: 32 }]\nlet total = 0\nfor (const a of panier) total += a.prix\nconsole.log('total', total)\n",
)
await call("devx:debug-breakpoints", {
  file: path.join(root, "debug-essai.js"),
  lines: [4],
})
await call("devx:debug-start", { file: "debug-essai.js" })
let paused = null
for (let i = 0; i < 40 && !paused; i += 1) {
  await sleep(150)
  const ev = await call("devx:debug-eval", { expression: "total" }).catch(
    () => null,
  )
  if (ev && ev.value === "42") paused = ev
}
ok(
  paused,
  "Débogueur : arrêt à la ligne 4 et variable lue (total = 42)",
  paused,
)
const sco = await call("devx:debug-scopes", { frame: 0 }).catch(
  (e) => e.message,
)
ok(
  Array.isArray(sco) &&
    sco.some((s) => s.vars.some((v) => v.name === "panier")),
  "Débogueur : variables du module",
  sco,
)
await call("devx:debug-cmd", { action: "resume" }).catch(() => {})
await call("devx:debug-cmd", { action: "stop" })
fs.rmSync(path.join(root, "debug-essai.js"))

// Client d'API : vrai serveur local.
const srv = http
  .createServer((req, res) => {
    res.writeHead(201, { "content-type": "application/json", "x-essai": "oui" })
    req.on("data", () => {})
    req.on("end", () =>
      res.end(JSON.stringify({ recu: req.method, chemin: req.url })),
    )
  })
  .listen(0)
await new Promise((r) => srv.once("listening", r))
const resp = await call("devx:http", {
  method: "POST",
  url: "{{base}}/commandes",
  vars: { base: `http://127.0.0.1:${srv.address().port}` },
  body: '{"a":1}',
})
ok(
  resp.status === 201 &&
    resp.json &&
    resp.json.recu === "POST" &&
    resp.headers.some(([k, v]) => k === "x-essai" && v === "oui"),
  "API : requête, variables, en-têtes et JSON",
  resp,
)
srv.close()
const imp = await call("devx:api-import", {
  text: JSON.stringify({
    openapi: "3.0.0",
    info: { title: "Boutique" },
    servers: [{ url: "https://api.exemple.com/v1" }],
    paths: {
      "/produits/{id}": { get: { summary: "Un produit", tags: ["Produits"] } },
    },
  }),
})
ok(
  imp.vars.baseUrl === "https://api.exemple.com/v1" &&
    imp.items[0].url === "{{baseUrl}}/produits/{{id}}",
  "API : import OpenAPI",
  imp,
)
const saved = await call("devx:api-load")
ok(
  saved.collections[0].items.length === 2,
  "API : collection du projet gardée",
  saved,
)

// Bases de données (SQLite) : tables, lignes, requête, données de test.
const dl = await call("devx:db-list")
const detected = dl.detected.find((d) => d.type === "sqlite")
ok(
  detected &&
    detected.file === "data/boutique.db" &&
    dl.detected.some((d) => d.type === "postgres" && !/motdepasse/.test(d.url)),
  "Bases : SQLite et DATABASE_URL repérées (mot de passe masqué)",
  dl.detected,
)
const conns = await call("devx:db-save", {
  conn: { type: "sqlite", name: "boutique.db", file: "data/boutique.db" },
})
const id = conns[0].id
const tables = await call("devx:db-tables", { id })
ok(
  tables.map((t) => t.name).join() === "clients,produits" &&
    tables.find((t) => t.name === "produits").count === 4,
  "Bases : tables et nombre de lignes",
  tables,
)
const rows = await call("devx:db-rows", { id, table: "produits", limit: 2 })
ok(
  rows.rows.length === 2 &&
    rows.total === 4 &&
    rows.rows[0].nom === "Sac en wax",
  "Bases : lignes paginées",
  rows,
)
const q = await call("devx:db-query", {
  id,
  sql: "select count(*) as n from produits where prix > 10000",
})
ok(q.rows[0].n === 3, "Bases : requête SQL", q)
const seed = await call("devx:db-seed", { id, table: "clients", count: 5 })
const after = await call("devx:db-rows", { id, table: "clients", limit: 100 })
ok(
  seed.inserted === 5 &&
    after.total === 7 &&
    after.rows.slice(-5).every((r) => /@exemple\.com$/.test(r.email)),
  "Bases : 5 clients de test ajoutés (e-mails plausibles)",
  after.rows.slice(-2),
)

// Assistant du projet : contexte, application des changements, annulation.
const ctx = await call("devx:agent-context", {
  query: "corrige la remise dans prix",
  open: ["src/panier.ts"],
})
ok(
  ctx.files.some((f) => f.path === "src/prix.js") &&
    ctx.files.some((f) => f.path === "src/panier.ts") &&
    ctx.tree.includes("server.js"),
  "Assistant : fichiers utiles choisis",
  ctx.files.map((f) => f.path),
)
await call("devx:consignes-set", {
  text: "Code en français, sans dépendance nouvelle.",
})
ok(
  (await call("devx:consignes-get")).text.includes("sans dépendance"),
  "Assistant : consignes du projet",
)
const before = fs.readFileSync(path.join(root, "src/prix.js"), "utf8")
const ap = await call("devx:agent-apply", {
  edits: [
    { path: "src/prix.js", content: "export const x = 1\n" },
    { path: "src/nouveau.js", content: "// nouveau\n" },
  ],
})
ok(
  fs.readFileSync(path.join(root, "src/prix.js"), "utf8") ===
    "export const x = 1\n" && fs.existsSync(path.join(root, "src/nouveau.js")),
  "Assistant : changements appliqués",
)
await call("devx:agent-undo", { undoId: ap.undoId })
ok(
  fs.readFileSync(path.join(root, "src/prix.js"), "utf8") === before &&
    !fs.existsSync(path.join(root, "src/nouveau.js")),
  "Assistant : annulation complète",
)
refused = false
try {
  await call("devx:agent-apply", {
    edits: [{ path: "../dehors.txt", content: "x" }],
  })
} catch {
  refused = true
}
ok(refused, "Assistant : écriture hors du projet refusée")

// Dépendances : licences lues (le reste demande le réseau).
const lic = (
  await import("../nexora/app/src/devplus/deps.js")
).default.licenses(root)
ok(
  lic.some(
    (l) =>
      l.name === "typescript" && l.license === "Apache-2.0" && l.risk === "ok",
  ),
  "Dépendances : licence de typescript",
  lic,
)

console.log(
  `\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}.`,
)
process.exit(fails ? 1 : 0)
