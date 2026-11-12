// NEXORA #090 : espace d'un parrain (code d'accès du mois saisi) : vue d'ensemble (revenus récurrents, soldes, gains
// des 12 derniers mois), codes promo et liens, filleuls, historique des gains, retraits. Routes après # : #/, #/codes,
// #/filleuls, #/gains, #/retraits.
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { rpc, type Code, type Dashboard, type Filleul, type Gain, type Me, type Payout } from "./supabase"
import { Brand, CopyButton, Empty, fmtDate, Icon, lastDay, METHOD, METHOD_HINT, pct, plural, Spinner, usd, usdFloor, usdTotal, useToast } from "./ui"

type Route = "" | "codes" | "filleuls" | "gains" | "retraits"
const TABS: [Route, string, string][] = [["", "Vue d’ensemble", "grid"], ["codes", "Codes et liens", "link"], ["filleuls", "Filleuls", "group"], ["gains", "Gains", "gift"], ["retraits", "Retraits", "download"]]
const readRoute = (): Route => {
  const r = location.hash.replace(/^#\/?/, "").split(/[/?]/)[0] as Route
  return TABS.some(([id]) => id === r) ? r : ""
}
/** Lien de parrainage : site vitrine de NEXORA, page des tarifs, code mémorisé par le site. */
export function referralLink(code: string) {
  const site = location.pathname.replace(/referral\/?.*$/, "site/")
  return `${location.origin}${site}?parrain=${encodeURIComponent(code)}#/tarifs`
}

export function Portal({ me, onMe, onSignOut }: { me: Me; onMe: (m: Me) => void; onSignOut: () => void }) {
  const [route, setRoute] = useState<Route>(readRoute)
  const [dash, setDash] = useState<Dashboard | null>(null)
  const [err, setErr] = useState("")
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const on = () => setRoute(readRoute())
    addEventListener("hashchange", on)
    return () => removeEventListener("hashchange", on)
  }, [])
  useEffect(() => {
    let alive = true
    rpc<Dashboard>("nx_partner_dashboard").then(
      (d) => alive && (setDash(d), setErr("")),
      (e) => {
        if (!alive) return
        const m = e instanceof Error ? e.message : String(e)
        // Changement de mois pendant la visite : le code du nouveau mois est demandé.
        if (/code d’accès du mois/.test(m)) onMe({ ...me, needs_code: true })
        else setErr(m)
      },
    )
    return () => { alive = false }
  }, [tick]) // eslint-disable-line react-hooks/exhaustive-deps
  const reload = () => setTick((t) => t + 1)
  const first = String(me.name || "").trim().split(/\s+/)[0]

  return (
    <div className="portal">
      <header className="top">
        <Brand />
        <nav className="tabs" aria-label="Sections">
          {TABS.map(([id, label, icon]) => (
            <a key={id || "home"} href={`#/${id}`} className={route === id ? "on" : ""} aria-current={route === id ? "page" : undefined}>
              <Icon name={icon} size={15} />
              <span>{label}</span>
            </a>
          ))}
        </nav>
        <div className="who">
          <span className="avatar" aria-hidden="true">{(first || me.email || "?").slice(0, 1).toUpperCase()}</span>
          <span className="who-text"><b>{me.name}</b><small>{me.email}</small></span>
          <button className="icon-btn" title="Se déconnecter" aria-label="Se déconnecter" onClick={onSignOut}><Icon name="external" size={15} /></button>
        </div>
      </header>
      <main className="page" key={route}>
        {err ? (
          <div className="panel narrow"><p className="msg bad">{err}</p><button className="btn" onClick={reload}>Réessayer</button></div>
        ) : !dash ? (
          <div className="loading"><Spinner /></div>
        ) : route === "codes" ? (
          <Codes d={dash} onChange={reload} />
        ) : route === "filleuls" ? (
          <Filleuls d={dash} />
        ) : route === "gains" ? (
          <Gains d={dash} />
        ) : route === "retraits" ? (
          <Retraits d={dash} me={me} onChange={reload} />
        ) : (
          <Overview d={dash} first={first} />
        )}
      </main>
      <footer className="foot">
        <span><Icon name="key" size={13} /> Code d’accès valable jusqu’au {lastDay(me.code_expires_at)} : un nouveau code vous est transmis chaque mois.</span>
        <a href="/">Site de NEXORA</a>
      </footer>
    </div>
  )
}

