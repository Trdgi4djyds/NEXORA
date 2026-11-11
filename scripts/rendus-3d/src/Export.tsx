import { Canvas, useThree } from "@react-three/fiber"
import { useEffect, useRef } from "react"
import * as THREE from "three"
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js"
import { Laptop, IPhone, IPad, StudioDisplay, Galaxy, Fold } from "react-3d-mockups"

// Appareils exportés (nom de fichier → élément). L'écran reçoit un enfant vide : sa surface devient NX_SCREEN.
export const DEVICES: Record<string, JSX.Element> = {
  "macbook-pro-16": <Laptop variant="pro16" color="spaceblack" openAngle={110}><div /></Laptop>,
  "macbook-pro-14": <Laptop variant="pro14" color="silver" openAngle={110}><div /></Laptop>,
  "macbook-air-13": <Laptop variant="air13" color="midnight" openAngle={110}><div /></Laptop>,
  "iphone-18-pro": <IPhone variant="18pro" color="black"><div /></IPhone>,
  "iphone-18-pro-max": <IPhone variant="18promax" color="silver"><div /></IPhone>,
  "iphone-17": <IPhone variant="17" color="lavender"><div /></IPhone>,
  "galaxy-s26-ultra": <Galaxy variant="s26ultra" color="titaniumblack"><div /></Galaxy>,
  "ipad-pro-13": <IPad variant="ipadpro13" color="spaceblack"><div /></IPad>,
  "ipad-pro-11": <IPad variant="ipadpro11" color="silver"><div /></IPad>,
  "studio-display": <StudioDisplay><div /></StudioDisplay>,
}

function Exporter({ id }: { id: string }) {
  const ref = useRef<THREE.Group>(null!)
  const scene = useThree((t) => t.scene)
  useEffect(() => {
    const t = setTimeout(async () => {
      const root = ref.current
      const screens: THREE.Mesh[] = []
      const bad: string[] = []
      root.updateMatrixWorld(true)
      root.traverse((o: any) => {
        if (!o.isMesh) return
        if (o.material?.isShaderMaterial) {
          if (String(o.material.fragmentShader).length < 400) screens.push(o)
          else bad.push(o.name || "shader")
        }
      })
      // Surface d'écran : matériau simple nommé, UV normalisées sur la boîte de la forme.
      for (const m of screens) {
        const g = m.geometry.clone()
        g.computeBoundingBox()
        const b = g.boundingBox!
        const pos = g.attributes.position
        const uv = new Float32Array(pos.count * 2)
        for (let i = 0; i < pos.count; i++) {
          uv[i * 2] = (pos.getX(i) - b.min.x) / (b.max.x - b.min.x)
          uv[i * 2 + 1] = 1 - (pos.getY(i) - b.min.y) / (b.max.y - b.min.y)
        }
        g.setAttribute("uv", new THREE.BufferAttribute(uv, 2))
        m.geometry = g
        m.material = new THREE.MeshBasicMaterial({ color: 0x111111, name: "NX_SCREEN_MAT" })
        m.name = "NX_SCREEN"
        m.position.z += 0.0004
      }
      // NEXORA reconnaît l'écran d'un GLB au premier maillage nommé screen, écran ou display : seul NX_SCREEN le reste.
      let k = 0
      root.traverse((o: any) => { if (o.isMesh && o.name !== "NX_SCREEN" && /screen|écran|ecran|display/i.test(o.name || "")) o.name = `piece-${k++}` })
      // Les objets HTML (portails) n'ont rien à faire dans le GLB.
      const strip: THREE.Object3D[] = []
      root.traverse((o: any) => { if (!o.isMesh && !o.isGroup && o.type !== "Object3D") strip.push(o) })
      strip.forEach((o) => o.parent?.remove(o))
      let tris = 0
      root.traverse((o: any) => { if (o.isMesh) tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3 })
      const ab = (await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true, maxTextureSize: 1024 })) as ArrayBuffer
      const bytes = new Uint8Array(ab)
      let bin = ""
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      ;(window as any).__glb = { id, b64: btoa(bin), screens: screens.length, bad, tris: Math.round(tris), size: bytes.length, renamed: k }
    }, 4000)
    return () => clearTimeout(t)
  }, [id, scene])
  return <group ref={ref}>{DEVICES[id]}</group>
}

export function ExportScene({ id }: { id: string }) {
  return (
    <Canvas gl={{ alpha: true }} camera={{ position: [0, 0.5, 8], fov: 40 }} frameloop="always">
      <ambientLight intensity={0.8} />
      <Exporter id={id} />
    </Canvas>
  )
}
