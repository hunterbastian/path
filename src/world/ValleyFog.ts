import * as THREE from 'three';
import type { Terrain } from './Terrain';
import type { WeatherCondition } from '../config/GameTuning';

// ---------------------------------------------------------------------------
// Shader: each fog layer is a horizontal plane with noise-driven opacity
// ---------------------------------------------------------------------------

const FOG_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uDrift;

  varying vec2 vWorldXZ;
  varying float vWorldY;
  varying vec3 vViewPos;

  void main() {
    vec3 transformed = position;

    // Gentle vertical undulation — makes the layer feel alive
    float wave = sin(position.x * 0.012 + uTime * 0.18 + uDrift) * 0.6
               + cos(position.z * 0.016 - uTime * 0.12) * 0.4;
    transformed.y += wave;

    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    vWorldXZ = worldPos.xz;
    vWorldY = worldPos.y;

    vec4 mvPos = modelViewMatrix * vec4(transformed, 1.0);
    vViewPos = mvPos.xyz;
    gl_Position = projectionMatrix * mvPos;
  }
`;

const FOG_FRAGMENT_SHADER = /* glsl */ `
  uniform float uTime;
  uniform float uOpacity;
  uniform float uDrift;
  uniform vec3 uFogColor;
  uniform float uCeilingY;
  uniform float uThickness;
  uniform float uCameraY;

  varying vec2 vWorldXZ;
  varying float vWorldY;
  varying vec3 vViewPos;

  // Simple value noise
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    for (int i = 0; i < 4; i++) {
      v += a * noise(p);
      p = p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }

  void main() {
    // Slowly drifting noise coordinates
    vec2 uv = vWorldXZ * 0.008;
    vec2 drift = vec2(uTime * 0.014 + uDrift, uTime * -0.009);
    float n = fbm(uv + drift);
    float n2 = fbm(uv * 1.8 - drift * 0.7 + vec2(5.2, 1.3));

    // Combine for organic wisps
    float shape = smoothstep(0.28, 0.62, n * 0.6 + n2 * 0.4);

    // Height-based density: densest near floor, fades toward ceiling
    float heightFrac = clamp((vWorldY - (uCeilingY - uThickness)) / uThickness, 0.0, 1.0);
    float heightFade = 1.0 - heightFrac * heightFrac; // Quadratic — dense at bottom

    // Soft edge fade based on view distance
    float viewDist = length(vViewPos);
    float distFade = smoothstep(8.0, 28.0, viewDist) * smoothstep(380.0, 220.0, viewDist);

    // When camera is submerged in the fog, boost density
    float submergeFactor = smoothstep(uCeilingY + 4.0, uCeilingY - uThickness * 0.5, uCameraY);
    float submergeBoost = 1.0 + submergeFactor * 0.6;

    float alpha = shape * heightFade * distFade * uOpacity * submergeBoost;
    alpha = clamp(alpha, 0.0, 0.82);

    // Slight color variation from noise
    vec3 color = uFogColor + (n - 0.5) * 0.04;

    gl_FragColor = vec4(color, alpha);
  }
