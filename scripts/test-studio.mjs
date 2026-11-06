// NEXORA #055 : essais du Studio 3D & Motion : fonctions sans navigateur (renderer/nx/studioplus/formats.js :
// OBJ, STL, PLY, SPLAT, ZIP aligné et USDZ, Lottie, flashs, bruitages, réponses de l'IA) et migration
// 20261106000005_studio_motion.sql rejouée deux fois sur Postgres (PGlite, dossier PGLITE_DIR comme pnpm
// test:offres) après 20261106000003 et 20261106000004 : vidéos à valider, instant des avis, notifications,
// dépôt des vidéos réservé aux éditeurs de l'espace, bibliothèque d'équipe 3D. Lancement : pnpm test:studio.
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { spawnSync } from "node:child_process"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import * as F from "../nexora/app/renderer/nx/studioplus/formats.js"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
let count = 0
let fails = 0
function ok(cond, label, detail) {
  count += 1
  if (!cond) fails += 1
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}${!cond && detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 300)}` : ""}`)
}
const enc = new TextEncoder()

// ---------- Modèles ----------
const obj = F.parseObj("# carré\nv 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvn 0 0 1\nf 1//1 2//1 3//1 4//1\n")
ok(obj.positions.length === 18 && obj.normals && obj.normals[2] === 1, "OBJ : quadrilatère découpé en 2 triangles, normales lues")
const objNeg = F.parseObj("v 0 0 0 1 0 0\nv 1 0 0 0 1 0\nv 0 1 0 0 0 1\nf -3 -2 -1\n")
ok(objNeg.positions.length === 9 && objNeg.colors && objNeg.colors[0] === 1 && objNeg.colors[4] === 1, "OBJ : indices négatifs et couleurs de sommets")
let bad = false; try { F.parseObj("v 0 0 0\n") } catch { bad = true }
ok(bad, "OBJ : fichier sans face refusé")
const stlB = new Uint8Array(84 + 50); const dv = new DataView(stlB.buffer); dv.setUint32(80, 1, true); dv.setFloat32(84 + 8, 1, true); [[0, 0, 0], [1, 0, 0], [0, 1, 0]].forEach((p, k) => p.forEach((x, j) => dv.setFloat32(84 + 12 + k * 12 + j * 4, x, true)))
const stl = F.parseStl(stlB)
ok(stl.positions.length === 9 && stl.positions[3] === 1 && stl.normals[2] === 1, "STL binaire lu")
const stlA = F.parseStl(enc.encode("solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 2 0 0\nvertex 0 2 0\nendloop\nendfacet\nendsolid t\n"))
ok(stlA.positions.length === 9 && stlA.positions[3] === 2, "STL texte lu")
const plyA = F.parsePly(enc.encode("ply\nformat ascii 1.0\nelement vertex 3\nproperty float x\nproperty float y\nproperty float z\nproperty uchar red\nproperty uchar green\nproperty uchar blue\nelement face 1\nproperty list uchar int vertex_indices\nend_header\n0 0 0 255 0 0\n1 0 0 0 255 0\n0 1 0 0 0 255\n3 0 1 2\n"))
ok(plyA.positions.length === 9 && plyA.indices && plyA.indices.length === 3 && plyA.colors[0] === 1 && plyA.colors[5] === 0, "PLY texte : maillage coloré")
const head = "ply\nformat binary_little_endian 1.0\nelement vertex 2\nproperty float x\nproperty float y\nproperty float z\nproperty float nx\nproperty float ny\nproperty float nz\nproperty float f_dc_0\nproperty float f_dc_1\nproperty float f_dc_2\nproperty float opacity\nend_header\n"
const hb = enc.encode(head); const body = new Float32Array([1, 2, 3, 0, 0, 0, 1.7725, 0, -1.7725, 1, 4, 5, 6, 0, 0, 0, 0, 0, 0, 1])
const plyB = new Uint8Array(hb.length + body.byteLength); plyB.set(hb); plyB.set(new Uint8Array(body.buffer), hb.length)
const sp = F.parsePly(plyB)
ok(sp.splat && sp.positions[3] === 4 && Math.abs(sp.colors[0] - 1) < 0.01 && Math.abs(sp.colors[2]) < 0.01 && Math.abs(sp.colors[3] - 0.5) < 0.01, "PLY binaire de capture 3D : couleurs tirées des harmoniques", Array.from(sp.colors))
const sb = new Uint8Array(64); const sv = new DataView(sb.buffer); sv.setFloat32(0, 1.5, true); sv.setFloat32(32 + 8, -2, true); sb[24] = 255; sb[32 + 26] = 128
const splat = F.parseSplat(sb)
ok(splat.positions[0] === 1.5 && splat.positions[5] === -2 && splat.colors[0] === 1 && Math.abs(splat.colors[5] - 128 / 255) < 1e-6, "SPLAT lu (2 points)")
const big = { positions: new Float32Array(30), colors: new Float32Array(30) }
ok(F.thin(big, 4).positions.length === 9 && F.thin(big, 4).thinned === 3, "Nuage de points allégé pour l'aperçu (un point sur 3)")

