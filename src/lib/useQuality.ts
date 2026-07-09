'use client'
import { useEffect, useState } from 'react'

export type Quality = 'high' | 'low'

/**
 * Returns 'low' when viewport ≤ 768px OR prefers-reduced-motion is set.
 * Scene.tsx and particle systems use this to skip PostFX / lower counts.
 */
export function useQuality(): Quality {
  const [quality, setQuality] = useState<Quality>('high')

  useEffect(() => {
    const viewport = window.matchMedia('(max-width: 768px)')
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')

    const update = () =>
      setQuality(viewport.matches ? 'low' : 'high')

    update()
    viewport.addEventListener('change', update)
    motion.addEventListener('change', update)

    return () => {
      viewport.removeEventListener('change', update)
      motion.removeEventListener('change', update)
    }
  }, [])

  return quality
}
