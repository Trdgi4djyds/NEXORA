// Supervision (NEXORA #022) : sites vérifiés 24 h/24 par le serveur Supabase. Tableaux de bord avec les
// mêmes graphiques que l'application (nexora/app/renderer/supervision/charts.js), alimentés par les
// fonctions monitor_overview et monitor_series (supabase/migrations/20261104000002_supervision_serveur.sql).
// Tant que la migration n'est pas appliquée, la section garde l'affichage simple d'origine.
import { useEffect, useMemo, useRef, useState } from "react"
import { go, useRefresh, type SectionProps } from "../App"
import { Icon } from "../icons"
import { must, sb, type Row } from "../supabase"
import { Drawer, Empty, fmtAgo, fmtDateTime, fmtDec, fmtNum, Kpi, Loaded, Seg, Switch, Table, Tag, useAction, useLoad, useUi } from "../ui"
import { Chart, statusBars } from "../../../nexora/app/renderer/supervision/charts.js"

type Bar = { t: string; n: number; fails: number; avail: number | null; p95: number | null }
type Site = {
  id: string
  org_id: string
  org: string | null
  name: string
  url: string
  active: boolean
  interval_minutes: number
  threshold_ms: number
  confirm_count: number
  keyword: string | null
  expected_status: number
  app_site_id: string | null
  muted_until: string | null
  status: string
  status_since: string | null
  last_checked_at: string | null
  last_latency_ms: number | null
  last_error: string | null
  n: number
  fails: number
  avail: number | null
  p50: number | null
  p95: number | null
  avg: number | null
  open: number
  bars: Bar[]
}
type Incident = {
  id: string
  monitor_id: string
  org_id: string
  kind: "down" | "slow"
  started_at: string
  ended_at: string | null
  cause: string
  last_cause: string
  checks: number
  notified: number
  ack_at: string | null
  note: string
  site?: string
}
type Overview = { from: string; to: string; hours: number; step: number; sites: Site[]; incidents: Incident[] }
type Point = { t: string; n: number; fails: number; avail: number | null; avg: number | null; p50: number | null; p95: number | null; max: number | null }
type Series = {
  from: string
  to: string
  step: number
  hourly: boolean
  points: Point[]
  totals: { n: number; fails: number; avail: number | null; avg: number | null; p50: number | null; p95: number | null; max: number | null }
  incidents: Incident[]
  recent: { checked_at: string; ok: boolean; status_code: number | null; latency_ms: number | null; error: string | null }[]
}
type Range = "24" | "168" | "720" | "2160"
type Filter = "all" | "down" | "inactive"

const STATUS: Record<string, [string, string]> = {
  up: ["En ligne", "ok"],
  down: ["En panne", "bad"],
  degraded: ["Lent", "warn"],
  paused: ["En pause", ""],
  unknown: ["En attente", ""],
  pending: ["En attente", ""],
}
const KIND: Record<string, string> = { down: "Panne", slow: "Lenteur" }
const RANGES: [Range, string][] = [["24", "24 h"], ["168", "7 j"], ["720", "30 j"], ["2160", "90 j"]]
const PALETTE = ["#007aff", "#af52de", "#30b0c7", "#ff9500", "#ff2d55", "#34c759", "#5856d6", "#a2845e", "#ffcc00", "#64d2ff"]
const OK = "#34c759"
const WARN = "#ff9500"
const BAD = "#ff3b30"

