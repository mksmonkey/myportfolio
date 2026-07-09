'use client'
import Scene from '@/components/three/Scene'
import { BootSequence } from '@/components/overlay/BootSequence'
import { useSmoothScroll } from '@/lib/gsap'
import { useAccentSync } from '@/lib/useAccentSync'
import { useSystemStore } from '@/lib/store'


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

  const alertLevel    = useSystemStore((s) => s.alertLevel)
  const setAlertLevel = useSystemStore((s) => s.setAlertLevel)
  const bootComplete  = useSystemStore((s) => s.bootComplete)
  const currentLayer  = useSystemStore((s) => s.currentLayer)

  const LAYER_LABELS = [
    'LAYER 0 // ~/surface',
    'LAYER 01 // ~/identity',
    'LAYER 02 // ~/systems',
    'LAYER 05 // ~/root',
  ]
  const layerLabel = LAYER_LABELS[Math.min(currentLayer, LAYER_LABELS.length - 1)]

  return (
    <>
      {/* Fixed WebGL canvas — z-index 0 */}
      <Scene />

      {/* Boot sequence — z-index 50, unmounts after ~3.5s */}
      <BootSequence />
      
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

        {/* Bottom-center: scroll cue — fades in 0.3s after boot completes */}
        <div
          style={{
            position:   'absolute',
            bottom:     '2.2rem',
            left:       '50%',
            transform:  'translateX(-50%)',
            ...monoStyle,
            opacity:    bootComplete ? 0.7 : 0,
            transition: bootComplete ? 'opacity 0.6s ease 0.3s' : 'none',
          }}
        >
          scroll to descend ↓
        </div>
      </div>

      {/* ── DOM layout layer (above chrome in z for interactive elements) ─────── */}
      <div style={{ position: 'relative', zIndex: 30, pointerEvents: 'none' }}>

        {/* ── [DEBUG] alertLevel slider — REMOVE IN PROMPT 4 ──────────────────
            Drag 0→1 to verify the dither corruption / glitch pipeline.         */}
        <div
          style={{
            position:       'fixed',
            bottom:         '1.5rem',
            right:          '1.5rem',
            zIndex:         100,
            pointerEvents:  'auto',
            background:     'rgba(10,10,11,0.9)',
            backdropFilter: 'blur(8px)',
            border:         '1px solid var(--accent)',
            borderRadius:   '0.5rem',
            padding:        '0.65rem 1rem',
            fontFamily:     'var(--font-mono)',
            fontSize:       '0.65rem',
            color:          'var(--text)',
            display:        'flex',
            flexDirection:  'column',
            gap:            '0.35rem',
          }}
        >
          <span style={{ opacity: 0.5 }}>[DEBUG] alertLevel: {alertLevel.toFixed(2)}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.0001}
            value={alertLevel}
            onChange={(e) => setAlertLevel(parseFloat(e.target.value))}
            style={{ width: '140px', cursor: 'pointer', accentColor: 'var(--accent)' }}
          />
        </div>

        {/* 500 vh spacer — 6 layers × ~100 vh; PROMPT 5: replace with real sections */}
        <div style={{ height: '500vh', pointerEvents: 'none' }} />
      </div>

    </>
  )
}
