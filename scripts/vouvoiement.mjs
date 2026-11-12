// NEXORA #115 : passage du tutoiement au vouvoiement dans tous les textes destinés aux utilisateurs (règle R8).
//
// Seuls les textes sont touchés : chaînes et gabarits JavaScript/TypeScript (y compris le code minifié de
// renderer/dist, analysé par TypeScript), textes JSX, textes et attributs visibles du HTML, chaînes Go, Java et SQL.
// Le code autour n'est jamais réécrit, et l'échappement d'origine est gardé (\xE9 et \u2019 dans le code minifié,
// caractères accentués ailleurs).
//
// Règles : « tu » sujet et son verbe (tu peux → vous pouvez, as-tu → avez-vous), « te », « t’ », « toi »,
// possessifs (ton, ta, tes → votre, vos), impératifs en tête de phrase ou enchaînés (Connecte ta clé et choisis
// l’IA → Connectez votre clé et choisissez l’IA), impératifs pronominaux (connecte-toi → connectez-vous).
// Les conjugaisons viennent du Lefff (paquet npm french-verbs-lefff 3.4.0, licence Apache-2.0), téléchargé une
// fois dans ~/.cache/nexora-vouvoiement et contrôlé par son empreinte SHA-256.
//
// Usage : node scripts/vouvoiement.mjs [--ecrire] [--rapport fichier.json] [--restes] [chemins…]
//   sans --ecrire : essai, affiche le nombre de changements par fichier (rien n'est écrit)
//   --rapport     : écrit chaque changement (fichier, avant, après) dans un fichier JSON, pour relecture
//   --restes      : liste les marques du tutoiement encore présentes après conversion (à relire à la main)
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import crypto from "node:crypto"
import { execFileSync } from "node:child_process"
import { fileURLToPath } from "node:url"
import ts from "typescript"

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const LEFFF = {
  url: "https://registry.npmjs.org/french-verbs-lefff/-/french-verbs-lefff-3.4.0.tgz",
  sha256: "c19cbeedcb60456bbbae2a061acd20fadfb3a20265f103296b02da5f7ef9219a",
}
const CACHE = path.join(os.homedir(), ".cache", "nexora-vouvoiement")

// Fichiers traités par défaut (textes vus par les utilisateurs). Bibliothèques tierces écartées.
export const DEFAULT_TARGETS = [
  "nexora/app/renderer/dist",
  "nexora/app/renderer/nx",
  "nexora/app/renderer/index.html",
  "nexora/app/renderer/supervision",
  "nexora/app/renderer/audit.js",
  "nexora/app/src",
  "nexora/app/main.js",
  "nexora/app/webview-preload.js",
  "nexora/app/android/templates",
  "nexora/app/android/shell",
  "nexora/app/desktop/template",
  "preview/bridge.js",
  "site/src",
  "site/index.html",
  "admin/src",
  "referral/src",
  "web",
  "worker",
  "launcher",
]
const SKIP_FILE =
  /(^|\/)(typescript|babel|estree|postcss|yaml|html|markdown|standalone|graphql|glimmer|angular|acorn|meriyah|flow|encoder)-[A-Z0-9]{8}\.js$|\.min\.js$|(^|\/)(vendor|node_modules|fonts|devices|walls|libs)\/|_test\.go$|(^|\/)LICEN[CS]E/
const EXT = /\.(m?js|ts|tsx|html|go|java)$/

// ---------------------------------------------------------------- conjugaisons
function loadLefff() {
  const file = path.join(CACHE, "conjugations-3.4.0.json")
  if (!fs.existsSync(file)) {
    fs.mkdirSync(CACHE, { recursive: true })
    const tgz = path.join(CACHE, "french-verbs-lefff-3.4.0.tgz")
    execFileSync("curl", ["-sSfL", "-o", tgz, LEFFF.url])
    const sum = crypto.createHash("sha256").update(fs.readFileSync(tgz)).digest("hex")
    if (sum !== LEFFF.sha256) throw new Error(`Empreinte inattendue pour french-verbs-lefff : ${sum}`)
    const out = path.join(CACHE, "x")
    fs.mkdirSync(out, { recursive: true })
    execFileSync("tar", ["xzf", tgz, "-C", out])
    fs.copyFileSync(path.join(out, "package", "dist", "conjugations.json"), file)
  }
  return JSON.parse(fs.readFileSync(file, "utf8"))
}

