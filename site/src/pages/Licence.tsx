// NEXORA #076 : « Ma licence ». NEXORA Devs Toolbox ne démarre qu'avec une licence validée par le serveur : ici,
// l'utilisateur crée son compte ou s'y connecte, obtient sa clé gratuite, voit ses appareils et son essai, passe à
// Pro (paiement dans le navigateur) et gère son abonnement. #/licence/verifier : vérification publique d'une clé.
import { useEffect, useState, type FormEvent } from "react"
import { SectionHead } from "../components/SectionHead"
import { DownloadButton } from "../components/Download"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { money, useRemote } from "../lib/remote"
import {
  KEY_RE, myLicence, pay, recover, releaseDevice, session, sessionFromLink, signIn, signOut, signUp, verifyKey,
  type Licence as Lic, type Session, type Verify,
} from "../lib/account"

const date = (iso?: string | null, time = false) =>
  iso ? new Date(iso).toLocaleString("fr-FR", time ? { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "long", year: "numeric" }) : ""

function AuthCard({ onSession }: { onSession: (s: Session) => void }) {
  const [mode, setMode] = useState<"login" | "signup" | "forgot">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ kind: "ok" | "bad"; text: string } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === "forgot") {
        await recover(email.trim())
        setMsg({ kind: "ok", text: "Si un compte existe avec cette adresse, un lien pour choisir un nouveau mot de passe vient de partir." })
      } else if (mode === "signup") {
        if (password.length < 8) throw new Error("Le mot de passe doit contenir au moins 8 caractères.")
        const s = await signUp(email.trim(), password)
        if (s) onSession(s)
        else setMsg({ kind: "ok", text: "Compte créé. Ouvre le lien reçu par e-mail pour le confirmer : ta licence s’affichera ici." })
      } else {
        onSession(await signIn(email.trim(), password))
      }
    } catch (err) {
      setMsg({ kind: "bad", text: err instanceof Error ? err.message : String(err) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="lic-card lic-auth" onSubmit={submit} noValidate>
      {mode !== "forgot" ? (
        <div className="lic-tabs" role="tablist" aria-label="Compte NEXORA">
          <button type="button" role="tab" aria-selected={mode === "login"} onClick={() => { setMode("login"); setMsg(null) }}>Connexion</button>
          <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => { setMode("signup"); setMsg(null) }}>Créer un compte</button>
        </div>
      ) : (
        <h2 className="lic-h">Mot de passe oublié</h2>
      )}
      <label className="lic-field">
        <span>Adresse e-mail</span>
        <span className="lic-input"><Icon name="mail" size={16} /><input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" /></span>
      </label>
      {mode !== "forgot" && (
        <label className="lic-field">
          <span>Mot de passe</span>
          <span className="lic-input"><Icon name="lock" size={16} /><input type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} value={password} onChange={(e) => setPassword(e.target.value)} placeholder={mode === "signup" ? "8 caractères minimum" : ""} /></span>
        </label>
      )}
      {msg && <p className={`lic-msg ${msg.kind}`} role="status">{msg.text}</p>}
      <button className="btn btn-primary btn-lg lic-submit" type="submit" disabled={busy || !email.trim() || (mode !== "forgot" && !password)}>
        {busy ? "Un instant…" : mode === "login" ? "Se connecter" : mode === "signup" ? "Créer mon compte et ma licence" : "Envoyer le lien"}
      </button>
      <p className="lic-foot">
        {mode === "forgot" ? (
          <button type="button" className="lic-link" onClick={() => { setMode("login"); setMsg(null) }}>Retour à la connexion</button>
        ) : (
          <button type="button" className="lic-link" onClick={() => { setMode("forgot"); setMsg(null) }}>Mot de passe oublié ?</button>
        )}
        <span>Même compte que dans NEXORA.</span>
      </p>
    </form>
  )
}

