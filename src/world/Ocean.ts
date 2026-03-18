import * as THREE from 'three';
import { SEA_LEVEL } from './Terrain';

// Reduced from 4000 — everything past ~600 is fogged anyway
const OCEAN_SIZE = 2400;
// Reduced from 140 — 100×100 = 10,000 verts (was 19,600)
const OCEAN_SEGMENTS = 100;

// ── Vertex: Gerstner waves with LOD + crest sharpening + shore breakers ──

const OCEAN_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uIslandEdge;

  varying vec3 vWorldPosition;
  varying float vWaveHeight;
  varying float vDistFromCenter;
  varying vec3 vWaveNormal;
  varying float vCoastProximity;
  varying float vWaveGroup;
  varying float vMaxAmp;

  vec3 gerstner(vec2 dir, float steep, float wl, float amp, float spd, vec2 p, float t) {
    float k = 6.28318 / wl;
    float ph = k * (dot(dir, p) - spd * t);
    return vec3(steep * amp * dir.x * cos(ph), amp * sin(ph), steep * amp * dir.y * cos(ph));
  }

  vec3 gerstnerN(vec2 dir, float steep, float wl, float amp, float spd, vec2 p, float t) {
    float k = 6.28318 / wl;
    float ph = k * (dot(dir, p) - spd * t);
    float wa = k * amp;
    return vec3(-dir.x * wa * cos(ph), -steep * wa * sin(ph), -dir.y * wa * cos(ph));
  }

  void main() {
    vec3 pos = position;
    vec2 p = pos.xz;
    float dist = length(p);

    // Wave group — slow swell modulation
    float group = 0.72 + 0.28 * sin(uTime * 0.11 + dist * 0.0016);

    // Deep water scale
    float deepScale = smoothstep(uIslandEdge - 40.0, uIslandEdge + 120.0, dist);

    // Distance LOD — skip fine waves for distant verts
    float detailLOD = 1.0 - smoothstep(300.0, 700.0, dist);

    // ── Open-ocean Gerstner layers (3 always + 2 LOD) ──
    vec3 disp = vec3(0.0);
    vec3 nAcc = vec3(0.0);
    float maxAmp = 0.0;

    // Primary swell — always computed
    vec2 d1 = normalize(vec2(0.76, 0.65));
    float a1 = 0.58 * group;
    disp += gerstner(d1, 0.44, 58.0, a1, 3.6, p, uTime);
    nAcc += gerstnerN(d1, 0.44, 58.0, a1, 3.6, p, uTime);
    maxAmp += a1;

    // Secondary swell — always computed
    vec2 d2 = normalize(vec2(-0.42, 0.91));
    float a2 = 0.34 * group;
    disp += gerstner(d2, 0.38, 40.0, a2, 3.0, p, uTime);
    nAcc += gerstnerN(d2, 0.38, 40.0, a2, 3.0, p, uTime);
    maxAmp += a2;

    // Medium chop — always computed
    vec2 d3 = normalize(vec2(0.25, -0.74));
    disp += gerstner(d3, 0.54, 19.0, 0.17, 5.2, p, uTime);
    nAcc += gerstnerN(d3, 0.54, 19.0, 0.17, 5.2, p, uTime);

    // Short chop + fine ripple — LOD gated
    if (detailLOD > 0.01) {
      vec2 d4 = normalize(vec2(-0.64, -0.35));
      float a4 = 0.085 * detailLOD;
      disp += gerstner(d4, 0.50, 10.5, a4, 6.6, p, uTime);
      nAcc += gerstnerN(d4, 0.50, 10.5, a4, 6.6, p, uTime);

      vec2 d5 = normalize(vec2(0.90, -0.22));
      float a5 = 0.038 * detailLOD;
      disp += gerstner(d5, 0.36, 5.8, a5, 8.4, p, uTime);
      nAcc += gerstnerN(d5, 0.36, 5.8, a5, 8.4, p, uTime);
    }

    disp *= deepScale;
    nAcc *= deepScale;
    maxAmp *= deepScale;

    // Crest sharpening (Stokes-like)
    if (disp.y > 0.0 && maxAmp > 0.01) {
      disp.y = pow(disp.y / maxAmp, 1.35) * maxAmp;
    }

    // ── Shore breakers — only in coastal zone ──
    float shoreZone = 1.0 - smoothstep(uIslandEdge - 55.0, uIslandEdge + 25.0, dist);
    if (shoreZone > 0.01) {
      vec2 toCenter = -normalize(p + vec2(0.001));
      float breakSteep = mix(0.28, 0.74, shoreZone);
      float ba = 0.30 * shoreZone * group;
      disp += gerstner(toCenter, breakSteep, 24.0, ba, 4.4, p, uTime);
      nAcc += gerstnerN(toCenter, breakSteep, 24.0, ba, 4.4, p, uTime);
      float ba2 = 0.18 * shoreZone * group;
      disp += gerstner(toCenter, breakSteep * 0.75, 15.0, ba2, 5.6, p, uTime + 3.9);
      nAcc += gerstnerN(toCenter, breakSteep * 0.75, 15.0, ba2, 5.6, p, uTime + 3.9);
    }

    pos += disp;
    vWaveHeight = disp.y;
    vWaveNormal = normalize(vec3(-nAcc.x, 1.0 - nAcc.y, -nAcc.z));
    vCoastProximity = shoreZone;
    vWaveGroup = group;
    vMaxAmp = maxAmp + 0.001;

    vec4 worldPos = modelMatrix * vec4(pos, 1.0);
    vWorldPosition = worldPos.xyz;
    vDistFromCenter = length(worldPos.xz);
    gl_Position = projectionMatrix * viewMatrix * worldPos;
  }
