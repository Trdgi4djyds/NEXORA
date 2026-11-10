// Facture PDF de NEXORA (#031), générée dans le navigateur avec pdf-lib : A4, logo, émetteur et client, lignes,
// totaux, modalités de paiement, pied de page légal. #104 : direction « Horizon » du site et des interfaces : bandeau
// noir (logo, repère « /facture », titre fin), carte des informations clés qui déborde du bandeau, repères « /émis par »
// et « /facturé à » en pilule à contour, en-tête du tableau gris, total dans un bloc noir, monochrome ; les couleurs
// d'état (payée, annulée) restent sur la pastille et le tampon. Police Urbanist (fichiers TrueType de `fonts/`, OFL,
// intégrés en sous-ensemble par @pdf-lib/fontkit) ; Helvetica si les fichiers ne se chargent pas.
import fontkit from "@pdf-lib/fontkit"
import { degrees, PDFDocument, rgb, setCharacterSpacing, StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB } from "pdf-lib"
import lightUrl from "./fonts/Urbanist-Light.ttf?url"
import regularUrl from "./fonts/Urbanist-Regular.ttf?url"
import semiUrl from "./fonts/Urbanist-SemiBold.ttf?url"
import { longDate, money, totals, type InvoiceDoc, type Party } from "./format"

// Caractères hors WinAnsi (police standard) : remplacés par un équivalent sûr.
const WIN_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"
function win(s: unknown) {
  const clean = String(s ?? "")
    .replace(/[\u202f\u2009\u2007]/g, "\u00a0")
    .replace(/\u2192/g, "->")
    .replace(/[\u2010\u2011]/g, "-")
    .replace(/\r/g, "")
  return Array.from(clean)
    .map((c) => {
      const n = c.codePointAt(0) || 0
      if ((n >= 32 && n <= 126) || (n >= 160 && n <= 255) || c === "\n" || WIN_EXTRA.includes(c)) return c
      // Emoji et pictogrammes : retirés ; autres écritures : « ? ».
      return n >= 0x2190 ? "" : "?"
    })
    .join("")
    .replace(/ {2,}/g, " ")
    .replace(/ +$/gm, "")
}

const hex = (h: string): RGB => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255)
const C = {
  ink: hex("#0a0a0a"),
  text: hex("#3d3d3d"),
  muted: hex("#6b6b6b"),
  faint: hex("#9a9a9a"),
  line: hex("#e6e6e6"),
  box: hex("#f4f4f4"),
  band: hex("#0a0a0a"),
  bandMuted: hex("#a3a3a3"),
  bandLine: hex("#3a3a3a"),
  ok: hex("#16884a"),
  okTint: hex("#e6f5ec"),
  bad: hex("#d92d20"),
  white: rgb(1, 1, 1),
}

/** Logo réduit à 192 px (PNG) pour un PDF léger. */
async function logoBytes(url: string) {
  const img = new Image()
  img.crossOrigin = "anonymous"
  img.src = url
  await img.decode()
  const c = document.createElement("canvas")
  c.width = c.height = 192
  c.getContext("2d")!.drawImage(img, 0, 0, 192, 192)
  const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, "image/png"))
  return new Uint8Array(await blob!.arrayBuffer())
}

/** Polices Urbanist (gardées après le premier chargement) ; null si un fichier manque. */
let fontFiles: Promise<ArrayBuffer[] | null> | null = null
function urbanist() {
  fontFiles ??= Promise.all([lightUrl, regularUrl, semiUrl].map((u) => fetch(u).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))))
    .catch(() => null)
  return fontFiles
}

