'use client'
import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { useSystemStore } from '@/lib/store'
import { scrollProgress, layerAnchorAt, cameraStateAt } from '@/components/three/rig/CameraRig'
import { rootDecrypt } from '@/components/three/postfx/DitherEffect'

// ── LAYER 5 // ~/root — ACCESS GRANTED ────────────────────────────────────────
// The payoff: entering the band tweens rootDecrypt → 1 and the ENTIRE screen
// resolves out of the dither (the attacker "wins" — because the builder let
// them). Alert cools to zero. The DOM terminal (overlay/Terminal.tsx) opens.

const L5_CENTER_P = 0.965
const L5_ANCHOR   = layerAnchorAt(L5_CENTER_P)
const LAYER_5_BAND: [number, number] = [0.94, 1.0]

const IDEAL   = cameraStateAt(L5_CENTER_P)
const FORWARD = IDEAL.lookAt.clone().sub(IDEAL.pos).normalize()
const FACE_EULER = (() => {
  const q = new THREE.Quaternion()
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), FORWARD.clone().negate())
  return new THREE.Euler().setFromQuaternion(q)
})()

function drawAccess(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.clearRect(0, 0, W, H)
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle   = '#E6E6E9'
  ctx.font        = 'bold 190px "Space Grotesk", system-ui, sans-serif'
  ctx.shadowColor = '#9EFF0040'
  ctx.shadowBlur  = 26
  ctx.fillText('ACCESS GRANTED', W / 2, H * 0.42)
  ctx.shadowBlur  = 0

  ctx.fillStyle = '#9EFF00'
  ctx.font      = '500 40px "JetBrains Mono", monospace'
  ctx.fillText('root@mayank:~#  all layers decrypted · alert level nominal', W / 2, H * 0.82)
}

function drawContact(ctx: CanvasRenderingContext2D, W: number, H: number) {
  ctx.clearRect(0, 0, W, H)
  ctx.textAlign    = 'center'
  ctx.textBaseline = 'middle'

  ctx.fillStyle = '#E6E6E9'
  ctx.font      = 'bold 52px "JetBrains Mono", monospace'
  ctx.fillText('mks1199yr521@gmail.com', W / 2, H * 0.22)

  ctx.fillStyle = '#5A6870'
  ctx.font      = '400 34px "JetBrains Mono", monospace'
  ctx.fillText('linkedin.com/in/mayank-sharma-184ba1153', W / 2, H * 0.52)

  ctx.fillStyle = '#00E5FF'
  ctx.font      = '500 30px "JetBrains Mono", monospace'
  ctx.fillText('▸ the shell below is live — type `help`', W / 2, H * 0.82)
}

export function Layer5Root() {
  const groupRef   = useRef<THREE.Group>(null)
  const accessRef  = useRef<THREE.Mesh>(null)
  const contactRef = useRef<THREE.Mesh>(null)
  const coreWireRef  = useRef<THREE.Mesh>(null)
  const coreSolidRef = useRef<THREE.Mesh>(null)
  const visLerp    = useRef(0)
  const enteredRef = useRef(false)

  useEffect(() => {
    const built: THREE.CanvasTexture[] = []
    let mounted = true

    const make = (
      w: number, h: number,
      draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
      meshRef: React.RefObject<THREE.Mesh | null>,
    ) => {
      const canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      const ctx = canvas.getContext('2d')!
      const redraw = () => { if (mounted) draw(ctx, w, h) }
      redraw()
      const tex = new THREE.CanvasTexture(canvas)
      tex.minFilter = THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.generateMipmaps = false
      tex.colorSpace = THREE.SRGBColorSpace
      built.push(tex)
      const mesh = meshRef.current
      if (mesh) {
        const mat = mesh.material as THREE.MeshBasicMaterial
        mat.map = tex
        mat.needsUpdate = true
      }
      document.fonts.ready.then(() => { redraw(); tex.needsUpdate = true })
    }

    make(2048, 512, drawAccess, accessRef)
    make(1800, 300, drawContact, contactRef)

    return () => {
      mounted = false
      built.forEach((t) => t.dispose())
      // never leave the world decrypted if the section unmounts mid-visit
      gsap.killTweensOf(rootDecrypt)
      rootDecrypt.value = 0
    }
  }, [])

  useFrame((state, delta) => {
    const store = useSystemStore.getState()
    if (!store.bootComplete) return

    const sp = scrollProgress.value
    const inBand = sp >= LAYER_5_BAND[0]
    visLerp.current = THREE.MathUtils.damp(visLerp.current, inBand ? 1 : 0, 4.5, delta)
    const vis = visLerp.current

    if (groupRef.current) groupRef.current.visible = vis > 0.01

    // full-decrypt handshake — once per entry/exit
    if (inBand && !enteredRef.current) {
      enteredRef.current = true
      gsap.killTweensOf(rootDecrypt)
      gsap.to(rootDecrypt, { value: 1, duration: 1.4, ease: 'power2.inOut' })
      store.setAlertLevel(0)
      if (store.l1Status !== 'idle') store.setL1LogText('>> ACCESS GRANTED // root shell open')
    } else if (!inBand && enteredRef.current) {
      enteredRef.current = false
      gsap.killTweensOf(rootDecrypt)
      gsap.to(rootDecrypt, { value: 0, duration: 0.9, ease: 'power2.inOut' })
    }

    if (vis <= 0.01) return
    const t = state.clock.elapsedTime

    const access = accessRef.current
    if (access) {
      (access.material as THREE.MeshBasicMaterial).opacity = vis
      access.position.y = 0.95 + Math.sin(t * 0.5) * 0.03
    }
    const contact = contactRef.current
    if (contact) (contact.material as THREE.MeshBasicMaterial).opacity = vis * 0.92

    // root core — the heart of the system, finally calm
    const pulse = 1 + Math.sin(t * 1.8) * 0.07
    if (coreWireRef.current) {
      coreWireRef.current.scale.setScalar(pulse)
      coreWireRef.current.rotation.y = t * 0.3
      ;(coreWireRef.current.material as THREE.MeshBasicMaterial).opacity = vis * 0.55
    }
    if (coreSolidRef.current) {
      coreSolidRef.current.scale.setScalar(pulse * 0.65)
      ;(coreSolidRef.current.material as THREE.MeshBasicMaterial).opacity = vis * 0.2
    }
  })

  return (
    <group position={[L5_ANCHOR.x, L5_ANCHOR.y, L5_ANCHOR.z]} rotation={FACE_EULER}>
      <group ref={groupRef} visible={false}>

        <mesh ref={accessRef} position={[0, 0.95, 0]} renderOrder={1}>
          <planeGeometry args={[6.2, 1.55]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>

        <mesh ref={contactRef} position={[0, -0.35, 0]} renderOrder={1}>
          <planeGeometry args={[4.9, 0.82]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>

        <mesh ref={coreWireRef} position={[0, -1.55, 0]}>
          <icosahedronGeometry args={[0.3, 1]} />
          <meshBasicMaterial color="#9EFF00" wireframe transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>
        <mesh ref={coreSolidRef} position={[0, -1.55, 0]}>
          <icosahedronGeometry args={[0.3, 1]} />
          <meshBasicMaterial color="#9EFF00" transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>

      </group>
    </group>
  )
}
