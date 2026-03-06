import * as THREE from 'three';
import { GritPostProcess } from '../render/GritPostProcess';

export class Engine {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly postProcess: GritPostProcess;
  readonly #container: HTMLElement;
  readonly #resizeObserver: ResizeObserver;

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

    this.#resizeObserver = new ResizeObserver(() => {
      this.#resize();
    });
    this.#resizeObserver.observe(container);
    this.#resize();
  }

  render(): void {
    this.postProcess.render();
  }

  dispose(): void {
    this.#resizeObserver.disconnect();
    this.postProcess.dispose();
    this.renderer.dispose();
  }

  #resize(): void {
    const width = Math.max(this.#container.clientWidth, 1);
    const height = Math.max(this.#container.clientHeight, 1);

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.setSize(width, height, false);
    this.postProcess.setSize(width, height);
  }
}
