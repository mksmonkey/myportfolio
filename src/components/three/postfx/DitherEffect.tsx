'use client'
import { Effect, BlendFunction } from 'postprocessing'
import { Uniform, Vector2 } from 'three'

// ── GLSL: mainImage convention (postprocessing v6 Effect) ─────────────────────
// inputBuffer is provided by the EffectPass as sampler2D — usable for UV shifts.
const glsl = /* glsl */`
uniform float uDitherAmount;
uniform vec2  uMouse;
uniform float uLensRadius;
uniform float uAlert;
uniform float uTime;
uniform vec2  uResolution;
uniform float uChoiceActive;
uniform float uFocus;

// 4×4 Bayer ordered-dither matrix (threshold 0..1)
float bayer4x4(vec2 fc) {
  int x = int(mod(fc.x, 4.0));
  int y = int(mod(fc.y, 4.0));
  float m[16];
  m[0]=0.;  m[1]=8.;  m[2]=2.;  m[3]=10.;
  m[4]=12.; m[5]=4.;  m[6]=14.; m[7]=6.;
  m[8]=3.;  m[9]=11.; m[10]=1.; m[11]=9.;
  m[12]=15.;m[13]=7.; m[14]=13.;m[15]=5.;
  return m[y * 4 + x] / 16.0;
}

float hash21(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {

  // ── 1. Alert glitch: horizontal scanline tears + channel split ─────────────
  float alertG  = uAlert * uAlert;
  float tSeed   = floor(uTime * 7.0);

  vec2  shiftedUV    = uv;
  float channelSplit = 0.0;
  if (alertG > 0.01) {
    float bandY  = floor(uv.y * 52.0);
    float tearOn = step(0.78 - alertG * 0.28, hash21(vec2(bandY + 0.4, tSeed)));
    shiftedUV.x += (hash21(vec2(bandY, tSeed)) - 0.5) * 0.12 * alertG * tearOn;
    channelSplit  = alertG * 0.014;
  }

  // ── 2. Sample scene with glitch + channel separation ──────────────────────
  vec2 uvC = clamp(shiftedUV, 0.0, 1.0);
  float r  = texture2D(inputBuffer, clamp(uvC + vec2(channelSplit, 0.0), 0.0, 1.0)).r;
  float gr = texture2D(inputBuffer, uvC).g;
  float b  = texture2D(inputBuffer, clamp(uvC - vec2(channelSplit, 0.0), 0.0, 1.0)).b;
  vec3  col = vec3(r, gr, b);

  // True-signal detection: strongly saturated sources (the red/blue pills)
  // carry their real color. Used by the lens always; used by the encrypted
  // path only once the pill choice is active (uChoiceActive) so Layer 0's
  // colored tagline stays mono-dithered.
  float chroma  = max(col.r, max(col.g, col.b)) - min(col.r, min(col.g, col.b));
  float trueSig = smoothstep(0.22, 0.55, chroma);

  // ── 3. Decryption lens ─────────────────────────────────────────────────────
  float aspect = max(uResolution.x / uResolution.y, 0.5);
  vec2  uvA    = vec2(uv.x * aspect, uv.y);
  vec2  mA     = vec2(uMouse.x * aspect, uMouse.y);
  float dist   = length(uvA - mA);
  float radius = uLensRadius * (1.0 + sin(uTime * 1.4) * 0.06);
  float reveal = 1.0 - smoothstep(radius * 0.55, radius, dist);

  // Scroll-focus decrypt: when a layer is centered in the descent, its content
  // zone resolves on its own (the descent itself is the decryption key) so the
  // visitor can actually READ it. Frame edges keep the dithered soul.
  vec2  fUv  = (uv - 0.5) * vec2(aspect * 0.72, 1.0);
  float zone = 1.0 - smoothstep(0.30, 0.58, length(fUv));
  reveal = max(reveal, zone * uFocus);

// ── 4. Ordered dither — CRUSH THE BLACKS & DOT THE WHITES ──────────────
  vec2  ditherCoord = floor((gl_FragCoord.xy + sin(uTime * 0.05) * 0.2) * 0.35);
  float rawLuma     = dot(col, vec3(0.299, 0.587, 0.114));
  
  float stylizedLuma = smoothstep(0.05, 0.90, rawLuma) * 0.85;

  // CRITICAL FIX 1: Content Masking
  // Noise sirf wahan apply hoga jahan actual luma (content) hai. Void remains untouched.
  float contentMask = step(0.01, stylizedLuma);
  float encAmt      = uDitherAmount * (1.0 - reveal) * contentMask;
  // True signal resists encryption once the choice is live — pill shapes stay coherent
  encAmt *= 1.0 - trueSig * 0.75 * uChoiceActive;
  float noisyLuma   = mix(stylizedLuma, hash21(ditherCoord + tSeed * 0.1), encAmt);

  if (alertG > 0.0) {
    float corruptL = hash21(floor(gl_FragCoord.xy * 0.18) + tSeed * 0.05);
    noisyLuma = mix(noisyLuma, corruptL, alertG * 0.6 * contentMask);
  }

  float dithered = step(bayer4x4(ditherCoord), noisyLuma);
  
  // CRITICAL FIX 2: Kill the Bayer Zero-Trap
  // Agar luma literally zero ke paas hai, force dither dots to 0.
  if (noisyLuma < 0.005) {
      dithered = 0.0;
  }

  // ── 5. Palette — Pure Black Background ─────────────────────────────────────
  vec3 paperCol = vec3(0.0, 0.0, 0.0); // Forced pure black vacuum
  vec3 inkCol   = vec3(0.92, 0.94, 0.96); // Crisper white/grey ink

  if (alertG > 0.0) {
    vec3 alertInk = mix(vec3(1.0, 0.35, 0.0), vec3(1.0, 0.15, 0.25), fract(uTime * 0.22));
    inkCol = mix(inkCol, alertInk, alertG * 0.55);
  }

  // Colored dither: after the choice unlocks, saturated signal dithers in its
  // OWN color even outside the lens (red pill dithers red, blue dithers cyan).
  inkCol = mix(inkCol, clamp(col * 1.7, 0.0, 1.0), trueSig * uChoiceActive);

  vec3 monoCol = mix(paperCol, inkCol, dithered);

  // ── 6. Lens reveal — Balanced Accent ───────────────────────────────────────
  vec3 calmA = vec3(0.0,  0.90, 1.0);
  vec3 calmB = vec3(0.62, 1.0,  0.0);
  vec3 accent = mix(calmA, calmB, smoothstep(0.15, 0.85, uv.y));

  float textMask = smoothstep(0.1, 0.6, stylizedLuma);
  vec3  litScene = mix(col * 0.1, accent * (0.9 + stylizedLuma), textMask);

  if (alertG > 0.0) {
    vec3 alertReveal = mix(vec3(1.0, 0.40, 0.10), vec3(1.0, 0.15, 0.20), fract(uTime * 0.3));
    litScene = mix(litScene, alertReveal * (0.5 + stylizedLuma * 1.5), alertG);
  }

  // True-signal reveal: saturated objects decrypt to their REAL color
  // instead of the ambient accent gradient (always on under the lens).
  litScene = mix(litScene, col * (1.15 + stylizedLuma * 0.8), trueSig);

  float ring = smoothstep(radius * 0.95, radius * 0.7, dist) *
               (1.0 - smoothstep(radius * 0.6, radius * 0.35, dist));
  litScene += accent * ring * 0.3 * (1.0 - alertG);

  vec3 result = mix(monoCol, litScene, reveal);
  outputColor = vec4(result, inputColor.a);
}
`

// Module-level flag — Layer1 tweens it to 1 when the pill choice goes live;
// PostFX copies it into uChoiceActive each frame. (Same pattern as ditherState.)
export const trueColorState = { value: 0 }

// Layer 5 (~/root) tweens this to 1 for the ACCESS GRANTED full decrypt;
// PostFX multiplies the dither amount down by it. Lives here to avoid a
// Scene ↔ section import cycle.
export const rootDecrypt = { value: 0 }

// ── Effect class ─────────────────────────────────────────────────────────────
export class DitherEffectImpl extends Effect {
  constructor() {
    super('DitherEffect', glsl, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform<unknown>>([
        ['uDitherAmount', new Uniform(1.0)],
        ['uMouse',        new Uniform(new Vector2(0.5, 0.5))],
        ['uLensRadius',   new Uniform(0.26)],
        ['uAlert',        new Uniform(0.0)],
        ['uTime',         new Uniform(0.0)],
        ['uResolution',   new Uniform(new Vector2(1920, 1080))],
        ['uChoiceActive', new Uniform(0.0)],
        ['uFocus',        new Uniform(0.0)],
      ]),
    })
  }
}

// DitherEffectImpl is instantiated imperatively in Scene.tsx — no wrapEffect needed.
