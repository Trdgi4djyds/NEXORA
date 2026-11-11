import { Canvas } from "@react-three/fiber"
import { Environment, Lightformer } from "@react-three/drei"
import { useEffect, useState } from "react"
import * as THREE from "three"
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js"

export function ViewScene({ id, img }: { id: string; img: string }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null)
  useEffect(() => {
    new GLTFLoader().load(`/glb/${id}.glb`, (g) => {
      new THREE.TextureLoader().load(img, (t) => {
        t.flipY = false; t.colorSpace = THREE.SRGBColorSpace
        g.scene.traverse((o: any) => { if (o.name === "NX_SCREEN") o.material = new THREE.MeshBasicMaterial({ map: t, toneMapped: false }) })
        const b = new THREE.Box3().setFromObject(g.scene); const c = b.getCenter(new THREE.Vector3()); const s = b.getSize(new THREE.Vector3())
        g.scene.position.sub(c); const k = 4 / Math.max(s.x, s.y, s.z); g.scene.scale.setScalar(k); g.scene.position.multiplyScalar(k)
        const w = new THREE.Group(); w.add(g.scene); w.rotation.set(0.15, -0.5, 0); setObj(w); (window as any).__ready = true
      })
    })
  }, [id, img])
  return (
    <Canvas gl={{ alpha: true }} camera={{ position: [0, 0.6, 7], fov: 40 }}>
      <Environment resolution={256}>
        <Lightformer intensity={2} position={[0, 6, 4]} scale={[12, 4, 1]} />
        <Lightformer intensity={1.5} position={[-6, 0, 2]} scale={[3, 10, 1]} color="#8b5cf6" />
        <Lightformer intensity={1.5} position={[6, 0, 2]} scale={[3, 10, 1]} color="#60a5fa" />
      </Environment>
      <ambientLight intensity={0.4} />
      {obj && <primitive object={obj} />}
    </Canvas>
  )
}