const ms = (v?: number | null) => (v == null ? "—" : v >= 1000 ? `${fmtDec(v / 1000, 2)} s` : `${fmtNum(Math.round(v))} ms`)
/** Disponibilité tronquée (jamais arrondie vers le haut : 98,99 % ne s'affiche pas « 99 % »). */
function pct(v?: number | null) {
  if (v == null) return "—"
  if (v >= 100) return "100 %"
  if (v >= 99) return `${fmtDec(Math.min(99.99, Math.floor(v * 100) / 100), 2)} %`
  return `${fmtDec(Math.floor(v * 10) / 10, 1)} %`
}
const availTone = (v?: number | null): "" | "good" | "warn" | "bad" => (v == null ? "" : v >= 99.9 ? "good" : v >= 99 ? "warn" : "bad")
function dur(msv: number) {
  const m = Math.round(msv / 60000)
  if (m < 1) return "< 1 min"
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  if (h < 48) return `${h} h${m % 60 ? ` ${String(m % 60).padStart(2, "0")}` : ""}`
  return `${Math.round(h / 24)} j`
}
const t = (v: string) => Date.parse(v)
function barTip(b: Bar) {
  const when = new Date(t(b.t)).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })
  if (!b.n) return `${when} · aucune vérification`
  return `${when} · disponibilité ${pct(b.avail)}${b.p95 != null ? ` · p95 ${ms(b.p95)}` : ""}${b.fails ? ` · ${b.fails} échec(s)` : ""}`
}

/** Graphique de NEXORA dans un composant React (mis à jour quand les options changent). */
function ChartBox({ opts }: { opts: Record<string, unknown> }) {
  const ref = useRef<HTMLDivElement>(null)
  const inst = useRef<Chart | null>(null)
  useEffect(() => {
    if (!ref.current) return
    if (inst.current) inst.current.update(opts)
    else inst.current = new Chart(ref.current, opts)
  }, [opts])
  useEffect(() => () => inst.current?.destroy(), [])
  return <div ref={ref} />
}

function Bars({ bars }: { bars: Bar[] }) {
  return <div title="" dangerouslySetInnerHTML={{ __html: statusBars(bars.map((b) => ({ ...b, slow: 0 })), barTip) }} />
}

/** Migration absente : fonction inconnue de PostgREST. */
function missingFn(e: unknown) {
  const err = e as { message?: string; code?: string } | null
  return /PGRST202|could not find the function/i.test(`${err?.code || ""} ${err?.message || ""}`)
}

export function Monitors({ param }: SectionProps) {
  const refresh = useRefresh()
  const [hours, setHours] = useState<Range>("24")
  const [filter, setFilter] = useState<Filter>("all")
  const [tick, setTick] = useState(0)
  const q = useLoad(async () => {
    const res = await sb.rpc("monitor_overview", { p_org: null, p_hours: Number(hours), p_buckets: 60 })
    if (res.error) {
      if (missingFn(res.error)) return null
      throw res.error
    }
    return res.data as Overview
  }, [refresh, hours, tick])
  if (q.data === null) return <Legacy param={param} />
  const changed = () => setTick((n) => n + 1)
  return (
    <>
      <Loaded q={q}>{(d) => (d ? <Dashboard d={d} filter={filter} setFilter={setFilter} hours={hours} setHours={setHours} onChange={changed} /> : <></>)}</Loaded>
      {param && q.data && <MonitorDrawer id={param} site={q.data.sites.find((s) => s.id === param)} hours={hours} onChange={changed} />}
    </>
  )
}

