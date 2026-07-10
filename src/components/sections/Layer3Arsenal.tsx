'use client'
import { useRef, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useSystemStore } from '@/lib/store'
import { mouseSmooth } from '@/lib/useMouse'
import { scrollProgress, layerAnchorAt, cameraStateAt } from '@/components/three/rig/CameraRig'

// ── LAYER 3 // ~/arsenal — the weapon rack ────────────────────────────────────
// Three racks (BUILD / SECURE / BREAK) resolve from the dither as you descend.
// The active lens (selectedRole) pre-lights its side of the rack; hover arms a
// rack fully. First hover of RACK::BREAK trips the honeypot (alert bump).

const L3_CENTER_P = 0.71
const L3_ANCHOR   = layerAnchorAt(L3_CENTER_P)
const LAYER_3_BAND: [number, number] = [0.65, 0.77]

const IDEAL   = cameraStateAt(L3_CENTER_P)
const FORWARD = IDEAL.lookAt.clone().sub(IDEAL.pos).normalize()
const FACE_EULER = (() => {
  const q = new THREE.Quaternion()
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), FORWARD.clone().negate())
  return new THREE.Euler().setFromQuaternion(q)
})()

const PANEL_W  = 2.05
const PANEL_H  = 2.55
const CANVAS_W = 640
const CANVAS_H = 800

interface Rack {
  id: string
  title: string
  sub: string
  accent: string
  items: [string, string][]
}

const RACKS: Rack[] = [
  {
    id: 'build', title: 'RACK::BUILD', sub: 'ship it', accent: '#00E5FF',
    items: [
      ['Next.js 16', 'PROD'], ['React 19', 'PROD'], ['TypeScript', 'STRICT'],
      ['Node.js', 'PROD'], ['Prisma ORM', 'PROD'], ['PostgreSQL / Neon', 'LIVE'],
      ['Supabase', 'LIVE'], ['NextAuth / JWT', 'HARDENED'], ['Tailwind v4', 'PROD'],
    ],
  },
  {
    id: 'secure', title: 'RACK::SECURE', sub: 'defend it', accent: '#9EFF00',
    items: [
      ['VAPT', 'FIELD'], ['OWASP Top 10', 'MAPPED'], ['Secure SDLC', 'ENFORCED'],
      ['Incident Response', 'DEPLOYED'], ['SOC / SIEM', '+50% DETECT'], ['OAuth / JWT hardening', 'PATCHED'],
      ['RBAC design', 'ENFORCED'], ['ISO 27001 / NIST', 'AUDITED'], ['PCI-DSS / GDPR', 'COMPLIANT'],
    ],
  },
  {
    id: 'break', title: 'RACK::BREAK', sub: 'prove it', accent: '#FF2D55',
    items: [
      ['Burp Suite', 'ARMED'], ['Nmap', 'ARMED'], ['Metasploit', 'ARMED'],
      ['SQLmap', 'ARMED'], ['Hydra', 'ARMED'], ['Gobuster', 'ARMED'],
      ['Nessus', 'SCANNING'], ['Wireshark', 'CAPTURING'], ['Python automation', '−35% MANUAL'],
    ],
  },
]

// Local-space layout inside the camera-facing group — side racks angled inward
const PANEL_POS: [number, number, number][] = [[-2.35, 0, 0], [0, 0, 0.18], [2.35, 0, 0]]
const PANEL_ROT_Y = [0.24, 0, -0.24]

// Role bias: which racks glow for the active lens
const ROLE_BIAS: Record<'builder' | 'breaker' | 'none', [number, number, number]> = {
  builder: [1.0, 0.78, 0.55],
  breaker: [0.55, 0.85, 1.0],
  none:    [0.85, 0.85, 0.85],
}

function drawRack(ctx: CanvasRenderingContext2D, rack: Rack, W: number, H: number) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0C0C10'
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = rack.accent
  ctx.lineWidth   = 2
  ctx.strokeRect(1, 1, W - 2, H - 2)

  // header
  ctx.fillStyle = rack.accent
  ctx.fillRect(0, 0, 6, 72)
  ctx.font         = 'bold 30px "JetBrains Mono", monospace'
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(rack.title, 28, 38)
  ctx.fillStyle = '#4A5860'
  ctx.font      = '400 19px "JetBrains Mono", monospace'
  ctx.textAlign = 'right'
  ctx.fillText(`// ${rack.sub}`, W - 24, 40)

  ctx.strokeStyle = '#1A2830'
  ctx.lineWidth   = 1
  ctx.beginPath(); ctx.moveTo(0, 72); ctx.lineTo(W, 72); ctx.stroke()

  // items — dotted leaders to a status column
  const rowH = 66
  rack.items.forEach(([name, status], i) => {
    const y = 128 + i * rowH
    ctx.fillStyle    = '#E6E6E9'
    ctx.font         = '500 22px "JetBrains Mono", monospace'
    ctx.textAlign    = 'left'
    ctx.fillText(name, 28, y)
    const nameW = ctx.measureText(name).width

    ctx.fillStyle = rack.accent
    ctx.font      = 'bold 17px "JetBrains Mono", monospace'
    ctx.textAlign = 'right'
    ctx.fillText(status, W - 26, y)
    const statusW = ctx.measureText(status).width

    ctx.strokeStyle = '#22303A'
    ctx.setLineDash([2, 5])
    ctx.beginPath()
    ctx.moveTo(28 + nameW + 14, y + 4)
    ctx.lineTo(W - 26 - statusW - 14, y + 4)
    ctx.stroke()
    ctx.setLineDash([])
  })

  // footer
  ctx.strokeStyle = '#1A2830'
  ctx.beginPath(); ctx.moveTo(0, H - 52); ctx.lineTo(W, H - 52); ctx.stroke()
  ctx.fillStyle = '#4A5860'
  ctx.font      = '400 16px "JetBrains Mono", monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`0${rack.items.length} MODULES`, 28, H - 26)
  ctx.textAlign = 'right'
  ctx.fillText('VERIFIED ✓', W - 26, H - 26)
}