function KeyCard({ lic }: { lic: Lic }) {
  const [copied, setCopied] = useState(false)
  const pro = lic.plan === "pro" && !lic.trial
  return (
    <Reveal className="lic-card lic-key">
      <div className="lic-key-top">
        <span className={`plan-tag ${pro || lic.trial ? "pro" : "free"}`}>{lic.trial ? "Essai Pro" : lic.plan_name || (pro ? "Pro" : "Gratuit")}</span>
        {lic.status !== "active" ? <span className="lic-state bad">Licence révoquée</span> : <span className="lic-state ok"><Icon name="check" size={13} stroke={2.6} />Active</span>}
      </div>
      <small className="lic-k">Ta clé de licence</small>
      <code className="lic-code" aria-label="Clé de licence">{lic.key}</code>
      <div className="lic-acts">
        <button type="button" className="btn btn-ghost" onClick={() => { navigator.clipboard?.writeText(lic.key).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1800) }) }}>
          <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copiée" : "Copier la clé"}
        </button>
        <a className="btn btn-primary" href={`nexora://licence?key=${encodeURIComponent(lic.key)}`}>
          <Icon name="external" size={16} /> Ouvrir NEXORA Devs Toolbox
        </a>
      </div>
      <p className="lic-note">
        {lic.trial
          ? `Ton premier jour est un essai complet de Pro, jusqu’au ${date(lic.trial_ends_at, true)}. Ensuite, l’offre Gratuite s’applique : Responsive Lab et Browser Lab restent entièrement ouverts.`
          : lic.activated_at
            ? `Activée le ${date(lic.activated_at)}. NEXORA vérifie ta licence auprès du serveur à chaque démarrage.`
            : "Lance NEXORA Devs Toolbox et connecte-toi avec ce compte : la licence s’active toute seule. Tu peux aussi coller la clé."}
      </p>
    </Reveal>
  )
}