function Dashboard({ d, filter, setFilter, hours, setHours, onChange }: { d: Overview; filter: Filter; setFilter: (v: Filter) => void; hours: Range; setHours: (v: Range) => void; onChange: () => void }) {
  const act = useAction()
  const sites = d.sites
  const active = sites.filter((s) => s.active)
  const down = active.filter((s) => s.status === "down")
  const slow = active.filter((s) => s.status === "degraded")
  const openInc = d.incidents.filter((i) => !i.ended_at)
  const n = sites.reduce((a, s) => a + s.n, 0)
  const fails = sites.reduce((a, s) => a + s.fails, 0)
  const avail = n ? ((n - fails) / n) * 100 : null
  const p95s = sites.map((s) => s.p95).filter((v): v is number => v != null).sort((a, b) => a - b)
  const p95 = p95s.length ? p95s[Math.floor((p95s.length - 1) / 2)] : null
  const closed = d.incidents.filter((i) => i.kind === "down" && i.ended_at)
  const mttr = closed.length ? closed.reduce((a, i) => a + (t(i.ended_at as string) - t(i.started_at)), 0) / closed.length : null
  const rows = sites.filter((s) => filter === "all" || (filter === "down" ? s.active && (s.status === "down" || s.status === "degraded" || s.open > 0) : !s.active))
  const latOpts = useMemo(
    () => ({
      height: 230, from: t(d.from), to: t(d.to), step: d.step, yFmt: ms, label: "Temps de réponse par site",
      empty: "Pas encore de mesure sur cette période.",
      series: sites.filter((s) => s.bars.some((b) => b.p95 != null)).map((s, i) => ({ id: s.id, name: s.name || s.url, color: PALETTE[i % PALETTE.length], points: s.bars.map((b) => ({ t: t(b.t), v: b.p95 })) })),
    }),
    [d],
  )
  const failOpts = useMemo(() => {
    const len = sites[0]?.bars.length || 0
    const pts = Array.from({ length: len }, (_, i) => ({ t: t(sites[0].bars[i].t), v: sites.reduce((a, s) => a + (s.bars[i]?.fails || 0), 0) }))
    return { height: 230, from: t(d.from), to: t(d.to), step: d.step, label: "Échecs", empty: "Aucun échec sur la période.", series: pts.some((p) => p.v) ? [{ id: "fails", name: "Échecs", type: "bar", stack: true, color: BAD, points: pts }] : [] }
  }, [d])

  async function toggle(s: Site, on: boolean) {
    if (await act.run(async () => must(await sb.from("monitors").update({ active: on }).eq("id", s.id)), on ? "Surveillance reprise." : "Surveillance en pause.")) onChange()
  }

  return (
    <div className="stack">
      <div className="toolbar">
        <Seg value={hours} onChange={setHours} options={RANGES} />
        <span className="grow" />
        <span className="muted small" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><Icon name="cloud" size={13} />Vérifié 24 h/24 par les serveurs NEXORA, même NEXORA fermée</span>
      </div>
      <div className="kpis">
        <Kpi icon="sync" label="Sites surveillés" value={fmtNum(sites.length)} hint={`${fmtNum(active.length)} actifs`} />
        <Kpi icon="error" label="En panne ou lents" value={fmtNum(down.length + slow.length)} tone={down.length ? "bad" : slow.length ? "warn" : "good"} hint={down.length || slow.length ? `${fmtNum(down.length)} en panne · ${fmtNum(slow.length)} lent(s)` : "Tous les sites répondent"} />
        <Kpi icon="warn" label="Incidents en cours" value={fmtNum(openInc.length)} tone={openInc.length ? "bad" : "good"} hint={`${fmtNum(d.incidents.length)} sur la période`} />
        <Kpi icon="pass" label="Disponibilité" value={pct(avail)} tone={availTone(avail)} hint={`${fmtNum(n)} vérifications · ${fmtNum(fails)} échecs`} />
        <Kpi icon="clock" label="Temps de réponse p95" value={ms(p95)} hint="Médiane des sites" />
        <Kpi icon="restart" label="Rétablissement moyen" value={mttr != null ? dur(mttr) : "—"} hint={closed.length ? `${fmtNum(closed.length)} panne(s) résolue(s)` : "Aucune panne résolue"} />
      </div>
      <div className="cols-2-1">
        <section className="card">
          <div className="card-head"><h3>Temps de réponse par site</h3><span className="muted small">p95 par tranche</span></div>
          <ChartBox opts={latOpts} />
        </section>
        <section className="card">
          <div className="card-head"><h3>Échecs</h3><span className="muted small">Tous sites confondus</span></div>
          <ChartBox opts={failOpts} />
        </section>
      </div>
      <section className="card">
        <div className="card-head">
          <h3>Sites</h3>
          <span className="grow" />
          <Seg value={filter} onChange={setFilter} options={[["all", "Tous"], ["down", "Incidents"], ["inactive", "En pause"]]} />
        </div>
        <Table head={["", "Site", "Espace", "Disponibilité sur la période", "Dispo.", "p95", "Fréquence", "Vérifié", "Active"]} empty="Aucun site surveillé par le serveur.">
          {rows.map((s) => (
            <tr key={s.id} className="click" onClick={(e) => !(e.target as HTMLElement).closest(".switch") && go("monitors", s.id)}>
              <td><span className={`dot ${s.status === "degraded" ? "warn" : s.status}`} title={STATUS[s.status]?.[0] || s.status} /></td>
              <td>
                <b>{s.name || s.url}</b>
                <div className="muted small ellipsis" style={{ maxWidth: 300 }}>{s.url}</div>
                {s.status !== "up" && s.last_error && <div className="small" style={{ color: "var(--bad)" }}>{s.last_error}</div>}
              </td>
              <td>{s.org || "—"}</td>
              <td style={{ minWidth: 220, width: "32%" }}><Bars bars={s.bars} /></td>
              <td className={`num ${availTone(s.avail)}`}>{pct(s.avail)}</td>
              <td className="num">{ms(s.p95)}</td>
              <td className="nowrap">{s.interval_minutes} min</td>
              <td className="nowrap">{fmtAgo(s.last_checked_at)}</td>
              <td><Switch checked={s.active} disabled={act.busy} onChange={(v) => toggle(s, v)} label="Surveillance active" /></td>
            </tr>
          ))}
        </Table>
      </section>
      <section className="card">
        <div className="card-head"><h3>Incidents</h3><span className="muted small">{fmtNum(d.incidents.length)} sur la période · panne confirmée après plusieurs échecs, lenteur après 3 mesures lentes</span></div>
        <IncidentTable list={d.incidents} onChange={onChange} />
      </section>
    </div>
  )
}

