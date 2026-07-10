'use client'
import { useRef, useEffect } from 'react'
import { gsap } from 'gsap'
import Scene from '@/components/three/Scene'
import { BootSequence } from '@/components/overlay/BootSequence'
import { Terminal } from '@/components/overlay/Terminal'
import { useSmoothScroll } from '@/lib/gsap'
import { useAccentSync } from '@/lib/useAccentSync'
import { useSystemStore } from '@/lib/store'

// ── Reality-shift overlay ─────────────────────────────────────────────────────
// Plays on EVERY role change (first pill click AND later lens switches): the
// world blacks out, the new lens announces itself, then lifts. Also hides the
// camera hand-off cut when the cinematic resumes scroll.
function RoleShiftOverlay() {
  const veilRef  = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLDivElement>(null)
  const subRef   = useRef<HTMLDivElement>(null)
  const prevRole = useRef<'builder' | 'breaker' | null>(null)
  const selectedRole = useSystemStore((s) => s.selectedRole)

  useEffect(() => {
    if (!selectedRole || selectedRole === prevRole.current) {
      prevRole.current = selectedRole
      return
    }
    prevRole.current = selectedRole

    const isRed = selectedRole === 'breaker'
    const color = isRed ? '#FF2D55' : '#00E5FF'
    const veil = veilRef.current, title = titleRef.current, sub = subRef.current
    if (!veil || !title || !sub) return

    title.textContent = isRed ? '>> ENTERING WONDERLAND' : '>> WAKING UP IN PROD'
    sub.textContent   = isRed ? 'offensive lens :: ~/breaker' : 'builder lens :: ~/builder'
    title.style.color = color
    title.style.textShadow = `0 0 26px ${color}`
    veil.style.display = 'flex'

    const tl = gsap.timeline({ onComplete: () => { veil.style.display = 'none' } })
    tl.fromTo(veil,  { opacity: 0 }, { opacity: 1, duration: 0.32, ease: 'power2.in' }, 0.28)
    tl.fromTo(title, { opacity: 0, letterSpacing: '0.65em' }, { opacity: 1, letterSpacing: '0.24em', duration: 0.55, ease: 'power3.out' }, 0.58)
    tl.fromTo(sub,   { opacity: 0 }, { opacity: 0.6, duration: 0.4 }, 0.85)
    tl.to(veil, { opacity: 0, duration: 0.55, ease: 'power2.inOut' }, 1.8)

    return () => { tl.kill() }
  }, [selectedRole])

  return (
    <div
      ref={veilRef}
      style={{
        position: 'fixed', inset: 0, zIndex: 95,
        display: 'none', opacity: 0,
        background: '#050506',
        backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.028) 0 1px, transparent 1px 3px)',
        alignItems: 'center', justifyContent: 'center', flexDirection: 'column',
        pointerEvents: 'none',
        fontFamily: 'var(--font-mono)',
      }}
    >
      <div ref={titleRef} style={{ fontSize: 'clamp(20px, 3.2vw, 44px)', fontWeight: 700, letterSpacing: '0.24em', whiteSpace: 'nowrap' }} />
      <div ref={subRef} style={{ marginTop: '1.1rem', fontSize: '0.78rem', letterSpacing: '0.32em', color: '#E6E6E9', opacity: 0 }} />
    </div>
  )
}


// ── Hero chrome styles (inline so no Tailwind dependency) ─────────────────────
const monoStyle: React.CSSProperties = {
  fontFamily:    'var(--font-mono)',
  fontSize:      '0.7rem',
  letterSpacing: '0.08em',
  color:         'var(--text)',
  opacity:       0.55,
  lineHeight:    1.5,
}

