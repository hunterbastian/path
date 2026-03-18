import * as THREE from 'three';
import type { WeatherCondition } from '../config/GameTuning';
import { sampleBiome } from './BiomeConfig';
import type { BiomeSkyTint } from './BiomeConfig';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SkyMood {
  fogColor: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  sunColor: number;
  sunIntensity: number;
  fillColor: number;
  fillIntensity: number;
  rimColor: number;
  rimIntensity: number;
  backgroundBlurriness: number;
  gradientStops: Array<{ offset: number; color: string }>;
  sunGlowInner: string;
  sunGlowMid: string;
  sunGlowOuter: string;
  hazeStart: string;
  hazeEnd: string;
  cloudDeckStart: string;
  cloudDeckMid: string;
  cloudDeckEnd: string;
}

interface TimeKeyframe {
  time: number; // 0–1 normalized (0 = midnight, 0.5 = noon)
  mood: SkyMood;
}

// ---------------------------------------------------------------------------
// Color interpolation helpers
// ---------------------------------------------------------------------------

const _cA = new THREE.Color();
const _cB = new THREE.Color();

function lerpHex(a: number, b: number, t: number): number {
  _cA.setHex(a);
  _cB.setHex(b);
  _cA.lerp(_cB, t);
  return _cA.getHex();
}

function lerpHexStr(a: string, b: string, t: number): string {
  _cA.set(a);
  _cB.set(b);
  _cA.lerp(_cB, t);
  return '#' + _cA.getHexString();
}

function parseRgba(s: string): [number, number, number, number] {
  const m = s.match(/([\d.]+)/g);
  if (!m) return [0, 0, 0, 1];
  return [+(m[0] ?? 0), +(m[1] ?? 0), +(m[2] ?? 0), m.length > 3 ? +(m[3] ?? 1) : 1];
}

function lerpRgba(a: string, b: string, t: number): string {
  const [ar, ag, ab, aa] = parseRgba(a);
  const [br, bg, bb, ba] = parseRgba(b);
  return `rgba(${Math.round(ar + (br - ar) * t)}, ${Math.round(ag + (bg - ag) * t)}, ${Math.round(ab + (bb - ab) * t)}, ${+(aa + (ba - aa) * t).toFixed(2)})`;
}

function lerpMood(a: SkyMood, b: SkyMood, t: number): SkyMood {
  const n = (x: number, y: number) => x + (y - x) * t;
  return {
    fogColor: lerpHex(a.fogColor, b.fogColor, t),
    hemisphereSky: lerpHex(a.hemisphereSky, b.hemisphereSky, t),
    hemisphereGround: lerpHex(a.hemisphereGround, b.hemisphereGround, t),
    hemisphereIntensity: n(a.hemisphereIntensity, b.hemisphereIntensity),
    sunColor: lerpHex(a.sunColor, b.sunColor, t),
    sunIntensity: n(a.sunIntensity, b.sunIntensity),
    fillColor: lerpHex(a.fillColor, b.fillColor, t),
    fillIntensity: n(a.fillIntensity, b.fillIntensity),
    rimColor: lerpHex(a.rimColor, b.rimColor, t),
    rimIntensity: n(a.rimIntensity, b.rimIntensity),
    backgroundBlurriness: n(a.backgroundBlurriness, b.backgroundBlurriness),
    gradientStops: a.gradientStops.map((s, i) => {
      const bStop = b.gradientStops[i] ?? s;
      return { offset: n(s.offset, bStop.offset), color: lerpHexStr(s.color, bStop.color, t) };
    }),
    sunGlowInner: lerpRgba(a.sunGlowInner, b.sunGlowInner, t),
    sunGlowMid: lerpRgba(a.sunGlowMid, b.sunGlowMid, t),
    sunGlowOuter: lerpRgba(a.sunGlowOuter, b.sunGlowOuter, t),
    hazeStart: lerpRgba(a.hazeStart, b.hazeStart, t),
    hazeEnd: lerpRgba(a.hazeEnd, b.hazeEnd, t),
    cloudDeckStart: lerpRgba(a.cloudDeckStart, b.cloudDeckStart, t),
    cloudDeckMid: lerpRgba(a.cloudDeckMid, b.cloudDeckMid, t),
    cloudDeckEnd: lerpRgba(a.cloudDeckEnd, b.cloudDeckEnd, t),
  };
}

