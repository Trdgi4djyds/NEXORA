import { Canvas, useThree } from "@react-three/fiber"
import { Environment, Lightformer } from "@react-three/drei"
import { useEffect, useMemo, useState } from "react"
import * as THREE from "three"
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js"

// Icône Lucide (24 × 24) en tubes : cœur lumineux dans un tube de verre irisé.
function tubes(svg: string) {
  const data = new SVGLoader().parse(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">${svg}</svg>`)
  const curves: THREE.CatmullRomCurve3[] = []
  for (const p of data.paths) {
    for (const sp of p.subPaths) {
      const pts2 = sp.getSpacedPoints(Math.max(24, Math.round(sp.getLength() * 6)))
      if (pts2.length < 2) continue
      const closed = pts2[0].distanceTo(pts2[pts2.length - 1]) < 0.05
      const pts = (closed ? pts2.slice(0, -1) : pts2).map((v) => new THREE.Vector3(v.x - 12, 12 - v.y, 0))
      curves.push(new THREE.CatmullRomCurve3(pts, closed, "catmullrom", 0.05))
    }
  }
  return curves
}

function Model({ svg }: { svg: string }) {
  const curves = useMemo(() => tubes(svg), [svg])
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#ffffff", metalness: 0, roughness: 0.04, transmission: 1, thickness: 2.2, ior: 1.5, iridescence: 1, iridescenceIOR: 1.3, iridescenceThicknessRange: [150, 600], clearcoat: 1, clearcoatRoughness: 0.05, attenuationColor: new THREE.Color("#7c3aed"), attenuationDistance: 5, envMapIntensity: 3 }), [])
  const core = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#a5f3fc").multiplyScalar(2.2), toneMapped: false }), [])
  const glow = useMemo(() => new THREE.MeshBasicMaterial({ color: new THREE.Color("#8b5cf6"), transparent: true, opacity: 0.35, toneMapped: false, depthWrite: false }), [])
  return (
    <group rotation={[0.38, -0.55, 0.06]} scale={0.95}>
      {curves.map((c, i) => {
        const n = Math.max(48, c.points.length * 3)
        return (
          <group key={i}>
            <mesh geometry={new THREE.TubeGeometry(c, n, 1.05, 32, c.closed)} material={glass} />
            <mesh geometry={new THREE.TubeGeometry(c, n, 0.34, 16, c.closed)} material={core} />
            {!c.closed && [c.points[0], c.points[c.points.length - 1]].map((p, k) => (
              <mesh key={k} position={p} material={glass}><sphereGeometry args={[1.05, 32, 32]} /></mesh>
            ))}
          </group>
        )
      })}
    </group>
  )
}

function Exposure() {
  const gl = useThree((t) => t.gl)
  useEffect(() => { gl.toneMappingExposure = 1.1 }, [gl])
  return null
}

export function IconScene({ id }: { id: string }) {
  const [svg, setSvg] = useState("")
  useEffect(() => { fetch("/icons.json").then((r) => r.json()).then((j) => setSvg(j[id].svg)) }, [id])
  return (
    <Canvas gl={{ alpha: true, antialias: true, preserveDrawingBuffer: true }} camera={{ position: [0, 0, 46], fov: 35 }} dpr={1}>
      <Exposure />
      <Environment resolution={256}>
        <Lightformer intensity={3} color="#ffffff" position={[0, 8, 6]} scale={[20, 4, 1]} />
        <Lightformer intensity={6} color="#8b5cf6" position={[-10, 0, 2]} scale={[6, 24, 1]} />
        <Lightformer intensity={5} color="#ec4899" position={[0, 0, -10]} scale={[24, 24, 1]} />
        <Lightformer intensity={4} color="#38bdf8" position={[10, -2, 2]} scale={[4, 20, 1]} />
        <Lightformer intensity={2} color="#d4ff3a" position={[0, -10, 4]} scale={[20, 3, 1]} />
      </Environment>
      <directionalLight position={[5, 10, 8]} intensity={1.5} />
      {svg && <Model svg={svg} />}
    </Canvas>
  )
}