export default function Home() {
  useSmoothScroll()
  useAccentSync()

  const bootComplete  = useSystemStore((s) => s.bootComplete)
  const currentLayer  = useSystemStore((s) => s.currentLayer)
  const l1Status      = useSystemStore((s) => s.l1Status)
  const l1LogText     = useSystemStore((s) => s.l1LogText)
  const l1ShowResume  = useSystemStore((s) => s.l1ShowResume)
  const selectedRole  = useSystemStore((s) => s.selectedRole)
  const descentUnlocked = useSystemStore((s) => s.descentUnlocked)

  const switchRole = (r: 'breaker' | 'builder') => {
    const st = useSystemStore.getState()
    if (st.selectedRole === r) return
    st.setSelectedRole(r)
    st.setAlertLevel(r === 'breaker' ? 0.55 : 0.05) // red runs hot, blue runs clean
  }

  const LAYER_LABELS = [
    'LAYER 0 // ~/surface',
    'LAYER 1 // ~/identity',
    'LAYER 2 // ~/systems',
    'LAYER 3 // ~/arsenal',
    'LAYER 4 // ~/history',
    'LAYER 5 // ~/root',
  ]
  const layerLabel = LAYER_LABELS[Math.min(currentLayer, LAYER_LABELS.length - 1)]

  return (
    <>
      {/* Fixed WebGL canvas — z-index 0 */}
      <Scene />

      {/* Boot sequence — z-index 50, unmounts after ~3.5s */}
      <BootSequence />

      {/* Reality-shift veil on role change — z-index 95 */}
      <RoleShiftOverlay />

      {/* Root shell — z-index 40, live only at LAYER 5 */}
      <Terminal />
      
      {/* ── Hero chrome — z-index 20, pointer-events: none ─────────────────── */}
      <div
        style={{
          position:      'fixed',
          inset:         0,
          zIndex:        20,
          pointerEvents: 'none',
        }}
      >
        {/* Top-left: session identifier */}
        <div style={{ position: 'absolute', top: '1.6rem', left: '1.8rem', ...monoStyle }}>
          root@mayank
          <span style={{ opacity: 0.35, marginLeft: '0.5rem' }}>~$</span>
        </div>

        {/* Top-right: layer indicator — updates on band change only (Zustand selector) */}
        <div style={{ position: 'absolute', top: '1.6rem', right: '1.8rem', ...monoStyle }}>
          {layerLabel}
        </div>

        {/* Top-center: lens toggle — appears after the kill chain; switch views
            anytime without replaying the ritual */}
        {l1Status === 'done' && descentUnlocked && (
          <div
            style={{
              position:      'absolute',
              top:           '1.35rem',
              left:          '50%',
              transform:     'translateX(-50%)',
              display:       'flex',
              gap:           '0.7rem',
              pointerEvents: 'auto',
              fontFamily:    'var(--font-mono)',
              fontSize:      '0.64rem',
              letterSpacing: '0.12em',
            }}
          >
            {(['breaker', 'builder'] as const).map((r) => {
              const active = selectedRole === r
              const col = r === 'breaker' ? '#FF2D55' : '#00E5FF'
              return (
                <button
                  key={r}
                  onClick={() => switchRole(r)}
                  style={{
                    background:    'rgba(10,10,11,0.55)',
                    border:        '1px solid',
                    borderColor:   active ? col : 'rgba(230,230,233,0.18)',
                    color:         active ? col : 'rgba(230,230,233,0.45)',
                    padding:       '0.32rem 0.75rem',
                    cursor:        'pointer',
                    fontFamily:    'inherit',
                    fontSize:      'inherit',
                    letterSpacing: 'inherit',
                    textShadow:    active ? `0 0 10px ${col}` : 'none',
                    transition:    'color .25s, border-color .25s, text-shadow .25s',
                  }}
                >
                  {r === 'breaker' ? 'RED // ~/breaker' : 'BLUE // ~/builder'}
                </button>
              )
            })}
          </div>
        )}

        {/* Bottom-center: scroll cue — fades in 0.3s after boot completes.
            During the pill choice it becomes the choice hint. */}
        <div
          style={{
            position:   'absolute',
            bottom:     '2.2rem',
            left:       '50%',
            transform:  'translateX(-50%)',
            ...monoStyle,
            opacity:    bootComplete ? 0.7 : 0,
            transition: bootComplete ? 'opacity 0.6s ease 0.3s' : 'none',
            color:      l1ShowResume && !descentUnlocked ? 'var(--accent)' : monoStyle.color,
          }}
        >
          {l1ShowResume && !descentUnlocked ? 'choose a lens to descend' : 'scroll to descend'}
        </div>

        {/* Bottom-left: Layer 1 kill-chain log — visible once the hack starts */}
        {l1Status !== 'idle' && (
          <div
            style={{
              position:    'absolute',
              bottom:      '2.2rem',
              left:        '1.8rem',
              ...monoStyle,
              opacity:     0.85,
              borderLeft:  '2px solid var(--accent)',
              paddingLeft: '0.6rem',
              maxWidth:    '46ch',
            }}
          >
            {l1LogText}
          </div>
        )}

        {descentUnlocked && (
          <div
            style={{
              position: 'absolute',
              right: '1.8rem',
              bottom: '2.2rem',
              display: 'flex',
              gap: '0.42rem',
              alignItems: 'center',
              ...monoStyle,
              opacity: 0.78,
            }}
          >
            {['identity', 'systems', 'arsenal', 'history', 'root'].map((node, i) => (
              <span
                key={node}
                style={{
                  color: i <= Math.max(0, currentLayer - 1) ? 'var(--accent)' : 'rgba(230,230,233,0.28)',
                  textShadow: i <= Math.max(0, currentLayer - 1) ? '0 0 10px var(--accent)' : 'none',
                }}
              >
                {node}
                {i < 4 ? ' /' : ''}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* ── DOM layout layer (above chrome in z for interactive elements) ─────── */}
      <div style={{ position: 'relative', zIndex: 30, pointerEvents: 'none' }}>
        {/* 560 vh scroll shaft — denser descent after the mandatory choice gate */}
        <div style={{ height: '560vh', pointerEvents: 'none' }} />
      </div>

    </>
  )
}
