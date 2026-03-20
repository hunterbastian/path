import * as THREE from 'three';
import type { WaterPool } from '../world/Water';
import {
  getRenderDebugViewIndex,
  type RenderDebugViewId,
} from './RenderDebugView';

const MAX_WATER_DEBUG_POOLS = 12;

const FULLSCREEN_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

// Pass 1: Bright-pixel extract + horizontal Gaussian blur (writes to half-res)
const BLOOM_EXTRACT_SHADER = {
  uniforms: {
    tScene: { value: null as THREE.Texture | null },
    uSceneRes: { value: new THREE.Vector2(1, 1) },
    uBloomThreshold: { value: 0.38 },
  },
  vertexShader: FULLSCREEN_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tScene;
    uniform vec2 uSceneRes;
    uniform float uBloomThreshold;
    varying vec2 vUv;

    vec3 thresholdSample(vec2 uv) {
      vec3 col = texture2D(tScene, uv).rgb;
      float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
      return col * smoothstep(uBloomThreshold - 0.05, uBloomThreshold + 0.15, luma);
    }

    void main() {
      vec2 texel = 1.0 / uSceneRes;
      // 7-tap horizontal Gaussian, stride 2 full-res pixels for wide soft glow
      vec3 c  = thresholdSample(vUv)                         * 0.2270;
      c += thresholdSample(vUv + vec2(texel.x * 2.0, 0.0))  * 0.1945;
      c += thresholdSample(vUv - vec2(texel.x * 2.0, 0.0))  * 0.1945;
      c += thresholdSample(vUv + vec2(texel.x * 4.0, 0.0))  * 0.1216;
      c += thresholdSample(vUv - vec2(texel.x * 4.0, 0.0))  * 0.1216;
      c += thresholdSample(vUv + vec2(texel.x * 6.0, 0.0))  * 0.0541;
      c += thresholdSample(vUv - vec2(texel.x * 6.0, 0.0))  * 0.0541;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

// Pass 2: Vertical Gaussian blur (half-res → half-res)
const BLOOM_BLUR_SHADER = {
  uniforms: {
    tBloomH: { value: null as THREE.Texture | null },
    uBloomRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: FULLSCREEN_VERT,
  fragmentShader: /* glsl */ `
    uniform sampler2D tBloomH;
    uniform vec2 uBloomRes;
    varying vec2 vUv;

    void main() {
      vec2 texel = 1.0 / uBloomRes;
      // 7-tap vertical Gaussian
      vec3 c  = texture2D(tBloomH, vUv).rgb                         * 0.2270;
      c += texture2D(tBloomH, vUv + vec2(0.0, texel.y * 1.0)).rgb  * 0.1945;
      c += texture2D(tBloomH, vUv - vec2(0.0, texel.y * 1.0)).rgb  * 0.1945;
      c += texture2D(tBloomH, vUv + vec2(0.0, texel.y * 2.0)).rgb  * 0.1216;
      c += texture2D(tBloomH, vUv - vec2(0.0, texel.y * 2.0)).rgb  * 0.1216;
      c += texture2D(tBloomH, vUv + vec2(0.0, texel.y * 3.0)).rgb  * 0.0541;
      c += texture2D(tBloomH, vUv - vec2(0.0, texel.y * 3.0)).rgb  * 0.0541;
      gl_FragColor = vec4(c, 1.0);
    }
  `,
};

// Pass 3: Composite (full-res) — scene + bloom + tone map + effects
const POST_SHADER = {
  uniforms: {
    tScene: { value: null as THREE.Texture | null },
    tBloom: { value: null as THREE.Texture | null },
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
    uSpeedBlur: { value: 0 },
  },
  vertexShader: FULLSCREEN_VERT,
  fragmentShader: /* glsl */ `
    #define MAX_WATER_DEBUG_POOLS ${MAX_WATER_DEBUG_POOLS}

    uniform sampler2D tScene;
    uniform sampler2D tBloom;
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

      // Color grade — subtle warmth, vivid saturation
      vec3 graded = mix(mapped, vec3(luma) * vec3(1.04, 1.02, 0.96), 0.04);
      graded = mix(vec3(luma), graded, 1.18);

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

      // 1. Bloom — pre-blurred half-res texture (separable Gaussian, 2-pass)
      if (uEffectScale > 0.3) {
        vec3 bloom = texture2D(tBloom, sampleUv).rgb;
        preGrade += bloom * 0.35 * uEffectScale;
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
  readonly #bloomTargetA: THREE.WebGLRenderTarget;
  readonly #bloomTargetB: THREE.WebGLRenderTarget;
  readonly #quadScene: THREE.Scene;
  readonly #bloomExtractScene: THREE.Scene;
  readonly #bloomBlurScene: THREE.Scene;
  readonly #quadCamera: THREE.OrthographicCamera;
  readonly #quadMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly #bloomExtractMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  readonly #bloomBlurMesh: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  #debugView: RenderDebugViewId = 'final';
  #bloomThreshold = 0.38;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.#renderer = renderer;
    this.#scene = scene;
    this.#camera = camera;

    // Full-res scene target with depth
    this.#sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      depthBuffer: true,
    });
    this.#sceneTarget.depthTexture = new THREE.DepthTexture(1, 1);
    this.#sceneTarget.depthTexture.type = THREE.UnsignedIntType;

    // Half-res bloom ping-pong targets (no depth needed)
    const bloomOpts = {
      depthBuffer: false,
      generateMipmaps: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    };
    this.#bloomTargetA = new THREE.WebGLRenderTarget(1, 1, bloomOpts);
    this.#bloomTargetB = new THREE.WebGLRenderTarget(1, 1, bloomOpts);

    // Shared ortho camera for all fullscreen passes
    this.#quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    // Bloom extract mesh (bright extract + horizontal Gaussian)
    const extractMaterial = new THREE.ShaderMaterial({
      vertexShader: BLOOM_EXTRACT_SHADER.vertexShader,
      fragmentShader: BLOOM_EXTRACT_SHADER.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(BLOOM_EXTRACT_SHADER.uniforms),
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.#bloomExtractScene = new THREE.Scene();
    this.#bloomExtractMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), extractMaterial);
    this.#bloomExtractScene.add(this.#bloomExtractMesh);

    // Bloom blur mesh (vertical Gaussian)
    const blurMaterial = new THREE.ShaderMaterial({
      vertexShader: BLOOM_BLUR_SHADER.vertexShader,
      fragmentShader: BLOOM_BLUR_SHADER.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(BLOOM_BLUR_SHADER.uniforms),
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    this.#bloomBlurScene = new THREE.Scene();
    this.#bloomBlurMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), blurMaterial);
    this.#bloomBlurScene.add(this.#bloomBlurMesh);

    // Composite mesh
    const compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: POST_SHADER.vertexShader,
      fragmentShader: POST_SHADER.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(POST_SHADER.uniforms),
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    });
    const uniforms = compositeMaterial.uniforms as typeof POST_SHADER.uniforms;
    uniforms.tScene.value = this.#sceneTarget.texture;
    uniforms.tDepth.value = this.#sceneTarget.depthTexture;
    uniforms.tBloom.value = this.#bloomTargetB.texture;

    this.#quadScene = new THREE.Scene();
    this.#quadMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), compositeMaterial);
    this.#quadScene.add(this.#quadMesh);
  }

  setSize(width: number, height: number): void {
    this.#sceneTarget.setSize(width, height);

    const hw = Math.max(1, Math.floor(width / 2));
    const hh = Math.max(1, Math.floor(height / 2));
    this.#bloomTargetA.setSize(hw, hh);
    this.#bloomTargetB.setSize(hw, hh);

    const extractUniforms = this.#bloomExtractMesh.material
      .uniforms as typeof BLOOM_EXTRACT_SHADER.uniforms;
    extractUniforms.uSceneRes.value.set(width, height);

    const blurUniforms = this.#bloomBlurMesh.material
      .uniforms as typeof BLOOM_BLUR_SHADER.uniforms;
    blurUniforms.uBloomRes.value.set(hw, hh);

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
    // Bright midday (2.4) → threshold 0.5 (suppress over-bloom)
    // Dark night (0.06) → threshold 0.2 (let headlights glow)
    const t = Math.min(sunIntensity / 2.4, 1);
    this.#bloomThreshold = 0.2 + t * 0.3;
  }

  render(frameSeconds: number): void {
    const compositeUniforms = this.#quadMesh.material.uniforms as typeof POST_SHADER.uniforms;
    const extractUniforms = this.#bloomExtractMesh.material
      .uniforms as typeof BLOOM_EXTRACT_SHADER.uniforms;
    const blurUniforms = this.#bloomBlurMesh.material
      .uniforms as typeof BLOOM_BLUR_SHADER.uniforms;
    const fog = this.#scene.fog;

    compositeUniforms.uTime.value += frameSeconds;
    compositeUniforms.uNearFar.value.set(this.#camera.near, this.#camera.far);
    compositeUniforms.uProjectionInverse.value.copy(this.#camera.projectionMatrixInverse);
    compositeUniforms.uCameraMatrixWorld.value.copy(this.#camera.matrixWorld);

    if (fog instanceof THREE.Fog) {
      compositeUniforms.uFogNearFar.value.set(fog.near, fog.far);
    } else {
      compositeUniforms.uFogNearFar.value.set(this.#camera.near, this.#camera.far);
    }

    // Pass 1: Render 3D scene → full-res sceneTarget
    this.#renderer.setRenderTarget(this.#sceneTarget);
    this.#renderer.clear();
    this.#renderer.render(this.#scene, this.#camera);

    // Pass 2: Extract bright pixels + horizontal Gaussian → half-res bloomTargetA
    extractUniforms.tScene.value = this.#sceneTarget.texture;
    extractUniforms.uBloomThreshold.value = this.#bloomThreshold;
    this.#renderer.setRenderTarget(this.#bloomTargetA);
    this.#renderer.clear();
    this.#renderer.render(this.#bloomExtractScene, this.#quadCamera);

    // Pass 3: Vertical Gaussian → half-res bloomTargetB
    blurUniforms.tBloomH.value = this.#bloomTargetA.texture;
    this.#renderer.setRenderTarget(this.#bloomTargetB);
    this.#renderer.clear();
    this.#renderer.render(this.#bloomBlurScene, this.#quadCamera);

    // Pass 4: Composite (scene + bloom + effects) → screen
    this.#renderer.setRenderTarget(null);
    this.#renderer.render(this.#quadScene, this.#quadCamera);
  }

  dispose(): void {
    this.#sceneTarget.dispose();
    this.#bloomTargetA.dispose();
    this.#bloomTargetB.dispose();
    this.#bloomExtractMesh.geometry.dispose();
    this.#bloomExtractMesh.material.dispose();
    this.#bloomBlurMesh.geometry.dispose();
    this.#bloomBlurMesh.material.dispose();
    this.#quadMesh.geometry.dispose();
    this.#quadMesh.material.dispose();
  }
}
