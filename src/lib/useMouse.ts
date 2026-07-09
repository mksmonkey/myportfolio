'use client'
import { useEffect } from 'react'
import * as THREE from 'three'

// Module-level singletons — read each frame by PostFX and CameraRig, no re-renders
export const mouseTarget = new THREE.Vector2(0.5, 0.5)
export const mouseSmooth = new THREE.Vector2(0.5, 0.5)

// Call once in Scene (outer wrapper component)
export function useMouse() {
  useEffect(() => {
    if (typeof window === 'undefined') return

    const onMove = (e: MouseEvent) => {
      mouseTarget.set(
        e.clientX / window.innerWidth,
        1.0 - e.clientY / window.innerHeight  // flip Y: WebGL origin is bottom-left
      )
    }
    window.addEventListener('mousemove', onMove, { passive: true })

    // Touch/pointer-coarse devices: slow auto-orbit so the lens stays visible
    let rafId = 0
    const isCoarse = window.matchMedia('(pointer: coarse)').matches
    if (isCoarse) {
      let angle = 0
      const orbit = () => {
        angle += 0.007
        mouseTarget.set(
          0.5 + Math.cos(angle) * 0.22,
          0.5 + Math.sin(angle * 0.71) * 0.15
        )
        rafId = requestAnimationFrame(orbit)
      }
      rafId = requestAnimationFrame(orbit)
    }

    return () => {
      window.removeEventListener('mousemove', onMove)
      if (rafId) cancelAnimationFrame(rafId)
    }
  }, [])
}