export async function invoicePdf(d: InvoiceDoc, logoUrl: string): Promise<Uint8Array> {
  const pdf = await PDFDocument.create()
  const title = d.number ? `Facture ${d.number}` : "Facture (brouillon)"
  pdf.setTitle(title)
  pdf.setAuthor(d.issuer.name || "NEXORA")
  pdf.setSubject("Facture NEXORA")
  pdf.setCreator("NEXORA — back office")
  pdf.setProducer("NEXORA")
  pdf.setLanguage("fr-FR")
  let light: PDFFont, reg: PDFFont, bold: PDFFont
  const files = await urbanist()
  if (files) {
    pdf.registerFontkit(fontkit)
    ;[light, reg, bold] = await Promise.all(files.map((f) => pdf.embedFont(f, { subset: true })))
  } else {
    reg = await pdf.embedFont(StandardFonts.Helvetica)
    light = reg
    bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  }
  let logo: PDFImage | null = null
  try { logo = await pdf.embedPng(await logoBytes(logoUrl)) } catch { logo = null }

  const W = 595.28
  const H = 841.89
  const M = 44
  const t = totals(d.lines, d.taxRate)
  const cur = d.currency || "EUR"
  const paid = d.status === "payee"
  const cancelled = d.status === "annulee"
  const pages: PDFPage[] = []

  type TextOpts = { size?: number; font?: PDFFont; color?: RGB; align?: "left" | "right" | "center"; opacity?: number; spacing?: number }
  const width = (s: string, size: number, f: PDFFont, spacing = 0) => f.widthOfTextAtSize(win(s), size) + spacing * Math.max(0, win(s).length - 1)
  const text = (pg: PDFPage, s: string, x: number, y: number, o: TextOpts = {}) => {
    const f = o.font || reg
    const size = o.size || 10
    const str = win(s)
    const w = width(str, size, f, o.spacing)
    const dx = o.align === "right" ? -w : o.align === "center" ? -w / 2 : 0
    if (o.spacing) pg.pushOperators(setCharacterSpacing(o.spacing))
    pg.drawText(str, { x: x + dx, y, size, font: f, color: o.color || C.text, opacity: o.opacity ?? 1 })
    if (o.spacing) pg.pushOperators(setCharacterSpacing(0))
    return w
  }
  // Découpe un texte en lignes qui tiennent dans la largeur (retours à la ligne gardés).
  const wrap = (s: string, size: number, maxW: number, f: PDFFont = reg) => {
    const out: string[] = []
    for (const para of win(s).split("\n")) {
      let line = ""
      for (const word of para.split(/ +/)) {
        const next = line ? `${line} ${word}` : word
        if (f.widthOfTextAtSize(next, size) <= maxW || !line) line = next
        else { out.push(line); line = word }
      }
      out.push(line)
    }
    return out
  }
  // Rectangle arrondi (tracé SVG : origine en haut à gauche, axe vertical vers le bas), plein ou contour.
  const roundSvg = (w: number, h: number, r: number) => {
    const q = Math.min(r, w / 2, h / 2)
    return `M${q},0 H${w - q} A${q},${q} 0 0 1 ${w},${q} V${h - q} A${q},${q} 0 0 1 ${w - q},${h} H${q} A${q},${q} 0 0 1 0,${h - q} V${q} A${q},${q} 0 0 1 ${q},0 Z`
  }
  const fillRound = (pg: PDFPage, x: number, y: number, w: number, h: number, r: number, color: RGB, opacity = 1) =>
    pg.drawSvgPath(roundSvg(w, h, r), { x, y: y + h, color, opacity })
  const strokeRound = (pg: PDFPage, x: number, y: number, w: number, h: number, r: number, color: RGB, bw = 0.8) =>
    pg.drawSvgPath(roundSvg(w, h, r), { x, y: y + h, borderColor: color, borderWidth: bw })
  /** Repère « /tag » : pilule à contour, barre oblique grise devant (comme le site). */
  const tag = (pg: PDFPage, label: string, x: number, y: number, o: { color?: RGB; line?: RGB; slash?: RGB; align?: "left" | "right" } = {}) => {
    const size = 8
    const sw = width("/", size, reg)
    const lw = width(label, size, reg)
    const w = 10 + sw + 5 + lw + 10
    const x0 = o.align === "right" ? x - w : x
    strokeRound(pg, x0, y - 6, w, 19, 9.5, o.line || hex("#d4d4d4"), 0.7)
    text(pg, "/", x0 + 10, y, { size, color: o.slash || C.faint })
    text(pg, label, x0 + 10 + sw + 5, y, { size, color: o.color || C.ink })
    return w
  }
  /** Pastille d'état (pleine). */
  const pill = (pg: PDFPage, label: string, xRight: number, y: number, fg: RGB, bg: RGB, outline?: RGB) => {
    const w = width(label, 8.5, bold, 0.6) + 24
    if (outline) strokeRound(pg, xRight - w, y - 7, w, 21, 10.5, outline, 0.8)
    else fillRound(pg, xRight - w, y - 7, w, 21, 10.5, bg)
    text(pg, label, xRight - w / 2, y, { size: 8.5, font: bold, color: fg, align: "center", spacing: 0.6 })
  }

  // En-tête : grand bandeau noir (première page) ou filet noir et rappel du numéro (pages suivantes).
  const BAND = 196
  const newPage = (first: boolean) => {
    const pg = pdf.addPage([W, H])
    pages.push(pg)
    if (!first) {
      pg.drawRectangle({ x: 0, y: H - 6, width: W, height: 6, color: C.band })
      text(pg, `${d.number ? `Facture ${d.number}` : "Facture brouillon"} · suite`, M, H - 42, { size: 12, font: bold, color: C.ink })
      text(pg, d.issuer.name || "NEXORA", W - M, H - 42, { size: 9, color: C.muted, align: "right" })
      pg.drawLine({ start: { x: M, y: H - 56 }, end: { x: W - M, y: H - 56 }, thickness: 0.6, color: C.line })
      return { pg, y: H - 76 }
    }
    const top = H - BAND
    pg.drawRectangle({ x: 0, y: top, width: W, height: BAND, color: C.band })
    // Logo sur une tuile blanche, nom de NEXORA espacé.
    fillRound(pg, M, H - 78, 40, 40, 11, C.white)
    if (logo) pg.drawImage(logo, { x: M + 4, y: H - 74, width: 32, height: 32 })
    text(pg, "NEXORA", M + 52, H - 63, { size: 13, font: bold, color: C.white, spacing: 2.4 })
    // Émetteur sous le nom de NEXORA, seulement s'il est différent (NEXORA #038 : aucun nom de société par défaut).
    if (d.issuer.name && d.issuer.name.trim().toUpperCase() !== "NEXORA") text(pg, `par ${d.issuer.name}`, M + 52, H - 77, { size: 9, color: C.bandMuted })
    tag(pg, "facture", W - M, H - 62, { color: C.white, line: C.bandLine, slash: C.bandMuted, align: "right" })
    // Titre fin et numéro en second ton.
    text(pg, "Facture", M - 2, top + 72, { size: 48, font: light, color: C.white })
    text(pg, d.number ? `N° ${d.number}` : "Brouillon, non numérotée", M, top + 50, { size: 11, color: C.bandMuted })
    const st: [string, RGB, RGB, RGB?] = paid
      ? ["PAYÉE", C.white, C.ok]
      : cancelled
        ? ["ANNULÉE", C.white, C.bad]
        : !d.number
          ? ["BROUILLON", C.white, C.band, C.bandLine]
          : ["À RÉGLER", C.ink, C.white]
    pill(pg, st[0], W - M, top + 78, st[1], st[2], st[3])
    return { pg, y: top }
  }

  let { pg, y } = newPage(true)

  // Carte des informations clés, à cheval sur le bandeau.
  const cardH = 66
  const cardY = y - cardH / 2
  fillRound(pg, M, cardY, W - 2 * M, cardH, 16, C.white)
  strokeRound(pg, M, cardY, W - 2 * M, cardH, 16, C.line, 0.7)
  const meta: [string, string, boolean?][] = [
    ["Date d’émission", d.issuedAt ? longDate(d.issuedAt) : "À l’émission"],
    [paid ? "Payée le" : "Échéance", paid ? longDate(d.paidAt) : longDate(d.dueAt)],
    ["Client", d.customer.name || "—"],
    [paid ? "Montant réglé" : "Montant dû", money(t.total, cur), true],
  ]
  const colW = (W - 2 * M) / 4
  meta.forEach(([k, v, strong], i) => {
    const x = M + i * colW + 18
    if (i) pg.drawLine({ start: { x: M + i * colW, y: cardY + 15 }, end: { x: M + i * colW, y: cardY + cardH - 15 }, thickness: 0.6, color: C.line })
    text(pg, k.toUpperCase(), x, cardY + cardH - 25, { size: 7, font: bold, color: C.muted, spacing: 0.7 })
    const value = wrap(v, strong ? 15 : 11, colW - 30, strong ? bold : reg)[0]
    text(pg, value, x, cardY + 17, { size: strong ? 15 : 11, font: strong ? bold : reg, color: C.ink })
  })
  y = cardY - 34

  // Émetteur et client.
  const party = (label: string, p: Party, x: number, w: number) => {
    let yy = y
    tag(pg, label, x, yy)
    yy -= 26
    for (const l of wrap(p.name || "—", 13, w, bold)) { text(pg, l, x, yy, { size: 13, font: bold, color: C.ink }); yy -= 16 }
    yy -= 2
    const rest = [p.company && p.company !== p.name ? p.company : "", p.address || "", p.email || "", p.phone || "", p.website || "", p.tax_id ? `N° fiscal : ${p.tax_id}` : ""].filter(Boolean)
    for (const r of rest) for (const l of wrap(r, 9.5, w)) { text(pg, l, x, yy, { size: 9.5, color: C.text }); yy -= 12.5 }
    return yy
  }
  const half = (W - 2 * M - 40) / 2
  const yA = party("émis par", d.issuer, M, half)
  const yB = party("facturé à", d.customer, M + half + 40, half)
  y = Math.min(yA, yB) - 18

  // Lignes, numérotées.
  const cols = { num: M + 16, desc: M + 44, qty: W - M - 200, unit: W - M - 98, total: W - M - 16 }
  const descW = cols.qty - 36 - cols.desc
  const head = () => {
    fillRound(pg, M, y - 26, W - 2 * M, 30, 15, C.box)
    const o: TextOpts = { size: 7, font: bold, color: C.muted, spacing: 0.7 }
    text(pg, "N°", cols.num, y - 14, o)
    text(pg, "DESCRIPTION", cols.desc, y - 14, o)
    text(pg, "QTÉ", cols.qty, y - 14, { ...o, align: "right" })
    text(pg, "PRIX UNITAIRE HT", cols.unit, y - 14, { ...o, align: "right" })
    text(pg, "TOTAL HT", cols.total, y - 14, { ...o, align: "right" })
    y -= 46
  }
  head()
  const num = (q: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(q)
  d.lines.forEach((l, i) => {
    const lines = wrap(l.label || "—", 10.5, descW)
    const h = (lines.length - 1) * 14 + 27
    if (y - h < 220) {
      ;({ pg, y } = newPage(false))
      head()
    }
    text(pg, String(i + 1).padStart(2, "0"), cols.num, y, { size: 9, color: C.faint })
    lines.forEach((s, j) => text(pg, s, cols.desc, y - j * 14, { size: 10.5, color: C.ink }))
    text(pg, num(Number(l.qty) || 0), cols.qty, y, { size: 10.5, align: "right" })
    text(pg, money(Number(l.unit_cents) || 0, cur), cols.unit, y, { size: 10.5, align: "right" })
    text(pg, money(Math.round((Number(l.qty) || 0) * (Number(l.unit_cents) || 0)), cur), cols.total, y, { size: 10.5, font: bold, color: C.ink, align: "right" })
    if (i < d.lines.length - 1) pg.drawLine({ start: { x: M + 14, y: y - h + 18 }, end: { x: W - M - 14, y: y - h + 18 }, thickness: 0.6, color: C.line })
    y -= h
  })
  if (!d.lines.length) { text(pg, "Aucune ligne pour l’instant.", cols.desc, y, { size: 10, color: C.muted }); y -= 22 }

  // Note, sous les lignes (#104 : avant le bas de facture, pour ne jamais occuper une page à elle seule).
  if (d.notes.trim()) {
    const lines = wrap(d.notes.trim(), 9.5, W - 2 * M - 32)
    const h = lines.length * 13 + 44
    if (y - h < 200) ({ pg, y } = newPage(false))
    y -= 6
    strokeRound(pg, M, y - h, W - 2 * M, h, 16, C.line, 0.8)
    tag(pg, "note", M + 16, y - 22)
    lines.forEach((s, j) => text(pg, s, M + 16, y - 44 - j * 13, { size: 9.5, color: C.text }))
    y -= h + 8
  }

  // Bas de facture : paiement à gauche, totaux à droite.
  if (y < 200) ({ pg, y } = newPage(false))
  y -= 4
  pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: C.ink })
  y -= 28
  const tw = 222
  const tx = W - M - tw
  const topBlock = y + 14
  const totRow = (k: string, v: string) => {
    text(pg, k, tx + 6, y, { size: 10, color: C.muted })
    text(pg, v, W - M - 16, y, { size: 10.5, color: C.ink, align: "right" })
    y -= 20
  }
  totRow("Sous-total HT", money(t.subtotal, cur))
  if (d.taxRate > 0) totRow(`TVA (${num(d.taxRate)} %)`, money(t.tax, cur))
  else totRow(d.issuer.vat_note || "TVA non applicable", money(0, cur))
  y -= 20
  fillRound(pg, tx - 6, y - 17, tw + 6, 46, 16, C.band)
  text(pg, d.taxRate > 0 ? "Total TTC" : "Total", tx + 10, y, { size: 11, color: C.white })
  text(pg, money(t.total, cur), W - M - 16, y - 2, { size: 18, font: bold, color: C.white, align: "right" })
  const bottomTotals = y - 17

  // Carte de paiement (ou de règlement) à gauche des totaux.
  const lw = tx - 28 - M
  const payBody = paid
    ? `Facture réglée le ${longDate(d.paidAt)}. Merci !`
    : (d.issuer.payment || "").trim()
      ? `${d.issuer.payment!.trim()}${d.number ? `\nRéférence à indiquer : ${d.number}` : ""}`
      : `À régler avant le ${longDate(d.dueAt)}.${d.number ? `\nRéférence à indiquer : ${d.number}` : ""}`
  const payLines = wrap(payBody, 9.5, lw - 36)
  const payH = Math.max(payLines.length * 13 + 44, topBlock - bottomTotals)
  const payY = topBlock - payH
  fillRound(pg, M, payY, lw, payH, 16, paid ? C.okTint : C.box)
  tag(pg, paid ? "règlement" : "modalités de paiement", M + 18, topBlock - 22, { line: hex("#cfcfcf") })
  payLines.forEach((s, j) => text(pg, s, M + 18, topBlock - 44 - j * 13, { size: 9.5, color: C.text }))
  y = Math.min(payY, bottomTotals) - 18

  // Tampon « Payée ».
  if (paid) {
    const sx = tx + 40
    const sy = Math.min(payY, bottomTotals) - 58
    if (sy > 90) {
      pg.drawRectangle({ x: sx, y: sy, width: 132, height: 40, borderColor: C.ok, borderWidth: 2, opacity: 0, borderOpacity: 0.75, rotate: degrees(-8) })
      pg.drawText(win("PAYÉE"), { x: sx + 22, y: sy + 10, size: 22, font: bold, color: C.ok, opacity: 0.75, rotate: degrees(-8) })
      // La rotation abaisse le bord droit du tampon d'environ 19 points.
      y = Math.min(y, sy - 30)
    }
  }

  // Pied de page sur chaque page : filet noir, remerciement, mentions de l'émetteur, numéro de page.
  const legal = [d.issuer.name, d.issuer.address?.replace(/\n+/g, ", "), d.issuer.tax_id ? `N° fiscal ${d.issuer.tax_id}` : "", d.issuer.email, d.issuer.website].filter(Boolean).join(" · ")
  pages.forEach((p, i) => {
    p.drawLine({ start: { x: M, y: 64 }, end: { x: W - M, y: 64 }, thickness: 0.8, color: C.ink })
    if (d.issuer.footer) text(p, d.issuer.footer, M, 47, { size: 10, font: bold, color: C.ink })
    text(p, `${i + 1} / ${pages.length}`, W - M, 47, { size: 8.5, color: C.faint, align: "right" })
    wrap(legal, 8, W - 2 * M).slice(0, 2).forEach((s, j) => text(p, s, M, 32 - j * 10, { size: 8, color: C.faint }))
  })
  return pdf.save()
}

/** PDF en base64 (pièce jointe Brevo). */
export function toBase64(bytes: Uint8Array) {
  let s = ""
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}