/** Desaturate a hex color toward grey by factor (0 = full color, 1 = grey). */
function desaturateHex(hex: number, factor: number): number {
  _cA.setHex(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  _cA.getHSL(hsl);
  hsl.s *= 1 - factor;
  _cA.setHSL(hsl.h, hsl.s, hsl.l);
  return _cA.getHex();
}

// ---------------------------------------------------------------------------
// Time-of-day keyframes  (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset)
// Each defines the "clear/sunny" look. Weather modifiers dim/desaturate from here.
// ---------------------------------------------------------------------------

const TIME_KEYFRAMES: TimeKeyframe[] = [
  // ── Night (midnight) ──
  {
    time: 0.0,
    mood: {
      fogColor: 0x0e1620,
      hemisphereSky: 0x0c1424,
      hemisphereGround: 0x080c14,
      hemisphereIntensity: 0.14,
      sunColor: 0x607090,
      sunIntensity: 0.06,
      fillColor: 0x1a2840,
      fillIntensity: 0.10,
      rimColor: 0x182030,
      rimIntensity: 0.04,
      backgroundBlurriness: 0.04,
      gradientStops: [
        { offset: 0, color: '#070c18' },
        { offset: 0.22, color: '#0e1628' },
        { offset: 0.48, color: '#141e30' },
        { offset: 0.76, color: '#0c1220' },
        { offset: 1, color: '#080e18' },
      ],
      sunGlowInner: 'rgba(120, 140, 180, 0.06)',
      sunGlowMid: 'rgba(80, 100, 140, 0.03)',
      sunGlowOuter: 'rgba(60, 80, 120, 0.01)',
      hazeStart: 'rgba(20, 30, 50, 0)',
      hazeEnd: 'rgba(10, 16, 28, 0.18)',
      cloudDeckStart: 'rgba(20, 28, 44, 0.12)',
      cloudDeckMid: 'rgba(14, 20, 34, 0.08)',
      cloudDeckEnd: 'rgba(14, 20, 34, 0)',
    },
  },

  // ── Pre-dawn ──
  {
    time: 0.18,
    mood: {
      fogColor: 0x2a3040,
      hemisphereSky: 0x2a3a52,
      hemisphereGround: 0x1a1e26,
      hemisphereIntensity: 0.28,
      sunColor: 0xc07848,
      sunIntensity: 0.28,
      fillColor: 0x3a4860,
      fillIntensity: 0.22,
      rimColor: 0x804830,
      rimIntensity: 0.12,
      backgroundBlurriness: 0.07,
      gradientStops: [
        { offset: 0, color: '#1a2840' },
        { offset: 0.22, color: '#3a4860' },
        { offset: 0.48, color: '#8a5840' },
        { offset: 0.76, color: '#2a2030' },
        { offset: 1, color: '#141820' },
      ],
      sunGlowInner: 'rgba(220, 140, 80, 0.32)',
      sunGlowMid: 'rgba(180, 100, 60, 0.16)',
      sunGlowOuter: 'rgba(140, 70, 50, 0.06)',
      hazeStart: 'rgba(160, 90, 50, 0)',
      hazeEnd: 'rgba(60, 40, 50, 0.22)',
      cloudDeckStart: 'rgba(80, 70, 80, 0.18)',
      cloudDeckMid: 'rgba(50, 44, 56, 0.12)',
      cloudDeckEnd: 'rgba(50, 44, 56, 0)',
    },
  },

  // ── Dawn / sunrise ──
  {
    time: 0.25,
    mood: {
      fogColor: 0xb08060,
      hemisphereSky: 0x6888aa,
      hemisphereGround: 0x3a3028,
      hemisphereIntensity: 0.58,
      sunColor: 0xff8848,
      sunIntensity: 1.2,
      fillColor: 0x6888a8,
      fillIntensity: 0.42,
      rimColor: 0xe88848,
      rimIntensity: 0.34,
      backgroundBlurriness: 0.08,
      gradientStops: [
        { offset: 0, color: '#4870a0' },
        { offset: 0.20, color: '#8890a0' },
        { offset: 0.46, color: '#e89060' },
        { offset: 0.74, color: '#c06838' },
        { offset: 1, color: '#503828' },
      ],
      sunGlowInner: 'rgba(255, 180, 90, 0.82)',
      sunGlowMid: 'rgba(255, 130, 60, 0.40)',
      sunGlowOuter: 'rgba(220, 100, 50, 0.14)',
      hazeStart: 'rgba(255, 160, 80, 0)',
      hazeEnd: 'rgba(180, 80, 50, 0.36)',
      cloudDeckStart: 'rgba(240, 180, 140, 0.28)',
      cloudDeckMid: 'rgba(200, 140, 110, 0.18)',
      cloudDeckEnd: 'rgba(200, 140, 110, 0)',
    },
  },

  // ── Morning — fresh, vivid ──
  {
    time: 0.35,
    mood: {
      fogColor: 0xc8c0a0,
      hemisphereSky: 0xa0c8e0,
      hemisphereGround: 0x887050,
      hemisphereIntensity: 1.16,
      sunColor: 0xffe0a8,
      sunIntensity: 2.2,
      fillColor: 0xa0b8c0,
      fillIntensity: 0.94,
      rimColor: 0xd0b890,
      rimIntensity: 0.44,
      backgroundBlurriness: 0.05,
      gradientStops: [
        { offset: 0, color: '#68a8d0' },
        { offset: 0.20, color: '#90c0d8' },
        { offset: 0.46, color: '#d8c0a0' },
        { offset: 0.74, color: '#a09070' },
        { offset: 1, color: '#786848' },
      ],
      sunGlowInner: 'rgba(255, 244, 210, 0.78)',
      sunGlowMid: 'rgba(255, 210, 140, 0.38)',
      sunGlowOuter: 'rgba(255, 180, 120, 0.14)',
      hazeStart: 'rgba(255, 210, 150, 0)',
      hazeEnd: 'rgba(130, 100, 70, 0.18)',
      cloudDeckStart: 'rgba(252, 248, 240, 0.26)',
      cloudDeckMid: 'rgba(230, 226, 216, 0.16)',
      cloudDeckEnd: 'rgba(230, 226, 216, 0)',
    },
  },

  // ── Midday — warm dusty Patagonian sky ──
  {
    time: 0.50,
    mood: {
      fogColor: 0xc8c0a8,
      hemisphereSky: 0x88b8e0,
      hemisphereGround: 0x887050,
      hemisphereIntensity: 1.35,
      sunColor: 0xfff0d0,
      sunIntensity: 2.6,
      fillColor: 0xa8b8c0,
      fillIntensity: 1.15,
      rimColor: 0xe8c8a0,
      rimIntensity: 0.56,
      backgroundBlurriness: 0.04,
      gradientStops: [
        { offset: 0, color: '#5898c8' },
        { offset: 0.18, color: '#78b0d8' },
        { offset: 0.42, color: '#d8c8a8' },
        { offset: 0.72, color: '#a09070' },
        { offset: 1, color: '#786848' },
      ],
      sunGlowInner: 'rgba(255, 250, 230, 0.92)',
      sunGlowMid: 'rgba(255, 220, 150, 0.44)',
      sunGlowOuter: 'rgba(255, 180, 120, 0.16)',
      hazeStart: 'rgba(255, 210, 140, 0)',
      hazeEnd: 'rgba(140, 110, 80, 0.18)',
      cloudDeckStart: 'rgba(255, 252, 244, 0.28)',
      cloudDeckMid: 'rgba(240, 235, 220, 0.18)',
      cloudDeckEnd: 'rgba(240, 235, 220, 0)',
    },
  },

  // ── Golden hour / late afternoon ──
  {
    time: 0.68,
    mood: {
      fogColor: 0xd4a060,
      hemisphereSky: 0xf0c080,
      hemisphereGround: 0x5a4430,
      hemisphereIntensity: 0.96,
      sunColor: 0xff9040,
      sunIntensity: 2.0,
      fillColor: 0x9088a8,
      fillIntensity: 0.72,
      rimColor: 0xf09048,
      rimIntensity: 0.62,
      backgroundBlurriness: 0.07,
      gradientStops: [
        { offset: 0, color: '#7090b8' },
        { offset: 0.18, color: '#e0b078' },
        { offset: 0.40, color: '#f09048' },
        { offset: 0.68, color: '#c06838' },
        { offset: 1, color: '#5a3828' },
      ],
      sunGlowInner: 'rgba(255, 200, 100, 0.92)',
      sunGlowMid: 'rgba(255, 160, 60, 0.52)',
      sunGlowOuter: 'rgba(245, 120, 50, 0.22)',
      hazeStart: 'rgba(255, 180, 90, 0)',
      hazeEnd: 'rgba(200, 100, 50, 0.36)',
      cloudDeckStart: 'rgba(255, 200, 140, 0.32)',
      cloudDeckMid: 'rgba(240, 170, 110, 0.22)',
      cloudDeckEnd: 'rgba(240, 170, 110, 0)',
    },
  },

  // ── Sunset ──
  {
    time: 0.78,
    mood: {
      fogColor: 0xc06838,
      hemisphereSky: 0xc08870,
      hemisphereGround: 0x3a2820,
      hemisphereIntensity: 0.58,
      sunColor: 0xff5020,
      sunIntensity: 1.2,
      fillColor: 0x8868a0,
      fillIntensity: 0.42,
      rimColor: 0xf05828,
      rimIntensity: 0.48,
      backgroundBlurriness: 0.08,
      gradientStops: [
        { offset: 0, color: '#4a5080' },
        { offset: 0.18, color: '#b06878' },
        { offset: 0.42, color: '#f06838' },
        { offset: 0.72, color: '#c04020' },
        { offset: 1, color: '#3a1810' },
      ],
      sunGlowInner: 'rgba(255, 140, 50, 0.90)',
      sunGlowMid: 'rgba(255, 100, 40, 0.50)',
      sunGlowOuter: 'rgba(230, 70, 40, 0.20)',
      hazeStart: 'rgba(255, 120, 50, 0)',
      hazeEnd: 'rgba(200, 70, 50, 0.44)',
      cloudDeckStart: 'rgba(240, 130, 90, 0.34)',
      cloudDeckMid: 'rgba(200, 90, 70, 0.24)',
      cloudDeckEnd: 'rgba(200, 90, 70, 0)',
    },
  },

  // ── Late sunset (deep orange into pink) ──
  {
    time: 0.84,
    mood: {
      fogColor: 0x803848,
      hemisphereSky: 0x904870,
      hemisphereGround: 0x281820,
      hemisphereIntensity: 0.38,
      sunColor: 0xe04028,
      sunIntensity: 0.6,
      fillColor: 0x685080,
      fillIntensity: 0.30,
      rimColor: 0xc04830,
      rimIntensity: 0.28,
      backgroundBlurriness: 0.08,
      gradientStops: [
        { offset: 0, color: '#2a3058' },
        { offset: 0.20, color: '#784870' },
        { offset: 0.46, color: '#c84838' },
        { offset: 0.76, color: '#802818' },
        { offset: 1, color: '#281018' },
      ],
      sunGlowInner: 'rgba(240, 100, 50, 0.72)',
      sunGlowMid: 'rgba(220, 70, 50, 0.38)',
      sunGlowOuter: 'rgba(180, 50, 40, 0.14)',
      hazeStart: 'rgba(200, 80, 60, 0)',
      hazeEnd: 'rgba(140, 50, 50, 0.40)',
      cloudDeckStart: 'rgba(180, 90, 80, 0.30)',
      cloudDeckMid: 'rgba(140, 60, 60, 0.20)',
      cloudDeckEnd: 'rgba(140, 60, 60, 0)',
    },
  },

  // ── Twilight ──
  {
    time: 0.92,
    mood: {
      fogColor: 0x302030,
      hemisphereSky: 0x283048,
      hemisphereGround: 0x14141c,
      hemisphereIntensity: 0.22,
      sunColor: 0x803828,
      sunIntensity: 0.14,
      fillColor: 0x283040,
      fillIntensity: 0.16,
      rimColor: 0x503028,
      rimIntensity: 0.08,
      backgroundBlurriness: 0.06,
      gradientStops: [
        { offset: 0, color: '#161e38' },
        { offset: 0.20, color: '#2e2840' },
        { offset: 0.42, color: '#5a3040' },
        { offset: 0.66, color: '#3a1820' },
        { offset: 1, color: '#100c14' },
      ],
      sunGlowInner: 'rgba(160, 70, 50, 0.16)',
      sunGlowMid: 'rgba(100, 40, 36, 0.08)',
      sunGlowOuter: 'rgba(70, 30, 28, 0.03)',
      hazeStart: 'rgba(80, 40, 40, 0)',
      hazeEnd: 'rgba(36, 20, 26, 0.22)',
      cloudDeckStart: 'rgba(50, 36, 46, 0.14)',
      cloudDeckMid: 'rgba(28, 22, 32, 0.08)',
      cloudDeckEnd: 'rgba(28, 22, 32, 0)',
    },
  },
];

// ---------------------------------------------------------------------------
// Weather modifiers — scale the time-of-day base mood
// ---------------------------------------------------------------------------

interface WeatherScale {
  sunIntensity: number;
  fillIntensity: number;
  hemisphereIntensity: number;
  rimIntensity: number;
  desaturation: number; // 0 = none, 0.3 = 30% desaturated
  glowMult: number;
  blurrinessAdd: number;
}

const WEATHER_SCALES: Record<WeatherCondition, WeatherScale> = {
  sunny: {
    sunIntensity: 1.0,
    fillIntensity: 1.0,
    hemisphereIntensity: 1.0,
    rimIntensity: 1.0,
    desaturation: 0,
    glowMult: 1.0,
    blurrinessAdd: 0,
  },
  cloudy: {
    sunIntensity: 0.62,
    fillIntensity: 0.94,
    hemisphereIntensity: 0.92,
    rimIntensity: 0.68,
    desaturation: 0.15,
    glowMult: 0.45,
    blurrinessAdd: 0.04,
  },
  rainy: {
    sunIntensity: 0.48,
    fillIntensity: 0.86,
    hemisphereIntensity: 0.88,
    rimIntensity: 0.58,
    desaturation: 0.22,
    glowMult: 0.25,
    blurrinessAdd: 0.06,
  },
  snowy: {
    sunIntensity: 0.55,
    fillIntensity: 0.90,
    hemisphereIntensity: 0.90,
    rimIntensity: 0.62,
    desaturation: 0.18,
    glowMult: 0.35,
    blurrinessAdd: 0.05,
  },
  blizzard: {
    sunIntensity: 0.32,
    fillIntensity: 0.78,
    hemisphereIntensity: 0.82,
    rimIntensity: 0.42,
    desaturation: 0.30,
    glowMult: 0.15,
    blurrinessAdd: 0.10,
  },
  dust: {
    sunIntensity: 0.52,
    fillIntensity: 0.88,
    hemisphereIntensity: 0.86,
    rimIntensity: 0.54,
    desaturation: 0.12,
    glowMult: 0.30,
    blurrinessAdd: 0.08,
  },
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Full day-night cycle in seconds. */
const DAY_CYCLE_DURATION = 600;

/** How often (in seconds) to regenerate the environment texture. */
const ENV_TEXTURE_INTERVAL = 8;

/** Sun orbit radius for directional light positioning. */
const SUN_ORBIT_RADIUS = 220;

/** Lerp speed for biome sky tint transitions (~3 seconds to converge). */
const BIOME_SKY_LERP_SPEED = 0.35;

// ---------------------------------------------------------------------------
// Biome sky tint helpers
// ---------------------------------------------------------------------------

const _tintA = new THREE.Color();
const _tintB = new THREE.Color();
const _tintTarget = new THREE.Color();

/**
 * Compute time-of-day phase weights for biome sky tinting.
 * Returns { goldenHour, night, noon } weights that sum to 1.
 *
 * Phase regions (dayTime 0-1):
 *  - Night: roughly 0.0-0.15 and 0.88-1.0
 *  - Golden hour (dawn): 0.18-0.30
 *  - Noon: 0.38-0.62
 *  - Golden hour (dusk): 0.65-0.82
 *  - Between these: smooth transitions
 */
function computePhaseWeights(dayTime: number): { goldenHour: number; night: number; noon: number } {
  // Dawn golden hour peaks at 0.25, dusk golden hour peaks at 0.75
  // Night peaks at 0.0 (midnight), noon peaks at 0.5
  const dawnDist = Math.min(Math.abs(dayTime - 0.25), 1 - Math.abs(dayTime - 0.25));
  const duskDist = Math.min(Math.abs(dayTime - 0.75), 1 - Math.abs(dayTime - 0.75));
  const goldenDist = Math.min(dawnDist, duskDist);

  // Night: distance from midnight (handle wrap)
  const nightDist = dayTime <= 0.5 ? dayTime : 1.0 - dayTime;

  // Noon: distance from 0.5
  const noonDist = Math.abs(dayTime - 0.5);

  // Convert distances to weights using gaussian-like falloff
  const goldenW = Math.exp(-goldenDist * goldenDist * 120); // tight peak around golden hours
  const nightW = Math.exp(-nightDist * nightDist * 18);      // broader night region
  const noonW = Math.exp(-noonDist * noonDist * 28);          // moderate noon region

  // Normalize
  const sum = goldenW + nightW + noonW;
  return {
    goldenHour: goldenW / sum,
    night: nightW / sum,
    noon: noonW / sum,
  };
}

// ---------------------------------------------------------------------------
// Sky class
// ---------------------------------------------------------------------------

export class Sky {
  readonly #scene: THREE.Scene;
  readonly #hemisphere: THREE.HemisphereLight;
  readonly #sun: THREE.DirectionalLight;
  readonly #fill: THREE.DirectionalLight;
  readonly #rim: THREE.DirectionalLight;
  readonly #fog: THREE.Fog;
  readonly #mistLayers: Array<{
    sprite: THREE.Sprite;
    baseOpacity: number;
    basePosition: THREE.Vector3;
    baseScale: THREE.Vector2;
    driftRadius: number;
    driftSpeed: number;
    phase: number;
    lift: number;
  }> = [];
  #environmentTexture: THREE.CanvasTexture | null = null;
  #weatherCondition: WeatherCondition = 'sunny';
  #time = 0;
  #dayTime = 0.35; // Start at morning
  #envTextureTimer = 0;
  /** Fog near/far set externally by WeatherState — we scale by time brightness. */
  #baseFogNear = 46;
  #baseFogFar = 480;
  #valleyFogPush = 0;
  /** Current smoothly interpolated biome sky tint (additive). */
  readonly #currentBiomeTint = new THREE.Color(0x000000);
  /** Target biome sky tint (recomputed each frame from biome + phase). */
  readonly #targetBiomeTint = new THREE.Color(0x000000);

  constructor(scene: THREE.Scene) {
    this.#scene = scene;
    this.#hemisphere = new THREE.HemisphereLight(0xd7dde0, 0x59625d, 0.94);
    scene.add(this.#hemisphere);

    this.#sun = new THREE.DirectionalLight(0xffd6aa, 1.95);
    this.#sun.position.set(180, 140, 70);
    this.#sun.castShadow = false; // Enabled dynamically in #updateSunPosition when sun > horizon
    this.#sun.shadow.mapSize.set(512, 512);
    this.#sun.shadow.camera.left = -20;
    this.#sun.shadow.camera.right = 20;
    this.#sun.shadow.camera.top = 20;
    this.#sun.shadow.camera.bottom = -20;
    this.#sun.shadow.camera.near = 10;
    this.#sun.shadow.camera.far = 280;
    this.#sun.shadow.bias = -0.001;
    scene.add(this.#sun);
    scene.add(this.#sun.target);

    // Fill + rim lights disabled for performance — hemisphere provides ambient
    this.#fill = new THREE.DirectionalLight(0x9bb1bf, 0);
    this.#rim = new THREE.DirectionalLight(0xb6a894, 0);
    // Boost hemisphere to compensate
    this.#hemisphere.intensity = 1.2;

    this.#fog = new THREE.Fog(0xa8c8b8, 46, 580);
    scene.fog = this.#fog;
    // Mist bands disabled for performance — fog provides atmosphere
    // this.#addMistBands(scene);

    // Apply initial mood
    this.#applyMood(this.#computeBlendedMood());
    this.#regenerateEnvTexture();
  }

  /** Normalized day time (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset). */
  get dayTime(): number {
    return this.#dayTime;
  }

  /** Sun world position for specular/shadow calculations. */
  get sunPosition(): THREE.Vector3 {
    return this.#sun.position;
  }

  /** Current sun intensity after time-of-day and weather scaling. */
  get sunIntensity(): number {
    return this.#sun.intensity;
  }

  setAtmosphere(fogNear: number, fogFar: number, _mistStrength: number): void {
    this.#baseFogNear = fogNear;
    this.#baseFogFar = fogFar;
  }

  setWeatherMood(condition: WeatherCondition): void {
    this.#weatherCondition = condition;
  }

  /** Apply valley fog submersion push (0 = none, ~0.45 = max submerged). */
  setValleyFogPush(push: number): void {
    this.#valleyFogPush = THREE.MathUtils.clamp(push, 0, 0.5);
  }

  update(dt: number, _routeActivity: number, _rainDensity: number, playerPosition?: THREE.Vector3): void {
    this.#time += dt;
    this.#dayTime = (this.#dayTime + dt / DAY_CYCLE_DURATION) % 1;

    // Compute blended mood from time + weather
    const mood = this.#computeBlendedMood();
    this.#applyMood(mood);

    // Per-biome sky tint (additive, on top of time-of-day mood)
    if (playerPosition) {
      this.#updateBiomeSkyTint(playerPosition.x, playerPosition.z, dt);
      this.#applyBiomeSkyTint();
    }

    // Update sun position based on time-of-day orbit
    this.#updateSunPosition();

    // Shadow camera follows the player so the tight frustum covers the action
    if (playerPosition && this.#sun.castShadow) {
      this.#sun.target.position.set(playerPosition.x, 0, playerPosition.z);
      this.#sun.target.updateMatrixWorld();
    }

    // Scale fog by nighttime darkness factor
    const nightFade = this.#getNightFogScale();
    this.#fog.near = this.#baseFogNear * nightFade * (1 - this.#valleyFogPush);
    this.#fog.far = this.#baseFogFar * nightFade * (1 - this.#valleyFogPush * 0.3);

    // Regenerate environment texture periodically
    this.#envTextureTimer += dt;
    if (this.#envTextureTimer >= ENV_TEXTURE_INTERVAL) {
      this.#envTextureTimer = 0;
      this.#regenerateEnvTexture();
    }

  }

  // -----------------------------------------------------------------------
  // Time-of-day interpolation
  // -----------------------------------------------------------------------

  /** Find the two adjacent keyframes and interpolation factor for the current dayTime. */
  #getTimeInterpolation(): { a: SkyMood; b: SkyMood; t: number } {
    const dayTime = this.#dayTime;
    const kf = TIME_KEYFRAMES;
    const len = kf.length;

    // Find the keyframe just before and just after current dayTime
    let idxA = len - 1;
    for (let i = 0; i < len; i++) {
      if (kf[i]!.time > dayTime) {
        idxA = (i - 1 + len) % len;
        break;
      }
    }
    const idxB = (idxA + 1) % len;

    const kfA = kf[idxA]!;
    const kfB = kf[idxB]!;
    const timeA = kfA.time;
    const timeB = kfB.time;

    // Handle wrap-around (last keyframe → first keyframe across midnight)
    let span: number;
    let progress: number;
    if (timeB <= timeA) {
      // Wrapping around midnight
      span = (1 - timeA) + timeB;
      progress = dayTime >= timeA ? (dayTime - timeA) / span : (1 - timeA + dayTime) / span;
    } else {
      span = timeB - timeA;
      progress = (dayTime - timeA) / span;
    }

    return {
      a: kfA.mood,
      b: kfB.mood,
      t: THREE.MathUtils.clamp(progress, 0, 1),
    };
  }

  #computeBlendedMood(): SkyMood {
    const { a, b, t } = this.#getTimeInterpolation();
    const timeMood = lerpMood(a, b, t);

    // Apply weather modifier
    const ws = WEATHER_SCALES[this.#weatherCondition];
    const desat = ws.desaturation;

    return {
      fogColor: desat > 0 ? desaturateHex(timeMood.fogColor, desat) : timeMood.fogColor,
      hemisphereSky: desat > 0 ? desaturateHex(timeMood.hemisphereSky, desat) : timeMood.hemisphereSky,
      hemisphereGround: desat > 0 ? desaturateHex(timeMood.hemisphereGround, desat) : timeMood.hemisphereGround,
      hemisphereIntensity: timeMood.hemisphereIntensity * ws.hemisphereIntensity,
      sunColor: timeMood.sunColor,
      sunIntensity: timeMood.sunIntensity * ws.sunIntensity,
      fillColor: timeMood.fillColor,
      fillIntensity: timeMood.fillIntensity * ws.fillIntensity,
      rimColor: timeMood.rimColor,
      rimIntensity: timeMood.rimIntensity * ws.rimIntensity,
      backgroundBlurriness: timeMood.backgroundBlurriness + ws.blurrinessAdd,
      gradientStops: timeMood.gradientStops,
      sunGlowInner: this.#scaleGlowAlpha(timeMood.sunGlowInner, ws.glowMult),
      sunGlowMid: this.#scaleGlowAlpha(timeMood.sunGlowMid, ws.glowMult),
      sunGlowOuter: this.#scaleGlowAlpha(timeMood.sunGlowOuter, ws.glowMult),
      hazeStart: timeMood.hazeStart,
      hazeEnd: timeMood.hazeEnd,
      cloudDeckStart: timeMood.cloudDeckStart,
      cloudDeckMid: timeMood.cloudDeckMid,
      cloudDeckEnd: timeMood.cloudDeckEnd,
    };
  }

  #scaleGlowAlpha(rgba: string, mult: number): string {
    const [r, g, b, a] = parseRgba(rgba);
    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+(a * mult).toFixed(2)})`;
  }

  // -----------------------------------------------------------------------
  // Apply mood to scene lights
  // -----------------------------------------------------------------------

  #applyMood(mood: SkyMood): void {
    this.#fog.color.setHex(mood.fogColor);
    this.#hemisphere.color.setHex(mood.hemisphereSky);
    this.#hemisphere.groundColor.setHex(mood.hemisphereGround);
    this.#hemisphere.intensity = mood.hemisphereIntensity;
    this.#sun.color.setHex(mood.sunColor);
    this.#sun.intensity = mood.sunIntensity;
    this.#fill.color.setHex(mood.fillColor);
    this.#fill.intensity = mood.fillIntensity;
    this.#rim.color.setHex(mood.rimColor);
    this.#rim.intensity = mood.rimIntensity;
  }

  // -----------------------------------------------------------------------
  // Sun orbit
  // -----------------------------------------------------------------------

  #updateSunPosition(): void {
    // Sun orbit: at dayTime 0.25 (dawn) sun is on horizon east,
    // at 0.5 (noon) sun is overhead, at 0.75 (dusk) on horizon west.
    const angle = (this.#dayTime - 0.25) * Math.PI * 2;
    const sunX = Math.cos(angle) * SUN_ORBIT_RADIUS;
    const sunY = Math.sin(angle) * SUN_ORBIT_RADIUS;

    // Clamp sunY so the light doesn't go too far below (avoids reverse-lit shadows)
    this.#sun.position.set(sunX, Math.max(sunY, -20), 70);

    // Fill light opposes the sun
    this.#fill.position.set(-sunX * 0.5, Math.max(sunY * 0.25, 20), -90);

    // Rim comes from behind relative to sun
    this.#rim.position.set(-sunX * 0.3, Math.max(sunY * 0.15, 15), 140);

    // Disable shadows when sun is below horizon
    this.#sun.castShadow = sunY > 5;
  }

  /** At night, fog should close in. Returns a multiplier for fog distances. */
  #getNightFogScale(): number {
    const angle = (this.#dayTime - 0.25) * Math.PI * 2;
    const sunElevation = Math.sin(angle);
    // During day (elevation > 0): scale = 1.0
    // At night (elevation < 0): scale drops to ~0.45 (tighter fog, more intimate)
    if (sunElevation >= 0) return 1;
    return THREE.MathUtils.lerp(1, 0.45, Math.min(-sunElevation, 1));
  }

  // -----------------------------------------------------------------------
  // Biome sky tint
  // -----------------------------------------------------------------------

  /** Sample biome at player position, compute phase-weighted tint, smooth toward it. */
  #updateBiomeSkyTint(playerX: number, playerZ: number, dt: number): void {
    const sample = sampleBiome(playerX, playerZ);
    const weights = computePhaseWeights(this.#dayTime);

    // Compute weighted tint for primary biome
    const primaryTint = sample.primary.skyTint;
    this.#computeWeightedTint(_tintA, primaryTint, weights);

    if (sample.secondary && sample.blend > 0) {
      // Blend with secondary biome tint
      const secondaryTint = sample.secondary.skyTint;
      this.#computeWeightedTint(_tintB, secondaryTint, weights);
      _tintA.lerp(_tintB, sample.blend);
    }

    this.#targetBiomeTint.copy(_tintA);

    // Smooth interpolation (~3 seconds to converge)
    const lerpFactor = 1 - Math.exp(-BIOME_SKY_LERP_SPEED * dt);
    this.#currentBiomeTint.lerp(this.#targetBiomeTint, lerpFactor);
  }

  /** Combine a BiomeSkyTint's three channels using time-of-day phase weights. */
  #computeWeightedTint(
    out: THREE.Color,
    tint: BiomeSkyTint,
    weights: { goldenHour: number; night: number; noon: number },
  ): void {
    // Start from golden hour contribution
    out.setHex(tint.goldenHour);
    out.multiplyScalar(weights.goldenHour);

    // Add night contribution
    _tintTarget.setHex(tint.night);
    _tintTarget.multiplyScalar(weights.night);
    out.add(_tintTarget);

    // Add noon contribution
    _tintTarget.setHex(tint.noon);
    _tintTarget.multiplyScalar(weights.noon);
    out.add(_tintTarget);
  }

  /** Apply the current biome tint additively to fog, hemisphere sky, and hemisphere ground. */
  #applyBiomeSkyTint(): void {
    this.#fog.color.add(this.#currentBiomeTint);
    this.#hemisphere.color.add(this.#currentBiomeTint);
    this.#hemisphere.groundColor.add(this.#currentBiomeTint);
  }

  // -----------------------------------------------------------------------
  // Environment texture
  // -----------------------------------------------------------------------

  #regenerateEnvTexture(): void {
    const mood = this.#computeBlendedMood();
    const atmosphere = this.#createEnvironmentTexture(mood);
    this.#scene.environment = atmosphere;
    this.#scene.background = atmosphere;
    this.#scene.backgroundBlurriness = mood.backgroundBlurriness;
    this.#environmentTexture?.dispose();
    this.#environmentTexture = atmosphere;
  }

  #createEnvironmentTexture(mood: SkyMood): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create atmospheric texture.');
    }

    const skyGradient = context.createLinearGradient(0, 0, 0, canvas.height);
    for (const stop of mood.gradientStops) {
      skyGradient.addColorStop(stop.offset, stop.color);
    }
    context.fillStyle = skyGradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    // Sun glow position tracks the sun's azimuth across the sky texture
    const sunAzimuth = this.#dayTime * Math.PI * 2;
    const sunGlowX = ((sunAzimuth / (Math.PI * 2)) * canvas.width) % canvas.width;
    const sunAngle = (this.#dayTime - 0.25) * Math.PI * 2;
    const sunElevation = Math.max(Math.sin(sunAngle), -0.1);
    // Map elevation to Y: high sun = low Y (top of canvas), horizon = middle
    const sunGlowY = (0.5 - sunElevation * 0.38) * canvas.height;

    const h = canvas.height;
    const w = canvas.width;

    const sunGlow = context.createRadialGradient(
      sunGlowX, sunGlowY, h * 0.055,
      sunGlowX, sunGlowY, h * 0.86,
    );
    sunGlow.addColorStop(0, mood.sunGlowInner);
    sunGlow.addColorStop(0.24, mood.sunGlowMid);
    sunGlow.addColorStop(0.72, mood.sunGlowOuter);
    sunGlow.addColorStop(1, 'rgba(255, 197, 126, 0)');
    context.fillStyle = sunGlow;
    const glowLeft = Math.max(0, sunGlowX - w * 0.49);
    const glowTop = Math.max(0, sunGlowY - h * 0.7);
    context.fillRect(glowLeft, glowTop, w * 0.98, h * 1.4);

    const warmHaze = context.createLinearGradient(0, h * 0.7, 0, h * 1.4);
    warmHaze.addColorStop(0, mood.hazeStart);
    warmHaze.addColorStop(1, mood.hazeEnd);
    context.fillStyle = warmHaze;
    context.fillRect(0, h * 0.7, w, h * 0.74);

    const coolVeil = context.createLinearGradient(0, h * 0.31, 0, h * 1.21);
    coolVeil.addColorStop(0, 'rgba(176, 199, 207, 0.24)');
    coolVeil.addColorStop(1, 'rgba(63, 74, 117, 0)');
    context.fillStyle = coolVeil;
    context.fillRect(0, h * 0.31, w, h * 1.01);

    const alpineMist = context.createLinearGradient(0, h * 0.82, 0, h * 1.68);
    alpineMist.addColorStop(0, 'rgba(224, 218, 205, 0)');
    alpineMist.addColorStop(0.4, 'rgba(200, 192, 178, 0.24)');
    alpineMist.addColorStop(1, 'rgba(140, 130, 118, 0.34)');
    context.fillStyle = alpineMist;
    context.fillRect(0, h * 0.82, w, h * 0.9);

    const cloudDeck = context.createLinearGradient(0, h * 0.18, 0, h * 0.74);
    cloudDeck.addColorStop(0, mood.cloudDeckStart);
    cloudDeck.addColorStop(0.4, mood.cloudDeckMid);
    cloudDeck.addColorStop(1, mood.cloudDeckEnd);
    context.fillStyle = cloudDeck;
    context.fillRect(0, h * 0.11, w, h * 0.7);

    const ridgeShadow = context.createLinearGradient(0, h * 1.17, 0, h * 2.0);
    ridgeShadow.addColorStop(0, 'rgba(99, 87, 84, 0)');
    ridgeShadow.addColorStop(1, 'rgba(68, 73, 84, 0.45)');
    context.fillStyle = ridgeShadow;
    context.fillRect(0, h * 1.17, w, h * 0.83);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  // -----------------------------------------------------------------------
  // Mist bands
  // -----------------------------------------------------------------------

  #addMistBands(scene: THREE.Scene): void {
    const mistTexture = this.#createMistTexture();
    const layers = [
      {
        position: new THREE.Vector3(0, 22, 90),
        scale: new THREE.Vector2(380, 116),
        color: 0xdde2da,
        opacity: 0.24,
        driftRadius: 7,
        driftSpeed: 0.16,
        phase: 0.2,
        lift: 1.4,
      },
      {
        position: new THREE.Vector3(-48, 27, 168),
        scale: new THREE.Vector2(430, 128),
        color: 0xd4dbd4,
        opacity: 0.22,
        driftRadius: 9,
        driftSpeed: 0.13,
        phase: 1.1,
        lift: 1.8,
      },
      {
        position: new THREE.Vector3(42, 34, 246),
        scale: new THREE.Vector2(490, 144),
        color: 0xcfd8d4,
        opacity: 0.19,
        driftRadius: 11,
        driftSpeed: 0.11,
        phase: 2.3,
        lift: 2.1,
      },
      {
        position: new THREE.Vector3(0, 48, 334),
        scale: new THREE.Vector2(580, 168),
        color: 0xc8d1cf,
        opacity: 0.17,
        driftRadius: 14,
        driftSpeed: 0.09,
        phase: 3.2,
        lift: 2.8,
      },
      {
        position: new THREE.Vector3(84, 22, 148),
        scale: new THREE.Vector2(280, 96),
        color: 0xe5e6dc,
        opacity: 0.13,
        driftRadius: 6,
        driftSpeed: 0.18,
        phase: 4.0,
        lift: 1.2,
      },
    ];

    for (const layer of layers) {
      const material = new THREE.SpriteMaterial({
        map: mistTexture,
        color: layer.color,
        transparent: true,
        opacity: layer.opacity,
        depthWrite: false,
        depthTest: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(layer.position);
      sprite.scale.set(layer.scale.x, layer.scale.y, 1);
      this.#mistLayers.push({
        sprite,
        baseOpacity: layer.opacity,
        basePosition: layer.position.clone(),
        baseScale: layer.scale.clone(),
        driftRadius: layer.driftRadius,
        driftSpeed: layer.driftSpeed,
        phase: layer.phase,
        lift: layer.lift,
      });
      scene.add(sprite);
    }
  }

  #createMistTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create mist texture.');
    }

    const gradient = context.createRadialGradient(128, 64, 12, 128, 64, 120);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    gradient.addColorStop(0.38, 'rgba(245, 247, 243, 0.34)');
    gradient.addColorStop(0.72, 'rgba(219, 225, 218, 0.12)');
    gradient.addColorStop(1, 'rgba(219, 225, 218, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const veil = context.createLinearGradient(0, 24, 0, 104);
    veil.addColorStop(0, 'rgba(255, 255, 255, 0)');
    veil.addColorStop(0.45, 'rgba(255, 255, 255, 0.18)');
    veil.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = veil;
    context.fillRect(0, 18, canvas.width, 86);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
