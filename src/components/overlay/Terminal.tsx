'use client'
import { useRef, useState, useEffect } from 'react'
import { useSystemStore } from '@/lib/store'
import { lenisRef } from '@/lib/gsap'

// ── root shell — live at LAYER 5 // ~/root ────────────────────────────────────
// A small REPL over the same store the whole site runs on: `red`/`blue`
// actually swap the lens (RoleShiftOverlay fires), `breach` reads real state,
// `exit` rides Lenis back to the surface.

interface TLine {
  t: string
  c?: string
  href?: string
}

const PROMPT = 'root@mayank:~#'

const BOOT_LINES: TLine[] = [
  { t: 'session upgraded → interactive shell', c: '#9EFF00' },
  { t: "type 'help' for available commands", c: '#5A6870' },
]

function runCommand(raw: string): TLine[] | 'clear' {
  const store = useSystemStore.getState()
  const cmd = raw.trim().toLowerCase()

  switch (cmd) {
    case '':
      return []
    case 'help':
      return [
        { t: 'whoami      identity summary', c: '#E6E6E9' },
        { t: 'projects    decrypted files from ~/systems', c: '#E6E6E9' },
        { t: 'history     tail career.log', c: '#E6E6E9' },
        { t: 'arsenal     enumerate the weapon rack', c: '#E6E6E9' },
        { t: 'breach      nodes you compromised this session', c: '#E6E6E9' },
        { t: 'contact     open a channel', c: '#E6E6E9' },
        { t: 'red / blue  swap the lens', c: '#E6E6E9' },
        { t: 'clear       wipe the buffer · exit — back to surface', c: '#E6E6E9' },
      ]
    case 'whoami':
      return [
        { t: 'MAYANK SHARMA — application security engineer × full-stack developer', c: '#E6E6E9' },
        { t: 'CEH v11 · MCA CS (Chandigarh University) · CTF top 10% national', c: '#5A6870' },
        { t: '"I build systems. I break them. Then I build them better."', c: '#00E5FF' },
      ]
    case 'projects':
      return [
        { t: 'sarvavidhi.com    multi-tenant SaaS — OAuth ATO + tenant leak: patched', c: '#E6E6E9' },
        { t: 'vedaecho.com      subscription platform — IDOR class: designed out', c: '#E6E6E9' },
        { t: 'ayuceutical.com   AI healthcare — prompt-injection: guardrailed', c: '#E6E6E9' },
        { t: 'getnovative.com   3D studio portfolio — R3F/Three.js, solo build', c: '#E6E6E9' },
        { t: 'abhishek realtor  luxury real-estate — live on vercel', c: '#E6E6E9' },
      ]
    case 'history':
      return [
        { t: '[2026.01 → now ]  getnovative.solutions — full-stack developer', c: '#E6E6E9' },
        { t: '[2025.03 → 08  ]  coe-security.llc — cyberops & IR (80+ vulns down)', c: '#E6E6E9' },
        { t: '[2025.02 → 04  ]  azerium.dev — pentester (critical IDOR disclosed)', c: '#E6E6E9' },
        { t: '[2024.10 → 01  ]  1stop.ai — security intern (23+ servers hardened)', c: '#E6E6E9' },
      ]
    case 'arsenal':
      return [
        { t: 'BUILD   next.js · react · typescript · node · prisma · postgres', c: '#00E5FF' },
        { t: 'SECURE  vapt · owasp · siem/soc · incident response · rbac · iso27001', c: '#9EFF00' },
        { t: 'BREAK   burp · nmap · metasploit · sqlmap · hydra · nessus · python', c: '#FF2D55' },
      ]
    case 'breach': {
      const nodes = [...store.breached]
      if (nodes.length === 0) {
        return [{ t: 'no nodes breached yet — probe the dossiers in ~/systems', c: '#5A6870' }]
      }
      return [
        { t: `${nodes.length} node(s) compromised this session:`, c: '#FF6B00' },
        ...nodes.map((n) => ({ t: `  ▸ ${n}`, c: '#E6E6E9' })),
        { t: 'every one of them was already patched. the builder was here first.', c: '#9EFF00' },
      ]
    }
    case 'contact':
      return [
        { t: 'email    → mks1199yr521@gmail.com', c: '#E6E6E9', href: 'mailto:mks1199yr521@gmail.com' },
        { t: 'linkedin → linkedin.com/in/mayank-sharma-184ba1153', c: '#E6E6E9', href: 'https://www.linkedin.com/in/mayank-sharma-184ba1153' },
        { t: 'status   → open to work — bengaluru · on-site / hybrid', c: '#9EFF00' },
      ]
    case 'red':
      store.setSelectedRole('breaker')
      store.setAlertLevel(0.55)
      return [{ t: 'lens swapped → ~/breaker · wonderland engaged', c: '#FF2D55' }]
    case 'blue':
      store.setSelectedRole('builder')
      store.setAlertLevel(0.05)
      return [{ t: 'lens swapped → ~/builder · waking up in prod', c: '#00E5FF' }]
    case 'clear':
      return 'clear'
    case 'exit':
      lenisRef.instance?.scrollTo(0, { duration: 2.4 })
      return [{ t: 'climbing back to the surface...', c: '#5A6870' }]
    case 'sudo rm -rf /':
    case 'rm -rf /':
      store.setAlertLevel(1)
      return [
        { t: 'KERNEL PANIC AVERTED — immutable infra, versioned backups, zero trust.', c: '#FF2D55' },
        { t: 'nice try though. the builder plans for people like you.', c: '#FF6B00' },
      ]
    default:
      return [{ t: `command not found: ${raw.trim()} — try 'help'`, c: '#FF6B00' }]
  }
}

