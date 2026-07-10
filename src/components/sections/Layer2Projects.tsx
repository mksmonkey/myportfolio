'use client'
import { useRef, useEffect, useMemo, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three'
import { useSystemStore } from '@/lib/store'
import { mouseSmooth } from '@/lib/useMouse'
import { scrollProgress, layerAnchorAt } from '@/components/three/rig/CameraRig'

// ── Layer 2 anchor — centered in camera view at p=0.52 ───────────────────────
// layerAnchorAt(0.52) → cam=(0,-4.68,4.22) + dir*(0,0.4850,-0.8746)*4.5 ≈ (0,-2.50,0.28)
const L2_CENTER_P   = 0.52
const L2_ANCHOR     = layerAnchorAt(L2_CENTER_P)

const SLAB_W         = 2.2
const SLAB_H         = 1.4
const CARD_W         = 1024
const CARD_H         = 640
// Non-overlapping band with transit gaps on both sides — layers never co-exist.
// Center at 0.52; scroll-focus decrypt plateau matches (Scene.tsx FOCUS_BANDS).
const LAYER_2_BAND: [number, number] = [0.44, 0.60]

// ── Project data (CLAUDE.md §10) ─────────────────────────────────────────────
interface Project {
  id: string; name: string; url: string; type: string
  stack: string; vuln: string; patch: string
  fileId: string; classified: boolean; security?: boolean
}

// BUILDER view — full-stack / product framing
const BUILDER_PROJECTS: Project[] = [
  {
    id: 'sarvavidhi', name: 'SARVAVIDHI', url: 'sarvavidhi.com',
    type: 'Multi-Tenant SaaS',
    stack: 'Next.js · Prisma · Neon · NextAuth · QStash · Gemini',
    vuln: 'OAuth callback state-tampering → account-takeover + cross-tenant leak',
    patch: 'State-scoped session bind · per-tenant row isolation · atomic locks',
    fileId: 'FILE::0x4A1F', classified: false,
  },
  {
    id: 'vedaecho', name: 'VEDA ECHO', url: 'vedaecho.com',
    type: 'Subscription Platform',
    stack: 'Next.js · Prisma · Supabase · Cloudinary · UploadThing',
    vuln: 'IDOR on paid content — broken access control bypass',
    patch: 'RBAC tiers · JWT(jose) · server-side entitlement enforcement',
    fileId: 'FILE::0x2B8E', classified: false,
  },
  {
    id: 'ayuceutical', name: 'AYUCEUTICAL', url: 'ayuceutical.com',
    type: 'AI Healthcare Platform',
    stack: 'Next.js · Vercel AI SDK · Gemini · Resend',
    vuln: 'Prompt-injection → unsafe medical output exfiltration',
    patch: 'Server-side guardrails · output sanitization · content policy',
    fileId: 'FILE::0x7C3D', classified: false,
  },
  {
    id: 'getnovative', name: 'GETNOVATIVE', url: 'getnovative.com',
    type: '3D Studio Portfolio',
    stack: 'Three.js · React Three Fiber · GSAP · Next.js',
    vuln: '[CLASSIFIED]',
    patch: 'SECURE_BUILD :: no CVEs on record',
    fileId: 'FILE::0x5E92', classified: true,
  },
  {
    id: 'abhishek', name: 'ABHISHEK.REALTOR', url: 'Vercel · live',
    type: 'Luxury Real Estate',
    stack: 'Next.js · Framer Motion · Lenis · Tailwind',
    vuln: '[CLASSIFIED]',
    patch: 'SECURE_BUILD :: no CVEs on record',
    fileId: 'FILE::0x1A7B', classified: true,
  },
]

// BREAKER view — security / offensive framing (same world, different lens)
const BREAKER_PROJECTS: Project[] = [
  {
    id: 'sarvavidhi-sec', name: 'SARVAVIDHI', url: 'sarvavidhi.com',
    type: 'CVE :: OAuth + Tenant Isolation',
    stack: 'Next.js · NextAuth · Prisma · QStash webhooks',
    vuln: 'OAuth state-tampering → ATO + cross-tenant data exfiltration',
    patch: 'State-scoped userId bind · per-tenant row isolation · atomic status locks',
    fileId: 'VULN::0x4A1F', classified: false, security: true,
  },
  {
    id: 'vedaecho-sec', name: 'VEDA ECHO', url: 'vedaecho.com',
    type: 'CVE :: Broken Access Control',
    stack: 'Next.js · Supabase · jose JWT · UploadThing',
    vuln: 'IDOR on paid content — subscription tier bypass via direct resource ID',
    patch: 'Server-side entitlement checks · RBAC tiers · JWT validation (jose)',
    fileId: 'VULN::0x2B8E', classified: false, security: true,
  },
  {
    id: 'ayuceutical-sec', name: 'AYUCEUTICAL', url: 'ayuceutical.com',
    type: 'CVE :: LLM Prompt Injection',
    stack: 'Next.js · Vercel AI SDK · Gemini · Resend',
    vuln: 'Prompt-injection → unsafe medical output / system prompt exfiltration',
    patch: 'Server-side guardrails · output sanitization · content policy enforcement',
    fileId: 'VULN::0x7C3D', classified: false, security: true,
  },
  {
    id: 'coe-security', name: 'COE SECURITY', url: 'COE Security LLC · 2025',
    type: 'Security Operations · SOC',
    stack: 'SIEM · IDS/IPS · Nessus · Splunk · Python automation',
    vuln: '80+ vulnerabilities identified across network + web attack surface',
    patch: '−47% attack surface · +50% detection speed · 100% audit compliance',
    fileId: 'LOG::0x8F11', classified: false, security: true,
  },
  {
    id: 'ctf-warzone', name: 'WARZONE CTF', url: 'Kashi CTF · H4CKP13T 0x01 · WWCTF',
    type: 'Offensive Security :: CTF',
    stack: 'Burp Suite · Nmap · Metasploit · SQLmap · Hydra · Gobuster',
    vuln: 'Real-world exploit chains — web, network, crypto, OSINT categories',
    patch: 'Top 10% / 500+ competitors · multiple WARZONE badges · Azerium IDOR disclosed',
    fileId: 'CTF::0xDEAD', classified: false, security: true,
  },
]

// Alias: default (no role selected) shows BUILDER view
const PROJECTS = BUILDER_PROJECTS

// LOCAL-SPACE slab offsets from L2_ANCHOR.
// Column spread ±1.28 X; vertical spread ±1.9 Y — fits the 60° FOV at 4.5u view dist.
const SLAB_OFFSETS: [number, number, number][] = [
  [-1.28,  1.30, 0.04],
  [ 1.28,  0.50, 0.04],
  [-1.28, -0.30, 0.04],
  [ 1.28, -1.10, 0.04],
  [ 0.00, -1.90, 0.04],
]

// ── ASCII Rain Shaders ────────────────────────────────────────────────────────
const asciiVert = /* glsl */`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const asciiFrag = /* glsl */`
uniform float uTime;
uniform float uHover;
uniform float uVis;
varying vec2 vUv;

float h21(vec2 p) {
  p = fract(p * vec2(127.1, 311.7));
  p += dot(p, p + 17.31);
  return fract(p.x * p.y);
}

void main() {
  const float COLS = 27.0;
  const float ROWS = 17.0;

  vec2 gUv   = vUv * vec2(COLS, ROWS);
  vec2 cell  = floor(gUv);
  vec2 local = fract(gUv);
  float col  = cell.x;
  float row  = cell.y;

  float mx = 0.10, my = 0.14;
  bool inCell = local.x > mx && local.x < 1.0 - mx
             && local.y > my && local.y < 1.0 - my;

  if (!inCell) {
    gl_FragColor = vec4(0.05, 0.06, 0.07, (1.0 - uHover) * 0.55 * uVis);
    return;
  }

  float cSeed = h21(vec2(col, 0.0));
  float speed = 0.7 + cSeed * 1.6;
  float phase = h21(vec2(col, 42.0));

  float headY = mod(uTime * speed * 2.6 + phase * ROWS, ROWS);
  float dist  = mod(row - floor(headY) + ROWS, ROWS);

  float tLen  = 5.0 + h21(vec2(col, 1.0)) * 5.5;
  float trail = pow(clamp(1.0 - dist / tLen, 0.0, 1.0), 2.0);

  float headGlow = step(dist, 0.99) * 1.6;

  float tSlot = floor(uTime * 14.0);
  float cOn   = step(0.32, h21(vec2(col * 0.1 + tSlot * 0.013, row)));

  float bw   = 0.50 + h21(vec2(col + floor(uTime * 6.0), row)) * 0.38;
  float lx   = local.x - mx;
  float bMax = 1.0 - 2.0 * mx;
  float pad  = bMax * (1.0 - bw) * 0.5;
  float bar  = step(pad, lx) * (1.0 - step(bMax - pad, lx));

  float bright = (trail * cOn + headGlow) * bar;
  float lum    = clamp(bright, 0.0, 1.3);

  vec3 headCol  = vec3(0.92, 0.96, 1.00);
  vec3 trailCol = vec3(0.24, 0.27, 0.31);
  vec3 bgCol    = vec3(0.07, 0.08, 0.09);
  vec3 rgb      = mix(bgCol, mix(trailCol, headCol, min(lum, 1.0)), min(lum + 0.05, 1.0));

  float alpha = (1.0 - uHover) * clamp(lum + 0.09, 0.07, 1.0) * uVis;
  gl_FragColor = vec4(rgb, alpha);
}
`

// ── Card canvas drawing ───────────────────────────────────────────────────────
function drawCard(ctx: CanvasRenderingContext2D, p: Project, W: number, H: number) {
  const accent  = p.security ? '#FF6B00' : '#00E5FF'
  const accent2 = p.security ? '#FF2D55' : '#9EFF00'
  const headerBg = p.security ? '#130800' : '#001018'

  ctx.clearRect(0, 0, W, H)

  ctx.fillStyle = '#0C0C10'
  ctx.fillRect(0, 0, W, H)

  ctx.strokeStyle = accent
  ctx.lineWidth   = 2
  ctx.strokeRect(1, 1, W - 2, H - 2)

  ctx.fillStyle = headerBg
  ctx.fillRect(0, 0, W, 52)

  ctx.fillStyle    = accent
  ctx.font         = '500 19px "JetBrains Mono", monospace'
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(`${p.fileId}   ·   ${p.type.toUpperCase()}`, 20, 26)

  ctx.fillStyle = accent2
  ctx.textAlign = 'right'
  ctx.fillText(p.classified ? 'SECURED' : (p.security ? '▲ EXPOSED' : '● ACCESSED'), W - 20, 26)

  ctx.fillStyle    = '#E6E6E9'
  ctx.textAlign    = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.font         = 'bold 76px "Space Grotesk", system-ui, sans-serif'
  ctx.shadowColor  = p.security ? '#FF6B0030' : '#00E5FF30'
  ctx.shadowBlur   = 16
  ctx.fillText(p.name, 24, 156)
  ctx.shadowBlur   = 0

  ctx.fillStyle = '#334048'
  ctx.font      = '400 21px "JetBrains Mono", monospace'
  ctx.fillText(p.url, 26, 190)

  ctx.fillStyle   = '#4A5860'
  ctx.font        = '400 17px "JetBrains Mono", monospace'
  const parts     = p.stack.split(' · ')
  const half      = Math.ceil(parts.length / 2)
  ctx.fillText(parts.slice(0, half).join(' · '), 26, 222)
  if (parts.length > 1) ctx.fillText(parts.slice(half).join(' · '), 26, 244)

  ctx.strokeStyle = '#1A2830'
  ctx.lineWidth   = 1
  ctx.beginPath(); ctx.moveTo(24, 266); ctx.lineTo(W - 24, 266); ctx.stroke()

  if (p.classified) {
    ctx.fillStyle = '#336655'
    ctx.font      = 'bold 17px "JetBrains Mono", monospace'
    ctx.fillText('[CLASSIFIED] — vulnerability data sealed', 26, 308)
    ctx.fillStyle = '#669955'
    ctx.font      = '400 17px "JetBrains Mono", monospace'
    ctx.fillText(p.patch, 26, 370)
  } else {
    const vulnLabel = p.security ? 'EXPOSED ▸' : 'VULN ▸'
    const patchLabel = p.security ? 'FIXED ▸'  : 'PATCH ▸'
    ctx.fillStyle = p.security ? '#FF2D55' : '#FF6B00'
    ctx.font      = 'bold 17px "JetBrains Mono", monospace'
    ctx.fillText(vulnLabel, 26, 305)
    ctx.fillStyle = p.security ? '#AA2040' : '#BB4400'
    ctx.font      = '400 17px "JetBrains Mono", monospace'
    ctx.fillText(p.vuln, 26, 330)

    ctx.fillStyle = p.security ? '#FF6B00' : '#9EFF00'
    ctx.font      = 'bold 17px "JetBrains Mono", monospace'
    ctx.fillText(patchLabel, 26, 378)
    ctx.fillStyle = p.security ? '#BB5500' : '#6EBB00'
    ctx.font      = '400 17px "JetBrains Mono", monospace'
    ctx.fillText(p.patch, 26, 402)
  }

  ctx.fillStyle = '#080C10'
  ctx.fillRect(0, H - 48, W, 48)
  ctx.strokeStyle = '#1A2830'
  ctx.lineWidth   = 1
  ctx.beginPath(); ctx.moveTo(0, H - 48); ctx.lineTo(W, H - 48); ctx.stroke()
  ctx.fillStyle    = '#29404F'
  ctx.textAlign    = 'right'
  ctx.textBaseline = 'middle'
  ctx.font         = '400 15px "JetBrains Mono", monospace'
  ctx.fillText('STATUS :: PATCHED + DEPLOYED', W - 20, H - 24)
}

// ── Component ─────────────────────────────────────────────────────────────────
export function Layer2Projects() {
  const { camera } = useThree()

  const groupRef     = useRef<THREE.Group>(null)
  const headerRef    = useRef<HTMLDivElement | null>(null)
  const asciiMeshes  = useRef<(THREE.Mesh | null)[]>(Array(5).fill(null))
  const revealMeshes = useRef<(THREE.Mesh | null)[]>(Array(5).fill(null))
  const hoverLerps   = useRef<number[]>(Array(5).fill(0))
  const breached     = useRef<boolean[]>(Array(5).fill(false))
  const visLerp      = useRef(0)

  const uniforms = useMemo(
    () => PROJECTS.map(() => ({ uTime: { value: 0 }, uHover: { value: 0 }, uVis: { value: 0 } })),
    [],
  )

  const builderTextures = useRef<(THREE.CanvasTexture | null)[]>(Array(5).fill(null))
  const breakerTextures = useRef<(THREE.CanvasTexture | null)[]>(Array(5).fill(null))
  // Track last role to avoid redundant map swaps
  const lastRoleRef = useRef<'builder' | 'breaker' | null>(null)

  useEffect(() => {
    let mounted = true
    const built: THREE.CanvasTexture[] = []

    const buildSet = (
      projects: Project[],
      store: MutableRefObject<(THREE.CanvasTexture | null)[]>,
    ) => {
      projects.forEach((p, i) => {
        const canvas  = document.createElement('canvas')
        canvas.width  = CARD_W
        canvas.height = CARD_H
        const ctx     = canvas.getContext('2d')!

        const redraw = () => { if (mounted) drawCard(ctx, p, CARD_W, CARD_H) }
        redraw()

        const tex = new THREE.CanvasTexture(canvas)
        tex.minFilter       = THREE.LinearFilter
        tex.magFilter       = THREE.LinearFilter
        tex.generateMipmaps = false
        tex.colorSpace      = THREE.SRGBColorSpace
        store.current[i]    = tex
        built.push(tex)

        document.fonts.ready.then(() => { redraw(); tex.needsUpdate = true })
      })
    }

    buildSet(BUILDER_PROJECTS, builderTextures)
    buildSet(BREAKER_PROJECTS, breakerTextures)

    // Seed initial map (builder default)
    revealMeshes.current.forEach((mesh, i) => {
      if (mesh && builderTextures.current[i]) {
        const mat = mesh.material as THREE.MeshBasicMaterial
        mat.map = builderTextures.current[i]
        mat.needsUpdate = true
      }
    })

    return () => {
      mounted = false
      built.forEach(t => t.dispose())
      builderTextures.current.fill(null)
      breakerTextures.current.fill(null)
    }
  }, [])

  const raycaster = useMemo(() => new THREE.Raycaster(), [])
  const mouseNDC  = useMemo(() => new THREE.Vector2(), [])

  useFrame((state, delta) => {
    const sp = scrollProgress.value
    const store = useSystemStore.getState()
    if (!store.bootComplete) return

    const inBand = sp >= LAYER_2_BAND[0] && sp <= LAYER_2_BAND[1]
    visLerp.current = THREE.MathUtils.damp(visLerp.current, inBand ? 1 : 0, 4.5, delta)
    const vis = visLerp.current

    if (groupRef.current) groupRef.current.visible = vis > 0.01
    if (headerRef.current) headerRef.current.style.opacity = (vis * 0.75).toFixed(3)
    if (vis <= 0.01) return

    // Switch texture set when role changes (imperative, no re-render)
    const role = store.selectedRole ?? 'builder'
    if (role !== lastRoleRef.current) {
      lastRoleRef.current = role
      const texSet = role === 'breaker' ? breakerTextures.current : builderTextures.current
      for (let i = 0; i < 5; i++) {
        const rev = revealMeshes.current[i]
        const tex = texSet[i]
        if (rev && tex) {
          const mat = rev.material as THREE.MeshBasicMaterial
          mat.map = tex
          mat.needsUpdate = true
        }
      }
      // Reset breach flags so new set can be decrypted again
      breached.current.fill(false)
    }

    mouseNDC.set(mouseSmooth.x * 2 - 1, -(mouseSmooth.y * 2 - 1))
    raycaster.setFromCamera(mouseNDC, camera)

    const hitSet = new Set<number>()
    for (let i = 0; i < 5; i++) {
      const m = asciiMeshes.current[i]
      if (m && raycaster.intersectObject(m).length > 0) hitSet.add(i)
    }

    const t = state.clock.elapsedTime
    const activeProjects = role === 'breaker' ? BREAKER_PROJECTS : BUILDER_PROJECTS
    for (let i = 0; i < 5; i++) {
      hoverLerps.current[i] = THREE.MathUtils.damp(
        hoverLerps.current[i], hitSet.has(i) ? 1 : 0, 5, delta,
      )
      const hl = hoverLerps.current[i]

      uniforms[i].uTime.value  = t
      uniforms[i].uHover.value = hl
      uniforms[i].uVis.value   = vis

      const rev = revealMeshes.current[i]
      if (rev) (rev.material as THREE.MeshBasicMaterial).opacity = hl * vis

      if (hl > 0.45 && !breached.current[i]) {
        breached.current[i] = true
        store.breachNode(activeProjects[i].id)
      }
    }
  })

  return (
    // Group sits at the camera's view center at p=0.52; slabs use local-space offsets.
    <group ref={groupRef} position={[L2_ANCHOR.x, L2_ANCHOR.y, L2_ANCHOR.z]}>
      {PROJECTS.map((project, i) => (
        <group key={project.id} position={SLAB_OFFSETS[i]}>

          <mesh
            ref={(el) => { asciiMeshes.current[i] = el }}
            renderOrder={1}
          >
            <planeGeometry args={[SLAB_W, SLAB_H]} />
            <shaderMaterial
              vertexShader={asciiVert}
              fragmentShader={asciiFrag}
              uniforms={uniforms[i]}
              transparent
              depthWrite={false}
            />
          </mesh>

          <mesh
            ref={(el) => { revealMeshes.current[i] = el }}
            position={[0, 0, 0.001]}
            renderOrder={2}
          >
            <planeGeometry args={[SLAB_W, SLAB_H]} />
            <meshBasicMaterial
              transparent
              opacity={0}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>

        </group>
      ))}
      <Html position={[0, 2.15, 0.04]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
        <div ref={headerRef} style={{
          opacity: 0, color: '#E6E6E9',
          fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
          fontSize: '11px', letterSpacing: '0.28em', whiteSpace: 'nowrap',
        }}>
          LAYER 2 // ~/systems — encrypted files · hover to breach
        </div>
      </Html>
    </group>
  )
}
