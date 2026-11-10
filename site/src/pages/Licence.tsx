// NEXORA #076 : « Ma licence ». NEXORA Devs Toolbox ne démarre qu'avec une licence validée par le serveur : ici,
// l'utilisateur crée son compte ou s'y connecte, obtient sa clé gratuite, voit ses appareils et son essai, passe à
// Pro (paiement dans le navigateur) et gère son abonnement. #/licence/verifier : vérification publique d'une clé.
// #085 : mise en forme « Néon » avec les composants shadcn/ui (Tabs, Input, Label, Button, Badge) ; logique inchangée.
import { useEffect, useState, type FormEvent, type ReactNode } from "react"
import { StepCards, Watermark } from "../components/Blocks"
import { CtaBand } from "../components/CtaBand"
import { PageHero, SectionHead } from "../components/SectionHead"
import { DownloadButton } from "../components/Download"
import { Badge } from "../components/ui/badge"
import { Button } from "../components/ui/button"
import { Input } from "../components/ui/input"
import { Label } from "../components/ui/label"
import { Tabs, TabsList, TabsTrigger } from "../components/ui/tabs"
import { ToggleGroup, ToggleGroupItem } from "../components/ui/toggle-group"
import { Icon } from "../lib/icons"
import { Reveal } from "../lib/motion"
import { discounted, money, percent, usePayments, useRemote } from "../lib/remote"
import { CODE_RE, useParrain } from "../lib/referral"
import { cn } from "../lib/utils"
import {
  KEY_RE, myLicence, pay, recover, referralAttach, referralMine, releaseDevice, session, sessionFromLink, signIn, signOut, signUp, verifyKey,
  type Licence as Lic, type ReferralMine, type Session, type Verify,
} from "../lib/account"