function IncidentTable({ list, onChange, compact = false }: { list: Incident[]; onChange: () => void; compact?: boolean }) {
  const act = useAction()
  const ui = useUi()
  async function run(i: Incident, action: "ack" | "close" | "note") {
    let note: string | null = null
    if (action === "note") {
      note = window.prompt("Note sur l’incident (cause, action menée…)", i.note || "")
      if (note == null) return
    }
    if (action === "close" && !(await ui.confirm({ title: "Clore cet incident ?", body: "Il sera rouvert si le site échoue encore après confirmation.", confirm: "Clore" }))) return
    const msg = action === "ack" ? (i.ack_at ? "Prise en charge retirée." : "Incident pris en charge : les rappels sont suspendus.") : action === "close" ? "Incident clos." : "Note enregistrée."
    if (await act.run(async () => must(await sb.rpc("monitor_incident_action", { p_incident: i.id, p_action: action, p_note: note })), msg)) onChange()
  }
  if (!list.length) return <Empty icon="pass">Aucun incident sur la période.</Empty>
  return (
    <Table head={compact ? ["État", "Type", "Cause", "Début", "Durée", ""] : ["État", "Type", "Site", "Cause", "Début", "Durée", "Notifications", ""]}>
      {list.map((i) => (
        <tr key={i.id}>
          <td>{i.ended_at ? <Tag>Clos</Tag> : <Tag tone="bad">En cours</Tag>}{i.ack_at && !i.ended_at && <div className="muted small">pris en charge</div>}</td>
          <td><Tag tone={i.kind === "down" ? "bad" : "warn"}>{KIND[i.kind]}</Tag></td>
          {!compact && <td><button className="link-btn" onClick={() => go("monitors", i.monitor_id)}>{i.site || "—"}</button></td>}
          <td className="ellipsis" style={{ maxWidth: 260 }}>
            {i.last_cause || i.cause}
            {i.note && <div className="muted small ellipsis">Note : {i.note}</div>}
          </td>
          <td className="nowrap">{fmtDateTime(i.started_at)}</td>
          <td className="num nowrap">{dur((i.ended_at ? t(i.ended_at) : Date.now()) - t(i.started_at))}</td>
          {!compact && <td className="num">{fmtNum(i.notified)}</td>}
          <td className="nowrap" style={{ textAlign: "right" }}>
            {!i.ended_at && <button className="btn small" disabled={act.busy} onClick={() => run(i, "ack")}>{i.ack_at ? "Relâcher" : "Prendre en charge"}</button>}{" "}
            <button className="icon-btn" title="Note" disabled={act.busy} onClick={() => run(i, "note")}><Icon name="pencil" size={13} /></button>
            {!i.ended_at && <button className="icon-btn" title="Clore" disabled={act.busy} onClick={() => run(i, "close")}><Icon name="check" size={13} /></button>}
          </td>
        </tr>
      ))}
    </Table>
  )
}

