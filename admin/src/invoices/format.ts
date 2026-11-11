// Factures (#031) : types, totaux et formats partagés par la liste, l'éditeur et le PDF (sans pdf-lib).
export type InvoiceLine = { label: string; qty: number; unit_cents: number }
export type Party = { name?: string; company?: string; address?: string; email?: string; phone?: string; tax_id?: string; website?: string }
export type Issuer = Party & { vat_note?: string; payment?: string; footer?: string; prefix?: string; currency?: string; tax_rate?: number; due_days?: number }
export type InvoiceDoc = {
  number: string | null
  status: string
  issuedAt: string | null
  dueAt: string | null
  paidAt: string | null
  currency: string
  taxRate: number
  lines: InvoiceLine[]
  customer: Party
  issuer: Issuer
  notes: string
}

/** Totaux, calculés comme la base (déclencheur nx_invoice_before). */
export function totals(lines: InvoiceLine[], taxRate: number) {
  const subtotal = lines.reduce((s, l) => s + Math.round((Number(l.qty) || 0) * (Number(l.unit_cents) || 0)), 0)
  const tax = Math.round((subtotal * (Number(taxRate) || 0)) / 100)
  return { subtotal, tax, total: subtotal + tax }
}

export const money = (cents: number, currency = "EUR") =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency, minimumFractionDigits: currency === "XOF" ? 0 : 2 }).format(cents / 100)
export const longDate = (v?: string | null) =>
  v ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(new Date(v)) : "—"
export const invoiceFile = (number: string | null) => `Facture-${number || "brouillon"}.pdf`
