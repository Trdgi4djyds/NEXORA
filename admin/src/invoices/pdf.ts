// Facture PDF de NEXORA (#031), générée dans le navigateur avec pdf-lib : A4, logo, bandeau aux couleurs
// de la marque, émetteur et client, lignes, totaux, modalités de paiement, pied de page légal.
// Polices standard (Helvetica, encodage WinAnsi) : aucun fichier de police à embarquer.
import {
  appendBezierCurve, clip, closePath, degrees, endPath, lineTo, moveTo, PDFDocument, popGraphicsState, pushGraphicsState, rgb,
  StandardFonts, type PDFFont, type PDFImage, type PDFPage, type RGB,
} from "pdf-lib"
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
  ink: hex("#1d1d1f"),
  text: hex("#3a3a3c"),
  muted: hex("#6e6e73"),
  faint: hex("#9a9aa0"),
  line: hex("#e5e5ea"),
  box: hex("#f6f6f9"),
  brand: hex("#7b4fe6"),
  brandTint: hex("#f3eefe"),
  ok: hex("#1f9d55"),
  okTint: hex("#e7f6ee"),
  bad: hex("#e5302a"),
  badTint: hex("#fdecec"),
  white: rgb(1, 1, 1),
}
const GRAD = ["#ff6a88", "#d34bd5", "#5b6cff"].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)])

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

