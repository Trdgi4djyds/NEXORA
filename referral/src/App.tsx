// NEXORA #090 : parcours d'accès des parrains. Le back office crée le parrain et lui transmet un lien d'invitation
// (#/invitation/<jeton>) et un code d'accès qui change chaque mois. Accès : lien de connexion reçu à l'adresse invitée
// (Supabase Auth), puis code (activation au premier passage, puis une fois par mois). Ensuite : l'espace (Portal).
// NEXORA #127 : tout arrive par e-mail (migration 20261116000001) : le lien de l'invitation porte le code
// (#/invitation/<jeton>/<code>), celui du code du mois aussi (#/code/<code>) ; adresse et code sont pré-remplis, et
// « Recevoir mon code par e-mail » renvoie le code à l'adresse du parrain.
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { Portal } from "./Portal"
import { errText, rpc, sb, type CodeResult, type Me } from "./supabase"
import { Brand, DEFAULT_RULES, fmtTime, Icon, lastDay, pct, Spinner } from "./ui"

const INVITE_KEY = "nexora-referral-invite"
const TOKEN_RE = /^[0-9a-f]{64}$/
const CODE_RE = /^[A-Z0-9]{4}-?[A-Z0-9]{4}$/i

type Link = { token: string; code: string }
/** Jeton d'invitation et code reçus par e-mail : ceux de l'adresse (#/invitation/<jeton>[/<code>], #/code/<code>),
 * sinon ceux gardés avant l'envoi du lien de connexion (le retour du lien de connexion n'a plus le #). */
function readInvite(): Link {
  const inv = /^#\/invitation\/([0-9a-f]{64})(?:\/([A-Za-z0-9-]{8,9}))?/.exec(location.hash)
  const only = /^#\/code\/([A-Za-z0-9-]{8,9})/.exec(location.hash)
  const found: Link | null = inv ? { token: inv[1], code: inv[2] || "" } : only ? { token: "", code: only[1] } : null
  if (found) {
    if (!CODE_RE.test(found.code)) found.code = ""
    try { localStorage.setItem(INVITE_KEY, JSON.stringify({ ...found, at: Date.now() })) } catch { /* stockage refusé */ }
    return found
  }
  try {
    const saved = JSON.parse(localStorage.getItem(INVITE_KEY) || "null") as (Partial<Link> & { at?: number }) | null
    if (saved && Date.now() - Number(saved.at || 0) < 7 * 86400000) {
      return { token: saved.token && TOKEN_RE.test(saved.token) ? saved.token : "", code: saved.code && CODE_RE.test(saved.code) ? saved.code : "" }
    }
  } catch { /* valeur illisible */ }
  return { token: "", code: "" }
}
function forgetInvite() {
  try { localStorage.removeItem(INVITE_KEY) } catch { /* sans effet */ }
  if (/^#\/(invitation|code)\//.test(location.hash)) history.replaceState(null, "", `${location.pathname}#/`)
}
/** Code au format XXXX-XXXX. */
const fmtCode = (v: string) => {
  const raw = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8)
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw
}

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [me, setMe] = useState<Me | null>(null)
  const [err, setErr] = useState("")
  const [link] = useState(readInvite)
  const invite = link.token

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])
  // Retour du lien de connexion (?code=…) : la session est créée par supabase-js, l'adresse est nettoyée.
  useEffect(() => {
    if (session && /[?&]code=/.test(location.search)) history.replaceState(null, "", `${location.pathname}${location.hash || "#/"}`)
  }, [session])
  useEffect(() => {
    if (!session) { setMe(null); return }
    let alive = true
    setErr("")
    rpc<Me>("nx_partner_me").then((m) => alive && setMe(m), (e) => alive && setErr(e instanceof Error ? e.message : errText(e)))
    return () => { alive = false }
  }, [session])

  if (session === undefined) return <Splash />
  if (!session) return <SignIn invite={invite} />
  if (err) return <Frame><div className="panel narrow"><p className="msg bad">{err}</p><button className="btn" onClick={() => location.reload()}>Réessayer</button></div></Frame>
  if (!me) return <Splash />
  const signOut = () => sb.auth.signOut()
  if (!me.partner) {
    if (invite) return <CodeStep mode="activate" token={invite} initial={link.code} email={session.user.email || ""} onDone={(m) => { forgetInvite(); setMe(m) }} onSignOut={signOut} />
    return <NotPartner me={me} onSignOut={signOut} />
  }
  if (me.status === "suspended") {
    return (
      <Frame onSignOut={signOut}>
        <div className="panel narrow center">
          <span className="big-ic warn"><Icon name="lock" size={22} /></span>
          <h1>Accès suspendu</h1>
          <p className="muted">Votre accès de parrain est suspendu : vos codes promo ne fonctionnent plus pour l’instant. Écrivez à l’équipe NEXORA pour en savoir plus.</p>
        </div>
      </Frame>
    )
  }
  if (me.needs_code) return <CodeStep mode="unlock" initial={link.code} email={session.user.email || ""} me={me} onDone={(m) => { forgetInvite(); setMe(m) }} onSignOut={signOut} />
  if (invite || link.code) forgetInvite()
  return <Portal me={me} onMe={setMe} onSignOut={signOut} />
}