`;

// ── Fragment: SSS, organic foam, glitter, bioluminescence — with LOD ─────

const OCEAN_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform vec3 uSunPosition;
  uniform float uSunIntensity;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uIslandEdge;

  varying vec3 vWorldPosition;
  varying float vWaveHeight;
  varying float vDistFromCenter;
  varying vec3 vWaveNormal;
  varying float vCoastProximity;
  varying float vWaveGroup;
  varying float vMaxAmp;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  // Organic foam — bubbly clusters
  float foamTex(vec2 uv, float t) {
    float n1 = sin(uv.x * 3.4 + t * 0.6) * sin(uv.y * 2.9 - t * 0.4) * 0.5 + 0.5;
    float n2 = sin(uv.x * 7.8 - t * 0.9) * cos(uv.y * 6.6 + t * 0.7) * 0.5 + 0.5;
    float n3 = sin(uv.x * 15.0 + t * 1.5) * sin(uv.y * 13.2 - t * 1.1) * 0.5 + 0.5;
    return n1 * (0.6 + n2 * 0.4) * (0.7 + n3 * 0.3);
  }

  void main() {
    vec3 sunDir = normalize(uSunPosition - vWorldPosition);
    vec3 viewDir = normalize(cameraPosition - vWorldPosition);
    float sunFactor = mix(0.30, 1.0, clamp(uSunIntensity / 2.2, 0.0, 1.0));
    float camDist = length(cameraPosition - vWorldPosition);

    // Fragment LOD — skip expensive effects when far
    float fragDetail = 1.0 - smoothstep(120.0, 380.0, camDist);

    // ── Normal: Gerstner + micro-detail (LOD gated) ──
    vec3 normal = vWaveNormal;
    if (fragDetail > 0.01) {
      float t = uTime;
      vec2 wp = vWorldPosition.xz;
      vec3 micro = vec3(
        sin(wp.x * 0.85 + t * 2.1) * cos(wp.y * 0.72 + t * 1.5) * 0.016 * fragDetail
          + sin(wp.x * 2.3 - t * 3.2) * 0.007 * fragDetail,
        0.0,
        cos(wp.y * 0.78 + t * 1.8) * sin(wp.x * 0.68 - t * 1.3) * 0.014 * fragDetail
          + cos(wp.y * 1.9 + t * 2.6) * 0.006 * fragDetail
      );
      normal = normalize(vWaveNormal + micro);
    }

    // ── Base color: 5-stop depth gradient ──
    vec3 crystalCol  = vec3(0.28, 0.68, 0.58);
    vec3 shallowCol  = vec3(0.16, 0.54, 0.50);
    vec3 midCol      = vec3(0.07, 0.32, 0.50);
    vec3 deepCol     = vec3(0.04, 0.14, 0.32);
    vec3 abyssCol    = vec3(0.02, 0.06, 0.18);

    float d1 = smoothstep(uIslandEdge - 30.0, uIslandEdge + 20.0, vDistFromCenter);
    float d2 = smoothstep(uIslandEdge + 20.0, uIslandEdge + 100.0, vDistFromCenter);
    float d3 = smoothstep(uIslandEdge + 100.0, uIslandEdge + 300.0, vDistFromCenter);
    float d4 = smoothstep(uIslandEdge + 300.0, uIslandEdge + 700.0, vDistFromCenter);

    vec3 waterColor = mix(crystalCol, shallowCol, d1);
    waterColor = mix(waterColor, midCol, d2);
    waterColor = mix(waterColor, deepCol, d3);
    waterColor = mix(waterColor, abyssCol, d4);

    // Trough darkening / crest brightening
    float crestFactor = smoothstep(-0.30, 0.50, vWaveHeight);
    waterColor = mix(waterColor * 0.78, waterColor * 1.14, crestFactor);

    // ── Subsurface scattering — teal glow through crests ──
    float sssAngle = pow(max(dot(viewDir, -sunDir), 0.0), 3.0);
    float crestThin = clamp(vWaveHeight / vMaxAmp, 0.0, 1.0);
    vec3 sssCol = mix(vec3(0.10, 0.58, 0.44), vec3(0.18, 0.52, 0.28), sssAngle * 0.4);
    waterColor += sssCol * sssAngle * crestThin * uSunIntensity * 0.38;

    // ── Backlit rim glow ──
    float rim = 1.0 - max(dot(viewDir, normal), 0.0);
    float backlit = max(dot(-sunDir, normal), 0.0);
    waterColor += vec3(0.12, 0.48, 0.38) * rim * rim * backlit * uSunIntensity * 0.22;

    // Caustic shimmer in shallows (LOD gated)
    if (fragDetail > 0.1) {
      vec2 wp = vWorldPosition.xz;
      float t = uTime;
      float caustic = sin(wp.x * 0.04 + t * 0.4) * sin(wp.y * 0.05 - t * 0.3) * 0.5 + 0.5;
      waterColor += waterColor * caustic * 0.09 * fragDetail * (1.0 - d2);
    }

    waterColor *= sunFactor;

    // ── Shore foam — organic texture ──
    float angle = atan(vWorldPosition.z, vWorldPosition.x);
    float fw1 = sin(vDistFromCenter * 0.11 - uTime * 1.3 + angle * 0.22) * 0.5 + 0.5;
    float fw2 = sin(vDistFromCenter * 0.065 - uTime * 0.8 + 2.4) * 0.5 + 0.5;
    float fw3 = sin(vDistFromCenter * 0.18 - uTime * 1.9 + angle * 0.45 + 1.1) * 0.5 + 0.5;
    float shoreBand = vCoastProximity * (
      smoothstep(0.50, 0.80, fw1) * 0.55
      + smoothstep(0.58, 0.86, fw2) * 0.35
      + smoothstep(0.70, 0.93, fw3) * 0.22
    );
    float wash = vCoastProximity * vCoastProximity * 0.20;
    float shoreRaw = max(shoreBand, wash);

    vec2 foamUV = vWorldPosition.xz * 0.08;
    float foamPattern = foamTex(foamUV + vec2(uTime * 0.02, -uTime * 0.015), uTime);
    float shoreFoam = shoreRaw * (0.5 + foamPattern * 0.5);
    shoreFoam *= smoothstep(0.0, 0.15, shoreRaw);

    // ── Whitecaps — organic foam on steep crests ──
    float steepness = 1.0 - normal.y;
    float wcBase = smoothstep(0.04, 0.15, steepness) * d1;
    float wcTex = foamTex(foamUV * 1.8 + vec2(-uTime * 0.04, uTime * 0.03), uTime * 1.2);
    float whitecap = wcBase * wcTex * 0.45;
    float wcStreak = sin(vWorldPosition.x * 0.14 + vWorldPosition.z * 0.09 + uTime * 0.4) * 0.5 + 0.5;
    whitecap *= 0.6 + wcStreak * 0.4;

    float foam = max(shoreFoam, whitecap);
    vec3 foamCol = mix(vec3(0.92, 0.96, 0.98), vec3(0.97, 0.99, 1.0), vCoastProximity * 0.4);
    waterColor = mix(waterColor, foamCol, clamp(foam, 0.0, 0.72));

    // ── Specular ──
    vec3 halfDir = normalize(sunDir + viewDir);
    float nDotH = max(dot(normal, halfDir), 0.0);
    waterColor += vec3(1.0, 0.97, 0.90) * pow(nDotH, 320.0) * uSunIntensity * 0.6;
    waterColor += vec3(1.0, 0.96, 0.88) * pow(nDotH, 14.0) * uSunIntensity * 0.07;

    // Sun glitter (LOD gated — expensive)
    if (fragDetail > 0.2) {
      vec2 glitterCell = floor(vWorldPosition.xz * 1.6 + normal.xz * 5.0);
      float gh = hash(glitterCell + floor(uTime * 3.5));
      float glitter = step(0.984, gh) * pow(nDotH, 10.0);
      waterColor += vec3(1.0, 0.98, 0.94) * glitter * uSunIntensity * fragDetail * 3.2;
    }

    // ── Fresnel sky reflection ──
    float fresnel = 1.0 - max(dot(viewDir, normal), 0.0);
    fresnel = fresnel * fresnel * fresnel;
    waterColor = mix(waterColor, uFogColor * sunFactor * 1.2, fresnel * 0.50);

    // ── Night bioluminescence ──
    float nightFactor = 1.0 - clamp(uSunIntensity / 0.4, 0.0, 1.0);
    if (nightFactor > 0.01) {
      float bioGlow = clamp(vWaveHeight / vMaxAmp, 0.0, 1.0);
      bioGlow *= bioGlow;
      float bioSparkle = sin(vWorldPosition.x * 0.3 + uTime * 1.2) *
                         cos(vWorldPosition.z * 0.25 - uTime * 0.8) * 0.5 + 0.5;
      bioGlow *= 0.5 + bioSparkle * 0.5;
      waterColor += vec3(0.04, 0.22, 0.18) * bioGlow * nightFactor * 0.7;
      waterColor += vec3(0.02, 0.12, 0.10) * foam * nightFactor * 0.5;
    }

    // ── Fog ──
    float fogFactor = smoothstep(uFogNear, uFogFar, camDist);
    waterColor = mix(waterColor, uFogColor, fogFactor);

    gl_FragColor = vec4(waterColor, 1.0);
  }
`;

