'use client'
import { useRef, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { useSystemStore } from '@/lib/store'
import { useQuality } from '@/lib/useQuality'
import { lenisRef } from '@/lib/gsap'
import { scrollProgress, layerAnchorAt, cameraStateAt, LAYER_VIEW_DIST } from '@/components/three/rig/CameraRig'

// ═══════════════════════════════════════════════════════════════════════════════
// TUNABLE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════════

const L1_CENTER_P = 0.27
const L1_ANCHOR   = layerAnchorAt(L1_CENTER_P)

const PRE_BEAT_DUR        = 0.45  
const DIVE_TOTAL_DUR      = 3.0   
const STATION_PAUSE       = 0.30  
const DIVE_EASE           = 'power1.inOut'
const COMPUTE_LINGER      = 2.0   
const COMPUTE_PUSH_IN     = 2.0   
const RETURN_DUR          = 3.0
const RETURN_EASE         = 'power2.inout'
const REVEAL_DUR          = 1.2

const STATION_DIVE_VALUES = [0, 6, 12, 18, 24]
const STATION_FORWARD_OFFSET = [LAYER_VIEW_DIST, 10.5, 16.5, 22.5, 28.5] 
const FINAL_DIVE          = STATION_DIVE_VALUES[4] 

const LABEL_AHEAD_RANGE   = 8.0   
const LABEL_BEHIND_RANGE  = 2.0   
const LABEL_IN_DAMP       = 9.0   
const LABEL_OUT_DAMP      = 2.2   

const ALERT_PRE           = 0.10
const ALERT_DIVE_END      = 0.40
const ALERT_COMPUTE_SPIKE = 0.40
const ALERT_RETURN_END    = 0.40
const ALERT_SETTLE        = 0.18

const LAYER_1_BAND: [number, number] = [0.15, 0.45]

const NODE_OFFSETS: [number, number, number][] = [
  [ 0.0, 0.0, 0.0 ],
  [-2.2, 0.0, 0.0 ],
  [ 2.2, 0.0, 0.0 ],
]
const NODE_LABELS = ['ENTITY::MAYANK', 'ROLE::BUILDER', 'ROLE::BREAKER']
const NODE_COLORS = ['#FFFFFF', '#00E5FF', '#FF2D55']

const STATION_LABELS = [
  'ENTITY :: MAYANK',
  'ROUTER // 192.168.1.1',
  'ISP_GATEWAY :: tier-1',
  'SERVER :: AUTH',
  'COMPUTE :: nn_resolver',
]

const LATTICE_LAYERS = 3
const LATTICE_NODES_PER_LAYER = 4
const LATTICE_LAYER_SPACING = 0.85
const LATTICE_NODE_SPACING  = 0.45

// ═══════════════════════════════════════════════════════════════════════════════
// PRE-COMPUTED MATH (Optimized)
// ═══════════════════════════════════════════════════════════════════════════════
const IDEAL = cameraStateAt(L1_CENTER_P)
const FORWARD = IDEAL.lookAt.clone().sub(IDEAL.pos).normalize()
const START_CAM = IDEAL.pos.clone()

const STATION_WORLD_POS: THREE.Vector3[] = STATION_FORWARD_OFFSET.map((d) =>
  START_CAM.clone().addScaledVector(FORWARD, d)
)

const LATTICE_QUAT = (() => {
  const q = new THREE.Quaternion()
  q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), FORWARD.clone().negate())
  return q
})()
const LATTICE_EULER = new THREE.Euler().setFromQuaternion(LATTICE_QUAT)

const LATTICE_NODES = (() => {
  const out = []
  for (let L = 0; L < LATTICE_LAYERS; L++) {
    for (let N = 0; N < LATTICE_NODES_PER_LAYER; N++) {
      out.push({
        x: (L - (LATTICE_LAYERS - 1) / 2) * LATTICE_LAYER_SPACING,
        y: (N - (LATTICE_NODES_PER_LAYER - 1) / 2) * LATTICE_NODE_SPACING,
        layer: L,
        idx: N,
      })
    }
  }
  return out
})()

