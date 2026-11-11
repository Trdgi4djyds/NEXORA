// NEXORA #052 : mode démonstration du Dev Lab dans l'aperçu (option --demo-dev de pnpm captures).
// Un vrai projet est créé dans le dossier temporaire et les canaux dev:, git: et devx: sont servis par le vrai
// code du processus principal (nexora/app/src/dev/ipc.js et src/devplus/ipc.js), comme preview/demo-main.mjs
// pour la supervision. Sert aussi aux essais de scripts/test-devlab.mjs.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { execFileSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath } from "node:url"

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const APP = path.join(ROOT, "nexora", "app")
const BASE = path.join(os.tmpdir(), "nexora-demo-dev")
export const DEMO_DEV_ROOT = path.join(BASE, "boutique-demo")
const USER_DATA = path.join(BASE, "donnees-nexora")
// Valeur fictive, assemblée ici pour qu'aucun outil ne la prenne pour une vraie clé dans le dépôt.
const FAKE_KEY = ["sk", "live", "51NexoraDemo0000000000000000demo"].join("_")

const FILES = {
  "package.json": JSON.stringify(
    {
      name: "boutique-demo",
      version: "1.0.0",
      private: true,
      type: "module",
      scripts: {
        dev: "node server.js",
        build: "node scripts/build.js",
        test: "node --test",
        typecheck: "tsc --noEmit",
      },
      devDependencies: { typescript: "^5.6.0" },
    },
    null,
    2,
  ),
  "README.md":
    "# Boutique démo\n\nPetite boutique en ligne : catalogue, panier et paiement.\n",
  ".gitignore": "node_modules\ndist\n",
  "tsconfig.json": JSON.stringify(
    {
      compilerOptions: {
        strict: true,
        noEmit: true,
        target: "ES2022",
        module: "ESNext",
        moduleResolution: "Bundler",
      },
      include: ["src"],
    },
    null,
    2,
  ),
  "server.js": `import http from "node:http"
import fs from "node:fs"

const page = fs.readFileSync(new URL("./public/index.html", import.meta.url))
http
  .createServer((req, res) => {
    if (req.url === "/api/produits") {
      res.writeHead(200, { "content-type": "application/json" })
      res.end(JSON.stringify([{ id: 1, nom: "Sac en wax", prix: 25000 }]))
      return
    }
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" })
    res.end(page)
  })
  .listen(4173, () => console.log("Boutique prête sur http://localhost:4173"))
`,
  "public/index.html":
    '<!doctype html>\n<html lang="fr">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Boutique démo</title></head>\n<body><h1>Boutique démo</h1><p>Sacs, pagnes et accessoires.</p></body>\n</html>\n',
  "scripts/build.js":
    'import fs from "node:fs"\nfs.mkdirSync("dist", { recursive: true })\nfs.copyFileSync("public/index.html", "dist/index.html")\nconsole.log("Construit dans dist/")\n',
  "src/panier.ts": `export interface Article {
  nom: string
  prix: number
  quantite: number
}

export function total(articles: Article[]): number {
  return articles.reduce((somme, a) => somme + a.prix * a.quantite, 0)
}

// Erreur volontaire : une chaîne à la place d'un nombre.
export const fraisDePort: number = "2500"
`,
  "src/prix.js": `export function prixTTC(ht, taux = 0.18) {
  return Math.round(ht * (1 + taux) * 100) / 100
}

export function remise(prix, pourcentage) {
  return prix - pourcentage
}
`,
  "test/prix.test.js": `import test from "node:test"
import assert from "node:assert/strict"
import { prixTTC, remise } from "../src/prix.js"

test("prix TTC avec 18 % de taxe", () => {
  assert.equal(prixTTC(100), 118)
})

test("remise de 10 % sur 50", () => {
  assert.equal(remise(50, 10), 45)
})

test("prix TTC arrondi au centime", () => {
  assert.equal(prixTTC(9.99), 11.79)
})
`,
}

function git(args, cwd = DEMO_DEV_ROOT) {
  return execFileSync(
    "git",
    [
      "-c",
      "user.name=Camille Laurent",
      "-c",
      "user.email=camille@exemple.fr",
      ...args,
    ],
    { cwd, stdio: "pipe" },
  ).toString()
}
function write(rel, text) {
  const f = path.join(DEMO_DEV_ROOT, rel)
  fs.mkdirSync(path.dirname(f), { recursive: true })
  fs.writeFileSync(f, text)
}