// Verbes fréquents d'abord : en cas de forme commune à deux verbes, la leur l'emporte.
const FIRST = ["être", "avoir", "aller", "faire", "pouvoir", "vouloir", "devoir", "savoir", "voir", "venir", "prendre", "mettre", "dire", "recevoir", "suivre", "vivre", "lire", "écrire", "choisir", "finir", "ouvrir", "obtenir", "tenir", "connaître", "croire", "falloir", "valoir", "partir", "sortir", "servir", "sentir", "perdre", "rendre", "attendre", "répondre", "entendre", "gérer", "régler", "préférer", "répéter", "compléter"]

function buildMaps() {
  const d = loadLefff()
  const imp = new Map() // impératif 2e pers. sing. → plur.
  const fin = new Map() // formes conjuguées 2e pers. sing. → plur.
  const verbs = [...FIRST.filter((v) => d[v]), ...Object.keys(d).filter((v) => !FIRST.includes(v))]
  const put = (m, a, b) => { if (a && b && a !== "NA" && b !== "NA" && !m.has(a)) m.set(a, b) }
  for (const v of verbs) {
    const c = d[v]
    // -ayer : deux orthographes (essaie / essaye) ; le Lefff ne donne que la seconde.
    const alt = (s) => (/ayer$/.test(v) && s ? s.replace(/aye(s|ras|rais)?$/, (x, e) => `aie${e || ""}`) : null)
    if (c.Y) { put(imp, c.Y[1], c.Y[4]); put(imp, alt(c.Y[1]), c.Y[4]) }
    for (const t of ["P", "F", "I", "C", "S", "J"]) {
      if (!c[t]) continue
      put(fin, c[t][1], c[t][4])
      put(fin, alt(c[t][1]), c[t][4])
    }
  }
  imp.set("vas", "allez") // vas-y
  return { imp, fin }
}

