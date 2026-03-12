import * as THREE from 'three';
import type { WeatherCondition } from '../config/GameTuning';

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

  // ── Morning ──
  {
    time: 0.35,
    mood: {
      fogColor: 0xc0c8c4,
      hemisphereSky: 0xd0dce6,
      hemisphereGround: 0x586858,
      hemisphereIntensity: 0.92,
      sunColor: 0xffd8a0,
      sunIntensity: 1.8,
      fillColor: 0xa0bcc8,
      fillIntensity: 0.88,
      rimColor: 0xd0b890,
      rimIntensity: 0.40,
      backgroundBlurriness: 0.06,
      gradientStops: [
        { offset: 0, color: '#88aec8' },
        { offset: 0.20, color: '#c8d0d4' },
        { offset: 0.46, color: '#d8b898' },
        { offset: 0.74, color: '#807878' },
        { offset: 1, color: '#607070' },
      ],
      sunGlowInner: 'rgba(255, 240, 200, 0.72)',
      sunGlowMid: 'rgba(255, 200, 130, 0.34)',
      sunGlowOuter: 'rgba(255, 170, 110, 0.12)',
      hazeStart: 'rgba(255, 200, 140, 0)',
      hazeEnd: 'rgba(150, 100, 80, 0.22)',
      cloudDeckStart: 'rgba(250, 244, 236, 0.22)',
      cloudDeckMid: 'rgba(220, 216, 208, 0.14)',
      cloudDeckEnd: 'rgba(220, 216, 208, 0)',
    },
  },

  // ── Midday (matches original sunny mood) ──
  {
    time: 0.50,
    mood: {
      fogColor: 0xcfd3cb,
      hemisphereSky: 0xf0e9d6,
      hemisphereGround: 0x647162,
      hemisphereIntensity: 1.08,
      sunColor: 0xffddb0,
      sunIntensity: 2.24,
      fillColor: 0xb7cad0,
      fillIntensity: 1.08,
      rimColor: 0xe2c1a0,
      rimIntensity: 0.52,
      backgroundBlurriness: 0.06,
      gradientStops: [
        { offset: 0, color: '#a1c0d1' },
        { offset: 0.18, color: '#e7ddd1' },
        { offset: 0.42, color: '#dfb28d' },
        { offset: 0.72, color: '#8e7e7a' },
        { offset: 1, color: '#66737f' },
      ],
      sunGlowInner: 'rgba(255, 246, 222, 0.9)',
      sunGlowMid: 'rgba(255, 210, 134, 0.42)',
      sunGlowOuter: 'rgba(255, 171, 112, 0.16)',
      hazeStart: 'rgba(255, 200, 126, 0)',
      hazeEnd: 'rgba(162, 100, 86, 0.24)',
      cloudDeckStart: 'rgba(255, 246, 236, 0.24)',
      cloudDeckMid: 'rgba(230, 221, 209, 0.16)',
      cloudDeckEnd: 'rgba(230, 221, 209, 0)',
    },
  },

  // ── Golden hour / late afternoon ──
  {
    time: 0.68,
    mood: {
      fogColor: 0xc8a87a,
      hemisphereSky: 0xe0c8a0,
      hemisphereGround: 0x584a38,
      hemisphereIntensity: 0.94,
      sunColor: 0xffa858,
      sunIntensity: 1.9,
      fillColor: 0x8aa0b8,
      fillIntensity: 0.78,
      rimColor: 0xf0a060,
      rimIntensity: 0.56,
      backgroundBlurriness: 0.07,
      gradientStops: [
        { offset: 0, color: '#7898b8' },
        { offset: 0.20, color: '#d8c0a0' },
        { offset: 0.44, color: '#e89858' },
        { offset: 0.74, color: '#906848' },
        { offset: 1, color: '#584838' },
      ],
      sunGlowInner: 'rgba(255, 210, 130, 0.88)',
      sunGlowMid: 'rgba(255, 170, 80, 0.44)',
      sunGlowOuter: 'rgba(240, 130, 60, 0.18)',
      hazeStart: 'rgba(255, 180, 100, 0)',
      hazeEnd: 'rgba(180, 90, 60, 0.32)',
      cloudDeckStart: 'rgba(255, 220, 170, 0.28)',
      cloudDeckMid: 'rgba(230, 190, 140, 0.20)',
      cloudDeckEnd: 'rgba(230, 190, 140, 0)',
    },
  },

  // ── Sunset ──
  {
    time: 0.78,
    mood: {
      fogColor: 0xa07050,
      hemisphereSky: 0x8068a0,
      hemisphereGround: 0x382820,
      hemisphereIntensity: 0.52,
      sunColor: 0xff6830,
      sunIntensity: 1.0,
      fillColor: 0x6070a0,
      fillIntensity: 0.38,
      rimColor: 0xe06028,
      rimIntensity: 0.40,
      backgroundBlurriness: 0.08,
      gradientStops: [
        { offset: 0, color: '#485888' },
        { offset: 0.20, color: '#8870a0' },
        { offset: 0.46, color: '#e87040' },
        { offset: 0.74, color: '#b04828' },
        { offset: 1, color: '#402820' },
      ],
      sunGlowInner: 'rgba(255, 160, 70, 0.80)',
      sunGlowMid: 'rgba(255, 110, 40, 0.38)',
      sunGlowOuter: 'rgba(200, 80, 40, 0.14)',
      hazeStart: 'rgba(255, 140, 60, 0)',
      hazeEnd: 'rgba(160, 60, 50, 0.38)',
      cloudDeckStart: 'rgba(220, 140, 100, 0.30)',
      cloudDeckMid: 'rgba(180, 100, 80, 0.20)',
      cloudDeckEnd: 'rgba(180, 100, 80, 0)',
    },
  },

  // ── Twilight ──
  {
    time: 0.90,
    mood: {
      fogColor: 0x302838,
      hemisphereSky: 0x28304a,
      hemisphereGround: 0x14181e,
      hemisphereIntensity: 0.24,
      sunColor: 0x905838,
      sunIntensity: 0.18,
      fillColor: 0x283848,
      fillIntensity: 0.18,
      rimColor: 0x604030,
      rimIntensity: 0.10,
      backgroundBlurriness: 0.06,
      gradientStops: [
        { offset: 0, color: '#1a2440' },
        { offset: 0.22, color: '#384060' },
        { offset: 0.48, color: '#6a4040' },
        { offset: 0.76, color: '#201828' },
        { offset: 1, color: '#100e18' },
      ],
      sunGlowInner: 'rgba(180, 100, 60, 0.20)',
      sunGlowMid: 'rgba(120, 60, 40, 0.10)',
      sunGlowOuter: 'rgba(80, 40, 30, 0.04)',
      hazeStart: 'rgba(100, 60, 40, 0)',
      hazeEnd: 'rgba(40, 24, 30, 0.24)',
      cloudDeckStart: 'rgba(60, 50, 60, 0.16)',
      cloudDeckMid: 'rgba(34, 28, 40, 0.10)',
      cloudDeckEnd: 'rgba(34, 28, 40, 0)',
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
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Full day-night cycle in seconds. */
const DAY_CYCLE_DURATION = 600;

/** How often (in seconds) to regenerate the environment texture. */
const ENV_TEXTURE_INTERVAL = 1.8;

/** Sun orbit radius for directional light positioning. */
const SUN_ORBIT_RADIUS = 220;

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
  #baseFogFar = 430;
  #baseMistStrength = 1;
  #valleyFogPush = 0;

  constructor(scene: THREE.Scene) {
    this.#scene = scene;
    this.#hemisphere = new THREE.HemisphereLight(0xd7dde0, 0x59625d, 0.94);
    scene.add(this.#hemisphere);

    this.#sun = new THREE.DirectionalLight(0xffd6aa, 1.95);
    this.#sun.position.set(180, 140, 70);
    this.#sun.castShadow = true;
    this.#sun.shadow.mapSize.set(1024, 1024);
    this.#sun.shadow.camera.left = -52;
    this.#sun.shadow.camera.right = 52;
    this.#sun.shadow.camera.top = 52;
    this.#sun.shadow.camera.bottom = -52;
    this.#sun.shadow.camera.near = 10;
    this.#sun.shadow.camera.far = 280;
    this.#sun.shadow.bias = -0.0008;
    scene.add(this.#sun);
    scene.add(this.#sun.target);

    this.#fill = new THREE.DirectionalLight(0x9bb1bf, 0.96);
    this.#fill.position.set(-110, 55, -90);
    scene.add(this.#fill);

    this.#rim = new THREE.DirectionalLight(0xb6a894, 0.46);
    this.#rim.position.set(-60, 30, 140);
    scene.add(this.#rim);

    this.#fog = new THREE.Fog(0xb9c0bf, 46, 430);
    scene.fog = this.#fog;
    this.#addMistBands(scene);

    // Apply initial mood
    this.#applyMood(this.#computeBlendedMood());
    this.#regenerateEnvTexture();
  }

  /** Normalized day time (0 = midnight, 0.25 = sunrise, 0.5 = noon, 0.75 = sunset). */
  get dayTime(): number {
    return this.#dayTime;
  }

  setAtmosphere(fogNear: number, fogFar: number, mistStrength: number): void {
    this.#baseFogNear = fogNear;
    this.#baseFogFar = fogFar;
    this.#baseMistStrength = mistStrength;
  }

  setWeatherMood(condition: WeatherCondition): void {
    this.#weatherCondition = condition;
  }

  /** Apply valley fog submersion push (0 = none, ~0.45 = max submerged). */
  setValleyFogPush(push: number): void {
    this.#valleyFogPush = THREE.MathUtils.clamp(push, 0, 0.5);
  }

  update(dt: number, routeActivity: number, rainDensity: number, playerPosition?: THREE.Vector3): void {
    this.#time += dt;
    this.#dayTime = (this.#dayTime + dt / DAY_CYCLE_DURATION) % 1;

    // Compute blended mood from time + weather
    const mood = this.#computeBlendedMood();
    this.#applyMood(mood);

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

    // Mist animation
    const weatherDriftScale =
      this.#weatherCondition === 'rainy' ? 1.16 : this.#weatherCondition === 'sunny' ? 0.72 : 0.92;
    const weatherOpacityScale =
      this.#weatherCondition === 'rainy' ? 1.08 : this.#weatherCondition === 'sunny' ? 0.74 : 0.9;
    const routeMix = THREE.MathUtils.lerp(0.78, 1.06, THREE.MathUtils.clamp(routeActivity, 0, 1));
    const rainLift = THREE.MathUtils.lerp(0, 0.26, THREE.MathUtils.clamp(rainDensity, 0, 1));

    for (const layer of this.#mistLayers) {
      const driftTime = this.#time * layer.driftSpeed + layer.phase;
      const sway = Math.sin(driftTime) * layer.driftRadius * weatherDriftScale;
      const depthDrift =
        Math.cos(driftTime * 0.72 + layer.phase * 0.4)
        * layer.driftRadius
        * 0.42
        * weatherDriftScale;
      const verticalWave =
        Math.sin(driftTime * 0.46 + layer.phase) * layer.lift
        + rainLift * layer.lift * 0.45;

      layer.sprite.position.set(
        layer.basePosition.x + sway,
        layer.basePosition.y + verticalWave,
        layer.basePosition.z + depthDrift,
      );

      const opacityPulse = 0.9 + Math.sin(driftTime * 0.62 + layer.phase * 0.5) * 0.08;
      const scalePulse = 1 + Math.sin(driftTime * 0.38 + layer.phase) * 0.025;
      layer.sprite.scale.set(
        layer.baseScale.x * scalePulse,
        layer.baseScale.y * scalePulse,
        1,
      );

      const material = layer.sprite.material as THREE.SpriteMaterial;
      material.opacity =
        layer.baseOpacity * weatherOpacityScale * routeMix * opacityPulse * this.#baseMistStrength;
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
    // At night (elevation < 0): scale drops to ~0.5 (closer fog)
    if (sunElevation >= 0) return 1;
    return THREE.MathUtils.lerp(1, 0.55, Math.min(-sunElevation, 1));
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

    const sunGlow = context.createRadialGradient(sunGlowX, sunGlowY, 14, sunGlowX, sunGlowY, 220);
    sunGlow.addColorStop(0, mood.sunGlowInner);
    sunGlow.addColorStop(0.24, mood.sunGlowMid);
    sunGlow.addColorStop(0.72, mood.sunGlowOuter);
    sunGlow.addColorStop(1, 'rgba(255, 197, 126, 0)');
    context.fillStyle = sunGlow;
    // Draw glow around the sun position
    const glowLeft = Math.max(0, sunGlowX - 250);
    const glowTop = Math.max(0, sunGlowY - 180);
    context.fillRect(glowLeft, glowTop, 500, 360);

    const warmHaze = context.createLinearGradient(0, 180, 0, 360);
    warmHaze.addColorStop(0, mood.hazeStart);
    warmHaze.addColorStop(1, mood.hazeEnd);
    context.fillStyle = warmHaze;
    context.fillRect(0, 180, canvas.width, 190);

    const coolVeil = context.createLinearGradient(0, 80, 0, 310);
    coolVeil.addColorStop(0, 'rgba(176, 199, 207, 0.24)');
    coolVeil.addColorStop(1, 'rgba(63, 74, 117, 0)');
    context.fillStyle = coolVeil;
    context.fillRect(0, 80, canvas.width, 260);

    const alpineMist = context.createLinearGradient(0, 210, 0, 430);
    alpineMist.addColorStop(0, 'rgba(224, 231, 225, 0)');
    alpineMist.addColorStop(0.4, 'rgba(197, 203, 192, 0.24)');
    alpineMist.addColorStop(1, 'rgba(128, 135, 136, 0.34)');
    context.fillStyle = alpineMist;
    context.fillRect(0, 210, canvas.width, 230);

    const cloudDeck = context.createLinearGradient(0, 46, 0, 190);
    cloudDeck.addColorStop(0, mood.cloudDeckStart);
    cloudDeck.addColorStop(0.4, mood.cloudDeckMid);
    cloudDeck.addColorStop(1, mood.cloudDeckEnd);
    context.fillStyle = cloudDeck;
    context.fillRect(0, 28, canvas.width, 180);

    const ridgeShadow = context.createLinearGradient(0, 300, 0, 512);
    ridgeShadow.addColorStop(0, 'rgba(99, 87, 84, 0)');
    ridgeShadow.addColorStop(1, 'rgba(68, 73, 84, 0.45)');
    context.fillStyle = ridgeShadow;
    context.fillRect(0, 300, canvas.width, 212);

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