// ---------- ZIP, USDZ, Lottie ----------
const z = F.storeZip([{ name: "a.usda", data: "#usda 1.0\n" }, { name: "textures/t0.png", data: new Uint8Array([1, 2, 3, 4, 5]) }])
const zv = new DataView(z.buffer); let off = 0; const starts = []
while (zv.getUint32(off, true) === 0x04034b50) { const nl = zv.getUint16(off + 26, true); const el = zv.getUint16(off + 28, true); const size = zv.getUint32(off + 18, true); starts.push(off + 30 + nl + el); off += 30 + nl + el + size }
ok(starts.length === 2 && starts.every((s) => s % 64 === 0), "ZIP : données alignées sur 64 octets (exigence USDZ)", starts)
const mesh = { name: "Cube rouge", points: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]), indices: new Uint32Array([0, 1, 2]), color: [1, 0, 0], roughness: 0.3, metallic: 0.8 }
const usda = F.usda([mesh, { ...mesh, name: "Écran", uvs: new Float32Array(6), texture: "textures/t0.png" }])
ok(/defaultPrim = "Root"/.test(usda) && /upAxis = "Y"/.test(usda) && /def Mesh "geo"/.test(usda) && /UsdPreviewSurface/.test(usda) && /diffuseColor = \(1, 0, 0\)/.test(usda) && /@textures\/t0\.png@/.test(usda) && /Cube_rouge_0/.test(usda), "USDZ : scène USD (maillage, matière, texture, noms sûrs)")
const usdz = F.buildUsdz([mesh], [{ name: "textures/t0.png", data: new Uint8Array([137, 80, 78, 71]) }])
const tmp = path.join(os.tmpdir(), `nx-${process.pid}.usdz`); fs.writeFileSync(tmp, usdz)
const py = spawnSync("python3", ["-c", `import zipfile,sys;z=zipfile.ZipFile(sys.argv[1]);print(z.testzip() is None, z.namelist()[0], len(z.namelist()), all(i.compress_type==0 for i in z.infolist()))`, tmp], { encoding: "utf8" })
if (py.error) console.log("  externe : python3 absent, lecture de l'USDZ par un autre outil non vérifiée")
else ok(py.stdout.trim() === "True scene.usda 2 True", "USDZ relu par un lecteur ZIP standard (scene.usda en premier, sans compression)", py.stdout + py.stderr)
fs.rmSync(tmp, { force: true })
const lot = F.buildLottie({ w: 100, h: 50, fps: 12, frames: ["data:image/jpeg;base64,AA", "data:image/jpeg;base64,BB"] })
ok(lot.v && lot.fr === 12 && lot.op === 2 && lot.assets.length === 2 && lot.layers[1].ip === 1 && lot.layers[1].op === 2 && lot.layers[0].refId === "img_0" && lot.assets[0].e === 1, "Lottie : une image par étape, intégrée")

