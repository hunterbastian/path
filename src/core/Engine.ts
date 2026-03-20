import * as THREE from 'three';
import { GritPostProcess } from '../render/GritPostProcess';

const MAX_RENDER_PIXEL_RATIO = 1.15;
const MIN_RENDER_PIXEL_RATIO = 0.6;
const SLOW_FRAME_SECONDS = 1 / 58;
const FAST_FRAME_SECONDS = 1 / 72;

export class Engine {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly postProcess: GritPostProcess;
  readonly #container: HTMLElement;
  readonly #resizeObserver: ResizeObserver;
  readonly #drawingBufferSize = new THREE.Vector2();
  #containerWidth = 1;
  #containerHeight = 1;
  #currentPixelRatio = 1;
  #maxPixelRatio = 1;
  #minPixelRatio = MIN_RENDER_PIXEL_RATIO;
  #appliedPixelRatio = 0;
  #frameTimeAverage = 1 / 60;
  #slowFrameCount = 0;
  #fastFrameCount = 0;
  /** Whether post-processing is bypassed (low-perf fallback). */
  #bypassPostProcess = false;

  constructor(container: HTMLElement) {
    this.#container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.5, 1200);
    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    // Tone mapping handled in post-process shader (GritPostProcess) for HDR bloom
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

    this.renderer.domElement.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      console.warn('WebGL context lost — game paused');
    });

    this.renderer.domElement.addEventListener('webglcontextrestored', () => {
      console.info('WebGL context restored');
    });

    this.postProcess = new GritPostProcess(
      this.renderer,
      this.scene,
      this.camera,
    );

    this.#syncPixelRatioBounds();
    this.#resizeObserver = new ResizeObserver(() => {
      this.#resize();
    });
    this.#resizeObserver.observe(container);
    this.#resize();
  }

  async init(): Promise<void> {
    // No-op for WebGL — WebGPURenderer needs async init, WebGL does not.
  }

  render(frameSeconds = 1 / 60): void {
    this.#updateAdaptiveQuality(frameSeconds);
    const scale = this.effectScale;
    const shouldBypass = scale <= 0.35;

    // Toggle tone mapping only on state transition to avoid shader recompilation
    if (shouldBypass !== this.#bypassPostProcess) {
      this.#bypassPostProcess = shouldBypass;
      this.renderer.toneMapping = shouldBypass
        ? THREE.ACESFilmicToneMapping
        : THREE.NoToneMapping;
    }

    if (shouldBypass) {
      this.renderer.setRenderTarget(null);
      this.renderer.render(this.scene, this.camera);
    } else {
      this.postProcess.setEffectScale(scale);
      this.postProcess.render(frameSeconds);
    }
  }

  get effectScale(): number {
    const target = 1 / 60;
    const slow = 1 / 30;
    return THREE.MathUtils.clamp(
      1 - (this.#frameTimeAverage - target) / (slow - target),
      0.3,
      1,
    );
  }

  setQualityPreset(preset: 'low' | 'medium' | 'high'): void {
    switch (preset) {
      case 'low':
        this.#maxPixelRatio = 0.8;
        this.#minPixelRatio = 0.5;
        this.renderer.shadowMap.enabled = false;
        break;
      case 'medium':
        this.#maxPixelRatio = MAX_RENDER_PIXEL_RATIO;
        this.#minPixelRatio = MIN_RENDER_PIXEL_RATIO;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFShadowMap;
        break;
      case 'high':
        this.#maxPixelRatio = Math.min(window.devicePixelRatio, 2);
        this.#minPixelRatio = 1;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        break;
    }
    this.#syncPixelRatioBounds();
  }

  dispose(): void {
    this.#resizeObserver.disconnect();
    this.postProcess.dispose();
    this.renderer.dispose();
  }

  #resize(): void {
    this.#containerWidth = Math.max(this.#container.clientWidth, 1);
    this.#containerHeight = Math.max(this.#container.clientHeight, 1);
    this.#syncPixelRatioBounds();

    this.camera.aspect = this.#containerWidth / this.#containerHeight;
    this.camera.updateProjectionMatrix();
    this.#applyRenderScale(true);
  }

  #syncPixelRatioBounds(): void {
    const devicePixelRatio = Math.max(window.devicePixelRatio || 1, 1);
    this.#maxPixelRatio = Math.min(devicePixelRatio, MAX_RENDER_PIXEL_RATIO);
    this.#minPixelRatio = Math.min(this.#maxPixelRatio, MIN_RENDER_PIXEL_RATIO);
    this.#currentPixelRatio = THREE.MathUtils.clamp(
      this.#currentPixelRatio || this.#maxPixelRatio,
      this.#minPixelRatio,
      this.#maxPixelRatio,
    );
  }

  #updateAdaptiveQuality(frameSeconds: number): void {
    if (frameSeconds <= 0 || frameSeconds >= 0.05) {
      return;
    }

    this.#frameTimeAverage = THREE.MathUtils.lerp(
      this.#frameTimeAverage,
      frameSeconds,
      0.12,
    );

    if (this.#frameTimeAverage > SLOW_FRAME_SECONDS) {
      this.#slowFrameCount += 1;
      this.#fastFrameCount = 0;
    } else if (this.#frameTimeAverage < FAST_FRAME_SECONDS) {
      this.#fastFrameCount += 1;
      this.#slowFrameCount = 0;
    } else {
      this.#slowFrameCount = Math.max(0, this.#slowFrameCount - 1);
      this.#fastFrameCount = Math.max(0, this.#fastFrameCount - 1);
    }

    if (this.#slowFrameCount >= 3 && this.#currentPixelRatio > this.#minPixelRatio) {
      this.#currentPixelRatio = Math.max(
        this.#minPixelRatio,
        this.#currentPixelRatio - 0.15,
      );
      this.#slowFrameCount = 0;
      this.#applyRenderScale();
      return;
    }

    if (this.#fastFrameCount >= 24 && this.#currentPixelRatio < this.#maxPixelRatio) {
      this.#currentPixelRatio = Math.min(
        this.#maxPixelRatio,
        this.#currentPixelRatio + 0.04,
      );
      this.#fastFrameCount = 0;
      this.#applyRenderScale();
    }
  }

  #applyRenderScale(force = false): void {
    if (
      !force &&
      Math.abs(this.#appliedPixelRatio - this.#currentPixelRatio) < 0.01
    ) {
      return;
    }

    this.renderer.setPixelRatio(this.#currentPixelRatio);
    this.renderer.setSize(this.#containerWidth, this.#containerHeight, false);
    this.renderer.getDrawingBufferSize(this.#drawingBufferSize);
    this.postProcess.setSize(
      this.#drawingBufferSize.x,
      this.#drawingBufferSize.y,
    );
    this.#appliedPixelRatio = this.#currentPixelRatio;
  }
}
