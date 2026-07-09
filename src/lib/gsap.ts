'use client'
import { useEffect } from 'react'
import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

// Module-level Lenis holder — sequence ke time scroll lock/unlock ke liye.
// Kisi bhi component se import karke lenisRef.instance?.stop() / .start() call kar sakte hain.
export const lenisRef: { instance: import('lenis').default | null } = { instance: null }
export function useSmoothScroll() {
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)

    let isCancelled = false
    let cleanup: (() => void) | null = null

    import('lenis').then(({ default: Lenis }) => {
      if (isCancelled) return

      const lenis = new Lenis()
      lenisRef.instance = lenis

      // CRITICAL: ScrollTrigger ko Lenis ka scroll position dena
      // documentElement.scrollTop padhne se ScrollTrigger ko sirf native scroll dikhta hai;
      // Lenis ka virtual scroll alag track hota hai. Proxy ye gap close karta hai.
      ScrollTrigger.scrollerProxy(document.documentElement, {
        scrollTop(value) {
          if (arguments.length && typeof value === 'number') {
            lenis.scrollTo(value, { immediate: true })
          }
          return lenis.scroll
        },
        getBoundingClientRect() {
          return {
            top: 0,
            left: 0,
            width: window.innerWidth,
            height: window.innerHeight,
          }
        },
      })

      // Har Lenis scroll event pe ScrollTrigger ko update karo
      lenis.on('scroll', ScrollTrigger.update)

      // Lenis ko gsap ke RAF loop pe chalao
      const raf = (time: number) => lenis.raf(time * 1000)
      gsap.ticker.add(raf)
      gsap.ticker.lagSmoothing(0)

      // Sab triggers ko nayi scroller ke against re-evaluate karwao
      ScrollTrigger.refresh()

      // CameraRig ko signal: proxy ready hai
      ;(window as unknown as { __lenisReady?: boolean }).__lenisReady = true
      window.dispatchEvent(new Event('lenis-ready'))

      cleanup = () => {
        gsap.ticker.remove(raf)
        lenis.destroy()
        lenisRef.instance = null
        ;(window as unknown as { __lenisReady?: boolean }).__lenisReady = false
      }
    })

    return () => {
      isCancelled = true
      cleanup?.()
    }
  }, [])
}