export function Layer3Arsenal() {
  const { camera } = useThree()

  const groupRef   = useRef<THREE.Group>(null)
  const meshRefs   = useRef<(THREE.Mesh | null)[]>([null, null, null])
  const headerRef  = useRef<HTMLDivElement | null>(null)
  const visLerp    = useRef(0)
  const revealLerp = useRef([0, 0, 0])
  const hoverLerp  = useRef([0, 0, 0])
  const biasLerp   = useRef([0.85, 0.85, 0.85])
  const breakTripped = useRef(false)

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const mouseNDC  = useMemo(() => new THREE.Vector2(), [])

  useEffect(() => {
    const built: THREE.CanvasTexture[] = []
    let mounted = true

    RACKS.forEach((rack, i) => {
      const canvas  = document.createElement('canvas')
      canvas.width  = CANVAS_W
      canvas.height = CANVAS_H
      const ctx = canvas.getContext('2d')!
      const redraw = () => { if (mounted) drawRack(ctx, rack, CANVAS_W, CANVAS_H) }
      redraw()

      const tex = new THREE.CanvasTexture(canvas)
      tex.minFilter = THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.generateMipmaps = false
      tex.colorSpace = THREE.SRGBColorSpace
      built.push(tex)

      const mesh = meshRefs.current[i]
      if (mesh) {
        const mat = mesh.material as THREE.MeshBasicMaterial
        mat.map = tex
        mat.needsUpdate = true
      }
      document.fonts.ready.then(() => { redraw(); tex.needsUpdate = true })
    })

    return () => { mounted = false; built.forEach((t) => t.dispose()) }
  }, [])

  useFrame((_, delta) => {
    const store = useSystemStore.getState()
    if (!store.bootComplete) return

    const sp = scrollProgress.value
    const inBand = sp >= LAYER_3_BAND[0] && sp <= LAYER_3_BAND[1]
    visLerp.current = THREE.MathUtils.damp(visLerp.current, inBand ? 1 : 0, 4.5, delta)
    const vis = visLerp.current

    if (groupRef.current) groupRef.current.visible = vis > 0.01
    if (headerRef.current) headerRef.current.style.opacity = (vis * 0.75).toFixed(3)
    if (vis <= 0.01) return

    // staggered reveal within the band
    const bp = THREE.MathUtils.clamp((sp - LAYER_3_BAND[0]) / (LAYER_3_BAND[1] - LAYER_3_BAND[0]), 0, 1)

    // hover raycast (mouse lens = decryption metaphor carried through)
    mouseNDC.set(mouseSmooth.x * 2 - 1, -(mouseSmooth.y * 2 - 1))
    raycaster.setFromCamera(mouseNDC, camera)

    const role = store.selectedRole ?? 'none'
    const bias = ROLE_BIAS[role]

    for (let i = 0; i < 3; i++) {
      const mesh = meshRefs.current[i]
      if (!mesh) continue

      const revealOn = inBand && bp > 0.06 + i * 0.08
      revealLerp.current[i] = THREE.MathUtils.damp(revealLerp.current[i], revealOn ? 1 : 0, 4, delta)

      const hit = raycaster.intersectObject(mesh).length > 0
      hoverLerp.current[i] = THREE.MathUtils.damp(hoverLerp.current[i], hit ? 1 : 0, 6, delta)

      if (hit && i === 2 && !breakTripped.current && revealLerp.current[2] > 0.5) {
        breakTripped.current = true
        store.breachNode('arsenal-break') // honeypot: enumerating the offensive rack raises the alarm
        store.setL1LogText('>> HONEYPOT TRIPPED // offensive toolkit enumerated')
      }

      biasLerp.current[i] = THREE.MathUtils.damp(biasLerp.current[i], bias[i], 3, delta)

      const reveal = revealLerp.current[i]
      const hl = hoverLerp.current[i]
      const mat = mesh.material as THREE.MeshBasicMaterial
      mat.opacity = vis * reveal * Math.min(1, biasLerp.current[i] + hl * 0.45)

      mesh.position.y = PANEL_POS[i][1] + (1 - reveal) * -0.5
      const s = 1 + hl * 0.04
      mesh.scale.set(s, s, 1)
    }
  })

  return (
    <group position={[L3_ANCHOR.x, L3_ANCHOR.y, L3_ANCHOR.z]} rotation={FACE_EULER}>
      <group ref={groupRef} visible={false}>
        {RACKS.map((rack, i) => (
          <mesh
            key={rack.id}
            ref={(el) => { meshRefs.current[i] = el }}
            position={PANEL_POS[i]}
            rotation={[0, PANEL_ROT_Y[i], 0]}
            renderOrder={1}
          >
            <planeGeometry args={[PANEL_W, PANEL_H]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>
        ))}

        <Html position={[0, 1.75, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div ref={headerRef} style={{
            opacity: 0, color: '#E6E6E9',
            fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
            fontSize: '11px', letterSpacing: '0.28em', whiteSpace: 'nowrap',
          }}>
            LAYER 3 // ~/arsenal — pick your weapons
          </div>
        </Html>
      </group>
    </group>
  )
}