function Head({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="head">
      <div><h1>{title}</h1>{sub && <p>{sub}</p>}</div>
      {children}
    </div>
  )
}

function Kpi({ icon, label, value, unit, hint, tone }: { icon: string; label: string; value: string; unit?: string; hint?: ReactNode; tone?: "rose" | "blue" }) {
  return (
    <div className={`kpi${tone ? ` ${tone}` : ""}`}>
      <small><span className="kpi-ic"><Icon name={icon} size={14} /></span>{label}</small>
      <b>{value}{unit && <em>{unit}</em>}</b>
      {hint && <span>{hint}</span>}
    </div>
  )
}

/* ---------------------------------------------------------------- Vue d'ensemble */

function Overview({ d, first }: { d: Dashboard; first: string }) {
  const [codes, setCodes] = useState<Code[] | null>(null)
  useEffect(() => { rpc<Code[]>("nx_partner_codes").then(setCodes, () => setCodes([])) }, [])
  const b = d.balance
  const r = d.rules
  const min = Number(r.min_payout_cents)
  const avail = Number(b.available_cents)
  const perPayer = (Number(r.month_cents) * Number(r.commission_pct)) / 100
  const main = codes && codes.find((c) => c.active)
  return (
    <>
      <Head title={`Bonjour${first ? ` ${first}` : ""}`} sub={`${plural(d.referrals, "filleul")} au total, dont ${d.referrals_month} ce mois-ci · ${usdTotal(d.month_cents)} gagnés ce mois-ci`} />
      <div className="kpis">
        <Kpi tone="rose" icon="sync" label="Revenus récurrents" value={usdTotal(d.recurring.commission_cents)} unit=" / mois" hint={plural(d.recurring.payers, "filleul payant", "filleuls payants")} />
        <Kpi icon="star" label="Disponible" value={usdFloor(avail)} hint={avail >= min ? "Vous pouvez demander un retrait." : `Retrait à partir de ${usd(min)}`} />
        <Kpi icon="clock" label="En attente" value={usdTotal(b.pending_cents)} hint={`Disponible ${r.hold_days} jours après chaque paiement`} />
        <Kpi tone="blue" icon="gift" label="Total gagné" value={usdTotal(b.earned_cents)} hint={`${usdTotal(b.paid_cents)} déjà versés`} />
      </div>
      <div className="cols">
        <section className="card">
          <div className="card-head"><h2>Gains des douze derniers mois</h2></div>
          <Bars series={d.series} />
        </section>
        <div className="stack">
          <section className="card">
            <div className="card-head"><h2>Vers votre prochain retrait</h2></div>
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={min} aria-valuenow={Math.min(avail, min)}>
              <i style={{ width: `${min > 0 ? Math.min(100, (avail / min) * 100) : 100}%` }} />
            </div>
            <p className="muted small">{avail >= min ? <>Vous avez atteint le minimum de {usd(min)}. <a href="#/retraits">Demander un retrait</a></> : <>{usdFloor(avail)} disponibles sur {usd(min)} : encore {usdTotal(min - avail)}.</>}</p>
          </section>
          <section className="card share">
            <div className="card-head"><h2>Votre lien de parrainage</h2></div>
            {codes === null ? <Spinner /> : main ? (
              <>
                <div className="share-code"><span>Code promo</span><b>{main.code}</b><CopyButton value={main.code} label="Code promo" small /></div>
                <div className="share-link"><code>{referralLink(main.code)}</code><CopyButton value={referralLink(main.code)} label="Lien" small /></div>
                <a className="link" href="#/codes">Tous mes codes et liens</a>
              </>
            ) : (
              <>
                <p className="muted small">Créez votre premier code promo : il donne aussi votre lien de parrainage.</p>
                <a className="btn primary sm" href="#/codes"><Icon name="plus" size={14} /> Créer un code</a>
              </>
            )}
          </section>
        </div>
      </div>
      <section className="card how">
        <div className="card-head"><h2>Comment vous gagnez</h2></div>
        <ol>
          <li><i>1</i><div><b>Votre filleul s’abonne avec votre code ou votre lien</b><p>Il paie l’offre Pro {usd(r.month_cents)} par mois au lieu de {usd(r.list_month_cents)} ({usd(r.year_cents)} par an au lieu de {usd(r.list_year_cents)}) : −{pct(r.discount_pct)} % à chaque paiement.</p></div></li>
          <li><i>2</i><div><b>Vous touchez {pct(r.commission_pct)} % de chaque paiement</b><p>Soit {usd(perPayer)} par mois et par filleul mensuel, {usd((Number(r.year_cents) * Number(r.commission_pct)) / 100)} par filleul annuel, tant que son abonnement continue.</p></div></li>
          <li><i>3</i><div><b>Vous retirez vos gains</b><p>Disponibles {r.hold_days} jours après chaque paiement, retirables à partir de {usd(min)} par {r.methods.map((m) => METHOD[m] || m).join(", ").replace(/, ([^,]*)$/, " ou $1")}.</p></div></li>
        </ol>
      </section>
    </>
  )
}

