import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

const GRIT_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uPixelSize: { value: 2 },
    uColorSteps: { value: 24 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;

    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform vec2 uResolution;
    uniform float uTime;
    uniform float uPixelSize;
    uniform float uColorSteps;

    varying vec2 vUv;

    float hash(vec2 value) {
      value = fract(value * vec2(123.34, 456.21));
      value += dot(value, value + 78.233);
      return fract(value.x * value.y);
    }

    void main() {
      vec2 grid = max(floor(uResolution / uPixelSize), vec2(1.0));
      vec2 sampleUv = floor(vUv * grid) / grid;
      vec3 color = texture2D(tDiffuse, sampleUv).rgb;

      float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
      vec3 graded = mix(color, vec3(luma) * vec3(1.02, 1.0, 0.98), 0.035);
      graded = mix(vec3(luma), graded, 1.09);
      graded.r *= 1.018;
      graded.b *= 1.012;

      float grain = hash(sampleUv * uResolution + uTime * 4.0) - 0.5;
      graded += grain * 0.009;

      float scanline = sin(vUv.y * uResolution.y * 0.42) * 0.0025;
      graded -= scanline;

      graded = floor(clamp(graded, 0.0, 1.0) * uColorSteps) / uColorSteps;

      float vignette = smoothstep(0.92, 0.18, length(vUv - 0.5));
      graded *= mix(0.92, 1.0, vignette);

      gl_FragColor = vec4(clamp(graded, 0.0, 1.0), 1.0);
    }
  `,
};

export class GritPostProcess {
  readonly #composer: EffectComposer;
  readonly #gritPass: ShaderPass;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.#composer = new EffectComposer(renderer);
    this.#composer.addPass(new RenderPass(scene, camera));

    this.#gritPass = new ShaderPass(GRIT_SHADER);
    this.#composer.addPass(this.#gritPass);
  }

  setSize(width: number, height: number): void {
    this.#composer.setSize(width, height);
    const uniforms = this.#gritPass.material.uniforms as typeof GRIT_SHADER.uniforms;
    uniforms.uResolution.value.set(width, height);
    uniforms.uPixelSize.value = width < 900 ? 1.35 : 1.85;
  }

  render(): void {
    const uniforms = this.#gritPass.material.uniforms as typeof GRIT_SHADER.uniforms;
    uniforms.uTime.value += 1 / 60;
    this.#composer.render();
  }

  dispose(): void {
    this.#composer.dispose();
    this.#gritPass.dispose();
  }
}