// ── Ocean class ──────────────────────────────────────────────────────────

interface OceanUniforms {
  uTime: THREE.IUniform<number>;
  uSunPosition: THREE.IUniform<THREE.Vector3>;
  uSunIntensity: THREE.IUniform<number>;
  uFogColor: THREE.IUniform<THREE.Color>;
  uFogNear: THREE.IUniform<number>;
  uFogFar: THREE.IUniform<number>;
  uIslandEdge: THREE.IUniform<number>;
}

export class Ocean {
  readonly #mesh: THREE.Mesh;
  readonly #material: THREE.ShaderMaterial;
  readonly #uniforms: OceanUniforms;

  constructor(scene: THREE.Scene, islandEdge: number) {
    this.#uniforms = {
      uTime: { value: 0 },
      uSunPosition: { value: new THREE.Vector3(100, 200, 80) },
      uSunIntensity: { value: 1.0 },
      uFogColor: { value: new THREE.Color(0xa8c8b8) },
      uFogNear: { value: 46 },
      uFogFar: { value: 580 },
      uIslandEdge: { value: islandEdge },
    };

    this.#material = new THREE.ShaderMaterial({
      vertexShader: OCEAN_VERTEX,
      fragmentShader: OCEAN_FRAGMENT,
      uniforms: this.#uniforms as unknown as Record<string, THREE.IUniform>,
      side: THREE.FrontSide,
      transparent: false,
      depthWrite: true,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    const geometry = new THREE.PlaneGeometry(OCEAN_SIZE, OCEAN_SIZE, OCEAN_SEGMENTS, OCEAN_SEGMENTS);
    geometry.rotateX(-Math.PI / 2);

    this.#mesh = new THREE.Mesh(geometry, this.#material);
    this.#mesh.position.y = SEA_LEVEL - 0.04;
    this.#mesh.receiveShadow = false;
    this.#mesh.frustumCulled = false;
    scene.add(this.#mesh);
  }

  update(dt: number, sunPosition: THREE.Vector3, sunIntensity: number): void {
    this.#uniforms.uTime.value += dt;
    this.#uniforms.uSunPosition.value.copy(sunPosition);
    this.#uniforms.uSunIntensity.value = sunIntensity;

    const mesh = this.#mesh;
    if (mesh.parent) {
      const scene = mesh.parent as THREE.Scene;
      const fog = scene.fog as THREE.Fog | null;
      if (fog) {
        this.#uniforms.uFogColor.value.copy(fog.color);
        this.#uniforms.uFogNear.value = fog.near;
        this.#uniforms.uFogFar.value = fog.far;
      }
    }
  }

  dispose(): void {
    this.#material.dispose();
    this.#mesh.geometry.dispose();
    this.#mesh.removeFromParent();
  }
}
