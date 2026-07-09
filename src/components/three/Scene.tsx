'use client'
import { useRef, useLayoutEffect, useEffect } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import {
  EffectComposer as EffectComposerImpl,
  RenderPass,
  EffectPass,
  BloomEffect,
  NoiseEffect,
  Effect,
  BlendFunction,
} from 'postprocessing'
import { HalfFloatType, NoToneMapping } from 'three'
import * as THREE from 'three'
import { useSystemStore } from '@/lib/store'
import { useQuality } from '@/lib/useQuality'
import { useMouse, mouseTarget, mouseSmooth } from '@/lib/useMouse'
import { DescentShaft } from './DescentShaft'
import { CameraRig } from './rig/CameraRig'
import { HeroText } from './HeroText'
import { Layer1Identity } from '../sections/Layer1Identity'
import { Layer2Projects } from '../sections/Layer2Projects'
import { DitherEffectImpl } from './postfx/DitherEffect'

// Module-level boot state — exported so BootSequence can tween it; PostFX reads each frame.
export const ditherState = { amount: 1.0 }

// 🚨 THE DECAY ENGINE: Har frame pe alert level ko cool down karega
function AlertDecay() {
  useFrame((_, delta) => {
    // Zustand ka getState() use kar rahe hain taaki re-renders na hon
    const currentAlert = useSystemStore.getState().alertLevel
    
    if (currentAlert > 0) {
      // Decay Math: Har second kitna alert kam karna hai (0.4 means it takes ~2.5s to cool down from 1.0)
      const DECAY_RATE = 0.4 
      const nextAlert = Math.max(0, currentAlert - delta * DECAY_RATE)
      
      useSystemStore.getState().setAlertLevel(nextAlert)
    }
  })
  
  return null // Ye component kuch render nahi karta, sirf background math chalata hai
}

// ─── PostFX (inside Canvas) ───────────────────────────────────────────────────
// Imperative composer: avoids wrapEffect's JSON.stringify(props) which blows up
// in React 19 because ref is now a regular prop, and THREE objects are circular.
function PostFX({ quality }: { quality: 'high' | 'low' }) {
  const { gl, scene, camera } = useThree()
  const composerRef = useRef<EffectComposerImpl | null>(null)
  const bloomRef    = useRef<BloomEffect | null>(null)
  const ditherRef   = useRef<DitherEffectImpl | null>(null)
  const alertLerp   = useRef(0)

  useLayoutEffect(() => {
    const composer = new EffectComposerImpl(gl, {
      multisampling: quality === 'high' ? 8 : 0,
      frameBufferType: HalfFloatType,
    })
    composer.addPass(new RenderPass(scene, camera))

    const bloom  = new BloomEffect({
      blendFunction: BlendFunction.ADD,
      intensity: 0.04,
      luminanceThreshold: 0.65,
      luminanceSmoothing: 0.9,
      mipmapBlur: quality === 'high',
    })
    const dither = new DitherEffectImpl()
    bloomRef.current  = bloom
    ditherRef.current = dither

    const effects: Effect[] = [bloom, dither]
    if (quality === 'high') {
      const noise = new NoiseEffect({ blendFunction: BlendFunction.ADD })
      noise.blendMode.opacity.value = 0.02
      effects.push(noise)
    }
    composer.addPass(new EffectPass(camera, ...effects))

    // Suppress tone mapping on the render target (same as @react-three/postprocessing does)
    const prevToneMapping = gl.toneMapping
    gl.toneMapping = NoToneMapping
    composerRef.current = composer

    return () => {
      gl.toneMapping = prevToneMapping
      composer.dispose()
      bloomRef.current  = null
      ditherRef.current = null
      composerRef.current = null
    }
  }, [gl, scene, camera, quality])

  // Resize — read R3F's canonical size (handles DPR scaling correctly)
  const size = useThree((s) => s.size)
  useEffect(() => {
    composerRef.current?.setSize(size.width, size.height)
  }, [size])

  useFrame((state, delta) => {
    mouseSmooth.lerp(mouseTarget, delta * 5)

    const alertTarget = useSystemStore.getState().alertLevel
    alertLerp.current = THREE.MathUtils.damp(alertLerp.current, alertTarget, 3, delta)
    const al = alertLerp.current

    const bloom = bloomRef.current
    if (bloom) {
      const calmBloom  = quality === 'high' ? 0.04 : 0.02
      const alertBloom = quality === 'high' ? 0.55 : 0.32
      bloom.intensity  = THREE.MathUtils.lerp(calmBloom, alertBloom, al)
    }

    const d = ditherRef.current
    if (d) {
      const mu = d.uniforms.get('uMouse')
      if (mu) (mu.value as THREE.Vector2).copy(mouseSmooth)

      const mAlert = d.uniforms.get('uAlert')
      if (mAlert) mAlert.value = al

      const mTime = d.uniforms.get('uTime')
      if (mTime) mTime.value = (mTime.value as number) + delta

      const mAmount = d.uniforms.get('uDitherAmount')
      if (mAmount) mAmount.value = ditherState.amount

      const { width, height } = state.size
      const mRes = d.uniforms.get('uResolution')
      if (mRes) (mRes.value as THREE.Vector2).set(width, height)
    }

    state.gl.autoClear = true
    composerRef.current?.render(delta)
  }, 1)

  return null
}

// ─── Scene (exported) ─────────────────────────────────────────────────────────
export default function Scene() {
  const quality = useQuality()
  // 🚨 GET BOOT STATE
  const bootComplete = useSystemStore((s) => s.bootComplete) 

  // Activate mouse tracking
  useMouse()

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0 }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ antialias: true }}
        camera={{ position: [0, 0, 5], fov: 60, near: 0.1, far: 100 }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color('#0A0A0B'))
        }}
      >
        {/* 🚨 INJECT DECAY DAEMON HERE */}
        <AlertDecay />

        <ambientLight intensity={0.08} />

        {/* 🚨 VISIBILITY TOGGLE: Only render these if boot is complete */}
        <group visible={bootComplete}> 
            <DescentShaft />
            <HeroText />
             <Layer1Identity /> 
            <Layer2Projects />
        </group>

        {/* Camera Rig hamesha on rahega, par jab group invisible hoga toh wo black void dekhega */}
        <CameraRig />

        <PostFX quality={quality} />
      </Canvas>
    </div>
  )
}