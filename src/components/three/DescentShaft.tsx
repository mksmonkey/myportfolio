'use client'
import { useRef, useMemo, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useQuality } from '@/lib/useQuality'
import { useSystemStore } from '@/lib/store'
import { mouseSmooth } from '@/lib/useMouse'

// ─── Tunable geometry ─────────────────────────────────────────────────────────
const RING_RADIUS    = 7.8   // camera (z≈5) sits INSIDE → true tunnel surround
const RING_SEGMENTS  = 56
const RIB_COUNT      = 8
const SHAFT_TOP      = 6.0
const SHAFT_SPACING_HIGH = 0.65
const SHAFT_SPACING_LOW  = 0.95
const RING_COUNT_HIGH    = 72
const RING_COUNT_LOW     = 26

// ─── Geometry builders ───────────────────────────────────────────────────────
function buildShaftLines(rings: number, spacing: number): THREE.BufferGeometry {
  const positions: number[] = []
  const aDepth:    number[] = []   // 0..1 within shaft, used for shader fade
  const totalY     = (rings - 1) * spacing

  // ── Rings ──
  for (let r = 0; r < rings; r++) {
    const y     = SHAFT_TOP - r * spacing
    const dRatio = r / Math.max(1, rings - 1)
    // Slight per-ring radius wobble so the tunnel doesn't look CAD-perfect.
    const rWobble = 1 + Math.sin(r * 0.81) * 0.012 + (r % 7 === 0 ? 0.02 : 0)
    for (let s = 0; s < RING_SEGMENTS; s++) {
      const a0 = (s / RING_SEGMENTS) * Math.PI * 2
      const a1 = ((s + 1) / RING_SEGMENTS) * Math.PI * 2
      positions.push(
        Math.cos(a0) * RING_RADIUS * rWobble, y, Math.sin(a0) * RING_RADIUS * rWobble,
        Math.cos(a1) * RING_RADIUS * rWobble, y, Math.sin(a1) * RING_RADIUS * rWobble,
      )
      aDepth.push(dRatio, dRatio)
    }
  }

  // ── Ribs (vertical connectors at fixed angles) ──
  for (let k = 0; k < RIB_COUNT; k++) {
    const ang = (k / RIB_COUNT) * Math.PI * 2
    const cx  = Math.cos(ang) * RING_RADIUS
    const cz  = Math.sin(ang) * RING_RADIUS
    for (let r = 0; r < rings - 1; r++) {
      const y0 = SHAFT_TOP - r * spacing
      const y1 = SHAFT_TOP - (r + 1) * spacing
      positions.push(cx, y0, cz, cx, y1, cz)
      const d0 = r / (rings - 1)
      const d1 = (r + 1) / (rings - 1)
      aDepth.push(d0, d1)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3))
  geo.setAttribute('aDepth',   new THREE.Float32BufferAttribute(aDepth,    1))
  return geo
}

function buildFlowPoints(count: number, totalY: number): THREE.BufferGeometry {
  const positions = new Float32Array(count * 3)
  const aSeed     = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2
    const r = RING_RADIUS * (0.97 + Math.random() * 0.05)
    positions[i * 3]     = Math.cos(a) * r
    positions[i * 3 + 1] = Math.random() * totalY  // span randomly
    positions[i * 3 + 2] = Math.sin(a) * r
    aSeed[i] = Math.random()
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('aSeed',    new THREE.BufferAttribute(aSeed,    1))
  return geo
}

// ─── Shaders ──────────────────────────────────────────────────────────────────
const linesVert = /* glsl */`
attribute float aDepth;
uniform float uTime;
varying float vDepthCam;
varying float vADepth;
void main() {
  vec3 pos = position;
  // Subtle breathing — radius pulses slightly per row
  float breath = sin(uTime * 0.55 + aDepth * 12.0) * 0.018;
  pos.xz *= 1.0 + breath;
  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vDepthCam = -mv.z;
  vADepth   = aDepth;
  gl_Position = projectionMatrix * mv;
}
`

// src/components/three/DescentShaft.tsx ke linesFrag ko isse replace karo
const linesFrag = /* glsl */`
uniform float uAlert;
uniform float uTime;
varying float vDepthCam;
varying float vADepth;

void main() {
  // Distance fog: camera ke paas aur door dono taraf infinite black void
  float near = smoothstep(0.1, 4.0, vDepthCam);
  float far  = 1.0 - smoothstep(12.0, 32.0, vDepthCam);
  float fog  = near * far;

  // Kinetic Pulse Layer: Light waves streaming down the shaft
  // 3B1B inspired signal propagation math
  float pulse = sin(vADepth * 45.0 - uTime * 6.0);
  pulse = smoothstep(0.7, 1.0, pulse) * 0.65;

  // Periodic row flash for rhythmic cadence
  float beat = step(0.988, fract(vADepth * 16.0 + uTime * 0.02));
  
  vec3 ink     = vec3(0.92, 0.94, 0.96);
  vec3 alertI  = vec3(1.0, 0.22, 0.15);
  vec3 col     = mix(ink, alertI, uAlert);

  // High contrast Alpha mapping: baseline ko tight rakho taaki dither crisp ho
  float alpha = fog * (0.15 + pulse + beat * 0.5 + uAlert * 0.3);
  
  if (alpha < 0.005) discard;
  gl_FragColor = vec4(col, alpha);
}
`

