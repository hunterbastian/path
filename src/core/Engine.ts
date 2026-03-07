import * as THREE from 'three';
import { GritPostProcess } from '../render/GritPostProcess';

const MAX_RENDER_PIXEL_RATIO = 1.35;
const MIN_RENDER_PIXEL_RATIO = 0.85;
const SLOW_FRAME_SECONDS = 1 / 52;
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

  constructor(container: HTMLElement) {
    this.#container = container;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.1, 2400);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';

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

  render(frameSeconds = 1 / 60): void {
    this.#updateAdaptiveQuality(frameSeconds);
    this.postProcess.render();
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

    if (this.#slowFrameCount >= 8 && this.#currentPixelRatio > this.#minPixelRatio) {
      this.#currentPixelRatio = Math.max(
        this.#minPixelRatio,
        this.#currentPixelRatio - 0.08,
      );
      this.#slowFrameCount = 0;
      this.#applyRenderScale();
      return;
    }

    if (this.#fastFrameCount >= 48 && this.#currentPixelRatio < this.#maxPixelRatio) {
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