// Chemin d'un rectangle arrondi (opérateurs PDF), pour remplir ou découper proprement.
function roundedPath(x: number, y: number, w: number, h: number, r: number) {
  const k = 0.5523 * r
  return [
    moveTo(x + r, y), lineTo(x + w - r, y), appendBezierCurve(x + w - r + k, y, x + w, y + r - k, x + w, y + r),
    lineTo(x + w, y + h - r), appendBezierCurve(x + w, y + h - r + k, x + w - r + k, y + h, x + w - r, y + h),
    lineTo(x + r, y + h), appendBezierCurve(x + r - k, y + h, x, y + h - r + k, x, y + h - r),
    lineTo(x, y + r), appendBezierCurve(x, y + r - k, x + r - k, y, x + r, y), closePath(),
  ]
}
const mixGrad = (k: number) => {
  const [a, b, f] = k < 0.48 ? [GRAD[0], GRAD[1], k / 0.48] : [GRAD[1], GRAD[2], (k - 0.48) / 0.52]
  const m = (j: number) => (a[j] + (b[j] - a[j]) * f) / 255
  return rgb(m(0), m(1), m(2))
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
  const reg = await pdf.embedFont(StandardFonts.Helvetica)
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  let logo: PDFImage | null = null
  try { logo = await pdf.embedPng(await logoBytes(logoUrl)) } catch { logo = null }

  const W = 595.28
  const H = 841.89
  const M = 44
  const t = totals(d.lines, d.taxRate)
  const cur = d.currency || "EUR"
  const paid = d.status === "payee"
  const pages: PDFPage[] = []

  const text = (pg: PDFPage, s: string, x: number, y: number, o: { size?: number; font?: PDFFont; color?: RGB; align?: "left" | "right" | "center"; opacity?: number } = {}) => {
    const f = o.font || reg
    const size = o.size || 10
    const str = win(s)
    const w = f.widthOfTextAtSize(str, size)
    const dx = o.align === "right" ? -w : o.align === "center" ? -w / 2 : 0
    pg.drawText(str, { x: x + dx, y, size, font: f, color: o.color || C.text, opacity: o.opacity ?? 1 })
    return w
  }
  // Découpe un texte en lignes qui tiennent dans la largeur (retours à la ligne gardés).
  const wrap = (s: string, size: number, width: number, f: PDFFont = reg) => {
    const out: string[] = []
    for (const para of win(s).split("\n")) {
      let line = ""
      for (const word of para.split(/ +/)) {
        const next = line ? `${line} ${word}` : word
        if (f.widthOfTextAtSize(next, size) <= width || !line) line = next
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
  const strokeRound = (pg: PDFPage, x: number, y: number, w: number, h: number, r: number, color: RGB, width = 0.8) =>
    pg.drawSvgPath(roundSvg(w, h, r), { x, y: y + h, borderColor: color, borderWidth: width })
  // Dégradé de la marque (rose → magenta → bleu) en fines bandes verticales, découpé par un rectangle arrondi.
  const gradient = (pg: PDFPage, x: number, y: number, w: number, h: number, r = 0) => {
    pg.pushOperators(pushGraphicsState(), ...roundedPath(x, y, w, h, Math.min(r, h / 2, w / 2) || 0.01), clip(), endPath())
    const n = Math.max(24, Math.round(w / 3))
    for (let i = 0; i < n; i++) pg.drawRectangle({ x: x + (w / n) * i, y, width: w / n + 0.6, height: h, color: mixGrad(i / (n - 1)) })
    pg.pushOperators(popGraphicsState())
  }
  const pill = (pg: PDFPage, label: string, xRight: number, y: number, fg: RGB, bg: RGB) => {
    const w = bold.widthOfTextAtSize(win(label), 8.5) + 20
    fillRound(pg, xRight - w, y - 6, w, 19, 9.5, bg)
    text(pg, label, xRight - w / 2, y, { size: 8.5, font: bold, color: fg, align: "center" })
  }

  // En-tête : grand bandeau dégradé (première page) ou bandeau fin (pages suivantes).
  const newPage = (first: boolean) => {
    const pg = pdf.addPage([W, H])
    pages.push(pg)
    if (!first) {
      gradient(pg, 0, H - 8, W, 8)
      text(pg, `${d.number ? `Facture ${d.number}` : "Facture brouillon"} · suite`, M, H - 40, { size: 11, font: bold, color: C.ink })
      text(pg, d.issuer.name || "NEXORA", W - M, H - 40, { size: 9, color: C.muted, align: "right" })
      return { pg, y: H - 64 }
    }
    const top = H - 156
    gradient(pg, 0, top, W, 156)
    pg.drawCircle({ x: W - 70, y: H - 20, size: 120, color: C.white, opacity: 0.07 })
    pg.drawCircle({ x: W - 150, y: top - 10, size: 70, color: C.white, opacity: 0.06 })
    fillRound(pg, M, H - 86, 46, 46, 13, C.white)
    if (logo) pg.drawImage(logo, { x: M + 5, y: H - 81, width: 36, height: 36 })
    text(pg, "NEXORA", M + 58, H - 62, { size: 17, font: bold, color: C.white })
    // Émetteur sous le nom de NEXORA, seulement s'il est différent (NEXORA #038 : aucun nom de société par défaut).
    if (d.issuer.name && d.issuer.name.trim().toUpperCase() !== "NEXORA") text(pg, `par ${d.issuer.name}`, M + 58, H - 77, { size: 9.5, color: C.white, opacity: 0.85 })
    text(pg, "Facture", W - M, H - 66, { size: 30, font: bold, color: C.white, align: "right" })
    text(pg, d.number ? `N° ${d.number}` : "Brouillon, non numérotée", W - M, H - 83, { size: 10.5, color: C.white, opacity: 0.9, align: "right" })
    const st: [string, RGB] = paid ? ["PAYÉE", C.ok] : d.status === "annulee" ? ["ANNULÉE", C.bad] : !d.number ? ["BROUILLON", C.muted] : ["À RÉGLER", C.brand]
    pill(pg, st[0], W - M, H - 110, st[1], C.white)
    return { pg, y: top }
  }

  let { pg, y } = newPage(true)

  // Carte des informations clés, à cheval sur le bandeau.
  const cardH = 64
  const cardY = y - cardH / 2 - 6
  fillRound(pg, M + 1, cardY - 2, W - 2 * M - 2, cardH, 14, hex("#2a1d63"), 0.06)
  fillRound(pg, M, cardY, W - 2 * M, cardH, 14, C.white)
  strokeRound(pg, M, cardY, W - 2 * M, cardH, 14, C.line, 0.6)
  const meta: [string, string, boolean?][] = [
    ["Date d’émission", d.issuedAt ? longDate(d.issuedAt) : "À l’émission"],
    [paid ? "Payée le" : "Échéance", paid ? longDate(d.paidAt) : longDate(d.dueAt)],
    ["Client", d.customer.name || "—"],
    [paid ? "Montant réglé" : "Montant dû", money(t.total, cur), true],
  ]
  const colW = (W - 2 * M) / 4
  meta.forEach(([k, v, strong], i) => {
    const x = M + i * colW + 18
    if (i) pg.drawLine({ start: { x: M + i * colW, y: cardY + 14 }, end: { x: M + i * colW, y: cardY + cardH - 14 }, thickness: 0.6, color: C.line })
    text(pg, k.toUpperCase(), x, cardY + cardH - 24, { size: 7.5, font: bold, color: strong ? C.brand : C.muted })
    const value = wrap(v, strong ? 14 : 11, colW - 30, bold)[0]
    text(pg, value, x, cardY + 18, { size: strong ? 14 : 11, font: bold, color: strong ? C.brand : C.ink })
  })
  y = cardY - 34

  // Émetteur et client.
  const party = (label: string, p: Party, x: number, width: number) => {
    let yy = y
    text(pg, label, x, yy, { size: 7.5, font: bold, color: C.brand })
    yy -= 17
    for (const l of wrap(p.name || "—", 12, width, bold)) { text(pg, l, x, yy, { size: 12, font: bold, color: C.ink }); yy -= 15 }
    const rest = [p.company && p.company !== p.name ? p.company : "", p.address || "", p.email || "", p.phone || "", p.website || "", p.tax_id ? `N° fiscal : ${p.tax_id}` : ""].filter(Boolean)
    for (const r of rest) for (const l of wrap(r, 9.5, width)) { text(pg, l, x, yy, { size: 9.5, color: C.text }); yy -= 12.5 }
    return yy
  }
  const half = (W - 2 * M - 40) / 2
  const yA = party("ÉMIS PAR", d.issuer, M, half)
  const yB = party("FACTURÉ À", d.customer, M + half + 40, half)
  pg.drawLine({ start: { x: M + half + 20, y: y + 6 }, end: { x: M + half + 20, y: Math.min(yA, yB) + 8 }, thickness: 0.6, color: C.line })
  y = Math.min(yA, yB) - 20

  // Lignes, numérotées.
  const cols = { num: M + 14, desc: M + 40, qty: W - M - 200, unit: W - M - 96, total: W - M - 14 }
  const descW = cols.qty - 36 - cols.desc
  const head = () => {
    fillRound(pg, M, y - 24, W - 2 * M, 28, 9, C.brandTint)
    const o = { size: 7.5, font: bold, color: C.brand }
    text(pg, "N°", cols.num, y - 13, o)
    text(pg, "DESCRIPTION", cols.desc, y - 13, o)
    text(pg, "QTÉ", cols.qty, y - 13, { ...o, align: "right" })
    text(pg, "PRIX UNITAIRE HT", cols.unit, y - 13, { ...o, align: "right" })
    text(pg, "TOTAL HT", cols.total, y - 13, { ...o, align: "right" })
    y -= 42
  }
  head()
  const num = (q: number) => new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(q)
  d.lines.forEach((l, i) => {
    const lines = wrap(l.label || "—", 10, descW)
    const h = (lines.length - 1) * 13 + 26
    if (y - h < 250) {
      ;({ pg, y } = newPage(false))
      head()
    }
    text(pg, String(i + 1).padStart(2, "0"), cols.num, y, { size: 9, font: bold, color: C.faint })
    lines.forEach((s, j) => text(pg, s, cols.desc, y - j * 13, { size: 10, color: C.ink }))
    text(pg, num(Number(l.qty) || 0), cols.qty, y, { size: 10, align: "right" })
    text(pg, money(Number(l.unit_cents) || 0, cur), cols.unit, y, { size: 10, align: "right" })
    text(pg, money(Math.round((Number(l.qty) || 0) * (Number(l.unit_cents) || 0)), cur), cols.total, y, { size: 10, font: bold, color: C.ink, align: "right" })
    if (i < d.lines.length - 1) pg.drawLine({ start: { x: M + 12, y: y - h + 17 }, end: { x: W - M - 12, y: y - h + 17 }, thickness: 0.6, color: C.line })
    y -= h
  })
  if (!d.lines.length) { text(pg, "Aucune ligne pour l’instant.", cols.desc, y, { size: 10, color: C.muted }); y -= 22 }

  // Bas de facture : paiement à gauche, totaux à droite.
  if (y < 250) ({ pg, y } = newPage(false))
  y -= 4
  pg.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: C.line })
  y -= 26
  const tw = 220
  const tx = W - M - tw
  const topBlock = y + 12
  const totRow = (k: string, v: string) => {
    text(pg, k, tx + 4, y, { size: 10, color: C.muted })
    text(pg, v, W - M - 14, y, { size: 10, color: C.ink, align: "right" })
    y -= 19
  }
  totRow("Sous-total HT", money(t.subtotal, cur))
  if (d.taxRate > 0) totRow(`TVA (${num(d.taxRate)} %)`, money(t.tax, cur))
  else totRow(d.issuer.vat_note || "TVA non applicable", money(0, cur))
  y -= 10
  gradient(pg, tx - 6, y - 15, tw + 6, 40, 12)
  text(pg, d.taxRate > 0 ? "Total TTC" : "Total", tx + 8, y, { size: 11.5, font: bold, color: C.white })
  text(pg, money(t.total, cur), W - M - 14, y - 1, { size: 16, font: bold, color: C.white, align: "right" })
  const bottomTotals = y - 15

  // Carte de paiement (ou de règlement) à gauche des totaux.
  const lw = tx - 26 - M
  const payBody = paid
    ? `Facture réglée le ${longDate(d.paidAt)}. Merci !`
    : (d.issuer.payment || "").trim()
      ? `${d.issuer.payment!.trim()}${d.number ? `\nRéférence à indiquer : ${d.number}` : ""}`
      : `À régler avant le ${longDate(d.dueAt)}.${d.number ? `\nRéférence à indiquer : ${d.number}` : ""}`
  const payLines = wrap(payBody, 9.5, lw - 34)
  const payH = Math.max(payLines.length * 13 + 36, topBlock - bottomTotals)
  const payY = topBlock - payH
  fillRound(pg, M, payY, lw, payH, 12, paid ? C.okTint : C.box)
  // Barre de couleur à gauche, découpée par les coins arrondis de la carte.
  pg.pushOperators(pushGraphicsState(), ...roundedPath(M, payY, lw, payH, 12), clip(), endPath())
  pg.drawRectangle({ x: M, y: payY, width: 4, height: payH, color: paid ? C.ok : C.brand })
  pg.pushOperators(popGraphicsState())
  text(pg, paid ? "RÈGLEMENT" : "MODALITÉS DE PAIEMENT", M + 18, topBlock - 18, { size: 7.5, font: bold, color: paid ? C.ok : C.brand })
  payLines.forEach((s, j) => text(pg, s, M + 18, topBlock - 34 - j * 13, { size: 9.5, color: C.text }))
  y = Math.min(payY, bottomTotals) - 18

  // Tampon « Payée ».
  if (paid) {
    const sx = tx + 40
    const sy = Math.min(payY, bottomTotals) - 58
    if (sy > 90) {
      pg.drawRectangle({ x: sx, y: sy, width: 132, height: 40, borderColor: C.ok, borderWidth: 2, opacity: 0, borderOpacity: 0.75, rotate: degrees(-8) })
      pg.drawText("PAYÉE", { x: sx + 20, y: sy + 9, size: 22, font: bold, color: C.ok, opacity: 0.75, rotate: degrees(-8) })
      // La rotation abaisse le bord droit du tampon d'environ 19 points.
      y = Math.min(y, sy - 30)
    }
  }

  // Note.
  if (d.notes.trim()) {
    const lines = wrap(d.notes.trim(), 9.5, W - 2 * M - 32)
    const h = lines.length * 13 + 34
    if (y - h < 80) ({ pg, y } = newPage(false))
    strokeRound(pg, M, y - h, W - 2 * M, h, 12, C.line, 0.8)
    text(pg, "NOTE", M + 16, y - 18, { size: 7.5, font: bold, color: C.muted })
    lines.forEach((s, j) => text(pg, s, M + 16, y - 34 - j * 13, { size: 9.5, color: C.text }))
    y -= h + 12
  }

  // Pied de page sur chaque page : filet dégradé, remerciement, mentions de l'émetteur, numéro de page.
  const legal = [d.issuer.name, d.issuer.address?.replace(/\n+/g, ", "), d.issuer.tax_id ? `N° fiscal ${d.issuer.tax_id}` : "", d.issuer.email, d.issuer.website].filter(Boolean).join(" · ")
  pages.forEach((p, i) => {
    gradient(p, M, 63, W - 2 * M, 2.4)
    if (d.issuer.footer) text(p, d.issuer.footer, M, 46, { size: 9.5, font: bold, color: C.ink })
    text(p, `Page ${i + 1} / ${pages.length}`, W - M, 46, { size: 8.5, color: C.faint, align: "right" })
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
