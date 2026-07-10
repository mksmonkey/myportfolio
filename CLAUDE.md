# CLAUDE.md — "Live Exploit" Portfolio

> This file is auto-read by Claude Code every session. It is the single source of truth for the project's concept, architecture, and rules. Read it fully before writing any code. Do not violate the constraints in section `## HARD RULES`.

---

## 1. WHAT THIS IS

An **Awwwards-tier interactive WebGL portfolio** for **Mayank Sharma**, a **DevSecOps / Application Security Engineer + Full-Stack Developer**. The whole site behaves like an **attackable system** the visitor descends into and decrypts.

The bar is **Awwwards Site of the Year**, not "a nice portfolio". Reference DNA we are synthesizing (do NOT copy, extract principles):
- **AstroDither** (robertborghesi) → one obsessively-perfected signature visual technique (dithering).
- **Aino Agency** → editorial restraint, premium typography, minimal color.
- **Prometheus Fuels / Orano** (Active Theory / Immersive Garden) → a continuous spatial *journey*, camera travels through a world; navigation IS the experience.

If a change makes the site look more like a generic Three.js starter (floating particle sphere, rainbow colors, no interaction), it is **wrong**.

---

## 2. THE SIGNATURE: "Dithered Decryption"

The ONE unifying idea. Everything obeys it:

- Content lives **encrypted** = monochrome **ordered-dither (Bayer matrix) noise**, mushy/unreadable.
- Content **resolves** to **sharp + accent color** when **decrypted**.
- Decryption triggers: the **mouse "decryption lens"** (a flashlight that resolves content under the cursor) and **scroll descent** (the current layer resolves, layers behind re-encrypt).
- This is a literal metaphor for the security narrative: **encrypted → decrypted**, **signal lost → signal found**.

**Restraint rule:** most of the screen stays monochrome dithered at all times. Color appears ONLY where decrypted. Never rainbow the screen. Premium = disciplined.

---

## 3. THE STRUCTURE: descent through 6 layers

The site is a **vertical descent** through a system's layers (camera travels DOWN a conceptual shaft, NOT pushing into a sphere). Each layer has a base dither signature PLUS its own **reveal mechanic** — same soul, fresh feel per layer, each justified by narrative.

| Layer | Route | Section | Reveal mechanic | Built in |
|------|-------|---------|-----------------|----------|
| 0 | `~/surface`  | Hero (name + tagline) | **Dither resolve** + mouse lens (establishes signature) | Prompt 2.5 |
| 1 | `~/identity` | About — BUILD // BREAK | **Kill-chain cinematic** (packet dive through router→ISP→server→NN) ending in a **Morpheus red/blue-pill choice** — Mayank's photo (`/public/mypic.jpg`, posterized mono) center, RED pill = `~/breaker` (security), BLUE pill = `~/builder` (web dev); the pick sets `selectedRole`, which swaps Layer 2's card sets | Prompt 3/4 |
| 2 | `~/systems`  | Projects (most important) | **ASCII-rain resolve** — each project an "encrypted file" that decrypts to content; hover reveals vuln→patch | Prompt 3 |
| 3 | `~/arsenal`  | Skills | **Dither callback** — skills resolve from a dithered "weapon rack", category-wise | Prompt 4 |
| 4 | `~/history`  | Experience | **Scanline-glitch reveal** — jobs are "system logs" swept in by a CRT scanline | Prompt 4 |
| 5 | `~/root`     | Contact | **Full decrypt** — everything resolves, "ACCESS GRANTED", color floods, terminal contact | Prompt 4/5 |

**Constants across all layers:** mouse decryption lens always works · camera = continuous descent + mouse parallax · monochrome base + accent-on-reveal · `alertLevel` corruption when the user hits a "honeypot" or scrolls violently (system detects them → deliberate red glitch).

---

## 4. THE NARRATIVE HOOK (why this beats a "mode toggle")

Mayank is a **builder + attacker**. The visitor is cast as a temporary **attacker**: they "exploit" the system, but every project reveal shows the vulnerability was **already found and patched** by Mayank. The attacker always loses because the builder secured it first. This is the resume made literal: *"I break it, then I build it so it can't be broken."* Keep this subtext alive in copy and reveals.

---

## 5. STATE CONTRACT — `src/lib/store.ts` (Zustand, single source of truth)