// ---------------------------------------------------------------- moteur sur un texte
const L = "A-Za-zÀ-ÖØ-öø-ÿŒœ"
// Mots qui sont aussi des noms ou des adjectifs : impératif seulement devant un complément (ni « de », ni seul).
const AMBIG = new Set("visite parcours arrondis raccourcis vernis presse branche limite retouche force fixe présente archive monte compose lisse charge cours sens bois vis fonds réserve suis sors pars sers sois tiens viens lis copie sauvegarde analyse recherche note garde montre place marque ferme capture partage contrôle demande règle touche active vide liste complète continue entre commande change pose filtre classe coupe colle compte joue lit livre forme signe trace cache masque affiche relance recharge double aide échange coche tape cible bascule écoute mesure mise exclus inclus suis vis fuis sers pars sors offre guide centre cadre groupe programme règle modèle couleur".split(" "))
const OBJ = new Set("le la les l un une ton ta tes ce cet cette ces ici tout toute tous toutes chaque plusieurs puis maintenant y moi lui leur nous mon ma mes son sa ses simplement bien toujours votre vos quelques ton".split(" "))
const NOT_AFTER_AMBIG = new Set(["de", "du", "des", "d", "à", "au", "aux", "en", "et", "ou", "par", "pour", "avec", "sans", "sur", "dans", "est", "sont", "a", "ont", "terminée", "terminé", "réussie", "réussi", "en", "impossible", "indisponible", "prête", "prêt", "active", "activé", "activée", "créée", "créé", "enregistrée", "enregistré", "copiée", "copié", "envoyée", "envoyé"])
// Impératifs en -e (verbes du premier groupe) : seulement ces verbes, employés dans l'interface. Les autres formes
// en -e du Lefff sont presque toujours des noms (« Code », « Image », « Page », « Taille », « Titre »…).
const IMP_E = new Set("accepte accède achète active actualise adapte affiche affine ajoute ajuste aligne allonge allège améliore analyse anime annule appelle applique apporte approuve appuie archive arrête aspire assemble attribue augmente authentifie automatise autorise avance baisse bloque branche capture change charge cherche chiffre choisisse cite classe clique coche colle collecte combine commence commente communique compare compile complète compose compresse configure confirme connecte conserve consulte contacte continue contrôle copie corrige coupe creuse crée dessine devine dispose distribue donne double-clique duplique débloque déchiffre décide déclare déclenche décoche décompresse déconnecte découpe découvre décris dédouble défile dégroupe démarre déplace déplie déploie dépose désactive désinstalle désélectionne désépingle détaille déverrouille efface emballe embarque empêche enchaîne enlève enregistre enroule entoure envoie essaie essaye examine explique explore exporte expose exécute fais ferme filme filtre fixe force fusionne gagne garde glisse groupe gère génère héberge hésite identifie ignore imagine importe impose imprime incline indique inspecte installe insère intercepte intègre inverse invite joue justifie laisse lance libère lie limite lisse masque migre modifie monte montre navigue nomme note notifie observe optimise organise oublie ouvre paie parle partage passe patiente paye pense personnalise pivote place planifie pointe pose presse priorise profite programme projette prolonge propose protège prouve précise prépare présente publie quitte ramène range rappelle rattache recadre recapture recharge recherche recommande recommence reconnecte reconstitue recopie recrute recrée recule redimensionne redirige redémarre reformule refuse regarde regroupe rejoue relance relie relève rembourse remplace renomme renouvelle renseigne renvoie replie republie respecte restaure retire retouche retourne retrouve rouvre règle réanalyse récupère rédige réessaie réessaye réinitialise réinstalle répare répète réserve résilie résume réutilise révoque révèle sauvegarde scanne signale signe simule soulève suggère superpose supervise supprime surveille survole synchronise sécurise sélectionne sépare tape termine teste touche tourne traite transforme transfère travaille trie trouve télécharge utilise valide vide visite vérifie zoome éclaire économise écoute épingle étire évalue évite".split(" "))
// Code (JavaScript injecté dans les pages, CSS, requêtes) : jamais touché.
const CODE = /=>|\{"\w+":|\bimport\s+[a-z][\w.]*[.*;]|\bfun\s+\w+\(|@Composable|\bstruct\s+\w+|\bvar\s+body|\b(?:const|let|var|function|return|typeof|new)\s|document\.|window\.|\.querySelector|JSON\.|console\.|\)\s*\{|\}\s*\)|;\s*\}|^\s*[.#]?[\w-]+\s*\{|\bSELECT\s|\bINSERT\s|\bUPDATE\s.+\bSET\b/
// Mots isolés convertis (étapes du site : « Conçois », « Teste »…) ; les autres mots seuls sont des libellés,
// des noms ou des valeurs techniques (en-tête HTTP « Range », préréglages « Glisse », « Tourne »…).
const SINGLE_OK = new Set("réessaie réessaye patiente recommence conçois teste sécurise publie distribue".split(" "))
// Verbes convertis seulement au milieu d'une suite d'impératifs (« Conçois, code, teste »).
const CHAIN_OK = new Map([["code", "codez"]])
// Descriptions à la 3e personne (préréglages, options) : jamais converties.
const SKIP_TEXT = /^Mode diagnostic : affiche|^Sécurité : analyse un site|démarre agrandie|^Redirige vers|^Glisse (depuis|de gauche)|^Recule pour révéler|^Monte en regardant|^Charge la page dans un navigateur caché|et relève : erreurs/
// Débuts de phrase après lesquels une virgule peut être suivie d'un impératif (« Pour publier, ouvre… »).
const INTRO = /^(chez|bonjour|salut|merci|bravo|attention|astuce|conseil|important|info|ok|oui|non|voilà|terminé|c’est fait|pour|si|sinon|ensuite|puis|une fois|avant|après|dans|depuis|en cas|au besoin|ici|là|plus tard|au choix|dès|quand|lorsque|tant que|enfin|d['’]abord|ou|et|pour cela|sur|avec|sans|à|au|en|pas|aucun|aucune|rien|besoin|déjà|bienvenue|parfait|c['’]est|oups|presque)\b/i
const CLITIC = new Set(["ne", "n", "me", "m", "te", "t", "se", "s", "le", "la", "les", "l", "lui", "leur", "en", "y", "nous", "vous"])
const LINK = new Set(["et", "puis", "ou", "sinon", "ensuite", "alors"])
// Une subordonnée ou un autre sujet interrompt l'enchaînement d'impératifs (« Décoche si ton serveur vérifie puis confirme »).
const BREAK = new Set(["si", "que", "qu", "qui", "quand", "lorsque", "dont", "où", "car", "parce", "il", "elle", "ils", "elles", "on", "cela", "ça", "ceci", "celui", "celle"])
const NOUN_TON_BEFORE = new Set("un le du au ce même second premier bon mauvais quel chaque deux trois autre leur son mon".split(" "))
const SECOND = /(?<![A-Za-zÀ-ÿ'’-])(?:tu|te|toi|ton|ta|tes|t['’])(?![A-Za-zÀ-ÿ])/i
const FRENCHY = /(?<![A-Za-zÀ-ÿ])(le|la|les|des|du|de|un|une|et|est|pour|avec|dans|sur|pas|ne|à|au|aux|en|ton|ta|tes|tu|te|toi|ce|cette|qui|que|ou|puis|ici|votre|vos|si|il|elle|encore|plus|aussi|maintenant|alors|bien|très|tout|tous|rien|jamais|sans|par|mon|ma|mes|nous|vos|leur|sous|vers|chez)(?![A-Za-zÀ-ÿ])|[éèêàùçâîôûœ’]/i
const SENT_END = /[.!?…]\s+$|[:;«(\[•·\n\u0002\u2014\u2013]\s*$/
// Fin d'un texte : la ponctuation finale suffit.
const TEXT_END = /[.!?…:;«(\[•·\n\u0002\u2014\u2013]\s*$/
const keepCase = (src, dst) => {
  if (src.length > 1 && src === src.toUpperCase() && src !== src.toLowerCase()) return dst.toUpperCase()
  if (src[0] !== src[0].toLowerCase()) return dst[0].toUpperCase() + dst.slice(1)
  return dst
}

export function makeEngine() {
  const { imp, fin } = buildMaps()
  const missed = new Map()
  const trace = process.env.VOUV_TRACE ? [] : null
  // strict : impératifs en -e limités à IMP_E (sauf devant un pronom lié ou après « ne », où le verbe est sûr).
  const impOf = (w, strict = true) => {
    const low = w.toLowerCase()
    const x = imp.get(low)
    if (!x) return null
    if (strict && !/s$/.test(low) && !["va", "vas", "aie", "sache", "veuille", "sois"].includes(low) && !IMP_E.has(low)) {
      missed.set(low, (missed.get(low) || 0) + 1)
      return null
    }
    return keepCase(w, x)
  }
  const finOf = (w) => { const x = fin.get(w.toLowerCase()); return x ? keepCase(w, x) : null }

  /** Convertit un texte décodé. state = { start, chain } relie les morceaux d'un même gabarit. */
  function convert(text, state = { start: true, chain: false }) {
    const st0 = state.start
    if (CODE.test(text) || SKIP_TEXT.test(text.trim())) { state.start = false; return text }
    if (!text || !/[A-Za-zÀ-ÿ]/.test(text)) { state.start = (st0 && !/\S/.test(text || "")) || TEXT_END.test(text || ""); return text }
    const toks = []
    const re = new RegExp(`([${L}]+(?:-[${L}]+)*)(['’])?`, "g")
    let last = 0
    let m
    while ((m = re.exec(text))) {
      if (m.index > last) toks.push({ sep: true, s: text.slice(last, m.index) })
      toks.push({ w: m[1], apos: m[2] || "", o: m.index, len: m[0].length })
      last = re.lastIndex
    }
    if (last < text.length) toks.push({ sep: true, s: text.slice(last) })
    const idx = toks.map((t, i) => (t.sep ? -1 : i)).filter((i) => i >= 0)
    const single = idx.length === 1
    const hasSecond = SECOND.test(text)
    const french = FRENCHY.test(text) || hasSecond
    if (!french && !single) { state.start = TEXT_END.test(text); return text }
    const lw = (i) => (i >= 0 && !toks[i].sep ? toks[i].w.toLowerCase() : "")
    const nextW = (i) => { for (let j = i + 1; j < toks.length; j++) if (!toks[j].sep) return j; return -1 }
    const prevW = (i) => { for (let j = i - 1; j >= 0; j--) if (!toks[j].sep) return j; return -1 }
    const end = (i) => toks[i].o + toks[i].len
    const gap = (a, b) => text.slice(end(a), toks[b].o)
    const isStart = (i) => {
      const p = prevW(i)
      if (p < 0) {
        const before = text.slice(0, toks[i].o)
        return (state.start && !/[^\s\u0002«“"(\[•·—–\-]/.test(before)) || TEXT_END.test(before)
      }
      return SENT_END.test(gap(p, i))
    }
    let chain = state.chain
    let negOpen = false // « Ne modifie que… » : ce « que » n'ouvre pas de subordonnée
    let susp = false // enchaînement suspendu par une subordonnée (« Ferme NEXORA s’il est ouvert, puis relance »)
    let sStart = -1
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i]
      if (t.sep) continue
      const w = t.w
      const low = w.toLowerCase()
      const start = isStart(i)
      if (start) {
        sStart = i
        // « » et () ouvrent une citation : l'enchaînement de la phrase continue après.
        const p0 = prevW(i)
        if (p0 < 0 || /[.!?…:;\n]\s*$/.test(gap(p0, i))) { chain = false; susp = false }
      }
      if ((low === "que" || low === "qu") && negOpen) { negOpen = false; continue }
      if (BREAK.has(low) || (low === "s" && t.apos)) { if (chain) susp = true; chain = false; continue }
      let mm
      // Inversion : as-tu, veux-tu, construis-tu.
      if ((mm = /^(.+)-(tu)$/i.exec(w))) {
        const v = finOf(mm[1])
        if (v) { t.w = `${v}-${keepCase(mm[2], "vous")}`; continue }
      }
      // Impératif suivi d'un pronom : connecte-toi, lance-le, dis-moi, vas-y.
      if ((mm = /^(.+?)-(toi|moi|le|la|les|lui|leur|en|y|nous|vous)((?:-(?:toi|moi|le|la|les|lui|leur|en|y|nous|vous))*)$/i.exec(w))) {
        const base = impOf(mm[1], false)
        const pro = mm[2].toLowerCase()
        const strong = pro === "toi" || /-toi/i.test(mm[3])
        if (base && (strong || start || chain || hasSecond || pro === "moi" || pro === "y" || pro === "en")) {
          t.w = `${base}-${pro === "toi" ? keepCase(mm[2], "vous") : mm[2]}${mm[3].replace(/-toi/gi, "-vous")}`
          chain = true
          continue
        }
      }
      if (low === "toi-même") { t.w = keepCase(w, "vous-même"); continue }
      // « tu » sujet : tu (ne) (clitiques) verbe.
      if (low === "tu" && !t.apos) {
        t.w = keepCase(w, "vous")
        let j = nextW(i)
        while (j >= 0 && CLITIC.has(lw(j))) {
          if (lw(j) === "te") toks[j].w = keepCase(toks[j].w, "vous")
          else if (lw(j) === "t" && toks[j].apos) { toks[j].w = keepCase(toks[j].w, "vous"); toks[j].apos = " " }
          j = nextW(j)
        }
        if (j >= 0) { const v = finOf(toks[j].w); if (v) toks[j].w = v }
        continue
      }
      if (low === "t" && t.apos) {
        const n = nextW(i)
        if (n === i + 1) { t.w = keepCase(w, "vous"); t.apos = " " }
        continue
      }
      if ((low === "te" || low === "toi") && !t.apos) { t.w = keepCase(w, "vous"); continue }
      if (low === "tes" && !t.apos) { t.w = keepCase(w, "vos"); continue }
      if (low === "ta" && !t.apos && !single) { t.w = keepCase(w, "votre"); continue }
      if (low === "ton" && !t.apos && !single) {
        const p = prevW(i)
        const n = nextW(i)
        if ((p >= 0 && NOUN_TON_BEFORE.has(lw(p))) || lw(n) === "sur") continue
        t.w = keepCase(w, "votre")
        continue
      }
      if (/^tien(ne)?s?$/.test(low) && /^(le|la|les)$/.test(lw(prevW(i)))) { t.w = keepCase(w, /s$/.test(low) ? "vôtres" : "vôtre"); continue }
      // Impératifs.
      const p = prevW(i)
      const pl = lw(p)
      const afterNe = (pl === "ne" || (pl === "n" && toks[p].apos) || ((pl === "te" || (pl === "t" && toks[p].apos)) && ["ne", "n"].includes(lw(prevW(p)))))
      const neCap = afterNe && /^N/.test(toks[(pl === "te" || pl === "t") ? prevW(p) : p].w)
      let iv = afterNe ? impOf(w, !neCap) : impOf(w)
      if (!iv && chain && CHAIN_OK.has(low) && p >= 0 && /^,\s*$/.test(gap(p, i))) iv = keepCase(w, CHAIN_OK.get(low))
      if (!iv) continue
      const negStart = (pl === "ne" || (pl === "n" && toks[p].apos)) && isStart(p) && !/^(quel|quelle|quels|quelles|quoi|qui|où|comment|lequel|laquelle|lesquels|lesquelles)$/.test(lw(nextW(i)))
      const negTe = (pl === "te" || (pl === "t" && toks[p]?.apos)) && p > 0 && ["ne", "n"].includes(lw(prevW(p))) && isStart(prevW(p))
      const resumed = susp && p >= 0 && LINK.has(pl) && /^\s+$/.test(gap(p, i)) && prevW(p) >= 0 && /,\s*$/.test(gap(prevW(p), p))
      const linked = resumed || (chain && p >= 0 && (/^,\s*$/.test(gap(p, i)) || (LINK.has(pl) && /^\s+$/.test(gap(p, i)))))
      const nx = nextW(i)
      const strongNext = nx >= 0 && /^\s+$/.test(gap(i, nx)) && (["ton", "ta", "tes", "te", "toi"].includes(lw(nx)) || (lw(nx) === "t" && toks[nx].apos))
      const intro = p >= 0 && /,\s*$/.test(gap(p, i)) && ((sStart >= 0 && INTRO.test(text.slice(toks[sStart].o, toks[i].o))) || strongNext)
      if (!(start || negStart || negTe || linked || intro)) continue
      if (single && !(start && /^[A-ZÀ-Ý]/.test(w) && SINGLE_OK.has(low))) continue
      if (AMBIG.has(low) && !negStart && !negTe) {
        const n = nextW(i)
        const tight = n >= 0 && /^\s+$/.test(gap(i, n))
        const nl = lw(n)
        const dAbord = nl === "d" && lw(nextW(n)) === "abord"
        const endish = n < 0 || /[.;:!?)]/.test(gap(i, n))
        const commaLink = n >= 0 && /^,\s*$/.test(gap(i, n)) && LINK.has(nl)
        const relaxed = linked && n >= 0 && !NOT_AFTER_AMBIG.has(nl) && (!/^[A-ZÀ-Ý]/.test(toks[n].w) || /[(«]/.test(gap(i, n)))
        const ok = commaLink || relaxed || (tight && (OBJ.has(nl) || ["ton", "ta", "tes", "te", "t", "toi"].includes(nl) || dAbord || toks[n].w === "NEXORA" || (hasSecond && !NOT_AFTER_AMBIG.has(nl) && !/^[A-ZÀ-Ý]/.test(toks[n].w)))) || ((linked || negStart) && endish)
        if (!ok) continue
      }
      if (trace) trace.push([start ? "debut" : afterNe ? "ne" : linked ? "suite" : "intro", w, text.replace(/\s+/g, " ").slice(0, 220)])
      t.w = iv
      chain = true
      susp = false
      negOpen = afterNe
      if (negTe) { const q = toks[p]; q.w = keepCase(q.w, "vous"); if (q.apos) q.apos = " " }
    }
    state.chain = chain
    state.start = TEXT_END.test(text) || (st0 && !/\S/.test(text))
    let out = ""
    for (const t of toks) out += t.sep ? t.s : t.w + t.apos
    return out
  }
  return { convert, missed, trace }
}

// ---------------------------------------------------------------- lecture et réécriture des littéraux
// Décode les échappements de caractères (\xE9, \u2019, \u{…}) ; les autres (\n, \", \\…) deviennent des
// marqueurs non alphabétiques pour ne pas coller aux mots, puis sont rétablis tels quels.
const MARK = "\u0001"
const MARK_NL = "\u0002" // \n échappé : fin de ligne, donc début de phrase possible
function decode(raw) {
  const keep = []
  const s = raw.replace(/\\(x[0-9a-fA-F]{2}|u\{[0-9a-fA-F]+\}|u[0-9a-fA-F]{4}|[\s\S])/g, (all, e) => {
    if (e === "n") { keep.push(all); return MARK_NL }
    if (e[0] === "x" && e.length === 3) return String.fromCharCode(parseInt(e.slice(1), 16))
    if (e[0] === "u" && e[1] === "{") return String.fromCodePoint(parseInt(e.slice(2, -1), 16))
    if (e[0] === "u" && e.length === 5) return String.fromCharCode(parseInt(e.slice(1), 16))
    keep.push(all)
    return MARK
  })
  return { s, keep }
}
function encode(s, keep, escaped) {
  let k = 0
  let out = ""
  for (const ch of s) {
    if (ch === MARK || ch === MARK_NL) { out += keep[k++]; continue }
    const c = ch.codePointAt(0)
    if (escaped && c > 0x7e) out += c <= 0xff ? `\\x${c.toString(16).toUpperCase().padStart(2, "0")}` : c <= 0xffff ? `\\u${c.toString(16).toUpperCase().padStart(4, "0")}` : `\\u{${c.toString(16).toUpperCase()}}`
    else out += ch
  }
  return out
}

// Texte avec balises HTML : seuls les nœuds de texte et les attributs visibles sont convertis.
const VISIBLE_ATTR = /^(title|placeholder|aria-label|alt|data-tip|data-tooltip|data-label|data-hint|label|content)$/i
function convertMarkup(engine, s, state) {
  if (!/<[a-zA-Z/!]/.test(s)) return engine.convert(s, state)
  let out = ""
  let last = 0
  const tag = /<\/?[a-zA-Z][^<>]*>|<!--[\s\S]*?-->/g
  let m
  while ((m = tag.exec(s))) {
    out += engine.convert(s.slice(last, m.index), state)
    out += m[0].replace(/([\w:-]+)=("([^"]*)"|'([^']*)')/g, (all, name, q, a, b) => {
      if (!VISIBLE_ATTR.test(name)) return all
      const v = a ?? b
      const c = engine.convert(v, { start: true, chain: false })
      return `${name}=${q[0]}${c}${q[0]}`
    })
    state.start = true
    state.chain = false
    last = tag.lastIndex
  }
  out += engine.convert(s.slice(last), state)
  return out
}

function processJs(engine, file, src) {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : file.endsWith(".ts") ? ts.ScriptKind.TS : file.endsWith(".jsx") ? ts.ScriptKind.JSX : ts.ScriptKind.JS
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, false, kind)
  const edits = []
  const escaped = /renderer\/dist\//.test(file)
  const literal = (node, open, close, state) => {
    const startPos = node.getStart(sf) + open
    const endPos = node.end - close
    const raw = src.slice(startPos, endPos)
    const { s, keep } = decode(raw)
    const c = convertMarkup(engine, s, state)
    if (c !== s) edits.push([startPos, endPos, encode(c, keep, escaped && !/[^\x00-\x7e]/.test(raw))])
  }
  function tmpl(node, state) {
    literal(node.head, 1, 2, state)
    for (const span of node.templateSpans) {
      ts.forEachChild(span.expression, visit)
      const isTail = span.literal.kind === ts.SyntaxKind.TemplateTail
      // L'expression insérée n'est pas un début de phrase, sauf une icône en tête de libellé (ico('x', 14)).
      const ex = src.slice(span.expression.getStart(sf), span.expression.end)
      if (!/^[\w$.]+\(\s*["'][\w-]+["']\s*(,\s*\d+\s*)?\)$/.test(ex)) state.start = false
      literal(span.literal, 1, isTail ? 1 : 2, state)
    }
  }
  const isText = (n) => n && (n.kind === ts.SyntaxKind.StringLiteral || n.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral)
  const visit = (node) => {
    // Chaînes concaténées ('Ferme NEXORA, ' + 'puis relance.') : un seul texte, contexte partagé.
    if (node.kind === ts.SyntaxKind.BinaryExpression && node.operatorToken.kind === ts.SyntaxKind.PlusToken && !(node.parent && node.parent.kind === ts.SyntaxKind.BinaryExpression && node.parent.operatorToken.kind === ts.SyntaxKind.PlusToken)) {
      const parts = []
      const flat = (n) => { if (n.kind === ts.SyntaxKind.BinaryExpression && n.operatorToken.kind === ts.SyntaxKind.PlusToken) { flat(n.left); flat(n.right) } else parts.push(n) }
      flat(node)
      if (parts.length > 1 && parts.every((n) => isText(n) || n.kind === ts.SyntaxKind.TemplateExpression)) {
        const state = { start: true, chain: false }
        for (const n of parts) { if (isText(n)) literal(n, 1, 1, state); else tmpl(n, state) }
        return
      }
    }
    switch (node.kind) {
      case ts.SyntaxKind.StringLiteral: {
        // Clés d'objets, imports et comparaisons courtes : pas du texte d'interface.
        const p = node.parent
        if (p && (ts.isImportDeclaration(p) || ts.isExportDeclaration(p) || ts.isModuleDeclaration(p) || (ts.isPropertyAssignment(p) && p.name === node) || ts.isElementAccessExpression(p) || ts.isLiteralTypeNode(p))) break
        literal(node, 1, 1, { start: true, chain: false })
        break
      }
      case ts.SyntaxKind.NoSubstitutionTemplateLiteral:
        literal(node, 1, 1, { start: true, chain: false })
        break
      case ts.SyntaxKind.TemplateExpression:
        tmpl(node, { start: true, chain: false })
        return
      case ts.SyntaxKind.JsxText: {
        const raw = src.slice(node.pos, node.end)
        const c = engine.convert(raw, { start: true, chain: false })
        if (c !== raw) edits.push([node.pos, node.end, c])
        break
      }
      default:
    }
    ts.forEachChild(node, visit)
  }
  visit(sf)
  return applyEdits(src, edits)
}

function applyEdits(src, edits) {
  if (!edits.length) return { out: src, n: 0, changes: [] }
  edits.sort((a, b) => b[0] - a[0])
  let out = src
  const changes = []
  for (const [a, b, rep] of edits) {
    changes.push([src.slice(a, b), rep])
    out = out.slice(0, a) + rep + out.slice(b)
  }
  return { out, n: edits.length, changes: changes.reverse() }
}

// Go, Java, SQL : littéraux entre guillemets (et `…` pour Go, '…' pour SQL), commentaires écartés.
function processQuoted(engine, file, src) {
  const edits = []
  const go = file.endsWith(".go")
  const sql = file.endsWith(".sql")
  let i = 0
  while (i < src.length) {
    const c = src[i]
    if ((c === "/" && src[i + 1] === "/") || (sql && c === "-" && src[i + 1] === "-")) { i = src.indexOf("\n", i); if (i < 0) break; continue }
    if (c === "/" && src[i + 1] === "*") { i = src.indexOf("*/", i + 2); if (i < 0) break; i += 2; continue }
    const q = sql ? (c === "'" ? "'" : null) : c === '"' ? '"' : go && c === "`" ? "`" : (!go && c === "'") ? "'" : null
    if (!q) { i++; continue }
    let j = i + 1
    while (j < src.length) {
      if (!sql && q !== "`" && src[j] === "\\") { j += 2; continue }
      if (src[j] === q) { if (sql && src[j + 1] === "'") { j += 2; continue } break }
      if (q !== "`" && !sql && src[j] === "\n") break
      j++
    }
    const raw = src.slice(i + 1, j)
    if (q !== "'" || sql) {
      const { s, keep } = q === "`" || sql ? { s: raw, keep: [] } : decode(raw)
      const conv = convertMarkup(engine, s, { start: true, chain: false })
      if (conv !== s) edits.push([i + 1, j, q === "`" || sql ? conv : encode(conv, keep, false)])
    }
    i = j + 1
  }
  return applyEdits(src, edits)
}

function processHtml(engine, file, src) {
  // Scripts en ligne traités comme du JavaScript, styles ignorés, reste en balisage.
  const edits = []
  const block = /<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/gi
  let last = 0
  let m
  const parts = []
  while ((m = block.exec(src))) {
    parts.push([last, m.index, "html"])
    const inner = m.index + m[0].indexOf(">") + 1
    parts.push([inner, inner + m[2].length, m[1].toLowerCase()])
    last = block.lastIndex
  }
  parts.push([last, src.length, "html"])
  for (const [a, b, k] of parts) {
    const s = src.slice(a, b)
    if (k === "html") {
      const c = convertMarkup(engine, s, { start: true, chain: false })
      if (c !== s) edits.push([a, b, c])
    } else if (k === "script") {
      const r = processJs(engine, `${file}.js`, s)
      if (r.n) edits.push([a, b, r.out])
    }
  }
  return applyEdits(src, edits)
}

export function processFile(engine, file, src) {
  if (/\.(m?js|ts|tsx|jsx)$/.test(file)) return processJs(engine, file, src)
  if (/\.html?$/.test(file)) return processHtml(engine, file, src)
  if (/\.(go|java|sql)$/.test(file)) return processQuoted(engine, file, src)
  return { out: src, n: 0, changes: [] }
}

function* walk(p) {
  const full = path.resolve(ROOT, p)
  if (!fs.existsSync(full)) return
  const st = fs.statSync(full)
  if (st.isFile()) { yield full; return }
  for (const e of fs.readdirSync(full, { withFileTypes: true })) {
    const q = path.join(full, e.name)
    if (e.isDirectory()) { if (!SKIP_FILE.test(`${path.relative(ROOT, q)}/`)) yield* walk(q) }
    else yield q
  }
}

// Marques du tutoiement restantes dans un texte converti (pour relecture).
export function leftovers(text) {
  return [...text.matchAll(/(?<![A-Za-zÀ-ÿ'’\\-])(tu|te|toi|ton|ta|tes|t['’][a-zà-ÿ]+)(?![A-Za-zÀ-ÿ])/gi)].map((x) => x[0])
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2)
  const write = args.includes("--ecrire")
  const restes = args.includes("--restes")
  const ri = args.indexOf("--rapport")
  const report = ri >= 0 ? args[ri + 1] : null
  const targets = args.filter((a, k) => !a.startsWith("--") && args[k - 1] !== "--rapport")
  const engine = makeEngine()
  const all = []
  let total = 0
  let files = 0
  for (const t of targets.length ? targets : DEFAULT_TARGETS) {
    for (const f of walk(t)) {
      const rel = path.relative(ROOT, f)
      if (!EXT.test(rel) && !rel.endsWith(".sql")) continue
      if (SKIP_FILE.test(rel)) continue
      const src = fs.readFileSync(f, "utf8")
      const r = processFile(engine, rel, src)
      if (!r.n) continue
      files += 1
      total += r.n
      console.log(`${String(r.n).padStart(5)}  ${rel}`)
      for (const [a, b] of r.changes) all.push({ file: rel, avant: a, apres: b })
      if (write) fs.writeFileSync(f, r.out)
    }
  }
  if (report) fs.writeFileSync(report, JSON.stringify(all, null, 1))
  if (engine.trace) fs.writeFileSync(process.env.VOUV_TRACE, JSON.stringify(engine.trace, null, 0))
  if (args.includes("--manques")) console.log([...engine.missed].sort((a, b) => b[1] - a[1]).map(([w, n]) => `${w}:${n}`).join(" "))
  if (restes) {
    for (const c of all) {
      const l = leftovers(decode(c.apres).s)
      if (l.length) console.log(`RESTE ${c.file} : ${l.join(", ")} :: ${decode(c.apres).s.replace(/\s+/g, " ").slice(0, 200)}`)
    }
  }
  console.log(`${total} texte(s) modifié(s) dans ${files} fichier(s)${write ? "" : " (essai : rien n'est écrit)"}.`)
}