// ---------- Accessibilité, bruitages, IA ----------
const flashing = Array.from({ length: 60 }, (_, i) => (Math.floor(i / 3) % 2 ? 0.9 : 0.1))
const calm = Array.from({ length: 60 }, (_, i) => i / 60)
ok(F.flashRate(flashing, 30) > 3 && F.flashRate(calm, 30) === 0, "Flashs : 5 par seconde signalés, fondu lent accepté", [F.flashRate(flashing, 30), F.flashRate(calm, 30)])
const all = Object.keys(F.SFX).map((k) => F.synth(k, 16000))
ok(all.every((s) => s.length > 100 && Math.max(...s.map(Math.abs)) <= 0.9001 && Math.max(...s.map(Math.abs)) > 0.5), "Bruitages : 7 sons synthétisés, niveau normalisé")
const ch = [new Float32Array(10), new Float32Array(10)]; F.mixInto(ch, new Float32Array([0.8, 0.8, 0.8]), 8, 2)
ok(ch[0][8] === 1 && ch[1][9] === 1 && ch[0][7] === 0, "Mélange : bruitage placé à l'instant voulu, sans dépasser le niveau maximal")
const plan = F.cleanPlan({ scene: "hack", anim: "spin", camera: "orbit360", style: "argile", duration: 999, color: "red", texts: ["Bonjour", "x".repeat(80), "trop"] }, { styles: ["normal", "argile"] })
ok(plan.scene === "hero" && plan.anim === "spin" && plan.style === "argile" && plan.duration === 30 && plan.color === null && plan.texts.length === 2 && plan.texts[1].length === 40 && plan.hdri === null, "IA : mise en scène limitée aux réglages existants", plan)
const parts = F.cleanParts({ name: "Tasse", parts: [{ shape: "cylinder", pos: [0, 5, 0], size: [8, 10, 8], color: "#ffffff" }, { shape: "dragon", pos: [999, 0, 0], color: "rouge" }] })
ok(parts.parts.length === 2 && parts.parts[1].shape === "box" && parts.parts[1].pos[0] === 50 && parts.parts[1].color === "#cccccc", "IA : objet composé contrôlé (forme, position, couleur)")
let empty = false; try { F.cleanParts({ parts: [] }) } catch { empty = true }
ok(empty, "IA : objet sans forme refusé")