Both the 3D canvas and the DOM read from this. **Never** prop-drill these; **never** read them via hook selectors inside `useFrame` (causes per-frame re-renders) — use `useSystemStore.getState()` or an imperative `subscribe` + ref.

```
alertLevel:   number 0..1        // drives dither corruption, post-fx intensity, palette bias
breached:     Set<string>        // which project nodes are "hacked"/decrypted
activeNode:   string | null      // currently focused project/layer
bootComplete: boolean            // loader/auth done
mode:         'guided' | 'terminal'

Actions: setAlertLevel(clamp), raiseAlert(delta clamp), breachNode(id -> new Set + raiseAlert 0.2),
         setActiveNode, setBootComplete, setMode, reset
```

`alertLevel` is the master dial: one float feeds the dither shader uniform, the CSS `--accent` interpolation, and post-processing intensity. Change it in one place, three systems react.

---

## 6. DESIGN SYSTEM

**Palette (restraint is mandatory):**
- `--bg: #0A0A0B`  ·  `--surface: #101014`  ·  dither ink `--text: #E6E6E9`
- Calm/decrypted accent: `--calm-a: #00E5FF` (cyan) → `--calm-b: #9EFF00` (lime)
- Alert/corrupted: `--alert-a: #FF6B00` (amber) → `--alert-b: #FF2D55` (red)
- Live `--accent` / `--accent-2` are JS-interpolated from `alertLevel` (see `useAccentSync.ts`).
- Color appears **only on decrypt**. Default screen = monochrome dither.

**Type:** `Space Grotesk` (display, `--font-display`) + `JetBrains Mono` (mono/terminal, `--font-mono`). Editorial, large, confident (Aino energy). Mono for all system chrome (`root@mayank`, `LAYER X // ~/route`, logs).

**Texture:** subtle film grain + scanlines overlay (low opacity, `pointer-events:none`, above canvas / below UI). Never heavy.

**Text rendering rule:** any readable text that must stay crisp when decrypted is rendered via a **high-res offscreen canvas → texture on a plane** (or a screen-space layer the dither pass processes). **Never build readable text out of particles** — it goes mushy. Particles are for ambience/depth only.

---

## 7. TECH STACK & ARCHITECTURE

- **Next.js 16** (App Router) · **TypeScript** · **Tailwind v4** (`@theme` in globals.css)
- **three** ^0.184 · **@react-three/fiber** ^9.6 · **@react-three/drei** ^10.7 · **@react-three/postprocessing** + **postprocessing** ^3.0.4
- **gsap** ^3.x + ScrollTrigger · **lenis** ^1.3 (smooth scroll) · **zustand** ^5
- Single **persistent `<Canvas>`** for the whole site (`src/components/three/Scene.tsx`). NEVER mount multiple canvases.

**File map (current + planned):**
```
src/
  app/
    layout.tsx          fonts, metadata ("root@mayank")
    page.tsx            Scene + DOM overlay (+ temp debug slider — REMOVE in Prompt 5)
    globals.css         tokens, Tailwind @theme, grain/scanline overlay
  lib/
    store.ts            Zustand state contract (section 5)
    useAccentSync.ts    writes --accent/--accent-2 from alertLevel
    useQuality.ts       'high' | 'low' (viewport + prefers-reduced-motion)
    useMouse.ts         damped normalized mouse → decryption lens          [Prompt 2.5]
    gsap.ts             useSmoothScroll() — Lenis + ScrollTrigger
  components/
    three/
      Scene.tsx         persistent Canvas: SystemCore + CameraRig + PostFX
      SystemCore.tsx    particle field — now SUBTLE dithered ambience       [demoted 2.5]
      rig/CameraRig.tsx vertical descent + mouse parallax                   [reworked 2.5]
      postfx/
        DitherEffect.tsx  custom Bayer ordered-dither pass + lens + glitch  [Prompt 2.5]
      shaders/          GLSL as template-string consts
    overlay/            DOM chrome: layer indicator, scroll cue, (later) Terminal, BootSequence
    sections/           Layer 1–5 DOM content                                [Prompt 3+]
```

---

## 8. HARD RULES (do not violate)