function Splash() {
  return <div className="splash"><Spinner /></div>
}


/** Écran d'accès : marque, contenu centré, pied de page. */
function Frame({ children, onSignOut }: { children: ReactNode; onSignOut?: () => void }) {
  return (
    <div className="auth">
      <header className="auth-top">
        <Brand />
        {onSignOut && <button className="btn ghost sm" onClick={onSignOut}><Icon name="external" size={14} /> Se déconnecter</button>}
      </header>
      <main className="auth-main">{children}</main>
      <footer className="auth-foot">Espace réservé aux parrains invités par l’équipe NEXORA · <a href="/">Site de NEXORA</a></footer>
    </div>
  )
}

function Steps({ at }: { at: 1 | 2 }) {
  return (
    <ol className="steps" aria-label="Étapes">
      <li className={at === 1 ? "on" : "done"}><i>{at > 1 ? <Icon name="check" size={12} /> : 1}</i>Adresse e-mail</li>
      <li className={at === 2 ? "on" : ""}><i>2</i>Code d’accès</li>
    </ol>
  )
}

type Invite = { valid: boolean; reason?: string; email?: string; address?: string; name?: string; expires_at?: string }

function SignIn({ invite }: { invite: string }) {
  const [info, setInfo] = useState<Invite | null>(null)
  const [email, setEmail] = useState("")
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState("")
  const [err, setErr] = useState("")
  const [wait, setWait] = useState(0)
  useEffect(() => {
    if (!invite) return
    rpc<Invite>("nx_partner_invite_info", { p_token: invite }).then((i) => {
      setInfo(i)
      // NEXORA #127 : adresse invitée pré-remplie (un clic pour recevoir le lien de connexion).
      if (i.valid && i.address) setEmail((e) => e || i.address || "")
    }, () => setInfo({ valid: false, reason: "server" }))
  }, [invite])
  useEffect(() => {
    if (!wait) return
    const t = setTimeout(() => setWait((w) => Math.max(0, w - 1)), 1000)
    return () => clearTimeout(t)
  }, [wait])

  async function send(e?: FormEvent) {
    e?.preventDefault()
    const v = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setErr("Saisissez une adresse e-mail valide."); return }
    setBusy(true)
    setErr("")
    // Avec une invitation, le compte NEXORA est créé s'il n'existe pas ; sans invitation, seul un compte existant reçoit un lien.
    const { error } = await sb.auth.signInWithOtp({ email: v, options: { emailRedirectTo: `${location.origin}${location.pathname}`, shouldCreateUser: Boolean(invite && info?.valid) } })
    setBusy(false)
    if (error) { setErr(errText(error)); return }
    setSent(v)
    setWait(60)
  }

  const invalid = invite && info && !info.valid
  return (
    <Frame>
      <div className="auth-grid">
        <section className="pitch">
          <span className="eyebrow"><Icon name="gift" size={13} /> Programme de parrainage</span>
          <h1>{invite && info?.valid ? <>Bienvenue{info.name ? `, ${info.name}` : ""}.<br /><em>Votre espace de parrain vous attend.</em></> : <>Partage NEXORA.<br /><em>Gagnez à chaque paiement.</em></>}</h1>
          <p>Vos filleuls ont {pct(DEFAULT_RULES.discount_pct)} % de remise sur l’offre Pro, à chaque paiement. Vous touchez {pct(DEFAULT_RULES.commission_pct)} % de ce qu’ils paient, remise déduite, tant que leur abonnement continue.</p>
          <ul className="pitch-list">
            <li><Icon name="link" size={16} />Créez vos codes promo et vos liens de parrainage</li>
            <li><Icon name="sync" size={16} />Suivez vos revenus récurrents, filleul par filleul</li>
            <li><Icon name="download" size={16} />Demandez vos retraits : PayPal, virement ou Mobile Money</li>
          </ul>
        </section>
        <section className="panel">
          {invite && <Steps at={1} />}
          {invalid ? (
            <>
              <h2>Lien d’invitation expiré</h2>
              <p className="muted">{info?.reason === "suspended" ? "Cet accès de parrain est suspendu." : "Ce lien a déjà servi ou a été remplacé par un plus récent, envoyé par e-mail. Si votre accès est déjà activé, connectez-vous avec votre adresse e-mail ; sinon, ouvrez le dernier e-mail d’invitation reçu."}</p>
            </>
          ) : sent ? (
            <>
              <span className="big-ic"><Icon name="mail" size={22} /></span>
              <h2>Vérifiez votre boîte de réception</h2>
              <p className="muted">Un lien de connexion vient d’être envoyé à <b>{sent}</b>. Ouvrez-le <b>sur cet appareil</b>{invite ? " : votre code d’accès sera déjà rempli" : ""}. Il expire dans une heure ; pensez à regarder dans les courriers indésirables.</p>
              <div className="row">
                <button className="btn" disabled={busy || wait > 0} onClick={() => send()}>{wait > 0 ? `Renvoyer dans ${wait} s` : "Renvoyer le lien"}</button>
                <button className="btn ghost" onClick={() => { setSent(""); setErr("") }}>Changer d’adresse</button>
              </div>
            </>
          ) : (
            <form onSubmit={send} className="form">
              <h2>{invite ? "Activez votre accès" : "Connexion des parrains"}</h2>
              <p className="muted">
                {invite && info?.valid ? <>Connectez-vous avec l’adresse invitée, <b>{info.email}</b>. Vous recevrez un lien de connexion, sans mot de passe.</> : "Saisissez l’adresse e-mail de votre accès de parrain : vous recevrez un lien de connexion, sans mot de passe."}
              </p>
              <label className="field">
                <span>Adresse e-mail</span>
                <input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="prenom@exemple.com" autoFocus />
              </label>
              {err && <p className="msg bad" role="alert">{err}</p>}
              <button className="btn primary block" disabled={busy || Boolean(invite && !info)}>{busy ? "Envoi…" : "Recevoir mon lien de connexion"}</button>
              {!invite && <p className="fine">Pas encore parrain ? L’accès se fait sur invitation de l’équipe NEXORA.</p>}
            </form>
          )}
        </section>
      </div>
    </Frame>
  )
}