// ---------- Migration ----------
async function migration() {
  const dir = process.env.PGLITE_DIR || "/tmp/pgtest"
  let PGlite
  try { ({ PGlite } = await import(pathToFileURL(createRequire(path.join(dir, "package.json")).resolve("@electric-sql/pglite")).href)) } catch { console.log(`PGlite introuvable dans ${dir} : partie sautée.`); return }
  const db = new PGlite()
  const q = async (t, p) => (await db.query(t, p)).rows
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    create table public.organizations (id uuid primary key);
    create table public.organization_members (org_id uuid, user_id uuid, role text default 'member');
    grant select on public.organization_members to authenticated;
    create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid, kind text, title text, body text, link text, read_at timestamptz, created_at timestamptz default now());
    create schema storage; grant usage on schema storage to anon, authenticated;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:greatest(array_length(string_to_array(name, '/'), 1) - 1, 0)] $$;
    grant execute on function storage.foldername(text) to anon, authenticated;
    alter table storage.objects enable row level security; grant select, insert, delete on storage.objects to authenticated;
    insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'a@exemple.test'), ('00000000-0000-0000-0000-00000000000b', null), ('00000000-0000-0000-0000-00000000000c', null);
    insert into public.organizations values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
    insert into public.organization_members values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner'), ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'owner'), ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'viewer');`)
  const M = (f) => fs.readFileSync(path.join(ROOT, "supabase/migrations", f), "utf8")
  for (let i = 0; i < 2; i++) { await db.exec(M("20261106000003_nex_design.sql")); await db.exec(M("20261106000004_nex_design_notifications.sql")); await db.exec(M("20261106000005_studio_motion.sql")) }
  ok(true, "Migration : 03, 04 puis 05 rejouées deux fois sans erreur")
  const fns = await q("select count(*)::int as n from pg_proc where proname = 'nx_review_post'")
  ok(fns[0].n === 1, "Avis : une seule fonction d'envoi (ancienne signature retirée)")
  const A = "00000000-0000-0000-0000-00000000000a"; const B = "00000000-0000-0000-0000-00000000000b"; const V = "00000000-0000-0000-0000-00000000000c"; const ORG = "10000000-0000-0000-0000-000000000001"
  const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('test.uid', '${uid}', false);`); try { return await fn() } finally { await db.exec("reset role;") } }
  const [link] = await as(A, () => q("insert into public.design_review_links (org_id, doc_local_id, name, kind, media_url, created_by) values ($1, 'studio:Scène 1', 'Lancement', 'video', 'https://exemple.test/v.mp4', $2) returning token", [ORG, A]))
  await db.exec("set role anon;")
  const got = (await q("select public.nx_review_get($1) as r", [link.token]))[0].r
  ok(got.kind === "video" && got.media_url === "https://exemple.test/v.mp4" && got.reviews.length === 0, "Vidéo : lien lu sans compte (type, adresse de la vidéo)", got)
  const rows = (await q("select public.nx_review_post($1, 'Awa', 'changes', 'Le logo arrive trop tard', 0, null, null, 12.345) as r", [link.token]))[0].r
  ok(rows.length === 1 && rows[0].t === 12.35, "Vidéo : avis rattaché à l'instant (12,35 s)", rows)
  await q("select public.nx_review_post($1, 'Awa', 'comment', 'Sans instant', 0)", [link.token])
  let badT = false; try { const r = (await q("select public.nx_review_post($1, 'Awa', 'comment', 'Instant faux', 0, null, null, -5) as r", [link.token]))[0].r; badT = r[0].t === null } catch { badT = false }
  ok(badT, "Vidéo : instant hors limites ignoré")
  await db.exec("reset role;")
  const n = await q("select title, body, link from public.notifications order by created_at")
  ok(n.length === 3 && n[0].title === "Awa demande des changements sur « Lancement »" && n[0].body.endsWith("(à 0:12)") && !n[1].body.includes("page") && n[0].link === "studio:Scène 1", "Notifications : instant de la vidéo dans le texte, lien vers la scène", n)
  const [dl] = await as(A, () => q("insert into public.design_review_links (org_id, doc_local_id, name, pages, created_by) values ($1, 'doc', 'Affiche', '[{\"img\":\"x\"}]', $2) returning token", [ORG, A]))
  await db.exec("set role anon;")
  const dr = (await q("select public.nx_review_post($1, 'Kofi', 'comment', 'Joli', 0, 0.5, 0.5, 9) as r", [dl.token]))[0].r
  await db.exec("reset role;")
  ok(dr[0].t === null && (await q("select body, link from public.notifications order by created_at desc limit 1")).every((r) => r.body.endsWith("(page 1)") && r.link === "design:doc"), "Design : instant ignoré, page et lien du document dans la notification")
  let kindBad = false; try { await as(A, () => q("insert into public.design_review_links (org_id, doc_local_id, kind) values ($1, 'x', 'audio')", [ORG])) } catch { kindBad = true }
  ok(kindBad, "Liens : type inconnu refusé")
  const bucket = await q("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'studio-reviews'")
  ok(bucket.length === 1 && bucket[0].public === true && Number(bucket[0].file_size_limit) === 104857600 && bucket[0].allowed_mime_types[0] === "video/mp4", "Stockage : compartiment des vidéos (public, 100 Mo, MP4)", bucket)
  await as(A, () => q("insert into storage.objects (bucket_id, name) values ('studio-reviews', $1)", [`${ORG}/v1.mp4`]))
  const deny = async (uid, name) => { try { await as(uid, () => q("insert into storage.objects (bucket_id, name) values ('studio-reviews', $1)", [name])); return false } catch { return true } }
  ok(await deny(B, `${ORG}/v2.mp4`) && await deny(V, `${ORG}/v3.mp4`) && await deny(A, "10000000-0000-0000-0000-000000000002/v4.mp4"), "Stockage : dépôt réservé aux éditeurs, dans le dossier de leur espace")
  await as(A, () => q("insert into public.design_libraries (org_id, kind, name, data, updated_by) values ($1, 'studio', 'Présentoir', '{\"scene\":{}}', $2)", [ORG, A]))
  ok((await as(A, () => q("select kind from public.design_libraries"))).some((r) => r.kind === "studio"), "Bibliothèque d'équipe 3D : mise en scène publiée")
}
await migration()
console.log(`\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
