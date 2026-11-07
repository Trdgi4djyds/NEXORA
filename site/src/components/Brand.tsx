import logo from "../../../nexora/app/renderer/logo.png"

/** Logo et nom de NEXORA (même image de marque que l'application). */
export function Brand({ size = 34 }: { size?: number }) {
  return (
    <span className="brand">
      <img src={logo} alt="" width={size} height={size} />
      <span className="brand-name">NEXORA</span>
    </span>
  )
}

export { logo }