const date = (iso?: string | null, time = false) =>
  iso ? new Date(iso).toLocaleString("fr-FR", time ? { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" } : { day: "numeric", month: "long", year: "numeric" }) : ""

const card = "surface p-6 md:p-7"

function Msg({ kind, children }: { kind: "ok" | "bad"; children: ReactNode }) {
  return (
    <p className={cn("rounded-xl border px-3.5 py-2.5 text-[13.5px]", kind === "ok" ? "border-brand-blue/35 bg-brand-blue/[0.08] text-brand-blue" : "border-destructive/40 bg-destructive/10 text-[#ff9c9c]")} role="status">
      {children}
    </p>
  )
}

function Field({ id, label, icon, children }: { id: string; label: string; icon: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Icon name={icon} size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
        {children}
      </div>
    </div>
  )
}

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
    <form className="panel-hi has-wm relative flex flex-col gap-5 overflow-hidden p-6 md:p-8" onSubmit={submit} noValidate>
      <Watermark icon="lock" className="wm-br" size={220} />
      <i className="halo top-[-140px] right-[-80px] h-[240px] w-[280px] opacity-[0.12]" aria-hidden="true" />
      {mode !== "forgot" ? (
        <Tabs
          value={mode}
          onValueChange={(v) => {
            setMode(v as "login" | "signup")
            setMsg(null)
          }}
          className="relative"
        >
          <TabsList aria-label="Compte NEXORA" className="w-full">
            <TabsTrigger value="login">Connexion</TabsTrigger>
            <TabsTrigger value="signup">Créer un compte</TabsTrigger>
          </TabsList>
        </Tabs>
      ) : (
        <h2 className="relative text-[20px] font-semibold">Mot de passe oublié</h2>
      )}
      <Field id="lic-email" label="Adresse e-mail" icon="mail">
        <Input id="lic-email" className="pl-10" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="toi@exemple.com" />
      </Field>
      {mode !== "forgot" && (
        <Field id="lic-pass" label="Mot de passe" icon="lock">
          <Input
            id="lic-pass"
            className="pl-10"
            type="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            required
            minLength={mode === "signup" ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={mode === "signup" ? "8 caractères minimum" : ""}
          />
        </Field>
      )}
      {msg && <Msg kind={msg.kind}>{msg.text}</Msg>}
      <Button size="lg" type="submit" className="relative w-full" disabled={busy || !email.trim() || (mode !== "forgot" && !password)}>
        {busy ? "Un instant…" : mode === "login" ? "Se connecter" : mode === "signup" ? "Créer mon compte et ma licence" : "Envoyer le lien"}
      </Button>
      <p className="relative flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted-foreground">
        {mode === "forgot" ? (
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setMode("login"); setMsg(null) }}>Retour à la connexion</button>
        ) : (
          <button type="button" className="font-medium text-primary hover:underline" onClick={() => { setMode("forgot"); setMsg(null) }}>Mot de passe oublié ?</button>
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
    <Reveal className="panel-hi has-wm relative overflow-hidden p-6 md:p-8 lg:col-span-2">
      <Watermark icon="key" className="wm-br" size={240} />
      <i className="halo top-[-160px] left-[30%] h-[260px] w-[420px] opacity-[0.12]" aria-hidden="true" />
      <div className="relative flex flex-wrap items-center justify-between gap-3">
        <Badge variant={pro || lic.trial ? "solid" : "default"}>{lic.trial ? "Essai Pro" : lic.plan_name || (pro ? "Pro" : "Gratuit")}</Badge>
        {lic.status !== "active" ? (
          <span className="text-[13px] font-medium text-[#ff9c9c]">Licence révoquée</span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-[13px] font-medium text-brand-blue">
            <i className="dot live ok" /> Active
          </span>
        )}
      </div>
      <small className="relative mt-6 block text-[13px] font-medium text-muted-foreground">Ta clé de licence</small>
      <code className="hud relative mt-3 block px-5 py-4 text-[clamp(16px,2.2vw,24px)] font-semibold tracking-[0.08em] break-all text-primary" aria-label="Clé de licence">
        {lic.key}
      </code>
      <div className="relative mt-5 flex flex-wrap gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            navigator.clipboard?.writeText(lic.key).then(() => {
              setCopied(true)
              window.setTimeout(() => setCopied(false), 1800)
            })
          }}
        >
          <Icon name={copied ? "check" : "copy"} size={16} /> {copied ? "Copiée" : "Copier la clé"}
        </Button>
        <Button asChild>
          <a href={`nexora://licence?key=${encodeURIComponent(lic.key)}`}>
            <Icon name="external" size={16} /> Ouvrir NEXORA Devs Toolbox
          </a>
        </Button>
      </div>
      <p className="relative mt-5 text-[14px] text-muted-foreground">
        {lic.trial
          ? `Ton premier jour est un essai complet de Pro, jusqu’au ${date(lic.trial_ends_at, true)}. Ensuite, l’offre Gratuite s’applique : Responsive Lab et Browser Lab complets, et 2 applications Android ou Windows.`
          : lic.activated_at
            ? `Activée le ${date(lic.activated_at)}. NEXORA vérifie ta licence auprès du serveur à chaque démarrage.`
            : "Lance NEXORA Devs Toolbox et connecte-toi avec ce compte : la licence s’active toute seule. Tu peux aussi coller la clé."}
      </p>
    </Reveal>
  )
}

// NEXORA #090 : refus du rattachement d'un code de parrain (nx_referral_attach).
const REF_REFUSED: Record<string, string> = {
  unknown: "Ce code n’existe pas ou n’est plus actif : vérifie-le auprès de ton parrain.",
  self: "Tu ne peux pas utiliser ton propre code de parrainage.",
  customer: "Le parrainage s’applique à un premier abonnement Pro.",
}

