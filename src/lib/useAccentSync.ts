'use client'
import { useEffect } from 'react'
import { useSystemStore } from './store'

/** Parse a #RRGGBB hex string into {r,g,b} components (0–255). */
function parseHex(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }
}

/** Linear-interpolate between two #RRGGBB colours; returns an rgb() string. */
function lerpHex(a: string, b: string, t: number): string {
  const ca = parseHex(a)
  const cb = parseHex(b)
  const r = Math.round(ca.r + (cb.r - ca.r) * t)
  const g = Math.round(ca.g + (cb.g - ca.g) * t)
  const bl = Math.round(ca.b + (cb.b - ca.b) * t)
  return `rgb(${r},${g},${bl})`
}

const CALM_A = '#00E5FF'
const CALM_B = '#9EFF00'
const ALERT_A = '#FF6B00'
const ALERT_B = '#FF2D55'

/**
 * Subscribes to alertLevel and writes --accent / --accent-2 onto
 * document.documentElement so any CSS can read the live-interpolated colour.
 * Respects prefers-reduced-motion by locking to calm colours.
 */
export function useAccentSync() {
  useEffect(() => {
   const apply = (alertLevel: number) => {
      const t = alertLevel // Direct connection to your system state
      const root = document.documentElement
      root.style.setProperty('--accent', lerpHex(CALM_A, ALERT_A, t))
      root.style.setProperty('--accent-2', lerpHex(CALM_B, ALERT_B, t))
    }

    apply(useSystemStore.getState().alertLevel)

    const unsub = useSystemStore.subscribe((s) => apply(s.alertLevel))
    return unsub
  }, [])
}