1. **No browser-storage APIs** (`localStorage`/`sessionStorage`) anywhere — they break in this environment. State lives in Zustand / React.
2. **Zero per-frame React re-renders.** In `useFrame`, read store/mouse imperatively (`getState()`, refs, imperative `subscribe`). Never via reactive hook selectors.
3. **GPU over CPU.** Animate particles/dither in **GLSL via uniforms** (`uTime`, `uAlert`, `uMouse`, `uDitherAmount`), not JS per-particle loops. Target 60fps with 10k+ points.
4. **One canvas only.** Everything 3D goes through the single persistent `<Canvas>`.
5. **Restraint.** Monochrome default; accent only on decrypt. No rainbow, no gratuitous effects. If unsure, do less.
6. **Readable text = canvas texture, never particles.**
7. **Mobile / `prefers-reduced-motion`:** every heavy effect needs a graceful low path (fewer particles, post-fx off, simpler camera). Use `useQuality()`.
8. **Damp everything.** No snapping. All state→visual transitions are lerped/damped (`THREE.MathUtils.damp`) for a buttery, cinematic feel.
9. **alertLevel high must look GOOD** — deliberate corruption (scanline tears, channel offset, controlled glitch), never ugly random noise.
10. **Scope discipline.** Each prompt builds only its stated layer(s). Mark future hooks with `// PROMPT N:` comments. Don't pre-build later layers.
11. **Mark injection points** for upcoming work with `// PROMPT 3:` / `// PROMPT 4:` / `// PROMPT 5:` so the next session finds them instantly.

---

## 9. BUILD PROGRESS

- [x] **Prompt 1** — Engine: Zustand store, Lenis+GSAP, persistent Canvas, CSS-var accent, PostFX (Bloom/Noise/Chromatic), quality hook, debug slider.
- [x] **Prompt 2** — SystemCore (GPU particle field, GLSL morph calm↔chaos) + CameraRig foundation. *(Outcome: looked too generic — being reworked.)*
- [x] **Prompt 2.5** — Dither Bayer pass + mouse decryption lens + vertical descent camera + Hero (Layer 0) working.
- [x] **Prompt 3** — 4 surgical bug fixes (CameraRig scroll inversion, lumaLift 0.30, HeroText fixed 9.0×3.96 world-unit sizing + canvas bg fill, alert tuning) + cinematic 5-beat hero boot sequence (`BootSequence.tsx`); `ditherState` exported for coordinated tween timing; scroll cue gated on `bootComplete`.
- [x] **Prompt 4** — Layer 1 kill-chain cinematic (5 stations, NN lattice, segmented return) ending in the **Morpheus pill choice** (photo tableau from `/public/mypic.jpg`; red=`breaker`/blue=`builder` → `setSelectedRole`; skip-scroll defaults to builder) + Layer 2 ASCII-rain projects with **dual card sets** (BUILDER/BREAKER, swapped via `selectedRole`) + DitherEffect chroma-preservation & **colored dither** after choice (`trueColorState`/`uChoiceActive`) + hero lift-out during cinematics + gyro reticle rings on pills + **persistent lens toggle** (top-center, after first kill chain; pills also re-clickable) + **RoleShiftOverlay** reality-shift veil on every role change (also masks the cinematic→scroll camera cut) + L1 log line & choice hint in `page.tsx`.
- [x] **Prompt 5** — Layer 3 `~/arsenal` (3 canvas-texture weapon racks BUILD/SECURE/BREAK, role-lens bias, staggered reveal, BREAK-rack honeypot → breachNode) + Layer 4 `~/history` (5 log blocks: 4 jobs + credentials/edu/CTF; CRT scanline scrub-head tied to scroll progress, blocks verify as it passes) + Layer 5 `~/root` (rootDecrypt full-decrypt via DitherEffect flag, ACCESS GRANTED + contact canvas planes, pulsing root core) + **Terminal REPL** (`overlay/Terminal.tsx`, DOM, visible at layer 5: help/whoami/projects/history/arsenal/breach/contact/red/blue/clear/exit + rm -rf easter egg; red/blue swap the lens through the store). Bands (non-overlapping, transit gaps between): L1 0.15–0.40 · L2 0.44–0.60 · L3 0.65–0.77 · L4 0.80–0.92 · L5 0.94–1.0; scroll shaft 700vh. **Scroll-focus decrypt**: `FOCUS_BANDS` + `focusAt()` in Scene.tsx drive the `uFocus` uniform — when a layer is centered its screen-center content zone resolves out of the dither (readable), edges stay encrypted; in the gaps everything re-encrypts. Hero + L1 excluded (keep signature dither).
- [ ] **Prompt 6** — Boot/auth sequence polish, guided-mode fallback, mobile perf pass, remove debug slider. **← next**

