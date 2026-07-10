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
import { trueColorState } from '@/components/three/postfx/DitherEffect'

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

const LAYER_1_BAND: [number, number] = [0.15, 0.40]

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

// ── THE CHOICE — Morpheus tableau (return beat of the kill chain) ─────────────
// Photo center (posterized mono, Morpheus pose), red pill = ~/breaker (viewer
// left, like the reference), blue pill = ~/builder. Picking one sets
// store.selectedRole, which Layer 2 reads to swap its card sets.
type PillRole = 'breaker' | 'builder'

const TABLEAU_OFFSET: [number, number, number] = [0, 0.95, -1.0] // groupRef-local → view center at return, nudged DOWN so the tableau owns the lower stage
const PHOTO_SIZE = 3.0
const PILL_X     = 2.05
const PILL_Y     = -1.05

const PILLS: { role: PillRole; x: number; color: string; name: string; sub: string }[] = [
  { role: 'breaker', x: -PILL_X, color: '#FF2D55', name: 'RED_PILL // ~/breaker',  sub: 'stay in wonderland — offensive security' },
  { role: 'builder', x:  PILL_X, color: '#00E5FF', name: 'BLUE_PILL // ~/builder', sub: 'wake up in prod — full-stack builder' },
]

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

  const entityWireRef  = useRef<THREE.Mesh>(null)
  const entitySolidRef = useRef<THREE.Mesh>(null)

  const stationLabelRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null, null])
  const labelDamp = useRef<number[]>([0, 0, 0, 0, 0])

  const latticeGroupRef = useRef<THREE.Group>(null)
  const latticeNodeRefs = useRef<(THREE.Mesh | null)[]>([])
  const latticeEdgeRefs = useRef<(THREE.Group | null)[]>([])
  const equationRefs = useRef<(HTMLDivElement | null)[]>([null, null, null, null])

  // ── Tableau refs ──────────────────────────────────────────────────────────
  const photoMeshRef  = useRef<THREE.Mesh>(null)
  const titleRef      = useRef<HTMLDivElement | null>(null)
  const scaleRefs     = useRef<Record<PillRole, THREE.Group | null>>({ breaker: null, builder: null })
  const spinRefs      = useRef<Record<PillRole, THREE.Group | null>>({ breaker: null, builder: null })
  const pillMeshRefs  = useRef<Record<PillRole, THREE.Mesh | null>>({ breaker: null, builder: null })
  const ringRefs      = useRef<Record<PillRole, (THREE.Mesh | null)[]>>({ breaker: [null, null], builder: [null, null] })
  const ringBoost     = useRef<Record<PillRole, number>>({ breaker: 1, builder: 1 })
  const idleTweenRef  = useRef<gsap.core.Tween | null>(null)
  const pillLabelRefs = useRef<Record<PillRole, HTMLDivElement | null>>({ breaker: null, builder: null })
  const labelBase     = useRef({ title: 0, breaker: 0, builder: 0 })
  const pillHover     = useRef<Record<PillRole, number>>({ breaker: 0, builder: 0 })
  const pillHoverTarget = useRef<Record<PillRole, boolean>>({ breaker: false, builder: false })
  const choiceRef     = useRef<PillRole | null>(null)

  const isHackingRef   = useRef(false)
  const cinematicLocalRef = useRef(false)
  const completedRef   = useRef(false)

  const proxyRef = useRef({ dive: 0, alertPulse: 0, latticePulse: 0, tableau: 0 })
  const ctxRef   = useRef<gsap.Context | null>(null)

  // 🚨 PATCH 1: Listener cleanup ref (Memory Leak Fix)
  const removeListenersRef = useRef<(() => void) | null>(null)

  const tmpPos    = useRef(new THREE.Vector3())
  const tmpLookAt = useRef(new THREE.Vector3())

  useEffect(() => {
    if (entityWireRef.current)  entityWireRef.current.userData.baseOpacity  = 0.45
    if (entitySolidRef.current) entitySolidRef.current.userData.baseOpacity = 0.0
    if (photoMeshRef.current)   photoMeshRef.current.userData.baseOpacity   = 0.0
    ;(['breaker', 'builder'] as const).forEach((role) => {
      const m = pillMeshRefs.current[role]
      if (m) m.userData.baseOpacity = 0.0
      ringRefs.current[role].forEach((rm) => { if (rm) rm.userData.baseOpacity = 0.0 })
    })

    const pulse = gsap.to(entityWireRef.current!.scale, {
      x: 1.18, y: 1.18, z: 1.18,
      duration: 1.2, yoyo: true, repeat: -1, ease: 'sine.inOut',
    })

    return () => {
      pulse.kill()
      idleTweenRef.current?.kill()
      ctxRef.current?.revert()
      // 🚨 Ensure listeners are wiped if component unmounts mid-hack
      if (removeListenersRef.current) removeListenersRef.current()
    }
  }, [])

  // ── Photo texture: grayscale + contrast + 5-level posterize + edge fade ────
  // (Morpheus screen-print look; edges dissolve so the plane never silhouettes
  // against the shaft. The dither pass then encrypts it like everything else.)
  useEffect(() => {
    let tex: THREE.CanvasTexture | null = null
    const img = new Image()
    img.src = '/mypic.jpg'
    img.onload = () => {
      const S = 512
      const cv = document.createElement('canvas')
      cv.width = S; cv.height = S
      const ctx = cv.getContext('2d')!
      ctx.drawImage(img, 0, 0, S, S)

      const id = ctx.getImageData(0, 0, S, S)
      const d = id.data
      for (let i = 0; i < d.length; i += 4) {
        let l = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) * 1.18 // lift shadows so the darker side of the face survives the dither
        l = (l - 128) * 1.45 + 124
        l = Math.max(0, Math.min(255, l))
        l = (Math.round((l / 255) * 4) / 4) * 255
        d[i] = d[i + 1] = d[i + 2] = l
      }
      ctx.putImageData(id, 0, 0)

      const g = ctx.createRadialGradient(S / 2, S * 0.46, S * 0.34, S / 2, S * 0.46, S * 0.70)
      g.addColorStop(0, 'rgba(0,0,0,0)')
      g.addColorStop(1, 'rgba(0,0,0,1)')
      ctx.globalCompositeOperation = 'destination-out'
      ctx.fillStyle = g
      ctx.fillRect(0, 0, S, S)
      ctx.globalCompositeOperation = 'source-over'

      tex = new THREE.CanvasTexture(cv)
      tex.colorSpace = THREE.SRGBColorSpace
      tex.minFilter = THREE.LinearFilter
      tex.magFilter = THREE.LinearFilter
      tex.generateMipmaps = false

      const mesh = photoMeshRef.current
      if (mesh) {
        const mat = mesh.material as THREE.MeshBasicMaterial
        mat.map = tex
        mat.needsUpdate = true
      }
    }
    return () => { tex?.dispose() }
  }, [])

  // ── Role sync: single source of visual truth for the pills ─────────────────
  // Fires on EVERY selectedRole change — first pill click, tableau re-click,
  // or the top-center lens toggle. Keeps tableau state consistent everywhere.
  useEffect(() => {
    const unsub = useSystemStore.subscribe((s, prev) => {
      const role = s.selectedRole
      if (!role || role === prev.selectedRole) return
      choiceRef.current = role
      const other: PillRole = role === 'breaker' ? 'builder' : 'breaker'

      ringBoost.current[role]  = 2.6
      ringBoost.current[other] = 0.12

      const cm = pillMeshRefs.current[role]
      const om = pillMeshRefs.current[other]
      if (cm) gsap.to(cm.userData, { baseOpacity: 0.95, duration: 0.5 })
      if (om) gsap.to(om.userData, { baseOpacity: 0.10, duration: 0.5 })
      ringRefs.current[role].forEach((rm) => { if (rm) gsap.to(rm.userData, { baseOpacity: 0.5, duration: 0.5 }) })
      ringRefs.current[other].forEach((rm) => { if (rm) gsap.to(rm.userData, { baseOpacity: 0.05, duration: 0.5 }) })
      gsap.to(labelBase.current, { [role]: 1, [other]: 0.12, title: 0, duration: 0.5 })

      s.setL1LogText(role === 'breaker'
        ? '>> RED_PILL // wonderland engaged — offensive lens active'
        : '>> BLUE_PILL // waking up in prod — builder lens active')
    })
    return () => unsub()
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

    gsap.killTweensOf(entityWireRef.current!.scale)
    entityWireRef.current!.scale.set(1, 1, 1)

    const proxy = proxyRef.current
    proxy.dive = 0
    proxy.alertPulse = 0
    proxy.latticePulse = 0
    proxy.tableau = 0

    // 🚨 PATCH 2: Revert old context before creating a new one (Context Leak Fix)
    if (ctxRef.current) ctxRef.current.revert()

    ctxRef.current = gsap.context(() => {
      const tl = gsap.timeline({
        onComplete: () => {
          completedRef.current = true
          useSystemStore.getState().setL1Status('done')
          useSystemStore.getState().setL1LogText('>> CHOICE PENDING // red or blue')
          useSystemStore.getState().setChoicePhase('pending')
          showChoiceGate()
          // Idle breathing dolly while the visitor decides — killed on choice/resume
          idleTweenRef.current?.kill()
          idleTweenRef.current = gsap.to(proxyRef.current, {
            dive: 0.55, duration: 3.4, ease: 'sine.inOut', yoyo: true, repeat: -1,
          })
        },
      })

      // PHASE 1
      tl.to(entityWireRef.current!.userData, { baseOpacity: 0.85, duration: PRE_BEAT_DUR }, 0)
      tl.to(entitySolidRef.current!.userData, { baseOpacity: 0.25, duration: PRE_BEAT_DUR }, 0)
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

      // PHASE 5 — THE CHOICE (entity dissolves, Morpheus tableau materializes)
      tl.addLabel('reveal')
      tl.call(() => useSystemStore.getState().setL1LogText('>> IDENTITY RESOLVED // MAKE YOUR CHOICE'))
      tl.to(entityWireRef.current!.userData, { baseOpacity: 0, duration: REVEAL_DUR * 0.4 }, 'reveal')
      tl.to(entitySolidRef.current!.userData, { baseOpacity: 0, duration: REVEAL_DUR * 0.4 }, 'reveal')
      tl.to(proxy, { tableau: 1, duration: REVEAL_DUR * 0.5, ease: 'power1.out' }, 'reveal')
      // color unlock — from here, saturated signal dithers in its true color
      tl.to(trueColorState, { value: 1, duration: 1.0, ease: 'power1.inOut' }, 'reveal')
      tl.to(photoMeshRef.current!.userData, { baseOpacity: 1, duration: REVEAL_DUR, ease: 'power2.out' }, `reveal+=${REVEAL_DUR * 0.25}`)
      tl.fromTo(photoMeshRef.current!.scale,
        { x: 0.9, y: 0.9, z: 1 },
        { x: 1, y: 1, z: 1, duration: REVEAL_DUR * 1.6, ease: 'power2.out' },
        `reveal+=${REVEAL_DUR * 0.25}`)
      tl.to(labelBase.current, { title: 1, duration: 0.6 }, `reveal+=${REVEAL_DUR * 0.5}`)
      ;(['breaker', 'builder'] as const).forEach((role, k) => {
        const at = `reveal+=${REVEAL_DUR * 0.55 + k * 0.18}`
        const g = scaleRefs.current[role]
        const m = pillMeshRefs.current[role]
        if (g) tl.fromTo(g.scale, { x: 0.001, y: 0.001, z: 0.001 }, { x: 1, y: 1, z: 1, duration: 0.7, ease: 'back.out(1.9)' }, at)
        if (m) tl.to(m.userData, { baseOpacity: 0.95, duration: 0.4 }, at)
        ringRefs.current[role].forEach((rm, ri) => {
          if (rm) tl.to(rm.userData, { baseOpacity: ri === 0 ? 0.32 : 0.22, duration: 0.6 }, at)
        })
      })
      tl.to(labelBase.current, { breaker: 1, builder: 1, duration: 0.6 }, `reveal+=${REVEAL_DUR * 0.9}`)
      tl.to(proxy, { alertPulse: ALERT_SETTLE, duration: REVEAL_DUR, ease: 'power2.inOut' }, 'reveal')
    })
  }

  const doFastReveal = () => {
    useSystemStore.getState().setCinematicMode(true)
    useSystemStore.getState().breachNode('layer1-mlp')
    useSystemStore.getState().setL1Status('done')
    useSystemStore.getState().setL1LogText('>> IDENTITY RESOLVED // red or blue')
    useSystemStore.getState().setChoicePhase('pending')
    cinematicLocalRef.current = true
    lenisRef.instance?.stop()
    gsap.killTweensOf(entityWireRef.current!.scale)
    entityWireRef.current!.scale.set(1, 1, 1)
    completedRef.current = true
    proxyRef.current.tableau = 1
    trueColorState.value = 1

    if (ctxRef.current) ctxRef.current.revert()

    ctxRef.current = gsap.context(() => {
      const tl = gsap.timeline()
      tl.to(entityWireRef.current!.userData, { baseOpacity: 0, duration: 0.4 }, 0)
      tl.to(entitySolidRef.current!.userData, { baseOpacity: 0, duration: 0.4 }, 0)
      tl.to(photoMeshRef.current!.userData, { baseOpacity: 1, duration: 0.5 }, 0.1)
      ;(['breaker', 'builder'] as const).forEach((role, k) => {
        const g = scaleRefs.current[role]
        const m = pillMeshRefs.current[role]
        if (g) tl.fromTo(g.scale, { x: 0.001, y: 0.001, z: 0.001 }, { x: 1, y: 1, z: 1, duration: 0.45, ease: 'back.out(1.7)' }, 0.15 + k * 0.1)
        if (m) tl.to(m.userData, { baseOpacity: 0.95, duration: 0.35 }, 0.15 + k * 0.1)
        ringRefs.current[role].forEach((rm, ri) => {
          if (rm) tl.to(rm.userData, { baseOpacity: ri === 0 ? 0.32 : 0.22, duration: 0.4 }, 0.15 + k * 0.1)
        })
      })
      tl.to(labelBase.current, { title: 1, breaker: 1, builder: 1, duration: 0.5 }, 0.3)
      useSystemStore.getState().setAlertLevel(ALERT_SETTLE)
      showChoiceGate()
    })
  }

  // ── Resume: only the pill choice unlocks the descent ────────────────────────
  const resumeScroll = () => {
    if (!useSystemStore.getState().descentUnlocked) return
    idleTweenRef.current?.kill()
    idleTweenRef.current = null
    if (removeListenersRef.current) {
      removeListenersRef.current()
      removeListenersRef.current = null
    }
    useSystemStore.getState().setL1ShowResume(false)
    lenisRef.instance?.start()
    useSystemStore.getState().setCinematicMode(false)
    cinematicLocalRef.current = false
  }

  const showChoiceGate = () => {
    setTimeout(() => useSystemStore.getState().setL1ShowResume(true), 300)
  }

  // ── THE CHOICE ───────────────────────────────────────────────────────────────
  // Re-clickable: after the first pick, clicking the OTHER pill switches the
  // lens (same as the top-center toggle). Visual sync happens in the
  // selectedRole subscription; this handles breach, camera and alert beats.
  const choosePill = (role: PillRole) => {
    if (!completedRef.current) return
    if (choiceRef.current === role) return
    const isFirst = choiceRef.current === null
    document.body.style.cursor = 'auto'

    const store = useSystemStore.getState()
    store.breachNode(role === 'breaker' ? 'pill-red' : 'pill-blue')
    store.setSelectedRole(role)
    if (isFirst) {
      store.setChoicePhase('chosen')
      store.setDescentUnlocked(true)
    }

    const chosen = scaleRefs.current[role]
    idleTweenRef.current?.kill()
    idleTweenRef.current = null

    const tl = gsap.timeline()
    if (chosen) {
      tl.to(chosen.scale, { x: 1.3, y: 1.3, z: 1.3, duration: 0.28, ease: 'back.out(3)' }, 0)
      tl.to(chosen.scale, { x: 1.12, y: 1.12, z: 1.12, duration: 0.5, ease: 'power2.out' }, 0.28)
    }

    // Red spikes the corruption (deliberate glitch), blue cools the system.
    if (isFirst && cinematicLocalRef.current) {
      // Dramatic dolly toward the figure as the pill goes down
      tl.to(proxyRef.current, { dive: proxyRef.current.dive + 0.9, duration: 1.0, ease: 'power2.out' }, 0)
      const flare = role === 'breaker' ? 0.8 : 0.06
      tl.to(proxyRef.current, { alertPulse: flare, duration: 0.3, ease: 'power2.out' }, 0)
      if (role === 'breaker') tl.to(proxyRef.current, { alertPulse: 0.4, duration: 0.8, ease: 'power2.inOut' }, 0.4)
      gsap.delayedCall(1.15, resumeScroll)
    } else {
      store.setAlertLevel(role === 'breaker' ? 0.7 : 0.08) // AlertDecay cools it from here
    }
  }

  // ── Per-frame tableau upkeep (labels, pill spin/bob/hover) ─────────────────
  const updateTableau = (t: number, delta: number, vis: number) => {
    if (titleRef.current) titleRef.current.style.opacity = (labelBase.current.title * vis).toFixed(3)
    ;(['breaker', 'builder'] as const).forEach((role, k) => {
      const label = pillLabelRefs.current[role]
      if (label) label.style.opacity = (labelBase.current[role] * vis).toFixed(3)

      if (vis <= 0.01) return
      const hoverOn = pillHoverTarget.current[role] && completedRef.current && choiceRef.current !== role
      pillHover.current[role] = THREE.MathUtils.damp(pillHover.current[role], hoverOn ? 1 : 0, 8, delta)
      const spin = spinRefs.current[role]
      if (spin) {
        spin.rotation.y = t * 0.6 + k * Math.PI * 0.5
        spin.position.y = Math.sin(t * 1.5 + k * 1.7) * 0.04
        spin.scale.setScalar(1 + pillHover.current[role] * 0.2)
      }
      // Gyro reticle rings — incremental so hover/choice speed changes don't jump
      const ringSpeed = (0.55 + pillHover.current[role] * 1.7) * ringBoost.current[role]
      const [ringA, ringB] = ringRefs.current[role]
      if (ringA) ringA.rotation.y += delta * ringSpeed
      if (ringB) ringB.rotation.x += delta * ringSpeed * 0.8
    })
  }

  useFrame((state, delta) => {
    const { bootComplete, cinematicMode } = useSystemStore.getState()
    if (!bootComplete) return
    const t = state.clock.elapsedTime

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
        // ENTITY label yields to the tableau on the final reveal
        if (i === 0) target *= 1 - p.tableau
        const isFadingOut = target < labelDamp.current[i]
        const dampSpeed = isFadingOut ? LABEL_OUT_DAMP : LABEL_IN_DAMP
        labelDamp.current[i] = THREE.MathUtils.damp(labelDamp.current[i], target, dampSpeed, delta)
        const el = stationLabelRefs.current[i]
        if (el) el.style.opacity = labelDamp.current[i].toFixed(3)
      }

      const pulse = proxyRef.current.latticePulse
      if (pulse > 0.001) {
        latticeNodeRefs.current.forEach((m, i) => {
          if (!m) return
          const s = 1 + Math.sin(t * 6 + i * 0.71) * 0.35 * pulse
          m.scale.setScalar(s)
        })
      }

      updateTableau(t, delta, 1)
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

    updateTableau(t, delta, vis)
    if (vis > 0.01) applyMaterialOpacities(vis)
  })

  const applyMaterialOpacities = (vis: number) => {
    const apply = (m: THREE.Mesh | null) => {
      if (!m) return
      const mat = m.material as THREE.Material & { opacity: number }
      if (m.userData.baseOpacity !== undefined) mat.opacity = m.userData.baseOpacity * vis
    }
    apply(entityWireRef.current)
    apply(entitySolidRef.current)
    apply(photoMeshRef.current)
    apply(pillMeshRefs.current.breaker)
    apply(pillMeshRefs.current.builder)
    ringRefs.current.breaker.forEach(apply)
    ringRefs.current.builder.forEach(apply)
  }

  const enablePointer  = () => { if (!isHackingRef.current) document.body.style.cursor = 'crosshair' }
  const disablePointer = () => { document.body.style.cursor = 'auto' }

  const pillPointerOver = (role: PillRole) => {
    pillHoverTarget.current[role] = true
    if (completedRef.current && choiceRef.current !== role) document.body.style.cursor = 'pointer'
  }
  const pillPointerOut = (role: PillRole) => {
    pillHoverTarget.current[role] = false
    document.body.style.cursor = 'auto'
  }

  return (
    <>
      {/* ═══ ENTITY + THE CHOICE ═══════════════════════════════ */}
      <group ref={groupRef} position={[L1_ANCHOR.x, L1_ANCHOR.y - 1.4, L1_ANCHOR.z + 1.0]}>

        <mesh position={[0, 0, 0]} onClick={(e) => { e.stopPropagation(); executeKillChain() }} onPointerOver={enablePointer} onPointerOut={disablePointer}>
          <sphereGeometry args={[0.7, 16, 16]} />
          <meshBasicMaterial transparent opacity={0} depthWrite={false} color="#ff0000" />
        </mesh>

        <mesh ref={entityWireRef}>
          <icosahedronGeometry args={[0.25, 1]} />
          <meshBasicMaterial color="#FFFFFF" wireframe transparent depthWrite={false} />
        </mesh>
        <mesh ref={entitySolidRef}>
          <icosahedronGeometry args={[0.25, 1]} />
          <meshBasicMaterial color="#FFFFFF" transparent depthWrite={false} toneMapped={false} />
        </mesh>

        <Html position={[0, 1.0, 0]} center distanceFactor={7} style={{ pointerEvents: 'none' }}>
          <div ref={(el) => { stationLabelRefs.current[0] = el }} style={{
            opacity: 0,
            color: '#FFFFFF',
            fontFamily: 'var(--font-mono), "JetBrains Mono", monospace',
            fontSize: '10px',
            letterSpacing: '0.18em',
            whiteSpace: 'nowrap',
            textShadow: '0 0 10px #FFFFFF',
          }}>
            {STATION_LABELS[0]}
          </div>
        </Html>

        {/* ═══ THE CHOICE — Morpheus tableau (lands on L1_ANCHOR = view center at return) ═══ */}
        <group position={TABLEAU_OFFSET}>

          <mesh ref={photoMeshRef} position={[0, 0.30, 0]} renderOrder={1}>
            <planeGeometry args={[PHOTO_SIZE, PHOTO_SIZE]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} toneMapped={false} />
          </mesh>

          <Html position={[0, 2.05, 0]} center distanceFactor={7} style={{ pointerEvents: 'none' }}>
            <div ref={titleRef} style={{ opacity: 0, textAlign: 'center', fontFamily: 'var(--font-mono), "JetBrains Mono", monospace', whiteSpace: 'nowrap' }}>
              <div style={{ color: '#E6E6E9', fontSize: '15px', letterSpacing: '0.26em' }}>THIS IS YOUR LAST CHANCE</div>
              <div style={{ color: '#E6E6E9', opacity: 0.55, fontSize: '11px', letterSpacing: '0.14em', marginTop: '5px' }}>after this, there is no turning back — choose a lens</div>
            </div>
          </Html>

          {PILLS.map(({ role, x, color, name, sub }) => (
            <group key={role} position={[x, PILL_Y, 0.25]}>

              <group ref={(el) => { scaleRefs.current[role] = el }} scale={0.001}>
                <group ref={(el) => { spinRefs.current[role] = el }}>
                  <mesh ref={(el) => { pillMeshRefs.current[role] = el }} rotation={[0, 0, x < 0 ? -0.5 : 0.5]} renderOrder={2}>
                    <capsuleGeometry args={[0.16, 0.44, 8, 20]} />
                    <meshBasicMaterial color={color} transparent opacity={0} depthWrite={false} toneMapped={false} />
                  </mesh>
                </group>

                {/* gyro reticle rings — the pill sits in a slow targeting gimbal */}
                <mesh ref={(el) => { ringRefs.current[role][0] = el }} rotation={[0.35, 0, 0]} renderOrder={1}>
                  <torusGeometry args={[0.52, 0.012, 8, 64]} />
                  <meshBasicMaterial color="#E6E6E9" transparent opacity={0} depthWrite={false} />
                </mesh>
                <mesh ref={(el) => { ringRefs.current[role][1] = el }} rotation={[0, 0.5, 0.3]} renderOrder={1}>
                  <torusGeometry args={[0.38, 0.01, 8, 56]} />
                  <meshBasicMaterial color="#E6E6E9" transparent opacity={0} depthWrite={false} />
                </mesh>

                {/* invisible hit target — comfortable click area */}
                <mesh
                  onClick={(e) => { e.stopPropagation(); choosePill(role) }}
                  onPointerOver={(e) => { e.stopPropagation(); pillPointerOver(role) }}
                  onPointerOut={() => pillPointerOut(role)}
                >
                  <sphereGeometry args={[0.55, 12, 12]} />
                  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
                </mesh>
              </group>

              <Html position={[0, -0.92, 0]} center distanceFactor={7} style={{ pointerEvents: 'none' }}>
                <div ref={(el) => { pillLabelRefs.current[role] = el }} style={{ opacity: 0, textAlign: 'center', fontFamily: 'var(--font-mono), "JetBrains Mono", monospace', whiteSpace: 'nowrap' }}>
                  <div style={{ color, fontSize: '13px', fontWeight: 700, letterSpacing: '0.16em', textShadow: `0 0 14px ${color}` }}>{name}</div>
                  <div style={{ color: '#E6E6E9', opacity: 0.5, fontSize: '10px', letterSpacing: '0.1em', marginTop: '4px' }}>{sub}</div>
                </div>
              </Html>

            </group>
          ))}
        </group>

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
