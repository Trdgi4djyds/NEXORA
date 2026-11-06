// NEXORA #053 : essais de NEX-DESIGN : fonctions sans navigateur (renderer/nx/designplus/pure.js : CSV,
// modèle rempli, PDF d'impression, lecture PSD, icônes ICO), canaux dzx:* du processus principal et migration 20261106000003_nex_design.sql rejouée
// deux fois sur Postgres (PGlite, dossier PGLITE_DIR comme pnpm test:offres) : droits des membres, revue sans
// compte, limites. Lancement : pnpm test:design.
// NEXORA #054 : PDF vectoriel (pdfvec.js : police WOFF livrée convertie en TrueType et intégrée, texte extrait par
// pdftotext s'il est installé), calculs du responsive (contraintes) et migration 20261106000004 (notifications et
// e-mails des avis de validation).
import fs from "node:fs"
import path from "node:path"
import { createRequire } from "node:module"
import { fileURLToPath, pathToFileURL } from "node:url"
import { parseCsv, fill, buildPdf, parsePsd, buildIco, contrast, guessCons, constrain, fitInside, pushDown } from "../nexora/app/renderer/nx/designplus/pure.js"
import * as PV from "../nexora/app/renderer/nx/designplus/pdfvec.js"
import zlib from "node:zlib"
import { spawnSync } from "node:child_process"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
let count = 0
let fails = 0
function ok(cond, label, detail) {
  count += 1
  if (!cond) fails += 1
  console.log(`${cond ? "OK  " : "ÉCHEC"} ${label}${!cond && detail !== undefined ? ` → ${JSON.stringify(detail).slice(0, 300)}` : ""}`)
}

// ---------- CSV et modèle ----------
const csv = parseCsv('nom;prix;photo\n"Sac en wax";"25 000 F";https://exemple.com/sac.jpg\n"Pagne ""tissé""";18 000 F;\n')
ok(csv.head.join() === "nom,prix,photo" && csv.rows.length === 2 && csv.rows[1].nom === 'Pagne "tissé"', "CSV : séparateur point-virgule, guillemets doublés", csv)
const page = { version: "6", objects: [{ type: "Textbox", text: "{{nom}} · {{ prix }}" }, { type: "Image", name: "@photo", src: "a.png" }, { type: "Group", objects: [{ type: "Textbox", text: "Réf. {{inconnu}}" }] }] }
const filled = fill(page, csv.rows[0])
ok(filled.objects[0].text === "Sac en wax · 25 000 F" && filled.objects[1].src === "https://exemple.com/sac.jpg" && filled.objects[2].objects[0].text === "Réf. {{inconnu}}" && page.objects[0].text.includes("{{"), "Modèle : textes, image @photo, groupes, modèle intact", filled)