export function Terminal() {
  const currentLayer = useSystemStore((s) => s.currentLayer)
  const visible = currentLayer === 5

  const [lines, setLines] = useState<TLine[]>([])
  const [input, setInput] = useState('')
  const bootedRef  = useRef(false)
  const lastCmdRef = useRef('')
  const bodyRef    = useRef<HTMLDivElement>(null)
  const inputRef   = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (visible && !bootedRef.current) {
      bootedRef.current = true
      setLines(BOOT_LINES)
    }
    if (visible) inputRef.current?.focus()
  }, [visible])

  useEffect(() => {
    const el = bodyRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [lines])

  const submit = () => {
    const echo: TLine = { t: `${PROMPT} ${input}`, c: '#4A5860' }
    const out = runCommand(input)
    if (out === 'clear') setLines([])
    else setLines((prev) => [...prev.slice(-80), echo, ...out])
    lastCmdRef.current = input
    setInput('')
  }

  return (
    <div
      data-lenis-prevent
      onClick={() => inputRef.current?.focus()}
      onWheel={(e) => e.stopPropagation()}
      style={{
        position:      'fixed',
        bottom:        '2.6rem',
        left:          '50%',
        transform:     `translateX(-50%) translateY(${visible ? '0' : '18px'})`,
        width:         'min(680px, 92vw)',
        zIndex:        40,
        opacity:       visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
        transition:    'opacity 0.5s ease, transform 0.5s ease',
        background:    'rgba(10, 10, 12, 0.88)',
        backdropFilter: 'blur(10px)',
        border:        '1px solid rgba(158, 255, 0, 0.35)',
        fontFamily:    'var(--font-mono), "JetBrains Mono", monospace',
        fontSize:      '0.72rem',
        lineHeight:    1.75,
        cursor:        'text',
      }}
    >
      {/* title bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        padding: '0.45rem 0.9rem',
        borderBottom: '1px solid rgba(158, 255, 0, 0.2)',
        color: '#9EFF00', letterSpacing: '0.12em', fontSize: '0.62rem',
      }}>
        <span>root shell — /dev/pts/0</span>
        <span style={{ opacity: 0.5 }}>ACCESS GRANTED</span>
      </div>

      {/* scrollback */}
      <div ref={bodyRef} style={{ maxHeight: '32vh', minHeight: '9rem', overflowY: 'auto', padding: '0.7rem 0.9rem 0.3rem' }}>
        {lines.map((l, i) => (
          <div key={i} style={{ color: l.c ?? '#E6E6E9', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {l.href
              ? <a href={l.href} target="_blank" rel="noreferrer" style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: '3px' }}>{l.t}</a>
              : l.t}
          </div>
        ))}
      </div>

      {/* prompt */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0.9rem 0.7rem' }}>
        <span style={{ color: '#9EFF00', whiteSpace: 'nowrap' }}>{PROMPT}</span>
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            e.stopPropagation()
            if (e.key === 'Enter') submit()
            if (e.key === 'ArrowUp') { e.preventDefault(); setInput(lastCmdRef.current) }
          }}
          spellCheck={false}
          autoComplete="off"
          aria-label="terminal input"
          style={{
            flex: 1, background: 'transparent', border: 'none', outline: 'none',
            color: '#E6E6E9', fontFamily: 'inherit', fontSize: 'inherit', caretColor: '#9EFF00',
          }}
        />
      </div>
    </div>
  )
}