/** Code d'accès : activation (lien d'invitation + code) ou code du mois. */
function CodeStep({ mode, token, initial, email, me, onDone, onSignOut }: { mode: "activate" | "unlock"; token?: string; initial?: string; email: string; me?: Me; onDone: (m: Me) => void; onSignOut: () => void }) {
  const [code, setCode] = useState(() => fmtCode(initial || ""))
  const [mailMsg, setMailMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [mailing, setMailing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const [wrongMail, setWrongMail] = useState("")
  const locked = me?.locked_until && new Date(me.locked_until).getTime() > Date.now() ? me.locked_until : ""
  const month = new Intl.DateTimeFormat("fr-FR", { month: "long" }).format(new Date())

  function onInput(v: string) {
    setCode(fmtCode(v))
  }
  // NEXORA #127 : code renvoyé à l'adresse du parrain (une fois toutes les 5 minutes).
  async function mailCode() {
    setMailing(true)
    setMailMsg(null)
    try {
      const r = await rpc<{ sent: boolean; reason?: string; to?: string }>("nx_partner_code_mail")
      if (r.sent) setMailMsg({ ok: true, text: `Code envoyé à ${r.to}. Ouvrez l’e-mail et cliquez sur le bouton : le code sera rempli pour vous.` })
      else if (r.reason === "recent") setMailMsg({ ok: true, text: `Un e-mail vient déjà de partir vers ${r.to} : regardez votre boîte de réception et les courriers indésirables.` })
      else if (r.reason === "partner") setMailMsg({ ok: false, text: "Ce compte n’a pas d’accès parrain : connectez-vous avec l’adresse qui a reçu l’invitation." })
      else if (r.reason === "suspended") setMailMsg({ ok: false, text: "Votre accès de parrain est suspendu." })
      else setMailMsg({ ok: false, text: "L’e-mail n’a pas pu partir pour l’instant : réessayez dans quelques minutes." })
    } catch (x) {
      setMailMsg({ ok: false, text: x instanceof Error ? x.message : errText(x) })
    } finally {
      setMailing(false)
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (code.replace("-", "").length !== 8) { setErr("Le code d’accès compte 8 caractères (XXXX-XXXX)."); return }
    setBusy(true)
    setErr("")
    try {
      const r = mode === "activate" ? await rpc<CodeResult>("nx_partner_activate", { p_token: token, p_code: code }) : await rpc<CodeResult>("nx_partner_unlock", { p_code: code })
      if (r.ok) { onDone(r); return }
      if (r.reason === "email") setWrongMail(r.expected || "")
      else if (r.reason === "locked") setErr(`Trop de codes faux : réessayez après ${fmtTime(r.until)}.`)
      else if (r.reason === "code") setErr(`Code incorrect${r.left != null ? ` : encore ${r.left} essai${(r.left || 0) > 1 ? "s" : ""} avant un blocage de 30 minutes` : ""}.`)
      else if (r.reason === "invite") setErr("Ce lien d’invitation n’est plus valable : ouvrez le dernier e-mail d’invitation reçu, un lien plus récent a pu le remplacer.")
      else if (r.reason === "already") setErr("Ce compte est déjà lié à un autre accès de parrain.")
      else setErr("Le code n’a pas pu être vérifié.")
    } catch (x) {
      setErr(x instanceof Error ? x.message : errText(x))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Frame onSignOut={onSignOut}>
      <section className="panel narrow">
        {mode === "activate" && <Steps at={2} />}
        <span className="big-ic"><Icon name="key" size={22} /></span>
        <h2>{mode === "activate" ? "Saisissez votre code d’accès" : `Code d’accès de ${month}`}</h2>
        <p className="muted">
          {mode === "activate"
            ? <>Connecté avec <b>{email}</b>. {initial ? "Votre code, reçu avec l’invitation, est déjà rempli : activez votre accès." : "Saisissez le code de 8 caractères reçu par e-mail avec votre invitation."}</>
            : <>Pour votre sécurité, l’accès change chaque mois. {initial ? `Votre code de ${month}, reçu par e-mail, est déjà rempli.` : `Saisissez le code de ${month} reçu par e-mail`}{!initial && me?.code_expires_at ? ` (valable jusqu’au ${lastDay(me.code_expires_at)})` : ""}{initial ? "" : "."}</>}
        </p>
        {wrongMail ? (
          <div className="stack">
            <p className="msg bad" role="alert">Vous êtes connecté avec <b>{email}</b>, mais l’invitation est pour <b>{wrongMail}</b>. Déconnectez-vous, puis connectez-vous avec l’adresse invitée.</p>
            <button className="btn primary block" onClick={onSignOut}>Changer de compte</button>
          </div>
        ) : (
          <form className="form" onSubmit={submit}>
            <label className="field">
              <span>Code d’accès</span>
              <input className="input code-input" value={code} onChange={(e) => onInput(e.target.value)} placeholder="XXXX-XXXX" autoComplete="one-time-code" inputMode="text" spellCheck={false} autoFocus aria-describedby="code-hint" disabled={Boolean(locked)} />
              <small id="code-hint">Sans 0, O, 1, I ni L : les caractères qui se confondent ne sont jamais utilisés.</small>
            </label>
            {locked && <p className="msg bad" role="alert">Trop de codes faux : réessayez après {fmtTime(locked)}.</p>}
            {err && <p className="msg bad" role="alert">{err}</p>}
            <button className="btn primary block" disabled={busy || Boolean(locked)}>{busy ? "Vérification…" : mode === "activate" ? "Activer mon accès" : "Ouvrir mon espace"}</button>
            {mailMsg && <p className={`msg ${mailMsg.ok ? "ok" : "bad"}`} role="status">{mailMsg.text}</p>}
            <button type="button" className="btn ghost block" disabled={mailing} onClick={mailCode}><Icon name="mail" size={14} /> {mailing ? "Envoi…" : "Recevoir mon code par e-mail"}</button>
            <p className="fine">Votre code vous est envoyé par e-mail au début de chaque mois.</p>
          </form>
        )}
      </section>
    </Frame>
  )
}

function NotPartner({ me, onSignOut }: { me: Me; onSignOut: () => void }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // NEXORA #127 : invitation renvoyée à l'adresse invitée (lien d'activation avec le code déjà rempli).
  async function resend() {
    setBusy(true)
    try {
      const r = await rpc<{ sent: boolean; reason?: string; to?: string }>("nx_partner_code_mail")
      setMsg(r.sent || r.reason === "recent"
        ? { ok: true, text: `Invitation envoyée à ${r.to} : ouvrez l’e-mail sur cet appareil et cliquez sur « Activer mon espace de parrain ».` }
        : { ok: false, text: "L’e-mail n’a pas pu partir pour l’instant : réessayez dans quelques minutes." })
    } catch (x) {
      setMsg({ ok: false, text: x instanceof Error ? x.message : errText(x) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <Frame onSignOut={onSignOut}>
      <section className="panel narrow center">
        <span className="big-ic"><Icon name="gift" size={22} /></span>
        <h2>{me.invited ? "Ouvrez votre lien d’invitation" : "Pas d’accès parrain"}</h2>
        <p className="muted">
          {me.invited
            ? <>Une invitation attend <b>{me.email}</b>. Ouvrez sur cet appareil l’e-mail d’invitation de NEXORA et cliquez sur « Activer mon espace de parrain » : votre code sera déjà rempli.</>
            : <>Le compte <b>{me.email}</b> n’est pas parrain. L’accès au programme se fait sur invitation de l’équipe NEXORA.</>}
        </p>
        {me.invited && (
          <>
            {msg && <p className={`msg ${msg.ok ? "ok" : "bad"}`} role="status">{msg.text}</p>}
            <button className="btn primary" disabled={busy} onClick={resend}><Icon name="mail" size={14} /> {busy ? "Envoi…" : "Recevoir de nouveau mon invitation"}</button>
          </>
        )}
      </section>
    </Frame>
  )
}
