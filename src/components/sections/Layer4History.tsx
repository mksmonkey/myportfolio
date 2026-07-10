'use client'
import { useRef, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useSystemStore } from '@/lib/store'
import { scrollProgress, layerAnchorAt, cameraStateAt } from '@/components/three/rig/CameraRig'

// ── LAYER 4 // ~/history — system logs ────────────────────────────────────────
// Career = a boot log. A CRT scanline sweeps down as you scroll; every log
// block it passes gets "verified" and resolves. Scroll IS the scrub head.

const L4_CENTER_P = 0.855
const L4_ANCHOR   = layerAnchorAt(L4_CENTER_P)
const LAYER_4_BAND: [number, number] = [0.80, 0.92]

const IDEAL   = cameraStateAt(L4_CENTER_P)
const FORWARD = IDEAL.lookAt.clone().sub(IDEAL.pos).normalize()
const FACE_EULER = (() => {
  const q = new THREE.Quaternion()
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), FORWARD.clone().negate())
  return new THREE.Euler().setFromQuaternion(q)
})()

const BLOCK_W  = 4.7
const BLOCK_H  = 0.78
const CANVAS_W = 1500
const CANVAS_H = 230
const BLOCK_YS = [1.5, 0.75, 0, -0.75, -1.5]
const SCAN_TOP = 1.92
const SCAN_BOT = -1.95

interface LogEntry {
  time: string
  org: string
  role: string
  detail: string
  status: string
  accent: string
}

const LOGS: LogEntry[] = [
  {
    time: '[2026.01 → ACTIVE]', org: 'getnovative.solutions',
    role: 'FULL-STACK DEVELOPER',
    detail: 'solo dev — 5 production apps shipped end-to-end · secure-by-default architecture',
    status: '● ACTIVE', accent: '#00E5FF',
  },
  {
    time: '[2025.03 → 2025.08]', org: 'coe-security.llc',
    role: 'CYBEROPS & INCIDENT RESPONSE SPECIALIST',
    detail: '80+ vulns remediated (−47% attack surface) · SIEM +50% detection · 100% audit pass',
    status: 'EXIT 0', accent: '#9EFF00',
  },
  {
    time: '[2025.02 → 2025.04]', org: 'azerium.dev',
    role: 'PENETRATION TESTER',
    detail: 'web/network VAPT · critical IDOR found & responsibly disclosed in production APIs',
    status: 'EXIT 0', accent: '#FF6B00',
  },
  {
    time: '[2024.10 → 2025.01]', org: '1stop.ai',
    role: 'CYBERSECURITY INTERN',
    detail: '23+ linux servers hardened (−42% misconfig) · RBAC (−15% priv-esc) · log automation',
    status: 'EXIT 0', accent: '#FF6B00',
  },
  {
    time: '[credentials.sig]', org: 'CEH v11 · ISC2 SSCP · IBM CySec Analyst · Google CySec · Postman API — 25+ verified',
    role: 'CERTS + EDU + CTF',
    detail: 'MCA CS — Chandigarh University (2023–25) · CTF top 10% — Kashi (IIT-BHU) · H4CKP13T · WWCTF',
    status: 'SIGNED ✓', accent: '#E6E6E9',
  },
]

function drawLog(ctx: CanvasRenderingContext2D, log: LogEntry, W: number, H: number) {
  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#0B0B0F'
  ctx.fillRect(0, 0, W, H)

  // left accent rail
  ctx.fillStyle = log.accent
  ctx.fillRect(0, 0, 7, H)

  ctx.strokeStyle = '#1A2830'
  ctx.lineWidth   = 1.5
  ctx.strokeRect(1, 1, W - 2, H - 2)

  ctx.textBaseline = 'middle'

  // line 1 — timestamp :: org
  ctx.fillStyle = '#4A5860'
  ctx.font      = '400 25px "JetBrains Mono", monospace'
  ctx.textAlign = 'left'
  ctx.fillText(`${log.time}  ::  ${log.org}`, 34, 46)

  // status — top right
  ctx.fillStyle = log.accent
  ctx.font      = 'bold 25px "JetBrains Mono", monospace'
  ctx.textAlign = 'right'
  ctx.fillText(log.status, W - 30, 46)

  // line 2 — role
  ctx.fillStyle = '#E6E6E9'
  ctx.font      = 'bold 46px "Space Grotesk", system-ui, sans-serif'
  ctx.textAlign = 'left'
  ctx.fillText(log.role, 32, 118)

  // line 3 — detail
  ctx.fillStyle = '#5A6870'
  ctx.font      = '400 25px "JetBrains Mono", monospace'
  ctx.fillText(log.detail, 34, 186)
}

