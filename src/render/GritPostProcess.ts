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
    uPixelSize: { value: 2 },
    uColorSteps: { value: 24 },
    uDebugView: { value: 0 },
    uNearFar: { value: new THREE.Vector2(0.1, 2400) },
    uFogNearFar: { value: new THREE.Vector2(46, 430) },
    uProjectionInverse: { value: new THREE.Matrix4() },
    uCameraMatrixWorld: { value: new THREE.Matrix4() },
    uWaterPoolCount: { value: 0 },
    uWaterPools: {
      value: Array.from({ length: MAX_WATER_DEBUG_POOLS }, () => new THREE.Vector4()),
    },
    uDamageFlash: { value: 0 },
    uSpeedIntensity: { value: 0 },
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
    uniform float uSpeedIntensity;

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

    vec3 applyFinalGrade(vec3 color, vec2 uv, vec2 sampleUv) {
      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      vec3 graded = mix(color, vec3(luma) * vec3(1.02, 1.0, 0.98), 0.035);
      graded = mix(vec3(luma), graded, 1.09);
      graded.r *= 1.018;
      graded.b *= 1.012;

      float grain = hash(sampleUv * uResolution + uTime * 4.0) - 0.5;
      graded += grain * 0.009;

      float scanline = sin(uv.y * uResolution.y * 0.42) * 0.0025;
      graded -= scanline;

      graded = floor(clamp(graded, 0.0, 1.0) * uColorSteps) / uColorSteps;

      float vignette = smoothstep(0.92, 0.18, length(uv - 0.5));
      graded *= mix(0.92, 1.0, vignette);

      return clamp(graded, 0.0, 1.0);
    }

    void main() {
      vec2 grid = max(floor(uResolution / uPixelSize), vec2(1.0));
      vec2 sampleUv = floor(vUv * grid) / grid;
      vec3 sceneColor = texture2D(tScene, vUv).rgb;
      vec3 finalColor = applyFinalGrade(texture2D(tScene, sampleUv).rgb, vUv, sampleUv);
      float rawDepth = texture2D(tDepth, vUv).r;
      bool hasSurface = rawDepth < 0.99999;

      vec3 outputColor = finalColor;

      if (uDebugView > 0.5) {
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

      // Damage flash — red vignette from screen edges
      if (uDamageFlash > 0.01) {
        float edgeDist = length(vUv - 0.5) * 2.0;
        float flashMask = smoothstep(0.3, 1.2, edgeDist);
        outputColor = mix(outputColor, vec3(0.6, 0.04, 0.02), flashMask * uDamageFlash * 0.6);
      }

      // Speed vignette — subtle tunnel vision at high speed
      if (uSpeedIntensity > 0.01) {
        float speedEdge = length(vUv - 0.5) * 2.0;
        float speedDarken = smoothstep(0.6, 1.4, speedEdge) * uSpeedIntensity * 0.18;
        outputColor *= 1.0 - speedDarken;
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
    uniforms.uPixelSize.value = width < 900 ? 1.35 : 1.85;
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

  setSpeedIntensity(intensity: number): void {
    const uniforms = this.#quadMesh.material.uniforms as typeof POST_SHADER.uniforms;
    uniforms.uSpeedIntensity.value = intensity;
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