function MonitorDrawer({ id, site, hours, onChange }: { id: string; site?: Site; hours: Range; onChange: () => void }) {
  const refresh = useRefresh()
  const [tick, setTick] = useState(0)
  const q = useLoad(async () => must(await sb.rpc("monitor_series", { p_monitor: id, p_hours: Number(hours), p_buckets: 96 })) as Series | null, [id, hours, refresh, tick])
  const changed = () => {
    setTick((n) => n + 1)
    onChange()
  }
  return (
    <Drawer title={site?.name || site?.url || "Site surveillé"} sub={site?.url} onClose={() => go("monitors")}>
      {site && (
        <dl className="kv">
          <dt>État</dt>
          <dd>
            <Tag tone={STATUS[site.status]?.[1] || ""}>{STATUS[site.status]?.[0] || site.status}</Tag>
            {site.status_since && <span className="muted small"> depuis {dur(Date.now() - t(site.status_since))}</span>}
          </dd>
          <dt>Espace</dt><dd>{site.org || "—"}</dd>
          <dt>Fréquence</dt><dd>toutes les {site.interval_minutes} min · panne confirmée après {site.confirm_count} échec(s)</dd>
          <dt>Seuil de lenteur</dt><dd>{site.threshold_ms ? ms(site.threshold_ms) : "—"}</dd>
          <dt>Code attendu</dt><dd>{site.expected_status === 200 ? "200 à 399" : site.expected_status}</dd>
          <dt>Mot-clé attendu</dt><dd>{site.keyword || "—"}</dd>
          <dt>Origine</dt><dd>{site.app_site_id ? "Supervision de l’application NEXORA" : "Espace d’équipe"}</dd>
        </dl>
      )}
      <Loaded q={q}>
        {(s) => {
          if (!s || !s.totals.n) return <Empty>Aucune vérification sur la période.</Empty>
          const from = t(s.from)
          const to = t(s.to)
          const at = (k: keyof Point) => s.points.map((p) => ({ t: t(p.t), v: p[k] as number | null }))
          const bands = s.incidents.map((i) => ({ from: t(i.started_at), to: i.ended_at ? t(i.ended_at) : to, color: i.kind === "down" ? BAD : WARN, opacity: 0.12, label: `${KIND[i.kind]} : ${i.cause}` }))
          return (
            <>
              <div className="kpis">
                <Kpi label="Disponibilité" value={pct(s.totals.avail)} tone={availTone(s.totals.avail)} hint={`${fmtNum(s.totals.n)} vérifications · ${fmtNum(s.totals.fails)} échecs`} />
                <Kpi label="Médiane (p50)" value={ms(s.totals.p50)} hint={`p95 ${ms(s.totals.p95)} · max ${ms(s.totals.max)}`} />
              </div>
              <section>
                <h4>Temps de réponse</h4>
                <ChartBox opts={{ height: 200, from, to, step: s.step, yFmt: ms, bands, thresholds: site?.threshold_ms ? [{ value: site.threshold_ms, label: `Seuil ${ms(site.threshold_ms)}`, color: WARN }] : [], thresholdInScale: false, series: [{ id: "p50", name: "p50", color: "#30b0c7", type: "area", points: at("p50") }, { id: "p95", name: "p95", color: "#007aff", points: at("p95"), width: 2 }] }} />
              </section>
              <section>
                <h4>Disponibilité</h4>
                <ChartBox opts={{ height: 150, from, to, step: s.step, yMin: 0, yMax: 100, yFmt: (v: number) => `${fmtDec(v, 0)} %`, series: [{ id: "avail", name: "Disponibilité", type: "bar", color: OK, colorOf: (p: { v: number }) => (p.v >= 99.99 ? OK : p.v >= 99 ? WARN : BAD), fmt: (v: number) => pct(v), points: at("avail") }] }} />
              </section>
              <section>
                <h4>Incidents</h4>
                <IncidentTable list={s.incidents} onChange={changed} compact />
              </section>
              <section>
                <h4>Dernières vérifications</h4>
                <div className="list">
                  {s.recent.slice(0, 30).map((c) => (
                    <div key={c.checked_at}>
                      <span className={`dot ${c.ok ? "ok" : "bad"}`} />
                      <span className="grow small">{fmtDateTime(c.checked_at)}</span>
                      <small className="muted">{c.status_code ?? "—"}</small>
                      <small className="muted" style={{ width: 64, textAlign: "right" }}>{c.latency_ms != null ? `${c.latency_ms} ms` : "—"}</small>
                      {c.error && <small style={{ color: "var(--bad)" }} className="ellipsis">{c.error}</small>}
                    </div>
                  ))}
                </div>
              </section>
            </>
          )
        }}
      </Loaded>
    </Drawer>
  )
}

