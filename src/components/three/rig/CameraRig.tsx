'use client'
import { useRef, useEffect } from 'react'
import { useThree, useFrame } from '@react-three/fiber'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import * as THREE from 'three'
import { useQuality } from '@/lib/useQuality'
import { mouseSmooth } from '@/lib/useMouse'
import { useSystemStore } from '@/lib/store'

// Module-level singleton — read each frame by layer components; no re-renders.
export const scrollProgress = { value: 0 }

// How far in front of the camera each layer anchor sits (world units).
export const LAYER_VIEW_DIST = 4.5

// Pure camera-path math — matches the lerps in useFrame exactly.
// Returns fresh Vector3s so callers can mutate freely.
export function cameraStateAt(p: number): { pos: THREE.Vector3; lookAt: THREE.Vector3 } {
  return {
    pos:    new THREE.Vector3(0, THREE.MathUtils.lerp(0, -9.0, p), THREE.MathUtils.lerp(5.0, 3.5, p)),
    lookAt: new THREE.Vector3(0, THREE.MathUtils.lerp(0, -4.5, p), 0),
  }
}

// World-space anchor guaranteed to be centered in the camera's view at `centerP`.
// Placement math:
//   p=0.27 → cam=(0,-2.43,4.595), lookAt=(0,-1.215,0),
//            dir=(0,0.2557,-0.9672), anchor≈(0,-1.28,0.24)
//   p=0.52 → cam=(0,-4.68,4.22),  lookAt=(0,-2.34,0),
//            dir=(0,0.4850,-0.8746), anchor≈(0,-2.50,0.28)
export function layerAnchorAt(centerP: number): THREE.Vector3 {
  const { pos, lookAt } = cameraStateAt(centerP)
  const dir = lookAt.clone().sub(pos).normalize()
  return pos.clone().addScaledVector(dir, LAYER_VIEW_DIST)
}

// PROMPT 5: replace stub with full layer-stop registry once all layers are placed.
export interface LayerStop {
  cameraY:  number
  lookAtY:  number
  cameraZ?: number
}

export function CameraRig() {
  const { camera } = useThree()
  const quality     = useQuality()
  const scrollProg  = useRef(0)
  const smoothProg  = useRef(0)
  const currentLayerRef = useRef(-1)

  const lookAtTarget = useRef(new THREE.Vector3(0, 0, 0))

  useEffect(() => {
 console.log('[CameraRig] effect fired, quality:', quality, '__lenisReady:', (window as any).__lenisReady)
    
    gsap.registerPlugin(ScrollTrigger)

    if (quality === 'low') return

    let st: ReturnType<typeof ScrollTrigger.create> | null = null

    const setupST = () => {
      console.log('[CameraRig] setupST called')
      st = ScrollTrigger.create({
        
        trigger:  document.documentElement,
        scroller: document.documentElement,
        start:    'top top',
        end:      'bottom bottom',
        scrub:    1.5,
        onUpdate: (self) => { 
          scrollProg.current = self.progress
          console.log('ST progress:', self.progress.toFixed(3))
        },
      })
    }

    // If lenis-ready already fired (or Lenis isn't used), set up immediately.
    // Otherwise wait for the proxy to be registered first to avoid a race.
    if ((window as unknown as Record<string, boolean>)['__lenisReady']) {
      setupST()
    } else {
      window.addEventListener('lenis-ready', setupST, { once: true })
    }

    return () => {
      window.removeEventListener('lenis-ready', setupST)
      st?.kill()
    }
  }, [quality])

  useFrame((_, delta) => {
    // Cinematic sequence chal raha hai? To camera ko chhod do — GSAP control karega.
    if (useSystemStore.getState().cinematicMode) return
    if (quality === 'low') return

    const raw = scrollProg.current
    const inLayer1 = raw >= 0.17 && raw <= 0.43
    const dampFactor = inLayer1 ? 1.6 : 2.5

    smoothProg.current = THREE.MathUtils.damp(smoothProg.current, raw, dampFactor, delta)
    const p = smoothProg.current

    scrollProgress.value = p

    // ── Layer indicator — fires only on band change (no per-frame React render) ──
    const newLayer = raw < 0.17 ? 0 : raw < 0.42 ? 1 : raw < 0.68 ? 2 : 5
    if (newLayer !== currentLayerRef.current) {
      currentLayerRef.current = newLayer
      useSystemStore.getState().setCurrentLayer(newLayer)
    }

    // ── Descent path ─────────────────────────────────────────────────────────
    const baseY = THREE.MathUtils.lerp(0.0, -9.0, p)
    const baseZ = THREE.MathUtils.lerp(5.0,  3.5, p)
    const sway  = Math.sin(p * Math.PI * 2.2) * 0.18 * (1 - p * 0.5)

    // ── Mouse parallax ────────────────────────────────────────────────────────
    const mouseX = (mouseSmooth.x - 0.5) * 0.6
    const mouseY = (mouseSmooth.y - 0.5) * 0.36

    camera.position.set(mouseX + sway, baseY + mouseY, baseZ)

    lookAtTarget.current.set(
      mouseX * 0.35,
      THREE.MathUtils.lerp(0, -4.5, p),
      0
    )
    camera.lookAt(lookAtTarget.current)
  })

  return null
}