const flowVert = /* glsl */`
attribute float aSeed;
uniform float uTime;
uniform float uSpan;
uniform float uTop;
uniform float uPixelRatio;
uniform float uAlert;
varying float vDepthCam;
varying float vSeed;
void main() {
  vec3 pos = position;
  // Stream downward; speed varies per-particle; wrap inside shaft span.
  float speed = 1.1 + aSeed * 2.4 + uAlert * 2.0;
  float y     = pos.y - uTime * speed;
  // Wrap to keep within [uTop - uSpan, uTop]
  y = uTop - mod(uTop - y, uSpan);
  pos.y = y;

  vec4 mv = modelViewMatrix * vec4(pos, 1.0);
  vDepthCam = -mv.z;
  vSeed     = aSeed;
  gl_Position = projectionMatrix * mv;
  gl_PointSize = (2.2 + aSeed * 2.6) * uPixelRatio * (9.0 / max(vDepthCam, 0.4));
}
`

const flowFrag = /* glsl */`
uniform float uAlert;
varying float vDepthCam;
varying float vSeed;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d);

  float near = smoothstep(0.0, 2.5, vDepthCam);
  float far  = 1.0 - smoothstep(20.0, 34.0, vDepthCam);
  float fog  = near * far;

  vec3 calm   = vec3(0.92, 0.94, 0.98);
  vec3 alertC = vec3(1.0, 0.45, 0.20);
  vec3 col    = mix(calm, alertC, uAlert * 0.7);

  float alpha = a * fog * (0.75 + vSeed * 0.55);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(col, alpha);
}
`

// ─── Component ────────────────────────────────────────────────────────────────
export function DescentShaft() {
  const quality = useQuality()
  const rings    = quality === 'high' ? RING_COUNT_HIGH : RING_COUNT_LOW
  const spacing  = quality === 'high' ? SHAFT_SPACING_HIGH : SHAFT_SPACING_LOW
  const flowCount = quality === 'high' ? 1200 : 320
  const totalY    = (rings - 1) * spacing

  const groupRef = useRef<THREE.Group>(null)
  const alertLerp = useRef(0)

  const linesGeo = useMemo(() => buildShaftLines(rings, spacing), [rings, spacing])
  const flowGeo  = useMemo(() => buildFlowPoints(flowCount, totalY), [flowCount, totalY])
  useEffect(() => () => { linesGeo.dispose(); flowGeo.dispose() }, [linesGeo, flowGeo])

  const linesUniforms = useMemo(() => ({
    uTime:  { value: 0 },
    uAlert: { value: 0 },
  }), [])

  const flowUniforms = useMemo(() => ({
    uTime:       { value: 0 },
    uAlert:      { value: 0 },
    uSpan:       { value: totalY },
    uTop:        { value: SHAFT_TOP },
    uPixelRatio: { value: typeof window !== 'undefined' ? Math.min(window.devicePixelRatio, 2) : 1 },
  }), [totalY])

  useFrame((_, delta) => {
    const target = useSystemStore.getState().alertLevel
    alertLerp.current = THREE.MathUtils.damp(alertLerp.current, target, 3, delta)
    const al = alertLerp.current

    linesUniforms.uTime.value  += delta
    linesUniforms.uAlert.value  = al
    flowUniforms.uTime.value   += delta
    flowUniforms.uAlert.value   = al

    // Mouse parallax — slight tilt of the whole shaft
    if (groupRef.current) {
      const tx = (mouseSmooth.x - 0.5) * 0.10
      const ty = (mouseSmooth.y - 0.5) * 0.06
      groupRef.current.rotation.y = THREE.MathUtils.damp(groupRef.current.rotation.y,  tx, 3, delta)
      groupRef.current.rotation.x = THREE.MathUtils.damp(groupRef.current.rotation.x, -ty, 3, delta)
    }
  })

  return (
    <group ref={groupRef}>
      <lineSegments geometry={linesGeo} frustumCulled={false}>
        <shaderMaterial
          vertexShader={linesVert}
          fragmentShader={linesFrag}
          uniforms={linesUniforms}
          transparent
          depthWrite={false}
        />
      </lineSegments>

      {/* Flow particles always render — low quality already drops count via flowCount */}
      <points geometry={flowGeo} frustumCulled={false}>
        <shaderMaterial
          vertexShader={flowVert}
          fragmentShader={flowFrag}
          uniforms={flowUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  )
}