/* ------------------------------------------------------------------ Affichage d'origine (sans la migration) */

type Monitor = Row<"monitors"> & { organizations: { name: string } | null }

function Legacy({ param }: SectionProps) {
  const refresh = useRefresh()
  const act = useAction()
  const [tick, setTick] = useState(0)
  const q = useLoad(async () => must(await sb.from("monitors").select("*, organizations(name)").order("last_status").order("name")) as unknown as Monitor[], [refresh, tick])
  async function toggle(m: Monitor, active: boolean) {
    if (await act.run(async () => must(await sb.from("monitors").update({ active }).eq("id", m.id)), active ? "Surveillance reprise." : "Surveillance en pause.")) setTick((n) => n + 1)
  }
  return (
    <div className="stack">
      <div className="banner">
        <Icon name="warn" size={16} />
        <span className="grow">Les tableaux de bord de la supervision par le serveur demandent la migration <b>20261104000002_supervision_serveur.sql</b> (pannes confirmées, incidents, agrégats, notifications).</span>
        <button className="btn small" onClick={() => go("supabase")}>Ouvrir la section Supabase</button>
      </div>
      <Loaded q={q}>
        {(all) => (
          <Table head={["", "Site", "Espace", "Fréquence", "Dernière vérification", "Latence", "Active"]} empty="Aucun site surveillé.">
            {all.map((m) => (
              <tr key={m.id}>
                <td><span className={`dot ${m.last_status}`} /></td>
                <td>
                  <b>{m.name || m.url}</b>
                  <div className="muted small ellipsis" style={{ maxWidth: 380 }}>{m.url}</div>
                  {m.last_error && <div className="small" style={{ color: "var(--bad)" }}>{m.last_error}</div>}
                </td>
                <td>{m.organizations?.name || "—"}</td>
                <td className="nowrap">{m.interval_minutes} min</td>
                <td className="nowrap">{fmtAgo(m.last_checked_at)}</td>
                <td className="num">{m.last_latency_ms != null ? `${m.last_latency_ms} ms` : "—"}</td>
                <td><Switch checked={m.active} disabled={act.busy} onChange={(v) => toggle(m, v)} label="Surveillance active" /></td>
              </tr>
            ))}
          </Table>
        )}
      </Loaded>
      {param && <Empty>Le détail d’un site sera disponible une fois la migration appliquée.</Empty>}
    </div>
  )
}
