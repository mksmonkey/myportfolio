'use client'
import { useRef, useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { gsap } from 'gsap'

const CANVAS_W = 2048
const CANVAS_H = 450

const W_W = 512, W_H = 256
const L_W = 128, L_H = 256

// 🚨 MODULAR CONFIG: Change these anytime, the whole engine will auto-adapt!
const ROWS = 10 
const COLS = 5
const TOTAL_LETTERS = 5
const TOTAL_PARTICLES = TOTAL_LETTERS * ROWS * COLS

// Exact 3D Plane dimensions (Do not change these, they maintain the font ratio)
const PLANE_W = 0.3
const PLANE_H = 0.6
const sliceW = PLANE_W / COLS
const sliceH = PLANE_H / ROWS
const S_W = L_W / COLS
const S_H = L_H / ROWS

const TOP_Y = 0.6
const BOT_Y = -0.7
const LETTER_OFFSETS = [-0.6, -0.3, 0, 0.3, 0.6]

// 🚨 DYNAMIC TIMING KNOBS
const ROW_STEP = 0.1      // Delay between each row falling
const LETTER_STEP = 0.1   // Delay between letters
const FALL_DUR = 1.6       // Gravity speed
const CROSSFADE = 0.2      // Morph speed
const ASCEND_DUR = 1.5     // Lift speed

function drawWord(ctx: CanvasRenderingContext2D, text: string, color: string) {
  ctx.clearRect(0, 0, W_W, W_H)
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.imageSmoothingEnabled = false
  ctx.fillStyle = color
  ctx.font = '500 70px "JetBrains Mono", monospace'
  ctx.fillText(text, W_W / 2, W_H / 2)
}

export function HeroText() {
  const groupRef = useRef<THREE.Group>(null)

  const redRefs = useRef<(THREE.Mesh | null)[]>([])
  const cyanRefs = useRef<(THREE.Mesh | null)[]>([])

  const [texMap, setTexMap] = useState<any>(null)

  // 1. DYNAMIC CANVAS + SAND GENERATOR
  useEffect(() => {
    let isMounted = true

    const mCan = document.createElement('canvas'); mCan.width = CANVAS_W; mCan.height = CANVAS_H
    const mCtx = mCan.getContext('2d')
    const mTex = new THREE.CanvasTexture(mCan)
    mTex.minFilter = THREE.LinearFilter; mTex.magFilter = THREE.LinearFilter; mTex.generateMipmaps = false; mTex.colorSpace = THREE.SRGBColorSpace

    const staticWords = [
      { t: 'I', c: '#FF2D55' }, { t: 'systems,', c: '#00E5FF' },
      { t: 'also', c: '#00E5FF' }, { t: 'them.', c: '#00E5FF' }
    ]
    const wordTex = staticWords.map(() => {
      const c = document.createElement('canvas'); c.width = W_W; c.height = W_H
      const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter
      return { ctx: c.getContext('2d'), tex }
    })

    const createSand = (letters: string[], color: string) => {
      const texArray: THREE.CanvasTexture[] = []
      letters.forEach((l) => {
        const temp = document.createElement('canvas'); temp.width = L_W; temp.height = L_H
        const tCtx = temp.getContext('2d')
        if (tCtx) {
          tCtx.textAlign = 'center'; tCtx.textBaseline = 'middle'
          tCtx.imageSmoothingEnabled = false
          tCtx.fillStyle = color
          tCtx.font = '500 110px "JetBrains Mono", monospace' 
          tCtx.fillText(l, L_W / 2, L_H / 2)
        }
        for (let r = 0; r < ROWS; r++) {
          for (let c = 0; c < COLS; c++) {
            const canvas = document.createElement('canvas'); canvas.width = S_W; canvas.height = S_H
            const ctx = canvas.getContext('2d')
            if (ctx && tCtx) ctx.drawImage(temp, c * S_W, r * S_H, S_W, S_H, 0, 0, S_W, S_H)
            const tex = new THREE.CanvasTexture(canvas)
            tex.minFilter = THREE.LinearFilter; tex.magFilter = THREE.LinearFilter; tex.generateMipmaps = false
            texArray.push(tex)
          }
        }
      })
      return texArray
    }

    const breakSand = createSand(['b', 'r', 'e', 'a', 'k'], '#FF2D55')
    const buildSand = createSand(['b', 'u', 'i', 'l', 'd'], '#00E5FF')

    const drawAll = () => {
      if (!isMounted) return
      if (mCtx) {
        mCtx.clearRect(0, 0, CANVAS_W, CANVAS_H)
        mCtx.textAlign = 'center'; mCtx.textBaseline = 'alphabetic'
        mCtx.imageSmoothingEnabled = false
        mCtx.shadowColor = '#FFFFFF'; mCtx.shadowBlur = 10; mCtx.fillStyle = '#FFFFFF'
        mCtx.font = 'bold 230px "Space Grotesk", system-ui, sans-serif'
        mCtx.fillText('MAYANK SHARMA', CANVAS_W / 2, CANVAS_H * 0.8)
        mTex.needsUpdate = true
      }
      wordTex.forEach((c, i) => { if (c.ctx) { drawWord(c.ctx, staticWords[i].t, staticWords[i].c); c.tex.needsUpdate = true } })
    }

    drawAll()
    setTexMap({ main: mTex, words: wordTex.map(c => c.tex), break: breakSand, build: buildSand })

    document.fonts.ready.then(() => { if (isMounted) drawAll() })
    const timer = setTimeout(() => { if (isMounted) drawAll() }, 400)

    return () => {
      isMounted = false; clearTimeout(timer); mTex.dispose()
      wordTex.forEach(c => c.tex.dispose())
      breakSand.forEach(t => t.dispose())
      buildSand.forEach(t => t.dispose())
    }
  }, [])

  // 2. ADAPTIVE PHYSICS ENGINE (Auto-scales to ROWS & COLS)
  useEffect(() => {
    if (!texMap) return
    const reds = redRefs.current.filter(Boolean)
    const cyans = cyanRefs.current.filter(Boolean)
    
    // 🚨 FIX: Strict length check prevents GSAP from crashing during Hot-Reloads
    if (reds.length < TOTAL_PARTICLES || cyans.length < TOTAL_PARTICLES) return

    const localX = (c: number) => (c - COLS / 2 + 0.5) * sliceW
    const localY = (r: number) => -(r - ROWS / 2 + 0.5) * sliceH

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ repeat: -1 })

      let lastEnd = 0
      for (let r = ROWS - 1; r >= 0; r--) {
        for (let l = 0; l < TOTAL_LETTERS; l++) {
          for (let c = 0; c < COLS; c++) {
            const idx = l * (ROWS * COLS) + r * COLS + c
            const red = reds[idx]!
            const cyan = cyans[idx]!

            const ox = LETTER_OFFSETS[l]
            const lx = localX(c)
            const ly = localY(r)

            const srcX = ox + lx
            const srcY = TOP_Y + ly
            const dstX = ox + lx
            const dstY = BOT_Y + ly

            const delay = (ROWS - 1 - r) * ROW_STEP + l * LETTER_STEP + Math.random() * 0.05

            tl.set(red.position, { x: srcX, y: srcY, z: 0 }, 0)
            tl.set(red.rotation, { x: 0, y: 0, z: 0 }, 0)
            tl.set(red.material as THREE.Material, { opacity: 1 }, 0)

            tl.set(cyan.position, { x: srcX, y: srcY, z: 0 }, 0)
            tl.set(cyan.rotation, { x: 0, y: 0, z: 0 }, 0)
            tl.set(cyan.material as THREE.Material, { opacity: 0 }, 0)

            // Scatter math tweaked to look good with 10x5 blocks
            const scatterX = (Math.random() - 0.5) * 0.04
            const scatterZ = (Math.random() - 0.5) * 0.05
            const tumble = (Math.random() - 0.5) * 4.0 // Higher tumble makes bigger blocks feel more chaotic

            // Travel
            tl.to(red.position, {
              x: dstX + scatterX, y: dstY, z: scatterZ,
              duration: FALL_DUR, ease: 'power1.in'
            }, delay)
            tl.to(red.rotation, { x: tumble, z: tumble * 0.5, duration: FALL_DUR }, delay)

            tl.to(cyan.position, {
              x: dstX + scatterX, y: dstY, z: scatterZ,
              duration: FALL_DUR, ease: 'power1.in'
            }, delay)
            tl.to(cyan.rotation, { x: tumble, z: tumble * 0.5, duration: FALL_DUR }, delay)

            // Morph
            const fadeAt = delay + FALL_DUR * 0.45
            tl.to(red.material as THREE.Material, { opacity: 0, duration: CROSSFADE }, fadeAt)
            tl.to(cyan.material as THREE.Material, { opacity: 1, duration: CROSSFADE }, fadeAt)

            // Snap completely to prevent Z-fighting blobs
            tl.to(cyan.position, { x: dstX, y: dstY, z: 0, duration: 0.3, ease: 'back.out(1.2)' }, delay + FALL_DUR)
            tl.to(cyan.rotation, { x: 0, y: 0, z: 0, duration: 0.3, ease: 'power2.out' }, delay + FALL_DUR)

            lastEnd = Math.max(lastEnd, delay + FALL_DUR + 0.3)
          }
        }
      }

      // ASCEND PHASE
      const ascendStart = lastEnd + 0.5

      for (let r = 0; r < ROWS; r++) {
        for (let l = 0; l < TOTAL_LETTERS; l++) {
          for (let c = 0; c < COLS; c++) {
            const idx = l * (ROWS * COLS) + r * COLS + c
            const red = reds[idx]!
            const cyan = cyans[idx]!
            const ox = LETTER_OFFSETS[l]
            const lx = localX(c)
            const ly = localY(r)

            const srcX = ox + lx
            const srcY = TOP_Y + ly
            const dstX = ox + lx
            const dstY = BOT_Y + ly

            tl.to(cyan.position, { x: srcX, y: srcY, z: 0, duration: ASCEND_DUR, ease: 'power2.inOut' }, ascendStart)

            tl.set(red.position, { x: dstX, y: dstY, z: 0 }, ascendStart)
            tl.set(red.rotation, { x: 0, y: 0, z: 0 }, ascendStart)
            tl.to(red.position, { x: srcX, y: srcY, z: 0, duration: ASCEND_DUR, ease: 'power2.inOut' }, ascendStart)

            tl.to(cyan.material as THREE.Material, { opacity: 0, duration: 0.8 }, ascendStart + 0.6)
            tl.to(red.material as THREE.Material, { opacity: 1, duration: 0.8 }, ascendStart + 0.6)
          }
        }
      }

      tl.to({}, { duration: 0.4 })
    })

    return () => ctx.revert()
  }, [texMap])

  useFrame(({ clock }) => {
    if (!groupRef.current) return
    groupRef.current.position.y = Math.sin(clock.elapsedTime * 0.4) * 0.035
  })

  if (!texMap) return null

  return (
    <group ref={groupRef} position={[0, 0.2, 0.5]}>
      <mesh position={[0, 1.3, 0]}>
        <planeGeometry args={[9.0, 1.98]} />
        <meshBasicMaterial map={texMap.main} transparent depthWrite={false} toneMapped={false} />
      </mesh>

      <group position={[0, -0.3, 0]}>
        {/* TOP LINE */}
        <group position={[0, 0.6, 0]}>
          <mesh position={[-1.6, 0, 0]}>
            <planeGeometry args={[2, 1]} />
            <meshBasicMaterial map={texMap.words[0]} transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[1.6, 0, 0]}>
            <planeGeometry args={[2, 1]} />
            <meshBasicMaterial map={texMap.words[1]} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        </group>

        {/* DYNAMIC SAND PARTICLES */}
        <group position={[0, 0, 0]}>
          {Array.from({ length: TOTAL_LETTERS }).map((_, lIdx) =>
            Array.from({ length: ROWS }).map((_, rIdx) =>
              Array.from({ length: COLS }).map((_, cIdx) => {
                const flatIdx = lIdx * (ROWS * COLS) + rIdx * COLS + cIdx
                return (
                  <group key={`sand-${flatIdx}`}>
                    <mesh ref={el => { if (el) redRefs.current[flatIdx] = el }}>
                      <planeGeometry args={[sliceW, sliceH]} />
                      <meshBasicMaterial map={texMap.break[flatIdx]} transparent depthWrite={false} toneMapped={false} />
                    </mesh>
                    <mesh ref={el => { if (el) cyanRefs.current[flatIdx] = el }}>
                      <planeGeometry args={[sliceW, sliceH]} />
                      <meshBasicMaterial map={texMap.build[flatIdx]} transparent opacity={0} depthWrite={false} toneMapped={false} />
                    </mesh>
                  </group>
                )
              })
            )
          )}
        </group>

        {/* BOTTOM LINE */}
        <group position={[0, -0.7, 0]}>
          <mesh position={[-1.6, 0, 0]}>
            <planeGeometry args={[2, 1]} />
            <meshBasicMaterial map={texMap.words[2]} transparent depthWrite={false} toneMapped={false} />
          </mesh>
          <mesh position={[1.6, 0, 0]}>
            <planeGeometry args={[2, 1]} />
            <meshBasicMaterial map={texMap.words[3]} transparent depthWrite={false} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </group>
  )
}