---

## 10. RESUME CONTENT (source of truth for section copy)

**Identity:** Application Security Engineer · DevSecOps · Full-Stack Developer. CEH v11. Tagline: **"I build systems. I break them."**

**Projects (Layer 2 — each an "encrypted file"; reveal includes the vuln found + that Mayank patched it):**
- **Sarvavidhi** (sarvavidhi.com) — multi-tenant SaaS. Stack: Next.js 16, Prisma, Neon PostgreSQL, NextAuth, QStash, Google Gemini. Security story: self-found & patched **OAuth-callback account-takeover** (state-based userId tampering) + **cross-tenant data-leak**; per-tenant userId isolation; signature-verified QStash webhooks + atomic status locking (race-condition fix).
- **Veda Echo** (vedaecho.com) — subscription content platform. Stack: Next.js 16, Prisma, Supabase, Cloudinary, UploadThing. Security: tiered access control, NextAuth + bcrypt + JWT (jose), designed against broken-access-control / IDOR on paid content.
- **Ayuceutical** (ayuceutical.com) — AI healthcare platform. Stack: Next.js 16, Vercel AI SDK, Google Gemini, Resend. Security: AI medical chatbot with **server-side system guardrails** (prompt-injection / unsafe-output mitigation); e-commerce; validated secure forms.
- **GetNovative** (getnovative.com) — 3D studio portfolio (Three.js / R3F). **Mayank's current employer; he is the solo developer.**
- **Abhishek the Realtor** — luxury real-estate site (Next.js 16, Framer Motion, Lenis), live on Vercel.

**Experience (Layer 4 — "system logs", reverse-chronological):**
- **Full-Stack Developer — GetNovative Solutions** (Jan 2026 – Present). Ships production Next.js apps end-to-end as solo dev; secure-by-default architecture.
- **Cybersecurity Operations & IR Specialist — COE Security LLC** (Mar–Aug 2025). 80+ vulns remediated (−47% attack surface); Python security automation (−35% manual time); SIEM (+50% faster detection); IDS/IPS; 100% audit compliance.
- **Penetration Tester — Azerium Development** (Feb–Apr 2025, internship). Web/network VAPT; found & responsibly reported a **critical IDOR** in production APIs.
- **Cybersecurity Intern — 1Stop.ai** (Oct 2024 – Jan 2025). Hardened 23+ Linux servers (−42% misconfig); RBAC (−15% priv-esc); Python/Bash log automation.

**Arsenal (Layer 3 — three clusters):**
- **Build:** Next.js 16, React 19, TypeScript, Node.js, Prisma, PostgreSQL (Neon), Supabase, NextAuth, Tailwind.
- **Secure (defensive):** VAPT, OWASP Top 10, Secure SDLC, Incident Response, SOC, SIEM, OAuth/JWT hardening, RBAC, ISO 27001 / NIST / PCI-DSS / GDPR.
- **Break (offensive):** Burp Suite, Nmap, Metasploit, SQLmap, Hydra, Gobuster, Nessus, Wireshark, Python automation.

**Achievements:** Top 10% / 500+ in national & international CTFs (Kashi CTF – IIT BHU, H4CKP13T 0x01, World Wide CTF); multiple WARZONE badges.

**Education:** MCA Computer Science, Chandigarh University (2023–2025) · B.Sc Hotel & Hospitality Management, IHM Bangalore (2017–2022).

**Certifications:** CEH v11 · ISC2 SSCP · IBM Cybersecurity Analyst · Google Cybersecurity Specialization · Postman API Expert.

**Contact:** mks1199yr521@gmail.com · linkedin.com/in/mayank-sharma-184ba1153 · email via Resend.

---

## 11. WORKING AGREEMENT WITH MAYANK

- Mayank is an experienced full-stack dev (Next.js, React, Node). Don't over-explain basics. Be concise and technical.
- Prefers PowerShell syntax for shell commands on his Windows machine (`D:\myportfolio`).
- Be token/efficient — he works within a limited Claude Code window. Do the focused job per prompt, don't sprawl.
- When something looks generic or off-concept, say so directly and propose the SOTY-tier alternative.