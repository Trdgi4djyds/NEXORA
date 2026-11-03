// Connexion au back office : comptes NEXORA dont le rôle (profiles.app_role) est admin ou superadmin.
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from "react"
import type { Session } from "@supabase/supabase-js"
import { errText, sb, type Row } from "./supabase"
import logo from "../../nexora/app/renderer/logo.png"

export type Me = { session: Session; profile: Row<"profiles">; isSuper: boolean }
const AuthCtx = createContext<Me>(null as unknown as Me)
export const useMe = () => useContext(AuthCtx)

const isAdminRole = (r?: string | null) => r === "admin" || r === "superadmin"

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Row<"profiles"> | null | undefined>(undefined)
  const [recovery, setRecovery] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    sb.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = sb.auth.onAuthStateChange((event, s) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true)
      // Différé : pas d'appel Supabase à l'intérieur du rappel (recommandation de supabase-js).
      setTimeout(() => setSession(s), 0)
    })
    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session) {
      setProfile(session === null ? null : undefined)
      return
    }
    setProfile(undefined)
    sb.from("profiles")
      .select("*")
      .eq("id", session.user.id)
      .maybeSingle()
      .then(({ data, error: e }) => {
        if (e) setError(errText(e))
        setProfile((data as Row<"profiles">) || null)
      })
  }, [session?.user.id])

  if (recovery && session) return <SetPassword onDone={() => setRecovery(false)} />
  if (session === undefined || (session && profile === undefined)) return <Splash />
  if (!session) return <Login />
  if (!profile || !isAdminRole(profile.app_role) || profile.status === "suspended")
    return <Denied reason={error || (profile?.status === "suspended" ? "Ce compte est suspendu." : "")} />
  return (
    <AuthCtx.Provider value={{ session, profile, isSuper: profile.app_role === "superadmin" }}>
      {children}
    </AuthCtx.Provider>
  )
}

function Splash() {
  return (
    <div className="auth" aria-busy="true">
      <span className="spinner" />
    </div>
  )
}

function Brand({ title, text }: { title: string; text?: string }) {
  return (
    <div className="brand">
      <img src={logo} alt="" />
      <div>
        <h1>{title}</h1>
      </div>
      {text && <p>{text}</p>}
    </div>
  )
}

function Login() {
  const [mode, setMode] = useState<"login" | "forgot">("login")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ text: string; bad?: boolean } | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMsg(null)
    try {
      if (mode === "login") {
        const { error } = await sb.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${location.origin}${location.pathname}`,
        })
        if (error) throw error
        setMsg({ text: "Si un compte existe avec cette adresse, un lien de réinitialisation vient d’être envoyé." })
      }
    } catch (err) {
      setMsg({ text: errText(err), bad: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <Brand
          title={mode === "login" ? "Administration NEXORA" : "Mot de passe oublié"}
          text={
            mode === "login"
              ? "Connecte-toi avec ton compte NEXORA administrateur."
              : "Saisis ton adresse e-mail : tu recevras un lien pour choisir un nouveau mot de passe."
          }
        />
        <label className="field">
          <span>Adresse e-mail</span>
          <input
            className="input"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        {mode === "login" && (
          <label className="field">
            <span>Mot de passe</span>
            <input
              className="input"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        )}
        {msg && <div className={msg.bad ? "alert" : "banner info"}>{msg.text}</div>}
        <button className="btn primary" disabled={busy}>
          {busy ? <span className="spinner sm" /> : mode === "login" ? "Se connecter" : "Envoyer le lien"}
        </button>
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === "login" ? "forgot" : "login")
            setMsg(null)
          }}
        >
          {mode === "login" ? "Mot de passe oublié ?" : "Retour à la connexion"}
        </button>
      </form>
    </div>
  )
}

function SetPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password !== confirm) return setMsg("Les deux mots de passe ne correspondent pas.")
    setBusy(true)
    const { error } = await sb.auth.updateUser({ password })
    setBusy(false)
    if (error) return setMsg(errText(error))
    history.replaceState(null, "", location.pathname)
    onDone()
  }
  return (
    <div className="auth">
      <form className="auth-card" onSubmit={submit}>
        <Brand title="Nouveau mot de passe" text="Choisis un mot de passe d’au moins 8 caractères." />
        <label className="field">
          <span>Nouveau mot de passe</span>
          <input className="input" type="password" minLength={8} required autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="field">
          <span>Confirmation</span>
          <input className="input" type="password" minLength={8} required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </label>
        {msg && <div className="alert">{msg}</div>}
        <button className="btn primary" disabled={busy}>
          Enregistrer
        </button>
      </form>
    </div>
  )
}

function Denied({ reason }: { reason: string }) {
  return (
    <div className="auth">
      <div className="auth-card">
        <Brand
          title="Accès réservé"
          text={reason || "Ce compte n’a pas le rôle administrateur. Demande à un super-administrateur de te l’attribuer."}
        />
        <button className="btn" onClick={() => sb.auth.signOut()}>
          Changer de compte
        </button>
      </div>
    </div>
  )
}
