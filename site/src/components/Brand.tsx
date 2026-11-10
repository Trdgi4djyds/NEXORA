import logo from "../../../nexora/app/renderer/logo.png"

/** Logo et nom de NEXORA (même image de marque que l'application). */
export function Brand({ size = 30 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <img src={logo} alt="" width={size} height={size} className="rounded-full" />
      <span className="font-display text-[18px] font-semibold tracking-[0.14em] text-foreground">NEXORA</span>
    </span>
  )
}

export { logo }