function Bars({ series }: { series: Dashboard["series"] }) {
  const max = Math.max(1, ...series.map((s) => Number(s.amount_cents)))
  if (!series.some((s) => Number(s.amount_cents) > 0)) return <Empty icon="sync" title="Pas encore de gains">Ils apparaissent ici dès le premier paiement d’un filleul.</Empty>
  return (
    <div className="bars" role="img" aria-label="Gains par mois">
      {series.map((s) => {
        const [y, m] = s.month.split("-").map(Number)
        const name = new Intl.DateTimeFormat("fr-FR", { month: "short" }).format(new Date(Date.UTC(y, m - 1, 15))).replace(".", "")
        const v = Number(s.amount_cents)
        return (
          <div className="bar" key={s.month} title={`${name} ${y} : ${usdTotal(v)}`}>
            <span className="bar-val">{v > 0 ? `${new Intl.NumberFormat("fr-FR").format(Math.round(v / 100))} $` : ""}</span>
            <div className="bar-track"><i style={{ height: `${(v / max) * 100}%` }} /></div>
            <small>{name}</small>
          </div>
        )
      })}
    </div>
  )
}

/* ---------------------------------------------------------------- Codes et liens */

function Codes({ d, onChange }: { d: Dashboard; onChange: () => void }) {
  const toast = useToast()
  const [list, setList] = useState<Code[] | null>(null)
  const [code, setCode] = useState("")
  const [label, setLabel] = useState("")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const load = () => rpc<Code[]>("nx_partner_codes").then(setList, (e) => setErr(e.message))
  useEffect(() => { load() }, [])
  async function create(e: FormEvent) {
    e.preventDefault()
    setErr("")
    setBusy(true)
    try {
      const c = await rpc<Code>("nx_partner_code_create", { p_code: code, p_label: label })
      toast(`Code ${c.code} créé.`)
      setCode("")
      setLabel("")
      await load()
      onChange()
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x))
    } finally {
      setBusy(false)
    }
  }
  async function toggle(c: Code) {
    try {
      await rpc("nx_partner_code_update", { p_id: c.id, p_active: !c.active })
      toast(c.active ? `Code ${c.code} désactivé.` : `Code ${c.code} réactivé.`)
      load()
    } catch (x) {
      toast(x instanceof Error ? x.message : String(x), true)
    }
  }
  const full = list ? list.length >= d.rules.max_codes : false
  return (
    <>
      <Head title="Codes et liens" sub={`Chaque code promo donne aussi un lien de parrainage. Le site garde votre lien ${d.rules.cookie_days} jours : votre filleul peut s’abonner plus tard.`} />
      <section className="card">
        <form className="create" onSubmit={create}>
          <label className="field grow">
            <span>Nouveau code promo</span>
            <input className="input code-input sm" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24))} placeholder="PRENOM25" required minLength={3} disabled={full} />
          </label>
          <label className="field grow">
            <span>Où vous le partagez (pour vous)</span>
            <input className="input" value={label} onChange={(e) => setLabel(e.target.value.slice(0, 60))} placeholder="Chaîne YouTube, groupe WhatsApp…" disabled={full} />
          </label>
          <button className="btn primary" disabled={busy || full}>{busy ? "Création…" : "Créer le code"}</button>
        </form>
        <p className="fine">3 à 24 lettres, chiffres ou tirets · {list ? `${list.length} / ${d.rules.max_codes} codes` : ""}</p>
        {err && <p className="msg bad" role="alert">{err}</p>}
      </section>
      {list === null ? <div className="loading"><Spinner /></div> : !list.length ? (
        <Empty icon="link" title="Aucun code pour l’instant">Créez un code par endroit où vous partagez NEXORA pour savoir lequel marche le mieux.</Empty>
      ) : (
        <div className="code-list">
          {list.map((c) => (
            <article key={c.id} className={`code-card${c.active ? "" : " off"}`}>
              <div className="code-top">
                <b className="code-name">{c.code}</b>
                {c.active ? <span className="pill ok">Actif</span> : <span className="pill">Désactivé</span>}
                <span className="grow" />
                <CopyButton value={c.code} label="Code promo" small />
              </div>
              {c.label && <p className="muted small">{c.label}</p>}
              <div className="share-link"><code>{referralLink(c.code)}</code><CopyButton value={referralLink(c.code)} label="Lien" small /></div>
              <dl className="code-stats">
                <div><dt>Filleuls</dt><dd>{c.referrals}</dd></div>
                <div><dt>Payants</dt><dd>{c.payers}</dd></div>
                <div><dt>Gains</dt><dd>{usdTotal(c.earned_cents)}</dd></div>
              </dl>
              <div className="code-foot">
                <small className="muted">Créé le {fmtDate(c.created_at)}</small>
                <button className="btn ghost sm" onClick={() => toggle(c)}>{c.active ? "Désactiver" : "Réactiver"}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- Filleuls */

function Filleuls({ d }: { d: Dashboard }) {
  const [list, setList] = useState<Filleul[] | null>(null)
  const [err, setErr] = useState("")
  useEffect(() => { rpc<Filleul[]>("nx_partner_referrals", { p_limit: 500 }).then(setList, (e) => setErr(e.message)) }, [])
  const SOURCE: Record<string, string> = { link: "Lien", code: "Code promo", admin: "Équipe NEXORA" }
  return (
    <>
      <Head title="Filleuls" sub={`${plural(d.referrals, "filleul")} · ${plural(d.recurring.payers, "payant")} en ce moment. Adresses masquées pour leur confidentialité.`} />
      {err && <p className="msg bad">{err}</p>}
      {list === null ? <div className="loading"><Spinner /></div> : !list.length ? (
        <Empty icon="group" title="Pas encore de filleul">Partagez votre lien ou votre code : vos filleuls apparaissent ici dès leur inscription.</Empty>
      ) : (
        <div className="rows">
          <div className="row-head"><span>Filleul</span><span>Arrivé par</span><span>Abonnement</span><span>Paiements</span><span className="num">Vos gains</span></div>
          {list.map((f, i) => (
            <div className="row-item" key={`${f.who}-${i}`}>
              <span><b>{f.who}</b><small>depuis le {fmtDate(f.since)}</small></span>
              <span>{SOURCE[f.source] || f.source}<small><code>{f.code}</code></small></span>
              <span>{f.active ? <span className="pill ok">Payant{f.period === "year" ? " · annuel" : " · mensuel"}</span> : f.payments ? <span className="pill bad">Arrêté</span> : <span className="pill">Pas encore abonné</span>}{f.renews_at && <small>renouvelé le {fmtDate(f.renews_at)}</small>}</span>
              <span>{f.payments}{f.last_payment_at && <small>dernier le {fmtDate(f.last_payment_at)}</small>}</span>
              <span className="num"><b>{usd(f.earned_cents)}</b></span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}

/* ---------------------------------------------------------------- Gains */

function Gains({ d }: { d: Dashboard }) {
  const [rows, setRows] = useState<Gain[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  async function more(offset: number) {
    setBusy(true)
    try {
      const r = await rpc<{ total: number; rows: Gain[] }>("nx_partner_commissions", { p_limit: 50, p_offset: offset })
      setTotal(r.total)
      setRows((x) => (offset ? [...x, ...r.rows] : r.rows))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  useEffect(() => { more(0) }, [])
  const b = d.balance
  return (
    <>
      <Head title="Historique des gains" sub={`Une ligne par paiement d’un filleul : ${pct(d.rules.commission_pct)} % de ce qu’il a payé, disponible ${d.rules.hold_days} jours plus tard.`} />
      <div className="kpis three">
        <Kpi icon="gift" label="Total gagné" value={usdTotal(b.earned_cents)} />
        <Kpi icon="clock" label="En attente" value={usdTotal(b.pending_cents)} />
        <Kpi icon="star" label="Disponible" value={usdFloor(b.available_cents)} hint={`${usdTotal(b.paid_cents)} versés · ${usdTotal(b.reserved_cents)} en cours de retrait`} />
      </div>
      {err && <p className="msg bad">{err}</p>}
      {total === null ? <div className="loading"><Spinner /></div> : !rows.length ? (
        <Empty icon="gift" title="Pas encore de gains">Chaque paiement de vos filleuls ajoute une ligne ici.</Empty>
      ) : (
        <div className="rows">
          <div className="row-head"><span>Date</span><span>Filleul</span><span>Payé</span><span>État</span><span className="num">Votre commission</span></div>
          {rows.map((g) => (
            <div className={`row-item${g.state === "canceled" ? " off" : ""}`} key={g.id}>
              <span><b>{fmtDate(g.at)}</b><small>{g.period === "year" ? "abonnement annuel" : "abonnement mensuel"}</small></span>
              <span>{g.who || "Compte supprimé"}</span>
              <span>{usd(g.paid_cents)}{g.list_cents > g.paid_cents && <small>au lieu de {usd(g.list_cents)}</small>}</span>
              <span>{g.state === "pending" ? <span className="pill warn">Disponible le {fmtDate(g.available_at)}</span> : g.state === "available" ? <span className="pill ok">Disponible</span> : <span className="pill bad">Annulée{g.note ? ` · ${g.note}` : ""}</span>}</span>
              <span className="num"><b>{usd(g.amount_cents)}</b><small>{pct(g.rate)} %</small></span>
            </div>
          ))}
        </div>
      )}
      {total !== null && rows.length < total && <div className="center"><button className="btn" disabled={busy} onClick={() => more(rows.length)}>{busy ? "Chargement…" : "Voir plus"}</button></div>}
    </>
  )
}

/* ---------------------------------------------------------------- Retraits */

const PAYOUT_STATE: Record<string, [string, string]> = { requested: ["Demandé", "warn"], approved: ["Approuvé", "blue"], paid: ["Versé", "ok"], rejected: ["Refusé", "bad"], canceled: ["Annulé", ""] }

function Retraits({ d, me, onChange }: { d: Dashboard; me: Me; onChange: () => void }) {
  const toast = useToast()
  const [list, setList] = useState<Payout[] | null>(null)
  const methods = d.rules.methods
  const [method, setMethod] = useState(me.payout_method && methods.includes(me.payout_method) ? me.payout_method : methods[0])
  const [details, setDetails] = useState(me.payout_details || "")
  const min = Number(d.rules.min_payout_cents)
  const avail = Math.floor(Number(d.balance.available_cents))
  const [amount, setAmount] = useState(String(Math.floor(avail / 100)))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const load = () => rpc<Payout[]>("nx_partner_payouts").then(setList, (e) => setErr(e.message))
  useEffect(() => { load() }, [])
  const cents = Math.round(Number(String(amount).replace(",", ".")) * 100) || 0
  const open = d.open_payout
  const can = !open && avail >= min
  const why = useMemo(() => (open ? "Une demande est déjà en cours." : avail < min ? `Encore ${usd(min - avail)} avant le minimum de ${usd(min)}.` : ""), [open, avail, min])

  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr("")
    if (cents < min) { setErr(`Le retrait minimum est de ${usd(min)}.`); return }
    if (cents > avail) { setErr(`Au plus ${usdFloor(avail)} (vos gains disponibles).`); return }
    setBusy(true)
    try {
      await rpc("nx_partner_payout_request", { p_amount_cents: cents, p_method: method, p_details: details })
      toast("Demande de retrait envoyée à l’équipe NEXORA.")
      load()
      onChange()
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x))
    } finally {
      setBusy(false)
    }
  }
  async function cancel(p: Payout) {
    try {
      await rpc("nx_partner_payout_cancel", { p_id: p.id })
      toast("Demande annulée : le montant revient dans vos gains disponibles.")
      load()
      onChange()
    } catch (x) {
      toast(x instanceof Error ? x.message : String(x), true)
    }
  }
  return (
    <>
      <Head title="Retraits" sub={`À partir de ${usd(min)}. L’équipe NEXORA verse vos gains et vous indique la référence du versement.`} />
      <div className="cols">
        <section className="card">
          <div className="card-head"><h2>Demander un retrait</h2><span className="pill blue">{usdFloor(avail)} disponibles</span></div>
          {open ? (
            <div className="open-payout">
              <p><b>{usd(open.amount_cents)}</b> par {METHOD[open.method] || open.method} · demandé le {fmtDate(open.requested_at)}</p>
              <span className={`pill ${PAYOUT_STATE[open.status][1]}`}>{PAYOUT_STATE[open.status][0]}</span>
              <p className="muted small">L’équipe traite les demandes sous quelques jours ouvrés.</p>
              {open.status === "requested" && <button className="btn ghost sm" onClick={() => cancel(open)}>Annuler la demande</button>}
            </div>
          ) : (
            <form className="form" onSubmit={submit}>
              <label className="field">
                <span>Montant ($)</span>
                <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.,]/g, ""))} disabled={!can} />
                <small>De {usd(min)} à {usdFloor(avail)}.</small>
              </label>
              <div className="field">
                <span>Moyen de versement</span>
                <div className="seg" role="radiogroup" aria-label="Moyen de versement">
                  {methods.map((m) => (
                    <button type="button" key={m} role="radio" aria-checked={method === m} className={method === m ? "on" : ""} onClick={() => setMethod(m)} disabled={!can}>{METHOD[m] || m}</button>
                  ))}
                </div>
              </div>
              <label className="field">
                <span>{METHOD_HINT[method] || "Coordonnées"}</span>
                <input className="input" value={details} onChange={(e) => setDetails(e.target.value.slice(0, 300))} required minLength={4} disabled={!can}
                  placeholder={method === "paypal" ? "prenom@exemple.com" : method === "bank" ? "FR76 … · Prénom Nom" : "+225 07 00 00 00 00 · Orange Money"} />
              </label>
              {why && <p className="msg">{why}</p>}
              {err && <p className="msg bad" role="alert">{err}</p>}
              <button className="btn primary block" disabled={!can || busy}>{busy ? "Envoi…" : `Demander ${cents > 0 ? usd(cents) : "le retrait"}`}</button>
            </form>
          )}
        </section>
        <section className="card">
          <div className="card-head"><h2>Vos retraits</h2></div>
          {list === null ? <Spinner /> : !list.length ? (
            <Empty icon="download" title="Aucun retrait pour l’instant">Vos demandes et leurs versements apparaissent ici.</Empty>
          ) : (
            <ul className="payouts">
              {list.map((p) => (
                <li key={p.id}>
                  <span><b>{usd(p.amount_cents)}</b><small>{METHOD[p.method] || p.method} · {fmtDate(p.requested_at)}</small></span>
                  <span className="right">
                    <span className={`pill ${PAYOUT_STATE[p.status]?.[1] || ""}`}>{PAYOUT_STATE[p.status]?.[0] || p.status}</span>
                    {p.reference && <small>réf. {p.reference}</small>}
                    {p.note && <small>{p.note}</small>}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
