import { createRoot } from "react-dom/client"
import { useThree } from "@react-three/fiber"
import { useEffect } from "react"
import { IconScene } from "./Icon3D"
import { ExportScene } from "./Export"
import { ViewScene } from "./View"
import { MockupCanvas, Laptop, IPhone, IPad, StudioDisplay, Galaxy } from "react-3d-mockups"

const img = (src: string) => <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "left top", display: "block" }} />
const P = new URLSearchParams(location.search)
const s = P.get("s") || "hero"

function Rim() {
  const gl = useThree((t) => t.gl)
  const inv = useThree((t) => t.invalidate)
  useEffect(() => { gl.toneMappingExposure = Number(P.get("e") || 0.62); inv() }, [gl, inv])
  return (
    <>
      <pointLight position={[-6, 3, -4]} intensity={60} color="#8b5cf6" />
      <pointLight position={[6, 1.5, -3]} intensity={45} color="#4f7cff" />
      <pointLight position={[0, -2, 4]} intensity={8} color="#c084fc" />
    </>
  )
}

const scenes: Record<string, () => JSX.Element> = {
  hero: () => (
    <MockupCanvas controls={false} shadows={false} camera={{ position: [0.4, 1.6, 12.5], fov: 30 }}>
      <Rim />
      <group position={[-0.5, -0.9, 0]} rotation={[0, 0.42, 0]}>
        <Laptop variant="pro16" color="#2a2a2d" openAngle={108}>{img("/dev-sombre.webp")}</Laptop>
      </group>
      <group position={[2.55, -0.95, 1.6]} rotation={[0.02, -0.38, 0]} scale={0.62}>
        <IPhone variant="18pro" color="black">{img("/site-iphone.webp")}</IPhone>
      </group>
    </MockupCanvas>
  ),
  duo: () => (
    <MockupCanvas controls={false} shadows={false} camera={{ position: [0, 2.6, 13], fov: 32 }}>
      <Rim />
      <group position={[-1.75, -0.8, 0]} rotation={[0, 0.62, 0]}>
        <Laptop variant="pro16" color="#2a2a2d" openAngle={112}>{img("/accueil-sombre.webp")}</Laptop>
      </group>
      <group position={[1.75, -0.8, 0]} rotation={[0, -0.62, 0]}>
        <Laptop variant="pro16" color="#2a2a2d" openAngle={112}>{img("/apps-sombre.webp")}</Laptop>
      </group>
    </MockupCanvas>
  ),
  display: () => (
    <MockupCanvas controls={false} shadows={false} camera={{ position: [-1.2, 0.6, 8], fov: 34 }}>
      <Rim />
      <group rotation={[0.05, 0.38, 0]} position={[0, -0.4, 0]}>
        <StudioDisplay>{img("/design-sombre.webp")}</StudioDisplay>
      </group>
    </MockupCanvas>
  ),
  ipad: () => (
    <MockupCanvas controls={false} shadows={false} camera={{ position: [0, 0.4, 7], fov: 34 }}>
      <Rim />
      <group rotation={[-0.25, -0.5, 0.06]}>
        <IPad variant="ipadpro13" color="spaceblack" orientation="landscape">{img("/studio-sombre.webp")}</IPad>
      </group>
    </MockupCanvas>
  ),
  phones: () => (
    <MockupCanvas controls={false} shadows={false} camera={{ position: [0, 0.3, 9], fov: 30 }}>
      <Rim />
      <group position={[-1.3, 0, 0]} rotation={[0, 0.35, 0.04]}><Galaxy variant="s26ultra" color="titaniumblack">{img("/site-iphone.webp")}</Galaxy></group>
      <group position={[1.3, 0, 0.4]} rotation={[0, -0.35, -0.04]}><IPhone variant="18pro" color="black">{img("/site-iphone.webp")}</IPhone></group>
    </MockupCanvas>
  ),
}
createRoot(document.getElementById("root")!).render(s === "view" ? <ViewScene id={P.get("id") || "macbook-pro-16"} img={P.get("img") || "/dev-sombre.webp"} /> : s === "export" ? <ExportScene id={P.get("id") || "macbook-pro-16"} /> : s === "icon" ? <IconScene id={P.get("id") || "dev"} /> : scenes[s]())
