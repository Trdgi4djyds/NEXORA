// NEXORA #129 : appareils réalistes en 3D pour la vidéo de présentation : mêmes modèles GLB que le Studio (#100,
// nexora/app/renderer/nx/studioplus/devices/) et même habillage d'écran que les Maquettes (#124 : image recadrée
// comme object-fit: cover, ancrée en haut, texture sans retournement), rendus par le three.js de NEXORA.
// Plateau de studio photo : reflets d'une pièce claire (RoomEnvironment), lumière principale et lumière de contour,
// sol noir brillant (reflet de l'appareil vu à travers un sol presque opaque), ombre de contact douce.
import * as T from "/nexora/app/renderer/dist/chunks/three-D5YSJNBV.js"

const DEVICES = "/nexora/app/renderer/nx/studioplus/devices/"
// Plus grande dimension réelle (mm), comme DEVICES de devices.js : 1 unité = 10 mm.
const MM = { "macbook-pro-16": 356, "macbook-pro-14": 313, "iphone-18-pro": 150, "iphone-17": 150, "ipad-pro-13": 282, "galaxy-s26-ultra": 163, "studio-display": 623 }

function loadImage(src) {
  return new Promise((ok, ko) => {
    const i = new Image()
    i.onload = () => ok(i)
    i.onerror = () => ko(new Error(`image : ${src}`))
    i.src = src
  })
}

// Écran au format exact de la dalle, image ancrée en haut (pages web), comme fitted() de devices.js.
function fitted(img, aspect) {
  const w = 2048
  const hgt = Math.round(w / aspect)
  const c = document.createElement("canvas")
  c.width = w
  c.height = hgt
  const k = Math.max(w / img.naturalWidth, hgt / img.naturalHeight)
  c.getContext("2d").drawImage(img, (w - img.naturalWidth * k) / 2, 0, img.naturalWidth * k, img.naturalHeight * k)
  return c
}

function softDisc(size = 256) {
  const c = document.createElement("canvas")
  c.width = c.height = size
  const x = c.getContext("2d")
  const g = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2)
  g.addColorStop(0, "rgba(0,0,0,0.85)")
  g.addColorStop(0.45, "rgba(0,0,0,0.45)")
  g.addColorStop(1, "rgba(0,0,0,0)")
  x.fillStyle = g
  x.fillRect(0, 0, size, size)
  const t = new T.CanvasTexture(c)
  t.colorSpace = T.SRGBColorSpace
  return t
}

/** Appareil GLB à taille réelle, posé au sol (y = 0), centré, écran habillé de l'image donnée. */
export async function appareil(key, screenSrc) {
  const res = await fetch(`${DEVICES}${key}.glb`)
  if (!res.ok) throw new Error(`modèle ${key} : ${res.status}`)
  const gltf = await new T.GLTFLoader().parseAsync(await res.arrayBuffer(), "")
  const model = gltf.scene
  const box = new T.Box3().setFromObject(model)
  const size = box.getSize(new T.Vector3())
  const c = box.getCenter(new T.Vector3())
  const k = MM[key] / 10 / Math.max(size.x, size.y, size.z, 1e-6)
  model.position.set(-c.x, -box.min.y, -c.z)
  const root = new T.Group()
  root.add(model)
  root.scale.setScalar(k)
  let screen = null
  model.traverse((o) => { if (!screen && o.isMesh && o.name === "NX_SCREEN") screen = o })
  if (screen && screenSrc) {
    screen.geometry.computeBoundingBox()
    const s = screen.geometry.boundingBox.getSize(new T.Vector3())
    const tex = new T.CanvasTexture(fitted(await loadImage(screenSrc), s.x / Math.max(1e-6, s.y)))
    tex.colorSpace = T.SRGBColorSpace
    tex.flipY = false
    tex.anisotropy = 8
    screen.material = new T.MeshBasicMaterial({ map: tex, toneMapped: false })
  }
  root.userData.size = size.clone().multiplyScalar(k)
  return root
}

/** Plateau : moteur, scène, caméra, lumières et sol ; place(appareil) ajoute un appareil avec reflet et ombre. */
export function plateau(canvas, { w = 1920, h = 1080, exposure = 1.05 } = {}) {
  const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true })
  renderer.setPixelRatio(1)
  renderer.setSize(w, h, false)
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.toneMapping = T.NeutralToneMapping
  renderer.toneMappingExposure = exposure
  renderer.setClearColor(0x000000, 0)
  const scene = new T.Scene()
  const pm = new T.PMREMGenerator(renderer)
  scene.environment = pm.fromScene(new T.RoomEnvironment(), 0.04).texture
  pm.dispose()
  if ("environmentIntensity" in scene) scene.environmentIntensity = 0.75
  const key = new T.DirectionalLight(0xffffff, 1.4)
  key.position.set(-30, 60, 50)
  const rim = new T.DirectionalLight(0xffffff, 2.6)
  rim.position.set(20, 30, -60)
  const fill = new T.DirectionalLight(0xffffff, 0.35)
  fill.position.set(50, 10, 30)
  scene.add(key, rim, fill)
  // Sol : presque opaque, de la couleur du fond de la vidéo ; le reflet (copie retournée) se voit au travers.
  const floor = new T.Mesh(new T.PlaneGeometry(4000, 4000), new T.MeshBasicMaterial({ color: 0x050505, transparent: true, opacity: 0.86, depthWrite: true }))
  floor.rotation.x = -Math.PI / 2
  floor.renderOrder = 1
  scene.add(floor)
  const shadowTex = softDisc()
  const camera = new T.PerspectiveCamera(26, w / h, 1, 5000)
  return {
    T,
    renderer,
    scene,
    camera,
    place(root, { x = 0, z = 0, ry = 0, shadow = 1.25 } = {}) {
      const g = new T.Group()
      g.position.set(x, 0, z)
      g.rotation.y = ry
      g.add(root)
      const mirror = root.clone(true)
      mirror.scale.y = -mirror.scale.y
      g.add(mirror)
      const sz = root.userData.size || new T.Vector3(10, 10, 10)
      const disc = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0.9 }))
      disc.rotation.x = -Math.PI / 2
      disc.position.y = 0.02
      disc.scale.set(Math.max(sz.x, 4) * shadow, Math.max(sz.z, 4) * shadow * 1.6, 1)
      disc.renderOrder = 2
      g.add(disc)
      scene.add(g)
      return { group: g, root, mirror }
    },
    look(pos, target, fov) {
      camera.position.set(pos[0], pos[1], pos[2])
      if (fov && camera.fov !== fov) {
        camera.fov = fov
        camera.updateProjectionMatrix()
      }
      camera.lookAt(target[0], target[1], target[2])
    },
    render() {
      renderer.render(scene, camera)
    },
  }
}