function PlanCard({ lic, s }: { lic: Lic; s: Session }) {
  const { plans, supportEmail, referral } = useRemote()
  const payments = usePayments()
  const pro = plans.find((p) => p.id === "pro")
  const [period, setPeriod] = useState<"month" | "year">("month")
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState("")
  const paid = lic.paid_plan === "pro"
  const b = lic.billing
  // NEXORA #090 : parrainage du compte. Le lien d'un parrain gardé par le site est rattaché au compte (avant un premier
  // abonnement) ; sinon, le client peut saisir le code promo d'un parrain.
  const parrain = useParrain()
  const [mine, setMine] = useState<ReferralMine | null>(null)
  const [code, setCode] = useState(parrain?.code || "")
  const [refBusy, setRefBusy] = useState(false)
  const [refErr, setRefErr] = useState("")
  useEffect(() => {
    let alive = true
    ;(async () => {
      let m = await referralMine(s).catch(() => null)
      if (m && !m.referred && m.eligible && parrain && referral.enabled) {
        const r = await referralAttach(s, parrain.code, "link").catch(() => null)
        if (r && r.ok !== false) m = r
      }
      if (alive) setMine(m)
    })()
    return () => {
      alive = false
    }
  }, [s, parrain, referral.enabled])
  async function applyCode(e: FormEvent) {
    e.preventDefault()
    const v = code.trim()
    if (!CODE_RE.test(v)) {
      setRefErr("Un code promo compte de 3 à 24 lettres, chiffres ou tirets.")
      return
    }
    setRefBusy(true)
    setRefErr("")
    try {
      const r = await referralAttach(s, v, parrain && parrain.code === v.toUpperCase() ? "link" : "code")
      if (r.ok === false) setRefErr(REF_REFUSED[r.reason || "unknown"] || REF_REFUSED.unknown)
      else setMine(r)
    } catch (x) {
      setRefErr(x instanceof Error ? x.message : String(x))
    } finally {
      setRefBusy(false)
    }
  }
  const refOn = Boolean(mine && mine.referred)

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
      <Reveal className={cn(card, "flex flex-col gap-4")} delay={80}>
        <span className="sp-ic solid">
          <Icon name="nxCrown" size={20} />
        </span>
        <h3 className="text-[20px] font-semibold">Offre Pro active</h3>
        <p className="text-[14.5px] text-muted-foreground">
          {lic.granted
            ? `Offerte par l’équipe NEXORA${lic.granted_until ? ` jusqu’au ${date(lic.granted_until)}` : ", sans date de fin"}.`
            : b && b.current_period_end
              ? b.cancel_at_period_end
                ? `Résiliée : Pro reste ouvert jusqu’au ${date(b.current_period_end)}, puis l’offre Gratuite s’applique.`
                : `Abonnement ${b.period === "year" ? "annuel" : "mensuel"} renouvelé le ${date(b.current_period_end)}.`
              : "Abonnement attribué par l’équipe NEXORA."}
          {b && b.status === "past_due" ? " Le dernier paiement a échoué : mets à jour ton moyen de paiement." : ""}
        </p>
        {err && <Msg kind="bad">{err}</Msg>}
        <Button type="button" variant="outline" className="w-fit" disabled={busy} onClick={() => go("portal")}>
          <Icon name="external" size={16} /> Gérer mon abonnement
        </Button>
      </Reveal>
    )
  }
  const listMonth = pro?.price_month_cents ?? 2500
  const listYear = pro?.price_year_cents ?? 25000
  const pct = mine?.discount_pct ?? referral.discount_pct
  const month = refOn ? discounted(listMonth, pct) : listMonth
  const year = refOn ? discounted(listYear, pct) : listYear
  return (
    <Reveal className={cn(card, "flex flex-col gap-4")} delay={80}>
      <span className="sp-ic solid">
        <Icon name="nxCrown" size={20} />
      </span>
      <h3 className="text-[20px] font-semibold">Passe à Pro</h3>
      <p className="text-[14.5px] text-muted-foreground">Dev Lab complet, jusqu’à 50 applications sans limite par application, Studio et NEX-DESIGN complets, et des limites larges.</p>
      <ToggleGroup type="single" value={period} onValueChange={(v) => v && setPeriod(v as "month" | "year")} aria-label="Périodicité" className="w-fit">
        <ToggleGroupItem value="month" className="h-9 px-4">
          Mensuel
        </ToggleGroupItem>
        <ToggleGroupItem value="year" className="h-9 px-4">
          Annuel <small className="opacity-80">2 mois offerts</small>
        </ToggleGroupItem>
      </ToggleGroup>
      <p className="flex items-baseline gap-1.5">
        <b className="text-[40px] leading-none font-semibold tracking-[-0.03em] text-primary">{money(period === "year" ? year : month)}</b>
        <span className="text-muted-foreground">{period === "year" ? " / an" : " / mois"}</span>
        {refOn && <s className="ml-1 text-[16px] text-muted-foreground/80">{money(period === "year" ? listYear : listMonth)}</s>}
      </p>
      {refOn && mine ? (
        <Msg kind="ok">
          Parrainage actif : code {mine.code}
          {mine.partner ? ` de ${mine.partner}` : ""}, −{percent(pct)} % à chaque paiement, tant que ton abonnement continue.
        </Msg>
      ) : mine?.eligible && referral.enabled ? (
        <form className="flex flex-col gap-2" onSubmit={applyCode}>
          <Label htmlFor="ref-code">Code promo d’un parrain (−{percent(pct)} % à chaque paiement)</Label>
          <div className="flex gap-2">
            <Input id="ref-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 24))} placeholder="CODE25" autoComplete="off" spellCheck={false} className="uppercase tracking-[0.08em]" />
            <Button type="submit" variant="outline" disabled={refBusy || !code}>
              {refBusy ? "…" : "Appliquer"}
            </Button>
          </div>
          {refErr && <Msg kind="bad">{refErr}</Msg>}
        </form>
      ) : null}
      {err && <Msg kind="bad">{err}</Msg>}
      {/* #087 (A-056) : paiement en ligne pas encore ouvert : demande à l'équipe, qui active Pro. */}
      {payments === false ? (
        <>
          <Button asChild size="lg">
            <a
              href={`mailto:${supportEmail}?subject=${encodeURIComponent("Passage à l’offre Pro")}&body=${encodeURIComponent(
                `Bonjour,\n\nJe souhaite passer à l’offre Pro (${period === "year" ? "paiement annuel" : "paiement mensuel"}) avec le compte ${s.email}.\n${refOn && mine ? `Code de parrainage : ${mine.code} (−${pct} %).\n` : ""}`,
              )}`}
            >
              <Icon name="mail" size={16} /> Demander Pro à l’équipe
            </a>
          </Button>
          <small className="text-[12.5px] text-muted-foreground">
            Le paiement en ligne arrive bientôt. En attendant, l’équipe NEXORA active ton offre sur demande, en général sous 24 h : écris à {supportEmail} ou depuis NEXORA (Mon compte → Support).
          </small>
        </>
      ) : (
        <>
          <Button type="button" size="lg" disabled={busy || payments === null} onClick={() => go("checkout")}>
            {busy ? "Ouverture du paiement…" : "Passer à Pro"}
          </Button>
          <small className="text-[12.5px] text-muted-foreground">Paiement sécurisé dans ton navigateur, sans engagement. NEXORA passe en Pro au contrôle de licence suivant.</small>
        </>
      )}
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
    try {
      await releaseDevice(s, id)
      onChange()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy("")
    }
  }
  return (
    <Reveal className={cn(card, "flex flex-col gap-4")} delay={140}>
      <h3 className="flex items-center gap-2.5 text-[18px] font-semibold">
        <Icon name="laptop" size={18} className="text-primary" /> Ordinateurs
        {lic.max_devices ? <small className="ml-auto rounded-full border border-foreground/10 px-2.5 py-0.5 text-[12px] font-medium text-muted-foreground">{active} / {lic.max_devices}</small> : null}
      </h3>
      {lic.devices.length ? (
        <ul className="flex flex-col divide-y divide-foreground/[0.08]">
          {lic.devices.map((d, i) => (
            <li key={`${d.id || d.name}-${i}`} className={cn("flex flex-col gap-0.5 py-3", d.released && "opacity-50")}>
              <b className="text-[14.5px] font-medium">
                {d.name || "PC Windows"}
                {d.released ? " · libéré" : ""}
              </b>
              <span className="text-[13px] text-muted-foreground">{[d.os, d.app_version && `NEXORA ${d.app_version}`].filter(Boolean).join(" · ")}</span>
              <small className="text-[12px] text-muted-foreground/80">
                Dernière connexion le {date(d.last_seen, true)}
                {d.last_ip ? ` · adresse ${d.last_ip}` : ""}
              </small>
              {d.id && !d.released && (
                <button type="button" className="mt-1 w-fit text-[13px] font-medium text-primary hover:underline disabled:opacity-50" disabled={busy === d.id} onClick={() => release(d.id as string)}>
                  {busy === d.id ? "…" : "Libérer cet ordinateur"}
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] text-muted-foreground">Aucun ordinateur pour l’instant : ils apparaissent ici dès le premier démarrage de NEXORA.</p>
      )}
      {err && <Msg kind="bad">{err}</Msg>}
      <p className="text-[12.5px] text-muted-foreground">Libère un ordinateur que tu n’utilises plus pour en ajouter un autre. Un ordinateur inconnu ? Change ton mot de passe et écris à l’assistance.</p>
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
    if (!KEY_RE.test(norm)) {
      setErr("Une clé NEXORA a la forme NXDT-XXXX-XXXX-XXXX-XXXX.")
      return
    }
    setBusy(true)
    try {
      setRes(await verifyKey(norm))
    } catch (e2) {
      setErr(e2 instanceof Error ? e2.message : String(e2))
    } finally {
      setBusy(false)
    }
  }
  return (
    <form className="hud has-wm flex flex-col gap-4 p-6 md:p-8" onSubmit={submit} id="verifier">
      <Watermark icon="shield" className="wm-br" size={220} />
      <h3 className="flex items-center gap-2.5 text-[18px] font-semibold">
        <Icon name="shield" size={18} className="text-primary" /> Vérifier une clé
      </h3>
      <p className="text-[14px] text-muted-foreground">Pour t’assurer qu’une clé est authentique avant de l’utiliser. Le titulaire n’est jamais affiché en entier.</p>
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Icon name="key" size={16} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input className="pl-10 tracking-[0.06em]" value={key} onChange={(e) => setKey(e.target.value)} placeholder="NXDT-XXXX-XXXX-XXXX-XXXX" spellCheck={false} autoCapitalize="characters" aria-label="Clé de licence" />
        </div>
        <Button type="submit" variant="outline" className="h-11" disabled={busy || !norm}>
          {busy ? "…" : "Vérifier"}
        </Button>
      </div>
      {err && <Msg kind="bad">{err}</Msg>}
      {res && (
        <Msg kind={res.valid ? "ok" : "bad"}>
          {res.valid
            ? `Clé authentique et active · offre ${res.plan_name || res.plan} · titulaire ${res.holder} · créée le ${date(res.created_at)}${res.activated ? "" : " · pas encore activée"}.`
            : res.reason === "unknown"
              ? "Cette clé n’existe pas. Vérifie chaque caractère."
              : "Cette clé existe mais a été révoquée : elle ne permet plus de démarrer NEXORA."}
        </Msg>
      )}
    </form>
  )
}

const POINTS: [string, string, string][] = [
  ["key", "Une licence gratuite par compte", "Générée tout de suite, liée à ton adresse e-mail."],
  ["star", "24 h d’essai complet", "Le premier jour, tout Pro est ouvert. Ensuite, Responsive Lab, Browser Lab et 2 applications restent gratuits."],
  ["shield", "Vérifiée à chaque démarrage", "Connexion signée avec nos serveurs : sans licence valide, NEXORA ne s’ouvre pas."],
  ["download", "Un lanceur léger", "Il télécharge, vérifie et met à jour NEXORA pour toi."],
]

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
    if (!sess) {
      setLic(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      setLic(await myLicence(sess))
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    sessionFromLink()
    session().then(load)
  }, [])

  return (
    <>
      <PageHero capture="haut">
        <SectionHead
          as="h1"
          align="left"
          eyebrow="Ma licence"
          title={["Ta licence NEXORA,", "toujours à portée."]}
          lead="NEXORA Devs Toolbox démarre avec une licence vérifiée par nos serveurs. Elle est gratuite : crée ton compte, récupère ta clé, puis passe à Pro quand tu en as besoin."
          className="mb-10 md:mb-12"
        />
        {paiement === "ok" && (
          <p className="mb-6 flex items-center gap-2.5 rounded-2xl border border-brand-blue/35 bg-brand-blue/[0.08] px-4 py-3 text-[14px] text-brand-blue">
            <Icon name="pass" size={16} /> Paiement reçu. Ton offre Pro s’active dans quelques secondes ; NEXORA la prend en compte au prochain contrôle.
          </p>
        )}
        {paiement === "annule" && (
          <p className="mb-6 flex items-center gap-2.5 rounded-2xl border border-foreground/10 bg-foreground/[0.03] px-4 py-3 text-[14px] text-muted-foreground">
            <Icon name="info" size={16} /> Paiement annulé : rien n’a été débité.
          </p>
        )}
        <div className="grid gap-5 lg:grid-cols-2">
          {loading ? (
            <div className={cn(card, "flex items-center gap-3 text-muted-foreground")}>
              <span className="size-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" aria-hidden="true" /> Lecture de ta licence…
            </div>
          ) : !s ? (
            <>
              <AuthCard onSession={load} />
              <ul className="flex flex-col gap-3" data-glow>
                {POINTS.map(([icon, title, text]) => (
                  <li key={title} className="glow surface has-wm flex items-start gap-4 p-5">
                    <Watermark icon={icon} className="wm-card" size={120} />
                    <span className="sp-ic">
                      <Icon name={icon} size={18} />
                    </span>
                    <div>
                      <b className="block text-[15.5px] font-semibold">{title}</b>
                      <span className="text-[14px] text-muted-foreground">{text}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : err ? (
            <div className={cn(card, "flex flex-col gap-4")}>
              <Msg kind="bad">{err}</Msg>
              <Button type="button" variant="outline" className="w-fit" onClick={() => session().then(load)}>
                Réessayer
              </Button>
            </div>
          ) : lic ? (
            <>
              <KeyCard lic={lic} />
              <PlanCard lic={lic} s={s} />
              <Devices lic={lic} s={s} onChange={() => load(s)} />
              <div className={cn(card, "flex flex-wrap items-center justify-between gap-4 lg:col-span-2")}>
                <span className="text-[14px] text-muted-foreground">
                  Connecté en tant que <b className="font-medium text-foreground">{s.email}</b>
                </span>
                <div className="flex flex-wrap gap-2.5">
                  <DownloadButton size="sm" label="Télécharger le lanceur" />
                  <Button type="button" size="sm" variant="ghost" onClick={() => signOut().then(() => load(null))}>
                    Se déconnecter
                  </Button>
                </div>
              </div>
            </>
          ) : null}
        </div>
      </PageHero>
      <StepCards
        className="lime"
        eyebrow="Comment ça marche"
        title={["Ta licence,", "en trois temps."]}
        steps={[
          { icon: "user", title: "Crée ton compte", text: "Le même compte que dans NEXORA, sur Windows comme sur le web." },
          { icon: "key", title: "Récupère ta clé", text: "Générée tout de suite, liée à ton adresse e-mail et à tes ordinateurs." },
          { icon: "shield", title: "NEXORA la vérifie", text: "À chaque démarrage, une connexion signée avec nos serveurs." },
        ]}
      />
      <section className="section-tight light relative overflow-hidden" data-capture="verifier">
        <Watermark icon="audit" className="wm-tr" size={420} />
        <div className="wrap relative max-w-[860px]">
          <Verifier />
        </div>
      </section>
      <CtaBand bright />
    </>
  )
}