`;

// ---------------------------------------------------------------------------
// Valley detection & fog placement
// ---------------------------------------------------------------------------

interface FogVolume {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  ceilingY: number;
  thickness: number;
  baseDrift: number;
  opacityScale: number;
}

/** Maximum height (world Y) below which fog can pool. */
const FOG_CEILING_MAX = 18;

/** Fog layer thickness. */
const FOG_THICKNESS = 12;

/** Grid resolution for scanning terrain valleys. */
const SCAN_STEP = 48;

/** Minimum plane size for a fog volume. */
const MIN_FOG_SIZE = 80;

// ---------------------------------------------------------------------------
// ValleyFog class
// ---------------------------------------------------------------------------

export class ValleyFog {
  readonly #scene: THREE.Scene;
  readonly #volumes: FogVolume[] = [];
  #time = 0;
  #dayTime = 0.35;
  #weatherCondition: WeatherCondition = 'sunny';
  #cameraY = 20;

  /** Extra fog-near push when the camera is submerged. */
  fogNearPush = 0;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.#scene = scene;
    this.#buildFogVolumes(terrain);
  }

  setDayTime(dayTime: number): void {
    this.#dayTime = dayTime;
  }

  setWeather(condition: WeatherCondition): void {
    this.#weatherCondition = condition;
  }

  update(dt: number, cameraPosition: THREE.Vector3): void {
    this.#time += dt;
    this.#cameraY = cameraPosition.y;

    // Time-of-day opacity curve
    // Thickest at dawn (0.22-0.30) and dusk (0.72-0.82)
    // Burns off at midday (0.45-0.55)
    // Present but dim at night
    const todOpacity = this.#getTimeOfDayOpacity();

    // Weather modifier
    const weatherMult =
      this.#weatherCondition === 'rainy'
        ? 1.35
        : this.#weatherCondition === 'cloudy'
          ? 1.1
          : 0.85;

    const targetOpacity = THREE.MathUtils.clamp(todOpacity * weatherMult, 0, 1);

    // Compute submersion push for the scene fog
    let maxSubmersion = 0;

    // Match scene fog color so valley fog blends naturally
    const sceneFog = this.#scene.fog as THREE.Fog | null;

    for (const vol of this.#volumes) {
      const mat = vol.mesh.material;
      // Smooth opacity transitions — each layer has its own density scale
      const layerTarget = targetOpacity * vol.opacityScale;
      const current = mat.uniforms.uOpacity!.value as number;
      mat.uniforms.uOpacity!.value = THREE.MathUtils.lerp(current, layerTarget, dt * 0.8);
      mat.uniforms.uTime!.value = this.#time;
      mat.uniforms.uCameraY!.value = this.#cameraY;
      if (sceneFog) {
        (mat.uniforms.uFogColor!.value as THREE.Color).lerp(sceneFog.color, 0.7);
      }

      // Track submersion for scene fog push
      const submerge = THREE.MathUtils.smoothstep(
        this.#cameraY,
        vol.ceilingY + 4,
        vol.ceilingY - vol.thickness * 0.4,
      );
      if (submerge > maxSubmersion) maxSubmersion = submerge;

      // Visibility: hide when opacity is near zero
      vol.mesh.visible = (mat.uniforms.uOpacity!.value as number) > 0.005;
    }

    // Scene fog push — when inside valley fog, scene fog closes in
    this.fogNearPush = maxSubmersion * targetOpacity * 0.45;
  }

  dispose(): void {
    for (const vol of this.#volumes) {
      vol.mesh.geometry.dispose();
      vol.mesh.material.dispose();
      this.#scene.remove(vol.mesh);
    }
    this.#volumes.length = 0;
  }

  // -----------------------------------------------------------------------
  // Time-of-day opacity curve
  // -----------------------------------------------------------------------

  #getTimeOfDayOpacity(): number {
    const t = this.#dayTime;

    // Dawn fog peak: 0.20–0.32
    const dawnPeak = this.#bellCurve(t, 0.26, 0.06) * 0.92;
    // Morning burn-off
    const morningBurn = this.#bellCurve(t, 0.40, 0.08) * 0.45;
    // Midday minimum
    const middayClear = this.#bellCurve(t, 0.50, 0.06) * 0.18;
    // Golden hour return
    const goldenHour = this.#bellCurve(t, 0.70, 0.06) * 0.72;
    // Dusk peak
    const duskPeak = this.#bellCurve(t, 0.80, 0.05) * 0.88;
    // Night — moderate fog
    const night = this.#bellCurve(t, 0.0, 0.12) * 0.55;
    // Also catch wrap-around night
    const nightWrap = this.#bellCurve(t, 1.0, 0.12) * 0.55;

    return Math.max(dawnPeak, morningBurn, middayClear, goldenHour, duskPeak, night, nightWrap);
  }

  /** Gaussian bell: peak = 1 at center, σ = width. */
  #bellCurve(x: number, center: number, width: number): number {
    const d = (x - center) / width;
    return Math.exp(-0.5 * d * d);
  }

  // -----------------------------------------------------------------------
  // Build fog volumes by scanning terrain for low-lying areas
  // -----------------------------------------------------------------------

  #buildFogVolumes(terrain: Terrain): void {
    const half = terrain.size * 0.46;
    const clusters: Array<{ x: number; z: number; height: number }> = [];

    // Scan the terrain for low points
    for (let z = -half; z <= half; z += SCAN_STEP) {
      for (let x = -half; x <= half; x += SCAN_STEP) {
        const h = terrain.getHeightAt(x, z);
        if (h < FOG_CEILING_MAX) {
          clusters.push({ x, z, height: h });
        }
      }
    }

    if (clusters.length === 0) return;

    // Merge nearby low points into fog regions using simple flood-fill grouping
    const visited = new Set<number>();
    const regions: Array<{ points: typeof clusters; minH: number; maxH: number }> = [];

    for (let i = 0; i < clusters.length; i++) {
      if (visited.has(i)) continue;
      const region = { points: [clusters[i]!], minH: clusters[i]!.height, maxH: clusters[i]!.height };
      visited.add(i);

      // BFS to find connected points
      const queue = [i];
      while (queue.length > 0) {
        const ci = queue.shift()!;
        const cp = clusters[ci]!;
        for (let j = 0; j < clusters.length; j++) {
          if (visited.has(j)) continue;
          const cj = clusters[j]!;
          const dist = Math.hypot(cp.x - cj.x, cp.z - cj.z);
          if (dist <= SCAN_STEP * 1.6) {
            visited.add(j);
            region.points.push(cj);
            region.minH = Math.min(region.minH, cj.height);
            region.maxH = Math.max(region.maxH, cj.height);
            queue.push(j);
          }
        }
      }

      if (region.points.length >= 2) {
        regions.push(region);
      }
    }

    // Create a fog plane for each region
    for (const region of regions) {
      let cx = 0, cz = 0;
      for (const p of region.points) {
        cx += p.x;
        cz += p.z;
      }
      cx /= region.points.length;
      cz /= region.points.length;

      // Compute bounding extent
      let maxDist = 0;
      for (const p of region.points) {
        const d = Math.max(Math.abs(p.x - cx), Math.abs(p.z - cz));
        if (d > maxDist) maxDist = d;
      }

      const size = Math.max(MIN_FOG_SIZE, maxDist * 2 + SCAN_STEP * 1.4);
      const ceilingY = Math.min(FOG_CEILING_MAX, region.maxH + 4);
      const thickness = Math.min(FOG_THICKNESS, ceilingY - region.minH + 4);

      // Stack 3 layers at different heights for volumetric depth
      const layerOffsets = [0.0, 0.35, 0.7];
      for (let li = 0; li < layerOffsets.length; li++) {
        const layerY = ceilingY - thickness * layerOffsets[li]!;
        const layerOpacityScale = 1 - layerOffsets[li]! * 0.4; // Lower layers are denser
        this.#createFogLayer(
          cx, cz, size,
          ceilingY, thickness, layerY,
          layerOpacityScale,
          region.points.length * 0.12 + li * 1.7,
        );
      }
    }
  }

  #createFogLayer(
    cx: number,
    cz: number,
    size: number,
    ceilingY: number,
    thickness: number,
    layerY: number,
    opacityScale: number,
    driftSeed: number,
  ): void {
    const geometry = new THREE.PlaneGeometry(size, size, 1, 1);
    geometry.rotateX(-Math.PI / 2);

    const fogColor = new THREE.Color(0xd4dbd6);

    const material = new THREE.ShaderMaterial({
      vertexShader: FOG_VERTEX_SHADER,
      fragmentShader: FOG_FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uDrift: { value: driftSeed },
        uFogColor: { value: fogColor },
        uCeilingY: { value: ceilingY },
        uThickness: { value: thickness },
        uCameraY: { value: 20 },
      },
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx, layerY, cz);
    mesh.renderOrder = 999;
    mesh.frustumCulled = true;

    this.#scene.add(mesh);
    this.#volumes.push({
      mesh,
      ceilingY,
      thickness,
      baseDrift: driftSeed,
      opacityScale,
    });
  }
}
