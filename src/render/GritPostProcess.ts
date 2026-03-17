import * as THREE from 'three';
import type { WaterPool } from '../world/Water';
import {
  getRenderDebugViewIndex,
  type RenderDebugViewId,
} from './RenderDebugView';

const MAX_WATER_DEBUG_POOLS = 12;

const POST_SHADER = {
  uniforms: {
    tScene: { value: null as THREE.Texture | null },
    tDepth: { value: null as THREE.DepthTexture | null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uPixelSize: { value: 1 },
    uColorSteps: { value: 128 },
    uDebugView: { value: 0 },
    uNearFar: { value: new THREE.Vector2(0.5, 1200) },
    uFogNearFar: { value: new THREE.Vector2(46, 430) },
    uProjectionInverse: { value: new THREE.Matrix4() },
    uCameraMatrixWorld: { value: new THREE.Matrix4() },
    uWaterPoolCount: { value: 0 },
    uWaterPools: {
      value: Array.from({ length: MAX_WATER_DEBUG_POOLS }, () => new THREE.Vector4()),
    },
    uDamageFlash: { value: 0 },
    uEffectScale: { value: 1 },
    uBloomThreshold: { value: 0.38 },
    uSpeedBlur: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #define MAX_WATER_DEBUG_POOLS ${MAX_WATER_DEBUG_POOLS}

    uniform sampler2D tScene;
    uniform sampler2D tDepth;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uPixelSize;
    uniform float uColorSteps;
    uniform float uDebugView;
    uniform vec2 uNearFar;
    uniform vec2 uFogNearFar;
    uniform mat4 uProjectionInverse;
    uniform mat4 uCameraMatrixWorld;
    uniform float uWaterPoolCount;
    uniform vec4 uWaterPools[MAX_WATER_DEBUG_POOLS];
    uniform float uDamageFlash;
    uniform float uEffectScale;
    uniform float uBloomThreshold;
    uniform float uSpeedBlur;

    varying vec2 vUv;

    float hash(vec2 value) {
      value = fract(value * vec2(123.34, 456.21));
      value += dot(value, value + 78.233);
      return fract(value.x * value.y);
    }

    float linearizeDepth(float depth) {
      float nearPlane = uNearFar.x;
      float farPlane = uNearFar.y;
      float z = depth * 2.0 - 1.0;
      return (2.0 * nearPlane * farPlane)
        / max(farPlane + nearPlane - z * (farPlane - nearPlane), 0.00001);
    }

    vec3 reconstructWorldPosition(vec2 uv, float depth) {
      vec4 clipPosition = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
      vec4 viewPosition = uProjectionInverse * clipPosition;
      viewPosition /= max(viewPosition.w, 0.00001);
      return (uCameraMatrixWorld * viewPosition).xyz;
    }

    vec3 heatRamp(float value) {
      float t = clamp(value, 0.0, 1.0);
      vec3 a = vec3(0.05, 0.09, 0.18);
      vec3 b = vec3(0.16, 0.62, 0.93);
      vec3 c = vec3(0.95, 0.86, 0.32);
      vec3 d = vec3(0.96, 0.35, 0.16);

      if (t < 0.33) {
        return mix(a, b, t / 0.33);
      }
      if (t < 0.66) {
        return mix(b, c, (t - 0.33) / 0.33);
      }
      return mix(c, d, (t - 0.66) / 0.34);
    }

    vec2 getWaterDebug(vec3 worldPosition) {
      float mask = 0.0;
      float depth = 0.0;

      for (int index = 0; index < MAX_WATER_DEBUG_POOLS; index += 1) {
        if (float(index) >= uWaterPoolCount) {
          break;
        }

        vec4 pool = uWaterPools[index];
        float radialDistance = length(worldPosition.xz - pool.xy);
        float footprint = 1.0 - smoothstep(pool.z - 4.0, pool.z + 2.0, radialDistance);
        float poolDepth = max(pool.w - worldPosition.y, 0.0) * footprint;

        mask = max(mask, footprint);
        depth = max(depth, poolDepth);
      }

      return vec2(mask, depth);
    }

    // Soft bloom — 9-tap weighted cross (wider glow, still cheap)
    vec3 sampleBloom(sampler2D tex, vec2 uv, vec2 resolution) {
      vec2 texel = 3.0 / resolution;
      vec3 center = texture2D(tex, uv).rgb;
      float centerLuma = dot(center, vec3(0.2126, 0.7152, 0.0722));
      if (centerLuma < uBloomThreshold) return vec3(0.0);
      vec3 acc = center * 0.3;
      acc += texture2D(tex, uv + vec2(texel.x, 0.0)).rgb * 0.2;
      acc += texture2D(tex, uv - vec2(texel.x, 0.0)).rgb * 0.2;
      acc += texture2D(tex, uv + vec2(0.0, texel.y)).rgb * 0.2;
      acc += texture2D(tex, uv - vec2(0.0, texel.y)).rgb * 0.2;
      // Diagonal taps for rounder glow
      vec2 diag = texel * 0.7;
      acc += texture2D(tex, uv + diag).rgb * 0.1;
      acc += texture2D(tex, uv - diag).rgb * 0.1;
      acc += texture2D(tex, uv + vec2(diag.x, -diag.y)).rgb * 0.1;
      acc += texture2D(tex, uv + vec2(-diag.x, diag.y)).rgb * 0.1;
      return acc * smoothstep(uBloomThreshold, uBloomThreshold + 0.42, centerLuma);
    }

    // ACES filmic tone mapping
    vec3 acesToneMap(vec3 x) {
      float a = 2.51;
      float b = 0.03;
      float c = 2.43;
      float d = 0.59;
      float e = 0.14;
      return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
    }

    vec3 applyFinalGrade(vec3 color, vec2 uv) {
      // Tone map — compress HDR into displayable range
      vec3 mapped = acesToneMap(color);

      float luma = dot(mapped, vec3(0.2126, 0.7152, 0.0722));

      // Warm color grade — golden hour push
      vec3 graded = mix(mapped, vec3(luma) * vec3(1.08, 1.03, 0.92), 0.06);
      graded = mix(vec3(luma), graded, 1.14);

      // Speed desaturation — subtle wash at high effectScale (driven externally)
      float speedDesatBlend = (1.0 - uEffectScale) * 0.12;
      graded = mix(graded, vec3(luma), speedDesatBlend);

      // Vignette — cinematic edge darkening
      float vignette = smoothstep(1.1, 0.3, length(uv - 0.5));
      graded *= mix(0.91, 1.0, vignette);

      return clamp(graded, 0.0, 1.0);
    }

    void main() {
      vec2 grid = max(floor(uResolution / uPixelSize), vec2(1.0));
      vec2 sampleUv = floor(vUv * grid) / grid;

      vec3 preGrade = texture2D(tScene, sampleUv).rgb;

      // 0. Radial speed blur — streaks from screen center at high speed
      if (uSpeedBlur > 0.01) {
        vec2 blurDir = (sampleUv - 0.5) * uSpeedBlur * 0.04;
        vec3 blurAcc = preGrade;
        blurAcc += texture2D(tScene, sampleUv - blurDir).rgb;
        blurAcc += texture2D(tScene, sampleUv - blurDir * 2.0).rgb;
        blurAcc += texture2D(tScene, sampleUv - blurDir * 3.0).rgb;
        preGrade = blurAcc * 0.25;
      }

      // 1. Bloom — HDR space, soft 9-tap
      if (uEffectScale > 0.3) {
        vec3 bloom = sampleBloom(tScene, sampleUv, uResolution);
        preGrade += bloom * 0.22 * uEffectScale;
      }

      // 2–3. ACES tone map + warm grade + vignette
      vec3 finalColor = applyFinalGrade(preGrade, vUv);

      // 4. Damage flash
      if (uDamageFlash > 0.01) {
        finalColor = mix(finalColor, vec3(0.85, 0.12, 0.08), uDamageFlash * 0.35);
      }

      // 5. Film grain — scales with effect intensity for gritty texture
      float grain = hash(vUv * uResolution + fract(uTime * 7.3)) - 0.5;
      finalColor += grain * mix(0.06, 0.03, uEffectScale);

      vec3 outputColor = finalColor;

      if (uDebugView > 0.5) {
        float rawDepth = texture2D(tDepth, vUv).r;
        bool hasSurface = rawDepth < 0.99999;
        vec3 sceneColor = texture2D(tScene, vUv).rgb;
        float linearDepth = hasSurface ? linearizeDepth(rawDepth) : uNearFar.y;
        float depth01 = clamp(linearDepth / max(uNearFar.y, 0.00001), 0.0, 1.0);
        float fogFactor = smoothstep(uFogNearFar.x, uFogNearFar.y, linearDepth);
        vec3 worldPosition = hasSurface
          ? reconstructWorldPosition(vUv, rawDepth)
          : vec3(0.0, 0.0, 0.0);
        vec2 waterDebug = hasSurface ? getWaterDebug(worldPosition) : vec2(0.0);
        float luma = dot(sceneColor, vec3(0.2126, 0.7152, 0.0722));
        float height01 = clamp((worldPosition.y + 20.0) / 140.0, 0.0, 1.0);

        if (uDebugView < 1.5) {
          outputColor = sceneColor;
        } else if (uDebugView < 2.5) {
          outputColor = vec3(luma);
        } else if (uDebugView < 3.5) {
          outputColor = hasSurface ? heatRamp(depth01) : vec3(0.98);
        } else if (uDebugView < 4.5) {
          outputColor = hasSurface
            ? mix(vec3(0.05, 0.09, 0.12), vec3(0.98, 0.56, 0.21), fogFactor)
            : vec3(0.0, 0.0, 0.0);
        } else if (uDebugView < 5.5) {
          outputColor = hasSurface
            ? mix(vec3(0.02, 0.03, 0.03), vec3(0.08, 0.88, 0.74), waterDebug.x)
            : vec3(0.0, 0.0, 0.0);
        } else if (uDebugView < 6.5) {
          outputColor = hasSurface
            ? heatRamp(clamp(waterDebug.y / 3.5, 0.0, 1.0))
            : vec3(0.0, 0.0, 0.0);
        } else {
          outputColor = hasSurface ? heatRamp(height01) : vec3(0.0, 0.0, 0.0);
        }
      }

      gl_FragColor = vec4(outputColor, 1.0);
    }
  `,
};

export class GritPostProcess {
  readonly #renderer: THREE.WebGLRenderer;
  readonly #scene: THREE.Scene;
  readonly #camera: THREE.PerspectiveCamera;
  readonly #sceneTarget: THREE.WebGLRenderTarget;
  readonly #quadScene: THREE.Scene;
  readonly #quadCamera: THREE.OrthographicCamera;
  readonly #quadMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  #debugView: RenderDebugViewId = 'final';

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.#renderer = renderer;
    this.#scene = scene;
    this.#camera = camera;

    this.#sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true,
    });
    this.#sceneTarget.depthTexture = new THREE.DepthTexture(1, 1);
    this.#sceneTarget.depthTexture.type = THREE.UnsignedIntType;

    const material = new THREE.ShaderMaterial({
      vertexShader: POST_SHADER.vertexShader,
      fragmentShader: POST_SHADER.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(POST_SHADER.uniforms),
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const uniforms = material.uniforms as typeof POST_SHADER.uniforms;
    uniforms.tScene.value = this.#sceneTarget.texture;
    uniforms.tDepth.value = this.#sceneTarget.depthTexture;

    this.#quadScene = new THREE.Scene();
    this.#quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.#quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    this.#quadScene.add(this.#quadMesh);
  }

  setSize(width: number, height: number): void {
    this.#sceneTarget.setSize(width, height);
    const uniforms = this.#quadMesh.material.uniforms as typeof POST_SHADER.uniforms;
    uniforms.uResolution.value.set(width, height);
    uniforms.uPixelSize.value = 1;
  }

  setDebugView(view: RenderDebugViewId): void {
    this.#debugView = view;
    const uniforms = this.#quadMesh.material.uniforms as typeof POST_SHADER.uniforms;
    uniforms.uDebugView.value = getRenderDebugViewIndex(view);
  }

  getDebugView(): RenderDebugViewId {
    return this.#debugView;
  }

  setWaterDebugPools(pools: WaterPool[]): void {
    const uniforms = this.#quadMesh.material.uniforms as typeof POST_SHADER.uniforms;
    const slots = uniforms.uWaterPools.value;
    const count = Math.min(pools.length, MAX_WATER_DEBUG_POOLS);

    for (let index = 0; index < count; index += 1) {
      const pool = pools[index];
      const slot = slots[index];
      if (!pool || !slot) continue;
      slot.set(
        pool.center.x,
        pool.center.y,
        pool.radius,
        pool.surfaceHeight,
      );
    }

    for (let index = count; index < slots.length; index += 1) {
      slots[index]?.set(0, 0, 0, 0);
    }

    uniforms.uWaterPoolCount.value = count;
  }

  setDamageFlash(intensity: number): void {
    const uniforms = this.#quadMesh.material.uniforms as typeof POST_SHADER.uniforms;
    uniforms.uDamageFlash.value = intensity;
  }

  setEffectScale(scale: number): void {
    const uniforms = this.#quadMesh.material.uniforms as typeof POST_SHADER.uniforms;
    uniforms.uEffectScale.value = scale;
  }

  /** Set radial speed blur intensity (0 = none, ~1 = heavy). */
  setSpeedBlur(intensity: number): void {
    const uniforms = this.#quadMesh.material.uniforms as typeof POST_SHADER.uniforms;
    uniforms.uSpeedBlur.value = intensity;
  }

  /** Scale bloom threshold with scene brightness (sunIntensity 0–2.4). */
  setBloomThreshold(sunIntensity: number): void {
    const uniforms = this.#quadMesh.material.uniforms as typeof POST_SHADER.uniforms;
    // Bright midday (2.4) → threshold 0.5 (suppress over-bloom)
    // Dark night (0.06) → threshold 0.2 (let headlights glow)
    const t = Math.min(sunIntensity / 2.4, 1);
    uniforms.uBloomThreshold.value = 0.2 + t * 0.3;
  }

  render(): void {
    const uniforms = this.#quadMesh.material.uniforms as typeof POST_SHADER.uniforms;
    const fog = this.#scene.fog;

    uniforms.uTime.value += 1 / 60;
    uniforms.uNearFar.value.set(this.#camera.near, this.#camera.far);
    uniforms.uProjectionInverse.value.copy(this.#camera.projectionMatrixInverse);
    uniforms.uCameraMatrixWorld.value.copy(this.#camera.matrixWorld);

    if (fog instanceof THREE.Fog) {
      uniforms.uFogNearFar.value.set(fog.near, fog.far);
    } else {
      uniforms.uFogNearFar.value.set(this.#camera.near, this.#camera.far);
    }

    this.#renderer.setRenderTarget(this.#sceneTarget);
    this.#renderer.clear();
    this.#renderer.render(this.#scene, this.#camera);
    this.#renderer.setRenderTarget(null);
    this.#renderer.render(this.#quadScene, this.#quadCamera);
  }

  dispose(): void {
    this.#sceneTarget.dispose();
    this.#quadMesh.geometry.dispose();
    this.#quadMesh.material.dispose();
  }
}