// ---------- PDF ----------
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9])
const pdf = buildPdf([{ jpg, pw: 10, ph: 10, iw: 100, ih: 60, mw: 140, mh: 100, margin: 28.35, bleedPt: 8.5, marks: true }, { jpg, pw: 10, ph: 10, iw: 100, ih: 60, mw: 140, mh: 100, margin: 8.5, bleedPt: 8.5, marks: false }])
const txt = Buffer.from(pdf).toString("latin1")
const xref = Number(/startxref\n(\d+)/.exec(txt)[1])
const offsets = [...txt.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]))
ok(txt.startsWith("%PDF-1.4") && txt.trimEnd().endsWith("%%EOF") && txt.slice(xref).startsWith("xref") && offsets.every((o, i) => txt.slice(o).startsWith(`${i + 1} 0 obj`)), "PDF : table des objets exacte", offsets)
ok((txt.match(/\/Type \/Page /g) || []).length === 2 && /\/TrimBox \[28\.35/.test(txt) && /\/BleedBox \[19\.85/.test(txt) && (txt.match(/ l S\n/g) || []).length === 8, "PDF : 2 pages, boîtes de coupe et de fond perdu, 8 traits de coupe")

// ---------- PSD (document fabriqué : 2 calques, brut et compressé, image fusionnée) ----------
function psd() {
  const b = []
  const u8 = (v) => b.push(v & 255)
  const u16 = (v) => { u8(v >> 8); u8(v) }
  const u32 = (v) => { u16(v >>> 16); u16(v & 0xffff) }
  const str = (s) => { for (const c of s) u8(c.charCodeAt(0)) }
  str("8BPS"); u16(1); for (let i = 0; i < 6; i++) u8(0); u16(3); u32(4); u32(4); u16(8); u16(3)
  u32(0); u32(0)
  const L = []
  const l8 = (v) => L.push(v & 255); const l16 = (v) => { l8(v >> 8); l8(v) }; const l32 = (v) => { l16(v >>> 16); l16(v & 0xffff) }; const ls = (s) => { for (const c of s) l8(c.charCodeAt(0)) }
  l16(2)
  // Calque 1 : 2 × 2 en (1, 1), rouge, données brutes ; calque 2 : 4 × 1 en (0, 3), bleu, masqué, compressé.
  const rec = (top, left, bottom, right, lens, opacity, flags, name) => { l32(top); l32(left); l32(bottom); l32(right); l16(3); lens.forEach((n, i) => { l16(i); l32(n) }); ls("8BIM"); ls("norm"); l8(opacity); l8(0); l8(flags); l8(0); const nm = [name.length, ...[...name].map((c) => c.charCodeAt(0))]; while (nm.length % 4) nm.push(0); l32(8 + nm.length); l32(0); l32(0); nm.forEach(l8) }
  rec(1, 1, 3, 3, [2 + 4, 2 + 4, 2 + 4], 255, 0, "Rouge")
  rec(3, 0, 4, 4, [2 + 2 + 2, 2 + 2 + 2, 2 + 2 + 2], 128, 2, "Bleu")
  const raw = (v) => { l16(0); for (let i = 0; i < 4; i++) l8(v) }
  raw(255); raw(0); raw(0)
  const rle = (v) => { l16(1); l16(2); l8(-3 & 255); l8(v) }
  rle(0); rle(0); rle(255)
  u32(L.length + 4); u32(L.length); b.push(...L)
  u16(0); for (let c = 0; c < 3; c++) for (let i = 0; i < 16; i++) u8(c === 1 ? 200 : 10)
  return new Uint8Array(b)
}
const P = parsePsd(psd())
ok(P.width === 4 && P.height === 4 && P.layers.length === 2, "PSD : taille et 2 calques", { w: P.width, n: P.layers.length })
const [red, blue] = P.layers
ok(red.name === "Rouge" && red.left === 1 && red.top === 1 && red.width === 2 && red.rgba[0] === 255 && red.rgba[1] === 0 && red.visible && red.opacity === 1, "PSD : calque brut (nom, position, couleur, visibilité)", red && { ...red, rgba: [...red.rgba.slice(0, 4)] })
ok(blue.name === "Bleu" && blue.width === 4 && blue.rgba[2] === 255 && blue.rgba[14] === 255 && !blue.visible && Math.abs(blue.opacity - 128 / 255) < 1e-9, "PSD : calque compressé, masqué, opacité 50 %", blue && { ...blue, rgba: [...blue.rgba.slice(0, 16)] })
ok(P.composite && P.composite[1] === 200 && P.composite[0] === 10, "PSD : image fusionnée")
let refused = false
try { parsePsd(new Uint8Array([1, 2, 3, 4, 5, 6])) } catch { refused = true }
ok(refused, "PSD : fichier non Photoshop refusé")

// ---------- ICO et contraste ----------
const ico = buildIco([{ size: 16, png: new Uint8Array([1, 2, 3]) }, { size: 256, png: new Uint8Array([4, 5]) }])
const dv = new DataView(ico.buffer)
ok(dv.getUint16(2, true) === 1 && dv.getUint16(4, true) === 2 && ico[6] === 16 && ico[22] === 0 && dv.getUint32(6 + 12, true) === 38 && dv.getUint32(22 + 12, true) === 41 && ico.length === 43, "ICO : en-tête, tailles 16 et 256, positions des images")
ok(Math.abs(contrast("#000000", "#ffffff") - 21) < 0.01 && contrast("#777777", "#ffffff") < 4.5 && contrast("#595959", "#ffffff") >= 7, "Contraste : 21:1, gris insuffisant, gris foncé AAA")

// ---------- Canaux dzx:* du processus principal (faux ipcMain, dossier temporaire) ----------
async function channels() {
  const { createRequire } = await import("node:module")
  const os = await import("node:os")
  const fs = await import("node:fs")
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dzx-"))
  const h = {}
  createRequire(import.meta.url)(path.join(ROOT, "nexora/app/src/designplus/ipc.js")).register({
    ipcMain: { handle: (c, f) => (h[c] = f) },
    app: { getPath: () => tmp },
    safeStorage: { isEncryptionAvailable: () => false },
  })
  const fails = async (fn, re) => { try { await fn(); return false } catch (e) { return re.test(e.message) } }
  ok(Object.keys(h).sort().join() === "dzx:figma-file,dzx:figma-svg,dzx:figma-token,dzx:font,dzx:font-ttf", "Canaux : cinq canaux dzx:*")
  ok(await fails(() => h["dzx:font"]({}, { family: "../etc" }), /invalide/), "Canaux : nom de police invalide refusé")
  ok((await h["dzx:figma-token"]({}, {})).saved === false && (await h["dzx:figma-token"]({}, { token: "figd_essai" })).saved === true, "Canaux : jeton Figma enregistré")
  ok(!fs.readFileSync(path.join(tmp, "designplus/figma.json"), "utf8").includes("figd_essai"), "Canaux : jeton absent en clair du fichier")
  ok(await fails(() => h["dzx:figma-file"]({}, { url: "https://exemple.com/x" }), /invalide/) && await fails(() => h["dzx:figma-svg"]({}, { key: "abc", ids: [] }), /cadre/), "Canaux : adresses et cadres Figma contrôlés")
  ok((await h["dzx:figma-token"]({}, { token: "" })).saved === false, "Canaux : jeton retiré")
  try {
    const f = await h["dzx:font"]({}, { family: "Poppins" })
    ok(f.faces.length >= 2 && f.faces[0].data.length > 1000, `Canaux : police libre téléchargée (${f.faces.length} graisses)`)
  } catch (e) {
    console.log(`  externe : téléchargement de police impossible ici (${e.message})`)
  }
  try {
    const t = await h["dzx:font-ttf"]({}, { family: "Poppins", weight: 700 })
    const bytes = t && Buffer.from(t.data, "base64")
    const f = bytes && PV.makeFont("F9", "Poppins-700", new Uint8Array(bytes))
    ok(f && f.ttf.gid(0x41) > 0 && fs.existsSync(path.join(tmp, "designplus/fonts/poppins-700.ttf")), "Canaux : police TrueType téléchargée pour le PDF vectoriel, lisible et gardée sur le PC")
  } catch (e) {
    console.log(`  externe : téléchargement TrueType impossible ici (${e.message})`)
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}
await channels()

// ---------- PDF vectoriel ----------
{
  const inflate = async (u) => new Uint8Array(zlib.inflateSync(u))
  const deflate = async (u) => new Uint8Array(zlib.deflateSync(u))
  const woff = new Uint8Array(fs.readFileSync(path.join(ROOT, "nexora/app/renderer/fonts/3d/inter-latin-800-normal.woff")))
  const ttf = await PV.woffToSfnt(woff, inflate)
  const font = PV.makeFont("F1", "Inter-800", ttf)
  ok(font && font.ttf.unitsPerEm === 2048 && font.ttf.gid(0x41) > 0 && font.ttf.gid(0xe9) > 0 && font.ttf.gid(0x2212) > 0, "PDF vectoriel : police WOFF livrée convertie et lue (A, é, signe moins)")
  ok(PV.parseTtf(new Uint8Array(20)) === null && PV.glyphs(font, [..."日"]) === null, "PDF vectoriel : fichier invalide refusé, caractère absent signalé (rendu en image)")
  const text = "Nouvelle collection été −20 %"
  const chars = [...text]; const g = PV.glyphs(font, chars)
  let x = 0; const lefts = chars.map((c, i) => { const l = x; x += font.ttf.advance(g[i]) * 40 / 2048; return l })
  const run = PV.textRun(font, chars, g, lefts, 40)
  const content = `q 0.39 0.33 0.96 rg ${PV.rectPath(20, 20, 200, 80, 12)}f /G1 gs 1 0.8 0 rg ${PV.ellipsePath(300, 60, 40, 40)}f Q\nBT /F1 40 Tf 0 0 0 rg 1 0 0 1 20 200 Tm ${run} ET\n${PV.cropMarks(595, 842, 28, 8)}`
  const pdf = await PV.buildVectorPdf([{ W: 595, H: 842, trim: [28, 28, 567, 814], bleed: [20, 20, 575, 822], content, gs: [{ key: "G1", ca: 0.5 }] }], [font], { deflate, title: "Essai (NEXORA)" })
  const txt = Buffer.from(pdf).toString("latin1")
  ok(/\/FontFile2 \d+ 0 R/.test(txt) && /\/CIDFontType2/.test(txt) && /\/ToUnicode \d+ 0 R/.test(txt) && /\/TrimBox \[28 28 567 814\]/.test(txt) && /\/ca 0.5/.test(txt), "PDF vectoriel : police intégrée, table Unicode, format fini et transparence")
  ok(PV.pathOps([["M", 0, 0], ["Q", 5, 5, 10, 0], ["Z"]]) !== null && PV.pathOps([["A", 1, 1, 0, 0, 0, 2, 2]]) === null, "PDF vectoriel : tracés convertis, commande inconnue rendue en image")
  const tmp = path.join((await import("node:os")).tmpdir(), `nx-vec-${process.pid}.pdf`)
  fs.writeFileSync(tmp, pdf)
  const r = spawnSync("pdftotext", [tmp, "-"], { encoding: "utf8" })
  if (r.error) console.log("  externe : pdftotext absent, extraction du texte non vérifiée")
  else ok(r.status === 0 && r.stdout.includes(text), "PDF vectoriel : texte sélectionnable, extrait tel quel (accents et signe moins)", r.stdout)
  fs.rmSync(tmp, { force: true })
}

// ---------- Responsive ----------
{
  const F = { w: 1440, h: 900 }; const T = { w: 390, h: 844 }
  ok(guessCons({ left: 0, top: 0, width: 1440, height: 80 }, 1440, 900).h === "stretch" && guessCons({ left: 1200, top: 20, width: 200, height: 40 }, 1440, 900).h === "right" && guessCons({ left: 620, top: 420, width: 200, height: 60 }, 1440, 900).v === "center", "Responsive : contraintes devinées (bandeau étiré, bouton à droite, bloc centré)")
  const b = { left: 1200, top: 20, width: 200, height: 40 }
  const r1 = constrain(b, { h: "right", v: "top" }, F, T)
  ok(r1.left === 150 && r1.width === 200, "Responsive : ancré à droite, marge droite gardée", r1)
  const r2 = constrain({ left: 40, top: 0, width: 1360, height: 80 }, { h: "stretch", v: "top" }, F, T)
  ok(r2.left === 40 && r2.width === 310, "Responsive : étiré, marges gardées", r2)
  const r3 = constrain({ left: 100, top: 300, width: 300, height: 120 }, { h: "left", v: "scale" }, F, T, { fixedH: true })
  ok(r3.height === 120 && Math.abs(r3.top - 300 * 844 / 900) < 1e-9, "Responsive : texte en proportionnel, hauteur gardée", r3)
  const big = { left: 80, top: 200, width: 900, height: 300 }
  const f1 = fitInside(constrain(big, { h: "left", v: "top" }, F, T), big, F, T)
  const f2 = fitInside(constrain(big, { h: "left", v: "top" }, F, T), big, F, T, { text: true })
  ok(f1.left >= 0 && f1.left + f1.width <= 390 && Math.abs(f1.height / f1.width - 300 / 900) < 1e-9 && f2.height === 300 && f2.left + f2.width <= 390, "Responsive : élément trop large ramené dans la page (proportions gardées ; texte élargi seulement)", [f1, f2])
  const deco = { left: 1100, top: -200, width: 600, height: 600 }
  ok(guessCons(deco, 1440, 900).h === "scale" && fitInside(constrain(deco, { h: "right", v: "top" }, F, T), deco, F, T).width === 600, "Responsive : décor qui déborde de la page suivi en proportion, jamais ramené dans la page")
  const sh = pushDown([{ before: { left: 0, top: 0, width: 300, height: 100 }, after: { left: 0, top: 0, width: 300, height: 260 }, grow: 160 }, { before: { left: 0, top: 120, width: 300, height: 50 }, after: { left: 0, top: 120, width: 300, height: 50 }, grow: 0 }, { before: { left: 0, top: 120, width: 100, height: 50 }, after: { left: 320, top: 120, width: 60, height: 50 }, grow: 0 }])
  ok(sh[0] === 0 && sh[1] === 160 && sh[2] === 0, "Responsive : un texte plus haut repousse ce qui est dessous, pas ce qui est à côté", sh)
}

// ---------- Migration ----------
async function migration() {
  const dir = process.env.PGLITE_DIR || "/tmp/pgtest"
  let PGlite
  try { ({ PGlite } = await import(pathToFileURL(createRequire(path.join(dir, "package.json")).resolve("@electric-sql/pglite")).href)) } catch { console.log(`PGlite introuvable dans ${dir} : partie sautée.`); return }
  const db = new PGlite()
  const q = async (t, p) => (await db.query(t, p)).rows
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users (id uuid primary key, email text);
    create table public.notifications (id uuid primary key default gen_random_uuid(), user_id uuid, kind text, title text, body text, link text, read_at timestamptz, created_at timestamptz default now());
    create table public.app_config (key text primary key, value jsonb);
    insert into public.app_config values ('email_alerts', '{"enabled": true}');
    create table public.profiles (id uuid primary key, full_name text);
    create table public.test_mails (to_addr text, subject text, body text, kicker text);
    create function public.nx_brevo_send(p_to text, p_to_name text, p_subject text, p_text text, p_kicker text default 'Supervision') returns void language sql as $$ insert into public.test_mails values (p_to, p_subject, p_text, p_kicker) $$;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('test.uid', true), '')::uuid $$;
    grant usage on schema auth, public to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
    create table public.organizations (id uuid primary key);
    create table public.organization_members (org_id uuid, user_id uuid, role text default 'member');
    grant select on public.organization_members to authenticated;
    insert into auth.users values ('00000000-0000-0000-0000-00000000000a'), ('00000000-0000-0000-0000-00000000000b'), ('00000000-0000-0000-0000-00000000000c');
    insert into public.organizations values ('10000000-0000-0000-0000-000000000001'), ('10000000-0000-0000-0000-000000000002');
    insert into public.organization_members values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner'), ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'owner'), ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'viewer');`)
  await db.exec("update auth.users set email = 'a@exemple.test' where id = '00000000-0000-0000-0000-00000000000a'; insert into public.profiles values ('00000000-0000-0000-0000-00000000000a', 'Kofi');")
  const MIG = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261106000003_nex_design.sql"), "utf8")
  const MIG4 = fs.readFileSync(path.join(ROOT, "supabase/migrations/20261106000004_nex_design_notifications.sql"), "utf8")
  await db.exec(MIG); await db.exec(MIG4)
  await db.exec(MIG); await db.exec(MIG4)
  ok(true, "Migration : 20261106000003 et 20261106000004 rejouées deux fois sans erreur")
  const as = async (uid, fn) => { await db.exec(`set role authenticated; select set_config('test.uid', '${uid}', false);`); try { return await fn() } finally { await db.exec("reset role;") } }
  const A = "00000000-0000-0000-0000-00000000000a"; const B = "00000000-0000-0000-0000-00000000000b"; const ORG = "10000000-0000-0000-0000-000000000001"
  const pages = JSON.stringify([{ name: "Accueil", w: 100, h: 100, img: "data:image/jpeg;base64,AA" }, { name: "Contact", w: 100, h: 100, img: "data:image/jpeg;base64,BB" }])
  const [link] = await as(A, () => q("insert into public.design_review_links (org_id, doc_local_id, name, pages, created_by) values ($1, 'doc1', 'Boutique', $2, $3) returning token", [ORG, pages, A]))
  ok(link && link.token.length === 32, "Liens : un membre crée un lien (jeton de 32 caractères)")
  let denied = false
  try { await as(B, () => q("insert into public.design_review_links (org_id, doc_local_id, name) values ($1, 'x', 'x')", [ORG])) } catch { denied = true }
  ok(denied, "Liens : création refusée hors de l’espace")
  ok((await as(B, () => q("select * from public.design_review_links"))).length === 0, "Liens : invisibles hors de l’espace")
  const V = "00000000-0000-0000-0000-00000000000c"
  let viewerDenied = false
  try { await as(V, () => q("insert into public.design_review_links (org_id, doc_local_id, name) values ($1, 'x', 'x')", [ORG])) } catch { viewerDenied = true }
  ok(viewerDenied && (await as(V, () => q("select * from public.design_review_links"))).length === 1, "Liens : un lecteur de l’espace les voit sans pouvoir en créer")
  await db.exec("set role anon;")
  const got = (await q("select public.nx_review_get($1) as r", [link.token]))[0].r
  ok(got && got.name === "Boutique" && got.pages.length === 2 && got.reviews.length === 0, "Revue : lien lu sans compte", got)
  const after = (await q("select public.nx_review_post($1, 'Awa', 'changes', 'Le titre est trop petit', 9, 0.5, 2) as r", [link.token]))[0].r
  ok(after.length === 1 && after[0].page === 1 && after[0].x === 0.5 && after[0].y === null && after[0].decision === "changes", "Revue : avis sans compte, page et position bornées", after)
  let bad = false
  try { await q("select public.nx_review_post($1, '  ', 'approve', '', 0)", [link.token]) } catch { bad = true }
  ok(bad, "Revue : nom obligatoire")
  let direct = false
  try { await q("insert into public.design_reviews (token, author) values ($1, 'x')", [link.token]) } catch { direct = true }
  ok(direct, "Revue : écriture directe dans la table refusée")
  await db.exec("reset role;")
  ok((await as(A, () => q("select author from public.design_reviews"))).length === 1 && (await as(B, () => q("select author from public.design_reviews"))).length === 0, "Avis : lus par l’espace seulement")
  // NEXORA #054 : notifications et e-mails des avis.
  const n1 = await q("select user_id, kind, title, body, link from public.notifications")
  const m1 = await q("select * from public.test_mails")
  ok(n1.length === 1 && n1[0].user_id === A && n1[0].kind === "design_review" && n1[0].title === "Awa demande des changements sur « Boutique »" && n1[0].body.includes("page 2") && n1[0].link === "design:doc1", "Notifications : avis reçu par la personne qui a créé le lien", n1)
  ok(m1.length === 1 && m1[0].to_addr === "a@exemple.test" && m1[0].kicker === "NEX-DESIGN" && m1[0].subject.includes("changements"), "Notifications : décision envoyée par e-mail", m1)
  await db.exec("set role anon;")
  await q("select public.nx_review_post($1, 'Awa', 'approve', 'Parfait', 0)", [link.token])
  await q("select public.nx_review_post($1, 'Awa', 'comment', 'Et le logo ?', 0, 0.2, 0.3)", [link.token])
  await db.exec("reset role;")
  const n2 = await q("select title from public.notifications order by created_at")
  ok(n2.length === 3 && n2.some((x) => x.title === "Awa a approuvé « Boutique »") && n2.some((x) => x.title.startsWith("Nouveau commentaire de Awa")), "Notifications : chaque avis notifié (approbation, commentaire)", n2)
  ok((await q("select * from public.test_mails")).length === 1, "Notifications : pas plus d’un e-mail par lien en 15 minutes, aucun pour un simple commentaire")
  await db.exec("update public.app_config set value = '{\"enabled\": false}' where key = 'email_alerts'")
  await db.exec("update public.design_reviews set created_at = now() - interval '1 hour'")
  await db.exec("set role anon;"); await q("select public.nx_review_post($1, 'Awa', 'approve', '', 0)", [link.token]); await db.exec("reset role;")
  ok((await q("select * from public.test_mails")).length === 1 && (await q("select * from public.notifications")).length === 4, "Notifications : alertes e-mail coupées, notification dans NEXORA seulement")
  let fnHidden = false
  try { await db.exec("set role anon;"); await q("select public.nx_review_notify()") } catch { fnHidden = true } finally { await db.exec("reset role;") }
  ok(fnHidden, "Notifications : fonction du déclencheur non appelable directement")
  await as(A, () => q("update public.design_review_links set active = false where token = $1", [link.token]))
  await db.exec("set role anon;")
  ok((await q("select public.nx_review_get($1) as r", [link.token]))[0].r === null, "Revue : lien fermé illisible")
  await db.exec("reset role;")
  await as(A, () => q("insert into public.design_libraries (org_id, kind, name, data, updated_by) values ($1, 'variables', 'Marque', '{\"list\":[]}', $2)", [ORG, A]))
  await as(A, () => q("insert into public.design_libraries (org_id, kind, name, data, updated_by) values ($1, 'variables', 'Marque', '{\"list\":[1]}', $2) on conflict (org_id, kind, name) do update set data = excluded.data", [ORG, A]))
  const libs = await as(A, () => q("select data from public.design_libraries"))
  ok(libs.length === 1 && libs[0].data.list.length === 1, "Bibliothèques : publication puis mise à jour")
  ok((await as(B, () => q("select * from public.design_libraries"))).length === 0, "Bibliothèques : invisibles hors de l’espace")
}
await migration()
console.log(`\n${count} vérifications, ${fails ? `${fails} échec(s)` : "aucun échec"}.`)
process.exit(fails ? 1 : 0)