export function Layer4History() {
  const groupRef  = useRef<THREE.Group>(null)
  const meshRefs  = useRef<(THREE.Mesh | null)[]>(Array(LOGS.length).fill(null))
  const panelRefs = useRef<(HTMLDivElement | null)[]>(Array(LOGS.length).fill(null))
  const scanRef   = useRef<THREE.Mesh>(null)
  const headerRef = useRef<HTMLDivElement | null>(null)
  const visLerp   = useRef(0)
  const blockLerp = useRef<number[]>(Array(LOGS.length).fill(0))

  useEffect(() => {
    const built: THREE.CanvasTexture[] = []
    let mounted = true

    LOGS.forEach((log, i) => {
      const canvas  = document.createElement('canvas')
      canvas.width  = CANVAS_W
      canvas.height = CANVAS_H
      const ctx = canvas.getContext('2d')!
      const redraw = () => { if (mounted) drawLog(ctx, log, CANVAS_W, CANVAS_H) }
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

  useFrame((state, delta) => {
    const store = useSystemStore.getState()
    if (!store.bootComplete) return

    const sp = scrollProgress.value
    const inBand = sp >= LAYER_4_BAND[0] && sp <= LAYER_4_BAND[1]
    visLerp.current = THREE.MathUtils.damp(visLerp.current, inBand ? 1 : 0, 4.5, delta)
    const vis = visLerp.current

    if (groupRef.current) groupRef.current.visible = vis > 0.01
    if (headerRef.current) headerRef.current.style.opacity = (vis * 0.75).toFixed(3)
    if (vis <= 0.01) return

    // scanline position — scroll-scrubbed, eased at the ends
    const bpRaw = THREE.MathUtils.clamp((sp - LAYER_4_BAND[0]) / (LAYER_4_BAND[1] - LAYER_4_BAND[0]), 0, 1)
    const bp = THREE.MathUtils.smoothstep(bpRaw, 0.04, 0.9)
    const scanY = THREE.MathUtils.lerp(SCAN_TOP, SCAN_BOT, bp)

    const t = state.clock.elapsedTime
    const scan = scanRef.current
    if (scan) {
      scan.position.y = scanY
      const mat = scan.material as THREE.MeshBasicMaterial
      // scanline lives only mid-sweep; flickers slightly like a CRT scrub head
      const alive = bp > 0.005 && bp < 0.995 ? 1 : 0
      mat.opacity = vis * alive * (0.75 + Math.sin(t * 22) * 0.12)
    }

    for (let i = 0; i < LOGS.length; i++) {
      const mesh = meshRefs.current[i]
      if (!mesh) continue
      // verified once the scanline has swept past this block
      const verified = scanY < BLOCK_YS[i] - BLOCK_H * 0.4
      blockLerp.current[i] = THREE.MathUtils.damp(blockLerp.current[i], verified ? 1 : 0, 5, delta)
      const bl = blockLerp.current[i]

      const mat = mesh.material as THREE.MeshBasicMaterial
      const pending = 0.42 + Math.sin(t * 9 + i * 2.3) * 0.035
      const resolved = THREE.MathUtils.lerp(pending, 1, bl)
      mat.opacity = vis * resolved
      mesh.position.x = (1 - bl) * Math.sin(t * 13 + i * 5.1) * 0.012

      const panel = panelRefs.current[i]
      if (panel) {
        panel.style.opacity = (vis * THREE.MathUtils.lerp(0.72, 1, bl)).toFixed(3)
        panel.style.transform = `translate3d(${(1 - bl) * Math.sin(t * 13 + i * 5.1) * 2}px, 0, 0)`
        panel.style.borderColor = bl > 0.75 ? LOGS[i].accent : 'rgba(230,230,233,0.24)'
      }
    }
  })

  return (
    <group position={[L4_ANCHOR.x, L4_ANCHOR.y, L4_ANCHOR.z]} rotation={FACE_EULER}>
      <group ref={groupRef} visible={false}>
        {LOGS.map((log, i) => (
          <group key={log.org} position={[0, BLOCK_YS[i], 0]}>
            <mesh
              ref={(el) => { meshRefs.current[i] = el }}
              renderOrder={1}
            >
              <planeGeometry args={[BLOCK_W, BLOCK_H]} />
              <meshBasicMaterial transparent opacity={0} depthWrite={false} toneMapped={false} />
            </mesh>
            <Html center distanceFactor={7.2} position={[0, 0, 0.08]} style={{ pointerEvents: 'none' }}>
              <div
                ref={(el) => { panelRefs.current[i] = el }}
                style={{
                  width: '780px',
                  minHeight: '108px',
                  opacity: 0,
                  boxSizing: 'border-box',
                  background: 'rgba(6,7,10,0.84)',
                  border: '1px solid rgba(230,230,233,0.24)',
                  borderLeft: `5px solid ${log.accent}`,
                  padding: '14px 18px 13px',
                  fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
                  boxShadow: `0 0 28px ${log.accent}22`,
                  backdropFilter: 'blur(2px)',
                  transition: 'border-color 0.22s ease',
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '18px',
                  color: '#7A8790',
                  fontSize: '13px',
                  lineHeight: 1.25,
                  whiteSpace: 'nowrap',
                }}>
                  <span>{log.time} :: {log.org}</span>
                  <span style={{ color: log.accent, fontWeight: 700 }}>{log.status}</span>
                </div>
                <div style={{
                  marginTop: '8px',
                  color: '#F2F4F5',
                  fontFamily: 'var(--font-display), system-ui, sans-serif',
                  fontSize: '28px',
                  fontWeight: 800,
                  lineHeight: 1,
                  letterSpacing: 0,
                  whiteSpace: 'nowrap',
                  textShadow: '0 0 16px rgba(255,255,255,0.22)',
                }}>
                  {log.role}
                </div>
                <div style={{
                  marginTop: '9px',
                  color: '#B6C0C6',
                  fontSize: '14px',
                  lineHeight: 1.35,
                  whiteSpace: 'normal',
                }}>
                  {log.detail}
                </div>
              </div>
            </Html>
          </group>
        ))}

        {/* CRT scrub head */}
        <mesh ref={scanRef} position={[0, SCAN_TOP, 0.05]} renderOrder={2}>
          <planeGeometry args={[BLOCK_W + 0.5, 0.045]} />
          <meshBasicMaterial color="#FFFFFF" transparent opacity={0} depthWrite={false} toneMapped={false} />
        </mesh>

        <Html position={[0, 2.16, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
          <div ref={headerRef} style={{
            opacity: 0, color: '#E6E6E9',
            fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
            fontSize: '11px', letterSpacing: '0.28em', whiteSpace: 'nowrap',
          }}>
            LAYER 4 // ~/history — tail -f career.log
          </div>
        </Html>
      </group>
    </group>
  )
}