const LATTICE_EDGES: [number, number][] = (() => {
  const out: [number, number][] = []
  for (let L = 0; L < LATTICE_LAYERS - 1; L++) {
    for (let A = 0; A < LATTICE_NODES_PER_LAYER; A++) {
      for (let B = 0; B < LATTICE_NODES_PER_LAYER; B++) {
        out.push([L * LATTICE_NODES_PER_LAYER + A, (L + 1) * LATTICE_NODES_PER_LAYER + B])
      }
    }
  }
  return out
})()

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function Layer1Identity() {
  const { camera } = useThree()
  const quality = useQuality()

  const visibilityRef = useRef(0)
  const groupRef = useRef<THREE.Group>(null)
  const stationsGroupRef = useRef<THREE.Group>(null)

  const wireRefs  = useRef<(THREE.Mesh | null)[]>([null, null, null])
  const solidRefs = useRef<(THREE.Mesh | null)[]>([null, null, null])
  const lineLRef = useRef<THREE.Group | null>(null)
  const lineRRef = useRef<THREE.Group | null>(null)

  const stationLabelRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null, null])
  const labelDamp = useRef<number[]>([0, 0, 0, 0, 0])
  const nodeLabelRefs = useRef<(HTMLDivElement | null)[]>([null, null, null])

  const latticeGroupRef = useRef<THREE.Group>(null)
  const latticeNodeRefs = useRef<(THREE.Mesh | null)[]>([])
  const latticeEdgeRefs = useRef<(THREE.Group | null)[]>([])
  const equationRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null])

  const isHackingRef   = useRef(false)
  const cinematicLocalRef = useRef(false)  
  const completedRef   = useRef(false)

  const proxyRef = useRef({ dive: 0, alertPulse: 0, latticePulse: 0 })
  const ctxRef   = useRef<gsap.Context | null>(null)

  // 🚨 PATCH 1: Listener cleanup ref (Memory Leak Fix)
  const removeListenersRef = useRef<(() => void) | null>(null)

  const tmpPos    = useRef(new THREE.Vector3())
  const tmpLookAt = useRef(new THREE.Vector3())

  useEffect(() => {
    if (wireRefs.current[0])  wireRefs.current[0]!.userData.baseOpacity  = 0.45
    if (wireRefs.current[1])  wireRefs.current[1]!.userData.baseOpacity  = 0.0
    if (wireRefs.current[2])  wireRefs.current[2]!.userData.baseOpacity  = 0.0
    solidRefs.current.forEach((r) => { if (r) r.userData.baseOpacity = 0.0 })

    if (lineLRef.current) (lineLRef.current as any).userData.baseOpacity = 0.0
    if (lineRRef.current) (lineRRef.current as any).userData.baseOpacity = 0.0

    const pulse = gsap.to(wireRefs.current[0]!.scale, {
      x: 1.18, y: 1.18, z: 1.18,
      duration: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut',
    })

    return () => { 
      pulse.kill()
      ctxRef.current?.revert()
      // 🚨 Ensure listeners are wiped if component unmounts mid-hack
      if (removeListenersRef.current) removeListenersRef.current()
    }
  }, [])

  const executeKillChain = () => {
    if (isHackingRef.current) return
    isHackingRef.current = true

    const reduced = quality === 'low' || (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)

    if (reduced) {
      doFastReveal()
      return
    }

    useSystemStore.getState().setCinematicMode(true)
    useSystemStore.getState().breachNode('layer1-mlp')
    useSystemStore.getState().setL1Status('running')
    useSystemStore.getState().setL1LogText('>> PACKET INJECTED // routing...')
    cinematicLocalRef.current = true
    lenisRef.instance?.stop()

    if (groupRef.current) groupRef.current.visible = true
    if (stationsGroupRef.current) stationsGroupRef.current.visible = true

    gsap.killTweensOf(wireRefs.current[0]!.scale)
    wireRefs.current[0]!.scale.set(1, 1, 1)

    const proxy = proxyRef.current
    proxy.dive = 0
    proxy.alertPulse = 0
    proxy.latticePulse = 0

    // 🚨 PATCH 2: Revert old context before creating a new one (Context Leak Fix)
    if (ctxRef.current) ctxRef.current.revert()

    ctxRef.current = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          completedRef.current = true
          useSystemStore.getState().setL1Status('done')
          useSystemStore.getState().setL1LogText('>> DECRYPTION COMPLETE // ROLES ACTIVE')
          attachScrollResumeListener()
        },
      })

      // PHASE 1
      tl.to(wireRefs.current[0]!.userData, { baseOpacity: 0.85, duration: PRE_BEAT_DUR }, 0)
      tl.to(solidRefs.current[0]!.userData, { baseOpacity: 0.25, duration: PRE_BEAT_DUR }, 0)
      tl.to(proxy, { alertPulse: ALERT_PRE, duration: PRE_BEAT_DUR, ease: 'power1.in' }, 0)

      // PHASE 2 
      const segDur = DIVE_TOTAL_DUR / 4
      for (let i = 1; i <= 4; i++) {
        const label = STATION_LABELS[i]
        tl.to(proxy, { dive: STATION_DIVE_VALUES[i], duration: segDur, ease: DIVE_EASE })
        tl.call(() => useSystemStore.getState().setL1LogText(`>> TRAVERSING ${label}`))
        if (i < 4) tl.to({}, { duration: STATION_PAUSE })
      }

      tl.to(proxy, { alertPulse: ALERT_DIVE_END, duration: DIVE_TOTAL_DUR + STATION_PAUSE * 3, ease: 'none' }, PRE_BEAT_DUR)

      // PHASE 3 
      tl.addLabel('compute')
      tl.call(() => useSystemStore.getState().setL1LogText('>> NN_RESOLVE :: forward pass...'))
      tl.to(proxy, { dive: FINAL_DIVE + COMPUTE_PUSH_IN, duration: COMPUTE_LINGER, ease: 'power1.in' }, 'compute')
      tl.to(proxy, { alertPulse: ALERT_COMPUTE_SPIKE, duration: COMPUTE_LINGER * 0.5, ease: 'power2.out' }, 'compute')
      tl.to(proxy, { latticePulse: 1, duration: 0.25, ease: 'power2.out' }, 'compute')

      const eqStart = (idx: number) => `compute+=${idx * (COMPUTE_LINGER / 4)}`
      for (let i = 0; i < 4; i++) {
        tl.fromTo(
          equationRefs.current[i],
          { opacity: 0, y: 8, scale: 0.92 },
          { opacity: 1, y: 0, scale: 1.0, duration: 0.35, ease: 'back.out(2)' },
          eqStart(i),
        )
      }

      // PHASE 4 — RETURN (segmented, mirrors forward dive with station pauses)
      tl.addLabel('return')
      tl.call(() => useSystemStore.getState().setL1LogText('>> RETURN VECTOR // backing out of COMPUTE'))
      const returnSegDur = RETURN_DUR / 4
      const totalReturnDur = RETURN_DUR + STATION_PAUSE * 3
      // Seg 1: COMPUTE (26) → SERVER (18)
      tl.to(proxy, { dive: STATION_DIVE_VALUES[3], duration: returnSegDur, ease: RETURN_EASE }, 'return')
      tl.call(() => useSystemStore.getState().setL1LogText(`>> TRAVERSING BACK :: ${STATION_LABELS[3]}`))
      tl.to({}, { duration: STATION_PAUSE })
      // Seg 2: SERVER (18) → ISP (12)
      tl.to(proxy, { dive: STATION_DIVE_VALUES[2], duration: returnSegDur, ease: RETURN_EASE })
      tl.call(() => useSystemStore.getState().setL1LogText(`>> TRAVERSING BACK :: ${STATION_LABELS[2]}`))
      tl.to({}, { duration: STATION_PAUSE })
      // Seg 3: ISP (12) → ROUTER (6)
      tl.to(proxy, { dive: STATION_DIVE_VALUES[1], duration: returnSegDur, ease: RETURN_EASE })
      tl.call(() => useSystemStore.getState().setL1LogText(`>> TRAVERSING BACK :: ${STATION_LABELS[1]}`))
      tl.to({}, { duration: STATION_PAUSE })
      // Seg 4: ROUTER (6) → ENTITY (0)
      tl.to(proxy, { dive: STATION_DIVE_VALUES[0], duration: returnSegDur, ease: RETURN_EASE })
      tl.call(() => useSystemStore.getState().setL1LogText('>> IDENTITY LOCKED // roles resolved'))
      // Alert + lattice fade over full return (incl. pauses)
      tl.to(proxy, { alertPulse: ALERT_RETURN_END, duration: totalReturnDur, ease: 'power2.inOut' }, 'return')
      tl.to(proxy, { latticePulse: 0, duration: totalReturnDur * 0.6, ease: 'power2.in' }, 'return')
      tl.to(equationRefs.current, { opacity: 0, duration: returnSegDur * 0.9, ease: 'power1.in' }, 'return')

      // PHASE 5
      tl.addLabel('reveal')
      tl.to(wireRefs.current[0]!.userData, { baseOpacity: 0.6, duration: REVEAL_DUR * 0.5 }, 'reveal')
      tl.to(solidRefs.current[0]!.userData, { baseOpacity: 0.15, duration: REVEAL_DUR * 0.5 }, 'reveal')
      tl.to([lineLRef.current!.userData, lineRRef.current!.userData], { baseOpacity: 0.42, duration: REVEAL_DUR * 0.5 }, 'reveal')
      tl.to([wireRefs.current[1]!.userData, wireRefs.current[2]!.userData], { baseOpacity: 0.6, duration: REVEAL_DUR * 0.7 }, 'reveal')
      tl.to([solidRefs.current[1]!.userData, solidRefs.current[2]!.userData], { baseOpacity: 0.28, duration: REVEAL_DUR * 0.7 }, 'reveal')
      tl.to([nodeLabelRefs.current[1], nodeLabelRefs.current[2]], { opacity: 1, duration: REVEAL_DUR * 0.6, stagger: 0.12 }, `reveal+=${REVEAL_DUR * 0.3}`)
      tl.to(proxy, { alertPulse: ALERT_SETTLE, duration: REVEAL_DUR, ease: 'power2.inOut' }, 'reveal')
    })
  }

  const doFastReveal = () => {
    useSystemStore.getState().breachNode('layer1-mlp')
    useSystemStore.getState().setL1Status('done')
    useSystemStore.getState().setL1LogText('>> IDENTITY RESOLVED')
    gsap.killTweensOf(wireRefs.current[0]!.scale)
    wireRefs.current[0]!.scale.set(1, 1, 1)
    completedRef.current = true

    if (ctxRef.current) ctxRef.current.revert()

    ctxRef.current = gsap.context(() => {
      const tl = gsap.timeline()
      tl.to(wireRefs.current[0]!.userData, { baseOpacity: 0.6, duration: 0.4 }, 0)
      tl.to(solidRefs.current[0]!.userData, { baseOpacity: 0.15, duration: 0.4 }, 0)
      tl.to([wireRefs.current[1]!.userData, wireRefs.current[2]!.userData], { baseOpacity: 0.6, duration: 0.5 }, 0.1)
      tl.to([solidRefs.current[1]!.userData, solidRefs.current[2]!.userData], { baseOpacity: 0.28, duration: 0.5 }, 0.1)
      tl.to([lineLRef.current!.userData, lineRRef.current!.userData], { baseOpacity: 0.42, duration: 0.5 }, 0.1)
      tl.to([nodeLabelRefs.current[1], nodeLabelRefs.current[2]], { opacity: 1, duration: 0.4, stagger: 0.1 }, 0.3)
      useSystemStore.getState().setAlertLevel(ALERT_SETTLE)
    })
  }

  // 🚨 PATCH 3: Hardened Listener Management
  const attachScrollResumeListener = () => {
    setTimeout(() => useSystemStore.getState().setL1ShowResume(true), 300)

    const onFirstInput = () => {
      window.removeEventListener('wheel', onFirstInput, true)
      window.removeEventListener('touchstart', onFirstInput, true)
      window.removeEventListener('keydown', onFirstInput, true)
      removeListenersRef.current = null // Clear ref

      useSystemStore.getState().setL1ShowResume(false)
      lenisRef.instance?.start()
      useSystemStore.getState().setCinematicMode(false)
      cinematicLocalRef.current = false
    }

    // Save cleanup func so useEffect can wipe it on unmount
    removeListenersRef.current = () => {
      window.removeEventListener('wheel', onFirstInput, true)
      window.removeEventListener('touchstart', onFirstInput, true)
      window.removeEventListener('keydown', onFirstInput, true)
    }

    window.addEventListener('wheel', onFirstInput, { passive: true, capture: true })
    window.addEventListener('touchstart', onFirstInput, { passive: true, capture: true })
    window.addEventListener('keydown', onFirstInput, { capture: true })
  }

  useFrame((_, delta) => {
    const { bootComplete, cinematicMode } = useSystemStore.getState()
    if (!bootComplete) return

    if (cinematicMode) {
      const p = proxyRef.current
      
      // Zustand optimized call - sets memory without full render cycle where possible
      useSystemStore.getState().setAlertLevel(p.alertPulse) 

      tmpPos.current.copy(START_CAM).addScaledVector(FORWARD, p.dive)
      camera.position.copy(tmpPos.current)
      tmpLookAt.current.copy(START_CAM).addScaledVector(FORWARD, p.dive + LAYER_VIEW_DIST)
      camera.lookAt(tmpLookAt.current)

      if (groupRef.current) groupRef.current.visible = true
      if (stationsGroupRef.current) stationsGroupRef.current.visible = true
      visibilityRef.current = 1

      for (let i = 0; i < 5; i++) {
        const ahead = STATION_FORWARD_OFFSET[i] - p.dive
        let target = 0
        if (ahead < LABEL_AHEAD_RANGE && ahead > -LABEL_BEHIND_RANGE) {
          const peakAt = LAYER_VIEW_DIST
          const norm = 1 - Math.min(1, Math.abs(ahead - peakAt) / LABEL_AHEAD_RANGE)
          target = Math.max(0, norm)
        }
        const isFadingOut = target < labelDamp.current[i]
        const dampSpeed = isFadingOut ? LABEL_OUT_DAMP : LABEL_IN_DAMP
        labelDamp.current[i] = THREE.MathUtils.damp(labelDamp.current[i], target, dampSpeed, delta)
        const el = stationLabelRefs.current[i]
        if (el) el.style.opacity = labelDamp.current[i].toFixed(3)
      }

      const pulse = proxyRef.current.latticePulse
      if (pulse > 0.001) {
        const t = performance.now() * 0.001
        latticeNodeRefs.current.forEach((m, i) => {
          if (!m) return
          const s = 1 + Math.sin(t * 6 + i * 0.71) * 0.35 * pulse
          m.scale.setScalar(s)
        })
      }

      applyMaterialOpacities(1)
      return
    }

    const sp = scrollProgress.value
    const inBand = sp >= LAYER_1_BAND[0] && sp <= LAYER_1_BAND[1]
    visibilityRef.current = THREE.MathUtils.damp(visibilityRef.current, inBand ? 1 : 0, 3, delta)
    const vis = visibilityRef.current

    if (groupRef.current) groupRef.current.visible = vis > 0.01
    if (stationsGroupRef.current) {
      stationsGroupRef.current.visible = completedRef.current ? false : false
    }

    if (vis > 0.01) applyMaterialOpacities(vis)
  })

  const applyMaterialOpacities = (vis: number) => {
    const apply = (m: THREE.Mesh | null) => {
      if (!m) return
      const mat = m.material as THREE.Material & { opacity: number }
      if (m.userData.baseOpacity !== undefined) mat.opacity = m.userData.baseOpacity * vis
    }
    wireRefs.current.forEach(apply)
    solidRefs.current.forEach(apply)
    
    const applyLine = (g: THREE.Group | null) => {
      if (!g) return
      const base = (g as any).userData.baseOpacity
      if (base === undefined) return
      g.traverse((child) => {
        const c = child as any
        if (c.material && 'opacity' in c.material) c.material.opacity = base * vis
      })
    }
    applyLine(lineLRef.current)
    applyLine(lineRRef.current)
  }

  const enablePointer  = () => { if (!isHackingRef.current) document.body.style.cursor = 'crosshair' }
  const disablePointer = () => { document.body.style.cursor = 'auto' }

  return (
    <>
      {/* ═══ ENTITY / BUILDER / BREAKER ═══════════════════════ */}
      <group ref={groupRef} position={[L1_ANCHOR.x, L1_ANCHOR.y - 1.4, L1_ANCHOR.z + 1.0]}>

        <mesh position={[0, 0, 0]} onClick={(e) => { e.stopPropagation(); executeKillChain() }} onPointerOver={enablePointer} onPointerOut={disablePointer}>
          <sphereGeometry args={[0.7, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} color="#ff0000" />
        </mesh>

        <Line ref={lineLRef as any} points={[[0, 0, 0], [-2.2, 0, 0]]} color="#00E5FF" lineWidth={1.5} transparent depthWrite={false} />
        <Line ref={lineRRef as any} points={[[0, 0, 0], [ 2.2, 0, 0]]} color="#FF2D55" lineWidth={1.5} transparent depthWrite={false} />

        {NODE_OFFSETS.map((offset, i) => (
          <group key={i} position={offset}>
            <mesh ref={(el) => { wireRefs.current[i] = el }}>
              <icosahedronGeometry args={[0.25, 1]} />
              <meshBasicMaterial color={NODE_COLORS[i]} wireframe transparent depthWrite={false} />
            </mesh>
            <mesh ref={(el) => { solidRefs.current[i] = el }}>
              <icosahedronGeometry args={[0.25, 1]} />
              <meshBasicMaterial color={NODE_COLORS[i]} transparent depthWrite={false} toneMapped={false} />
            </mesh>
            <Html position={[0, -0.42, 0]} center distanceFactor={7} style={{ pointerEvents: 'none' }}>
              <div ref={(el) => { nodeLabelRefs.current[i] = el }} style={{
                opacity: i === 0 ? 0 : 0, 
                color: NODE_COLORS[i],
                fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
                fontSize: '10px',
                letterSpacing: '0.1em',
                whiteSpace: 'nowrap',
                textShadow: `0 0 10px ${NODE_COLORS[i]}`,
              }}>
                {NODE_LABELS[i]}
              </div>
            </Html>
          </group>
        ))}

        <Html position={[0, 1.0, 0]} center distanceFactor={7} style={{ pointerEvents: 'none' }}>
          <div ref={(el) => { stationLabelRefs.current[0] = el }} style={{
            opacity: 0,
            color: NODE_COLORS[0],
            fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
            fontSize: '10px',
            letterSpacing: '0.18em',
            whiteSpace: 'nowrap',
            textShadow: `0 0 10px ${NODE_COLORS[0]}`,
          }}>
            {STATION_LABELS[0]}
          </div>
        </Html>

      </group>

      {/* ═══ STATIONS ═══════════ */}
      <group ref={stationsGroupRef} visible={false}>
        <group position={STATION_WORLD_POS[1]} rotation={LATTICE_EULER}>
          <mesh>
            <boxGeometry args={[1.6, 0.5, 1.1]} />
            <meshBasicMaterial color="#E6E6E9" wireframe transparent opacity={0.55} depthWrite={false} />
          </mesh>
          {[-0.5, -0.17, 0.17, 0.5].map((x) => (
            <mesh key={x} position={[x, 0.3, 0.45]}>
              <sphereGeometry args={[0.045, 10, 10]} />
              <meshBasicMaterial color="#00E5FF" toneMapped={false} />
            </mesh>
          ))}
          <Html position={[0, 0.85, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
            <div ref={(el) => { stationLabelRefs.current[1] = el }} style={{
              opacity: 0, color: '#E6E6E9', fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
              fontSize: '11px', letterSpacing: '0.2em', whiteSpace: 'nowrap', textShadow: '0 0 10px #00E5FF',
            }}>
              {STATION_LABELS[1]}
            </div>
          </Html>
        </group>

        <group position={STATION_WORLD_POS[2]} rotation={LATTICE_EULER}>
          <mesh>
            <torusGeometry args={[0.75, 0.06, 12, 48]} />
            <meshBasicMaterial color="#E6E6E9" wireframe transparent opacity={0.55} depthWrite={false} />
          </mesh>
          {[0, 1, 2, 3, 4, 5].map((k) => {
            const a = (k / 6) * Math.PI * 2
            const x = Math.cos(a) * 0.75, y = Math.sin(a) * 0.75, xo = Math.cos(a) * 1.25, yo = Math.sin(a) * 1.25
            return <Line key={k} points={[[x, y, 0], [xo, yo, 0]]} color="#E6E6E9" lineWidth={1} transparent opacity={0.45} depthWrite={false} />
          })}
          <Html position={[0, 1.4, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
            <div ref={(el) => { stationLabelRefs.current[2] = el }} style={{
              opacity: 0, color: '#E6E6E9', fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
              fontSize: '11px', letterSpacing: '0.2em', whiteSpace: 'nowrap', textShadow: '0 0 10px #9EFF00',
            }}>
              {STATION_LABELS[2]}
            </div>
          </Html>
        </group>

        <group position={STATION_WORLD_POS[3]} rotation={LATTICE_EULER}>
          {[0.55, 0, -0.55].map((y) => (
            <group key={y} position={[0, y, 0]}>
              <mesh>
                <boxGeometry args={[1.4, 0.42, 0.9]} />
                <meshBasicMaterial color="#E6E6E9" wireframe transparent opacity={0.5} depthWrite={false} />
              </mesh>
              <mesh position={[-0.6, 0, 0.46]}>
                <sphereGeometry args={[0.04, 8, 8]} />
                <meshBasicMaterial color="#FF6B00" toneMapped={false} />
              </mesh>
            </group>
          ))}
          <Html position={[0, 1.3, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
            <div ref={(el) => { stationLabelRefs.current[3] = el }} style={{
              opacity: 0, color: '#E6E6E9', fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
              fontSize: '11px', letterSpacing: '0.2em', whiteSpace: 'nowrap', textShadow: '0 0 10px #FF6B00',
            }}>
              {STATION_LABELS[3]}
            </div>
          </Html>
        </group>

        <group ref={latticeGroupRef} position={STATION_WORLD_POS[4]} rotation={LATTICE_EULER}>
          {LATTICE_EDGES.map(([a, b], i) => {
            const A = LATTICE_NODES[a], B = LATTICE_NODES[b]
            return <Line key={i} ref={(el) => { latticeEdgeRefs.current[i] = el as any }} points={[[A.x, A.y, 0], [B.x, B.y, 0]]} color="#00E5FF" lineWidth={0.6} transparent opacity={0.28} depthWrite={false} />
          })}
          {LATTICE_NODES.map((n, i) => (
            <mesh key={i} ref={(el) => { latticeNodeRefs.current[i] = el }} position={[n.x, n.y, 0]}>
              <sphereGeometry args={[0.07, 14, 14]} />
              <meshBasicMaterial color={n.layer === LATTICE_LAYERS - 1 ? '#9EFF00' : '#00E5FF'} toneMapped={false} transparent opacity={0.9} />
            </mesh>
          ))}
          <Html position={[0, 1.55, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'center', fontFamily: 'var(--font-mono), "JetBrains Mono", monospace', fontSize: '13px', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
              <div ref={(el) => { equationRefs.current[0] = el }} style={{ opacity: 0, color: '#00E5FF', textShadow: '0 0 10px #00E5FF' }}>W₁·E + B₁</div>
              <div ref={(el) => { equationRefs.current[1] = el }} style={{ opacity: 0, color: '#00E5FF', textShadow: '0 0 10px #00E5FF' }}>→ ReLU(·)</div>
              <div ref={(el) => { equationRefs.current[2] = el }} style={{ opacity: 0, color: '#9EFF00', textShadow: '0 0 10px #9EFF00' }}>→ ≈1 if MAYANK else 0</div>
              <div ref={(el) => { equationRefs.current[3] = el }} style={{ opacity: 0, color: '#9EFF00', fontWeight: 700, fontSize: '15px', letterSpacing: '0.18em', textShadow: '0 0 14px #9EFF00', marginTop: '6px' }}>IDENTITY RESOLVED</div>
            </div>
          </Html>
          <Html position={[0, -1.4, 0]} center distanceFactor={8} style={{ pointerEvents: 'none' }}>
            <div ref={(el) => { stationLabelRefs.current[4] = el }} style={{
              opacity: 0, color: '#E6E6E9', fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
              fontSize: '11px', letterSpacing: '0.2em', whiteSpace: 'nowrap', textShadow: '0 0 10px #9EFF00',
            }}>
              {STATION_LABELS[4]}
            </div>
          </Html>
        </group>
      </group>

    </>
  )
}