'use client'
import { useEffect, useRef, useState } from 'react'
import { gsap } from 'gsap'
import { useSystemStore } from '@/lib/store'
import { ditherState } from '@/components/three/Scene'

// ─── Char sets ────────────────────────────────────────────────────────────────
const HEX  = '0123456789ABCDEF'
const SYM  = '<>{}[]/\\~!@#$%^'
const ALL  = HEX + SYM
const rCh  = () => ALL[Math.floor(Math.random() * ALL.length)]
const rRow = () => Array.from({ length: 6 }, rCh).join(' ')

// ─── Shared style tokens ──────────────────────────────────────────────────────
const mono: React.CSSProperties = {
  fontFamily:    'var(--font-mono)',
  letterSpacing: '0.06em',
  lineHeight:    1.6,
  userSelect:    'none',
}

// Module-level flag: persists across React StrictMode double-invoke within a page session.
// When StrictMode runs effect→cleanup→effect, the second run skips the animation and
// immediately resolves dither so the screen is never stuck on white noise.
// Resets to false on full page reload (fresh module evaluation).
let _bootRan = false

// ─── BootSequence ─────────────────────────────────────────────────────────────
export function BootSequence() {
  const bootComplete    = useSystemStore((s) => s.bootComplete)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // All DOM refs — GSAP drives them imperatively; zero React re-renders during playback.
  const containerRef = useRef<HTMLDivElement>(null)
  const col1Ref      = useRef<HTMLDivElement>(null)
  const col2Ref      = useRef<HTMLDivElement>(null)
  const col3Ref      = useRef<HTMLDivElement>(null)
  const col4Ref      = useRef<HTMLDivElement>(null)
  const initLineRef  = useRef<HTMLDivElement>(null)
  const scan1Ref     = useRef<HTMLDivElement>(null)
  const scan2Ref     = useRef<HTMLDivElement>(null)
  const scan3Ref     = useRef<HTMLDivElement>(null)
  const equationRef  = useRef<HTMLDivElement>(null)
  const outputRef    = useRef<HTMLDivElement>(null)
  const class1Ref    = useRef<HTMLDivElement>(null)
  const class2Ref    = useRef<HTMLDivElement>(null)
  const accessRef    = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!mounted) return
    // StrictMode guard: if cleanup already ran once (killed the first tl and resolved
    // dither in the cleanup), skip the full animation on the remount.
    // Without this, StrictMode leaves ditherState.amount = 1.0 → full-screen white noise.
    if (_bootRan) {
      ditherState.amount = 0.06
      if (!useSystemStore.getState().bootComplete) {
        useSystemStore.getState().setBootComplete(true)
      }
      return
    }
    _bootRan = true

    ditherState.amount = 1.0

    // ── Column rain intervals ──────────────────────────────────────────────────
    const rainIntervals: ReturnType<typeof setInterval>[] = []
    const colRefs = [col1Ref, col2Ref, col3Ref, col4Ref]
    colRefs.forEach((ref) => {
      if (!ref.current) return
      const rows = ref.current.querySelectorAll<HTMLElement>('.br')
      const iv = setInterval(() => {
        rows.forEach((row) => { if (Math.random() > 0.25) row.textContent = rRow() })
      }, 80)
      rainIntervals.push(iv)
    })

    // ── Typewriter helper (setInterval-based, auto-clears) ────────────────────
    function typewrite(el: HTMLElement | null, text: string, msPerChar = 15) {
      if (!el) return
      el.textContent = ''
      let i = 0
      const iv = setInterval(() => {
        el.textContent = text.slice(0, ++i)
        if (i >= text.length) clearInterval(iv)
      }, msPerChar)
      rainIntervals.push(iv) // reuse array — all cleared on cleanup
    }

    // ── All GSAP work inside context so ctx.revert() kills tl + restores DOM ──
    const ctx = gsap.context(() => {
      const tl = gsap.timeline()

      // ─── BEAT 1 (0.0 → 0.8s): matrix rain + init line ─────────────────────
      tl.to(initLineRef.current, { opacity: 1, duration: 0.25, ease: 'power2.out' }, 0.1)

      // ─── BEAT 2 (0.8 → 1.4s): computation + dither starts resolving ───────
      // Columns converge inward
      tl.to([col1Ref.current, col2Ref.current], { x: 55, opacity: 0.15, duration: 1.0, ease: 'power2.in' }, 0.8)
      tl.to([col3Ref.current, col4Ref.current], { x: -55, opacity: 0.15, duration: 1.0, ease: 'power2.in' }, 0.8)

      // Dither starts resolving — tween ditherState directly
      tl.call(() => {
        gsap.to(ditherState, { amount: 0.06, duration: 1.4, ease: 'power2.out' })
      }, [], 0.8)

      // Computation lines typewrite
      tl.call(() => typewrite(scan1Ref.current, '> scanning threat_vectors...  ✓', 13), [], 0.85)
      tl.call(() => typewrite(scan2Ref.current, '> resolving identity_hash...  ✓', 13), [], 1.05)
      tl.call(() => typewrite(scan3Ref.current, '> cross_ref: [build] [break]  ✓', 13), [], 1.18)

      // 3B1B equation flash
      tl.to(equationRef.current, { opacity: 0.55, duration: 0.2, ease: 'power2.out' }, 0.95)
      tl.to(equationRef.current, { opacity: 0,    duration: 0.2, ease: 'power2.in'  }, 1.35)

      // ─── BEAT 3 (1.4 → 2.2s): OUTPUT: MAYANK_SHARMA ──────────────────────
      tl.set([col1Ref.current, col2Ref.current, col3Ref.current, col4Ref.current], { display: 'none' }, 1.4)
      tl.set([scan1Ref.current, scan2Ref.current, scan3Ref.current, initLineRef.current], { opacity: 0 }, 1.4)

      // OUTPUT text slams in with glitch stutter
      tl.set(outputRef.current, { opacity: 1, x: 0 }, 1.4)
      tl.to(outputRef.current, { x: -4, duration: 0.04, ease: 'none' }, 1.41)
      tl.to(outputRef.current, { x:  5, duration: 0.04, ease: 'none' }, 1.45)
      tl.to(outputRef.current, { x: -3, duration: 0.04, ease: 'none' }, 1.49)
      tl.to(outputRef.current, { x:  2, duration: 0.04, ease: 'none' }, 1.53)
      tl.to(outputRef.current, { x:  0, duration: 0.05, ease: 'power2.out' }, 1.57)

      // Crossfade: DOM output dissolves, canvas HeroText takes over
      tl.to(outputRef.current, { opacity: 0, duration: 0.35, ease: 'power2.in' }, 1.85)

      // ─── BEAT 4 (2.2 → 2.9s): classification lines ────────────────────────
      tl.call(() => typewrite(class1Ref.current, '> ROLE: APPLICATION_SECURITY_ENGINEER + FULL_STACK_DEV', 11), [], 2.2)
      tl.call(() => typewrite(class2Ref.current, '> STATUS: I build systems. I break them.', 11), [], 2.58)

      // ─── BEAT 5 (2.9 → 3.5s): ACCESS GRANTED flash + fade out ────────────
      // Double strobe
      tl.to(accessRef.current, { opacity: 1, duration: 0.1, ease: 'none' }, 2.9)
      tl.to(accessRef.current, { opacity: 0, duration: 0.1, ease: 'none' }, 3.0)
      tl.to(accessRef.current, { opacity: 1, duration: 0.1, ease: 'none' }, 3.1)
      tl.to(accessRef.current, { opacity: 0, duration: 0.15, ease: 'none' }, 3.2)
      tl.to(accessRef.current, { opacity: 1, duration: 0.1, ease: 'none' }, 3.3)
      tl.to(accessRef.current, { opacity: 0, duration: 0.15, ease: 'none' }, 3.4)

      // Whole overlay fades out
      tl.to(containerRef.current, { opacity: 0, duration: 0.4, ease: 'power2.inOut' }, 3.4)

      // Mark boot complete — use imperative API (avoids stale closure)
      tl.call(() => { useSystemStore.getState().setBootComplete(true) }, [], 3.52)
    })

    return () => {
      ctx.revert()  // kills tl + restores all GSAP-modified DOM styles to initial state
      rainIntervals.forEach(clearInterval)
      // Resolve dither + unblock app if unmounted mid-sequence (route change, etc.)
      ditherState.amount = 0.06
      if (!useSystemStore.getState().bootComplete) {
        useSystemStore.getState().setBootComplete(true)
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted])

  if (!mounted || bootComplete) return null

  // ─── Render ───────────────────────────────────────────────────────────────
  const ROWS = 8

  return (
    <div
      ref={containerRef}
      style={{
        position:      'fixed',
        inset:         0,
        zIndex:        50,
        pointerEvents: 'none',
        overflow:      'hidden',
        ...mono,
      }}
    >
      {/* ── Matrix rain columns ─────────────────────────────────────────── */}
      {/* Left pair */}
      <div
        ref={col1Ref}
        style={{ position: 'absolute', top: '16%', left: '3%', fontSize: '0.62rem', color: '#E6E6E9', opacity: 0.38 }}
      >
        {Array.from({ length: ROWS }, (_, i) => (
          <div key={i} className="br" style={{ whiteSpace: 'nowrap' }}>{rRow()}</div>
        ))}
      </div>
      <div
        ref={col2Ref}
        style={{ position: 'absolute', top: '22%', left: '10%', fontSize: '0.62rem', color: '#E6E6E9', opacity: 0.28 }}
      >
        {Array.from({ length: ROWS }, (_, i) => (
          <div key={i} className="br" style={{ whiteSpace: 'nowrap' }}>{rRow()}</div>
        ))}
      </div>
      {/* Right pair */}
      <div
        ref={col3Ref}
        style={{ position: 'absolute', top: '16%', right: '3%', fontSize: '0.62rem', color: '#E6E6E9', opacity: 0.38 }}
      >
        {Array.from({ length: ROWS }, (_, i) => (
          <div key={i} className="br" style={{ whiteSpace: 'nowrap' }}>{rRow()}</div>
        ))}
      </div>
      <div
        ref={col4Ref}
        style={{ position: 'absolute', top: '22%', right: '10%', fontSize: '0.62rem', color: '#E6E6E9', opacity: 0.28 }}
      >
        {Array.from({ length: ROWS }, (_, i) => (
          <div key={i} className="br" style={{ whiteSpace: 'nowrap' }}>{rRow()}</div>
        ))}
      </div>

      {/* ── Beat 1: init line ───────────────────────────────────────────── */}
      <div
        ref={initLineRef}
        style={{
          position:  'absolute',
          top:       '11%',
          left:      '50%',
          transform: 'translateX(-50%)',
          fontSize:  '0.68rem',
          color:     '#E6E6E9',
          opacity:   0,
          whiteSpace:'nowrap',
        }}
      >
        &gt; INITIALIZING IDENTITY_RESOLVE.exe
      </div>

      {/* ── Beat 2: computation scan lines ─────────────────────────────── */}
      <div ref={scan1Ref} style={{ position: 'absolute', top: '42%', left: '14%', fontSize: '0.68rem', color: '#E6E6E9' }} />
      <div ref={scan2Ref} style={{ position: 'absolute', top: '48%', left: '14%', fontSize: '0.68rem', color: '#E6E6E9' }} />
      <div ref={scan3Ref} style={{ position: 'absolute', top: '54%', left: '14%', fontSize: '0.68rem', color: '#E6E6E9' }} />

      {/* Beat 2: 3B1B equation */}
      <div
        ref={equationRef}
        style={{
          position:  'absolute',
          top:       '50%',
          left:      '50%',
          transform: 'translate(-50%, -50%)',
          fontSize:  '0.85rem',
          color:     '#00E5FF',
          opacity:   0,
          whiteSpace:'nowrap',
          textAlign: 'center',
        }}
      >
        W₁&nbsp;·&nbsp;E&nbsp;+&nbsp;B₁&nbsp;→&nbsp;ReLU&nbsp;→&nbsp;IDENTITY
      </div>

      {/* ── Beat 3: OUTPUT: MAYANK_SHARMA ──────────────────────────────── */}
      <div
        ref={outputRef}
        style={{
          position:   'absolute',
          top:        '44%',
          left:       '50%',
          transform:  'translate(-50%, -50%)',
          fontSize:   'clamp(1.1rem, 2.8vw, 1.65rem)',
          fontWeight: 700,
          color:      '#E6E6E9',
          opacity:    0,
          whiteSpace: 'nowrap',
          letterSpacing: '0.12em',
        }}
      >
        OUTPUT:&nbsp;MAYANK_SHARMA
      </div>

      {/* ── Beat 4: classification lines ───────────────────────────────── */}
      <div
        ref={class1Ref}
        style={{ position: 'absolute', top: '60%', left: '50%', transform: 'translateX(-50%)', fontSize: '0.70rem', color: '#00E5FF', whiteSpace: 'nowrap' }}
      />
      <div
        ref={class2Ref}
        style={{ position: 'absolute', top: '66%', left: '50%', transform: 'translateX(-50%)', fontSize: '0.70rem', color: '#00E5FF', whiteSpace: 'nowrap' }}
      />

      {/* ── Beat 5: ACCESS GRANTED ─────────────────────────────────────── */}
      <div
        ref={accessRef}
        style={{
          position:   'absolute',
          top:        '37%',
          left:       '50%',
          transform:  'translate(-50%, -50%)',
          fontSize:   'clamp(1.0rem, 2.5vw, 1.5rem)',
          fontWeight: 700,
          color:      '#9EFF00',
          opacity:    0,
          whiteSpace: 'nowrap',
          letterSpacing: '0.18em',
        }}
      >
        [&nbsp;ACCESS&nbsp;GRANTED&nbsp;]
      </div>
    </div>
  )
}