/** (Re)crée le projet de démonstration : fichiers, base SQLite, dépôt Git avec branche et mise de côté. */
export function createDemoProject() {
  fs.rmSync(BASE, { recursive: true, force: true })
  fs.mkdirSync(USER_DATA, { recursive: true })
  for (const [rel, text] of Object.entries(FILES)) write(rel, text)
  // TypeScript du dépôt de travail, pour la vérification du projet (panneau « Problèmes »).
  const ts = path.join(ROOT, "node_modules", "typescript")
  if (fs.existsSync(ts)) {
    fs.mkdirSync(path.join(DEMO_DEV_ROOT, "node_modules", ".bin"), {
      recursive: true,
    })
    fs.symlinkSync(
      ts,
      path.join(DEMO_DEV_ROOT, "node_modules", "typescript"),
      "junction",
    )
    if (process.platform !== "win32")
      fs.symlinkSync(
        "../typescript/bin/tsc",
        path.join(DEMO_DEV_ROOT, "node_modules", ".bin", "tsc"),
      )
  }
  try {
    const { DatabaseSync } = require("node:sqlite")
    fs.mkdirSync(path.join(DEMO_DEV_ROOT, "data"), { recursive: true })
    const db = new DatabaseSync(path.join(DEMO_DEV_ROOT, "data", "boutique.db"))
    db.exec(`create table produits (id integer primary key, nom text not null, prix real, stock integer);
      create table clients (id integer primary key, nom text, email text, cree_le text);
      insert into produits (nom, prix, stock) values ('Sac en wax', 25000, 12), ('Pagne tissé', 18000, 30), ('Bracelet en perles', 4500, 80), ('Sandales en cuir', 15000, 9);
      insert into clients (nom, email, cree_le) values ('Awa Diallo', 'awa.diallo@exemple.com', '2026-10-02'), ('Hugo Martin', 'hugo.martin@exemple.com', '2026-10-15');`)
    db.close()
  } catch {
    // SQLite indisponible dans ce Node : pas de base de démonstration.
  }
  git(["init", "-q", "-b", "main"])
  git(["add", "-A"])
  git(["commit", "-qm", "Premier jet de la boutique"])
  git(["checkout", "-qb", "fonction/paiement"])
  write("src/paiement.js", 'export const moyens = ["Carte", "Mobile Money"]\n')
  git(["add", "-A"])
  git(["commit", "-qm", "Paiement : moyens acceptés"])
  git(["checkout", "-q", "main"])
  write(
    "README.md",
    `${FILES["README.md"]}\nLance \`pnpm dev\`, puis ouvre http://localhost:4173.\n`,
  )
  git(["commit", "-qam", "Documentation : lancement"])
  write("src/prix.js", `${FILES["src/prix.js"]}\nexport const TVA = 0.18\n`)
  git(["stash", "push", "-qm", "Essai de taux de TVA"])
  // Modifications en cours : un fichier de configuration avec une clé oubliée.
  write(
    "config.js",
    `export const STRIPE_KEY = "${FAKE_KEY}"\nexport const SITE = "Boutique démo"\n`,
  )
  write(
    "src/panier.ts",
    `${FILES["src/panier.ts"]}\nexport const devise = "FCFA"\n`,
  )
}

let runtime = null
function ensureRuntime() {
  if (runtime) return runtime
  createDemoProject()
  const handlers = new Map()
  const clients = new Set()
  const send = (channel, data) => {
    for (const res of clients)
      res.write(`data: ${JSON.stringify({ channel, data })}\n\n`)
  }
  const ipcMain = { handle: (c, fn) => handlers.set(c, fn), on() {} }
  const app = {
    getPath: () => USER_DATA,
    getVersion: () => "1.1.0",
    getAppPath: () => APP,
    isPackaged: false,
    on() {},
  }
  const safeStorage = { isEncryptionAvailable: () => false }
  const session = {
    fromPartition: () => ({ setProxy: async () => {}, on() {} }),
    defaultSession: {},
  }
  require(path.join(APP, "src", "dev", "ipc.js")).register({
    ipcMain,
    app,
    dialog: {},
    shell: {},
    send,
    getWin: () => null,
    safeStorage,
    net: { fetch },
    session,
  })
  require(path.join(APP, "src", "devplus", "ipc.js")).register({
    ipcMain,
    app,
    safeStorage,
    send,
    BrowserWindow: null,
    partition: () => "persist:demo",
  })
  runtime = { handlers, clients }
  // Variables protégées et requêtes d'API de départ.
  const call = (c, a) => handlers.get(c)({}, a)
  call("devx:env-set", {
    root: DEMO_DEV_ROOT,
    key: "DATABASE_URL",
    value: "postgres://boutique:motdepasse@localhost:5432/boutique",
  })
  call("devx:env-set", {
    root: DEMO_DEV_ROOT,
    key: "PUBLIC_SITE_NAME",
    value: "Boutique démo",
    secret: false,
  })
  call("devx:env-set", {
    root: DEMO_DEV_ROOT,
    key: "PAYMENT_API_KEY",
    value: "demo-paiement-0123456789",
  })
  call("devx:api-save", {
    root: DEMO_DEV_ROOT,
    data: {
      vars: { baseUrl: "http://localhost:4173" },
      collections: [
        {
          name: "Boutique",
          items: [
            {
              id: "r1",
              name: "Liste des produits",
              method: "GET",
              url: "{{baseUrl}}/api/produits",
              headers: [],
              body: "",
            },
            {
              id: "r2",
              name: "Créer une commande",
              method: "POST",
              url: "{{baseUrl}}/api/commandes",
              headers: [],
              body: '{\n  "produit": 1,\n  "quantite": 2\n}',
            },
          ],
        },
      ],
      history: [],
    },
  })
  return runtime
}

export async function demoDevInvoke(channel, args) {
  const rt = ensureRuntime()
  const fn = rt.handlers.get(channel)
  if (!fn)
    throw new Error(
      "Disponible uniquement dans l’application NEXORA pour Windows.",
    )
  return fn({}, ...(Array.isArray(args) ? args : []))
}

/** Ajoute un flux d'évènements (Server-Sent Events) ouvert par le pont : devx:task, dev:term… */
export function attachDevEvents(res) {
  const rt = ensureRuntime()
  rt.clients.add(res)
  res.on("close", () => rt.clients.delete(res))
}