function PlanCard({ lic, s }: { lic: Lic; s: Session }) {
  const { plans } = useRemote()
  const pro = plans.find((p) => p.id === "pro")
  const [period, setPeriod] = useState<"month" | "year">("month")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const paid = lic.paid_plan === "pro"
  const b = lic.billing

  async function go(kind: "checkout" | "portal") {
    setBusy(true)
    setErr("")
    try {
      location.href = await pay(kind, s, period)
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  if (paid) {
    return (
      <Reveal className="lic-card lic-plan paid" delay={80}>
        <span className="lic-ic"><Icon name="nxCrown" size={20} /></span>
        <h3>Offre Pro active</h3>
        <p>
          {lic.granted
            ? `Offerte par l’équipe NEXORA${lic.granted_until ? ` jusqu’au ${date(lic.granted_until)}` : ", sans date de fin"}.`
            : b && b.current_period_end
            ? b.cancel_at_period_end
              ? `Résiliée : Pro reste ouvert jusqu’au ${date(b.current_period_end)}, puis l’offre Gratuite s’applique.`
              : `Abonnement ${b.period === "year" ? "annuel" : "mensuel"} renouvelé le ${date(b.current_period_end)}.`
            : "Abonnement attribué par l’équipe NEXORA."}
          {b && b.status === "past_due" ? " Le dernier paiement a échoué : mets à jour ton moyen de paiement." : ""}
        </p>
        {err && <p className="lic-msg bad" role="status">{err}</p>}
        <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => go("portal")}>
          <Icon name="external" size={16} /> Gérer mon abonnement
        </button>
      </Reveal>
    )
  }
  const month = pro?.price_month_cents ?? 1800
  const year = pro?.price_year_cents ?? 18000
  return (
    <Reveal className="lic-card lic-plan" delay={80}>
      <span className="lic-ic"><Icon name="nxCrown" size={20} /></span>
      <h3>Passe à Pro</h3>
      <p>Dev Lab, App Builder, Desktop Builder, Studio et NEX-DESIGN complets, et des limites larges.</p>
      <div className="lic-period" role="radiogroup" aria-label="Périodicité">
        <button type="button" role="radio" aria-checked={period === "month"} onClick={() => setPeriod("month")}>Mensuel</button>
        <button type="button" role="radio" aria-checked={period === "year"} onClick={() => setPeriod("year")}>Annuel <small>2 mois offerts</small></button>
      </div>
      <p className="lic-price"><b>{money(period === "year" ? year : month)}</b><span>{period === "year" ? " / an" : " / mois"}</span></p>
      {err && <p className="lic-msg bad" role="status">{err}</p>}
      <button type="button" className="btn btn-primary btn-lg" disabled={busy} onClick={() => go("checkout")}>
        {busy ? "Ouverture du paiement…" : "Passer à Pro"}
      </button>
      <small className="lic-fine">Paiement sécurisé dans ton navigateur, sans engagement. NEXORA passe en Pro au contrôle de licence suivant.</small>
    </Reveal>
  )
}

function Devices({ lic, s, onChange }: { lic: Lic; s: Session; onChange: () => void }) {
  const [busy, setBusy] = useState("")
  const [err, setErr] = useState("")
  const active = lic.devices.filter((d) => !d.released).length
  async function release(id: string) {
    setBusy(id)
    setErr("")
    try { await releaseDevice(s, id); onChange() } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setBusy("") }
  }
  return (
    <Reveal className="lic-card lic-devices" delay={140}>
      <h3><Icon name="laptop" size={18} /> Ordinateurs{lic.max_devices ? <small className="lic-count">{active} / {lic.max_devices}</small> : null}</h3>
      {lic.devices.length ? (
        <ul>
          {lic.devices.map((d, i) => (
            <li key={`${d.id || d.name}-${i}`} className={d.released ? "off" : ""}>
              <b>{d.name || "PC Windows"}{d.released ? " · libéré" : ""}</b>
              <span>{[d.os, d.app_version && `NEXORA ${d.app_version}`].filter(Boolean).join(" · ")}</span>
              <small>Dernière connexion le {date(d.last_seen, true)}{d.last_ip ? ` · adresse ${d.last_ip}` : ""}</small>
              {d.id && !d.released && <button type="button" className="lic-link" disabled={busy === d.id} onClick={() => release(d.id as string)}>{busy === d.id ? "…" : "Libérer cet ordinateur"}</button>}
            </li>
          ))}
        </ul>
      ) : (
        <p className="lic-note">Aucun ordinateur pour l’instant : ils apparaissent ici dès le premier démarrage de NEXORA.</p>
      )}
      {err && <p className="lic-msg bad" role="status">{err}</p>}
      <p className="lic-fine">Libère un ordinateur que tu n’utilises plus pour en ajouter un autre. Un ordinateur inconnu ? Change ton mot de passe et écris à l’assistance.</p>
    </Reveal>
  )
}

function Verifier() {
  const [key, setKey] = useState("")
  const [busy, setBusy] = useState(false)
  const [res, setRes] = useState<Verify | null>(null)
  const [err, setErr] = useState("")
  const norm = key.trim().toUpperCase()
  async function submit(e: FormEvent) {
    e.preventDefault()
    setErr("")
    setRes(null)
    if (!KEY_RE.test(norm)) { setErr("Une clé NEXORA a la forme NXDT-XXXX-XXXX-XXXX-XXXX."); return }
    setBusy(true)
    try { setRes(await verifyKey(norm)) } catch (e2) { setErr(e2 instanceof Error ? e2.message : String(e2)) } finally { setBusy(false) }
  }
  return (
    <form className="lic-card lic-verify" onSubmit={submit} id="verifier">
      <h3><Icon name="shield" size={18} /> Vérifier une clé</h3>
      <p className="lic-note">Pour t’assurer qu’une clé est authentique avant de l’utiliser. Le titulaire n’est jamais affiché en entier.</p>
      <div className="lic-row">
        <span className="lic-input"><Icon name="key" size={16} /><input value={key} onChange={(e) => setKey(e.target.value)} placeholder="NXDT-XXXX-XXXX-XXXX-XXXX" spellCheck={false} autoCapitalize="characters" aria-label="Clé de licence" /></span>
        <button className="btn btn-ghost" type="submit" disabled={busy || !norm}>{busy ? "…" : "Vérifier"}</button>
      </div>
      {err && <p className="lic-msg bad" role="status">{err}</p>}
      {res && (
        <p className={`lic-msg ${res.valid ? "ok" : "bad"}`} role="status">
          {res.valid
            ? `Clé authentique et active · offre ${res.plan_name || res.plan} · titulaire ${res.holder} · créée le ${date(res.created_at)}${res.activated ? "" : " · pas encore activée"}.`
            : res.reason === "unknown"
              ? "Cette clé n’existe pas. Vérifie chaque caractère."
              : "Cette clé existe mais a été révoquée : elle ne permet plus de démarrer NEXORA."}
        </p>
      )}
    </form>
  )
}

export function Licence({ query }: { query: string }) {
  const [s, setS] = useState<Session | null>(null)
  const [lic, setLic] = useState<Lic | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState("")
  const params = new URLSearchParams(query)
  const paiement = params.get("paiement")

  async function load(sess: Session | null) {
    setS(sess)
    setErr("")
    if (!sess) { setLic(null); setLoading(false); return }
    setLoading(true)
    try { setLic(await myLicence(sess)) } catch (e) { setErr(e instanceof Error ? e.message : String(e)) } finally { setLoading(false) }
  }

  useEffect(() => {
    sessionFromLink()
    session().then(load)
  }, [])

  return (
    <>
      <section className="page-hero lic-hero" data-light>
        <i className="grid-bg" aria-hidden="true" />
        <i className="grid-lit" aria-hidden="true" />
        <i className="torch" aria-hidden="true" />
        <div className="container">
          <SectionHead
            as="h1"
            align="left"
            eyebrow="Ma licence"
            title={["Ta licence NEXORA,", "toujours à portée."]}
            lead="NEXORA Devs Toolbox démarre avec une licence vérifiée par nos serveurs. Elle est gratuite : crée ton compte, récupère ta clé, puis passe à Pro quand tu en as besoin."
          />
          {paiement === "ok" && <p className="lic-banner ok"><Icon name="pass" size={16} /> Paiement reçu. Ton offre Pro s’active dans quelques secondes ; NEXORA la prend en compte au prochain contrôle.</p>}
          {paiement === "annule" && <p className="lic-banner"><Icon name="info" size={16} /> Paiement annulé : rien n’a été débité.</p>}
          <div className="lic-grid">
            {loading ? (
              <div className="lic-card lic-wait"><span className="lic-spin" aria-hidden="true" /> Lecture de ta licence…</div>
            ) : !s ? (
              <>
                <AuthCard onSession={load} />
                <ul className="lic-points">
                  <li><Icon name="key" size={18} /><div><b>Une licence gratuite par compte</b><span>Générée tout de suite, liée à ton adresse e-mail.</span></div></li>
                  <li><Icon name="star" size={18} /><div><b>24 h d’essai complet</b><span>Le premier jour, tout Pro est ouvert. Ensuite, Responsive Lab et Browser Lab restent gratuits.</span></div></li>
                  <li><Icon name="shield" size={18} /><div><b>Vérifiée à chaque démarrage</b><span>Connexion signée avec nos serveurs : sans licence valide, NEXORA ne s’ouvre pas.</span></div></li>
                  <li><Icon name="download" size={18} /><div><b>Un lanceur léger</b><span>Il télécharge, vérifie et met à jour NEXORA pour toi.</span></div></li>
                </ul>
              </>
            ) : err ? (
              <div className="lic-card"><p className="lic-msg bad">{err}</p><button type="button" className="btn btn-ghost" onClick={() => session().then(load)}>Réessayer</button></div>
            ) : lic ? (
              <>
                <KeyCard lic={lic} />
                <PlanCard lic={lic} s={s} />
                <Devices lic={lic} s={s} onChange={() => load(s)} />
                <div className="lic-card lic-me">
                  <span>Connecté en tant que <b>{s.email}</b></span>
                  <div className="lic-acts">
                    <DownloadButton size="sm" variant="ink" label="Télécharger le lanceur" />
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => signOut().then(() => load(null))}>Se déconnecter</button>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </section>
      <section className="section tight">
        <div className="container lic-verify-wrap">
          <Verifier />
        </div>
      </section>
    </>
  )
}
