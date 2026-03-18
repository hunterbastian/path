import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';

interface CloudInstance {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  speedX: number;
  speedZ: number;
}

const CLOUD_COUNT = 24;
const DRIFT_WRAP = 700; // wrap distance from center

export class CloudSystem {
  readonly #mesh: THREE.InstancedMesh;
  readonly #clouds: CloudInstance[];
  readonly #dummy = new THREE.Object3D();

  constructor(scene: THREE.Scene) {
    const texture = CloudSystem.#generateTexture();
    const geometry = new THREE.PlaneGeometry(1, 1);
    const material = new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });

    this.#mesh = new THREE.InstancedMesh(geometry, material, CLOUD_COUNT);
    this.#mesh.frustumCulled = false;
    this.#mesh.renderOrder = -1;
    scene.add(this.#mesh);

    const random = new SeededRandom(0x434c4f55);
    this.#clouds = [];
    for (let i = 0; i < CLOUD_COUNT; i++) {
      // Scatter in a large area above the terrain
      const angle = random.next() * Math.PI * 2;
      const radius = random.range(80, 580);
      this.#clouds.push({
        x: Math.cos(angle) * radius,
        y: random.range(115, 195),
        z: Math.sin(angle) * radius,
        width: random.range(45, 100),
        height: random.range(18, 38),
        speedX: random.range(0.8, 2.8) * (random.next() > 0.5 ? 1 : -0.3),
        speedZ: random.range(-0.4, 0.6),
      });
    }
  }

  update(dt: number, camera: THREE.Camera, sunIntensity: number): void {
    for (let i = 0; i < this.#clouds.length; i++) {
      const cloud = this.#clouds[i]!;

      // Drift with wind
      cloud.x += cloud.speedX * dt;
      cloud.z += cloud.speedZ * dt;

      // Wrap around
      if (cloud.x > DRIFT_WRAP) cloud.x -= DRIFT_WRAP * 2;
      if (cloud.x < -DRIFT_WRAP) cloud.x += DRIFT_WRAP * 2;
      if (cloud.z > DRIFT_WRAP) cloud.z -= DRIFT_WRAP * 2;
      if (cloud.z < -DRIFT_WRAP) cloud.z += DRIFT_WRAP * 2;

      // Billboard toward camera
      this.#dummy.position.set(cloud.x, cloud.y, cloud.z);
      this.#dummy.lookAt(camera.position.x, cloud.y, camera.position.z);
      this.#dummy.scale.set(cloud.width, cloud.height, 1);
      this.#dummy.updateMatrix();
      this.#mesh.setMatrixAt(i, this.#dummy.matrix);
    }

    // Fade clouds at night
    const mat = this.#mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = THREE.MathUtils.lerp(0.08, 0.82, THREE.MathUtils.clamp(sunIntensity / 2, 0, 1));

    this.#mesh.instanceMatrix.needsUpdate = true;
  }

  dispose(): void {
    const mat = this.#mesh.material as THREE.MeshBasicMaterial;
    mat.map?.dispose();
    mat.dispose();
    this.#mesh.geometry.dispose();
    this.#mesh.removeFromParent();
  }

  /** Generate a soft cumulus cloud texture on a canvas. */
  static #generateTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, size, size);

    // Overlapping radial gradients for a puffy cumulus shape
    const blobs = [
      { x: 0.50, y: 0.52, r: 0.30 },
      { x: 0.34, y: 0.56, r: 0.22 },
      { x: 0.66, y: 0.54, r: 0.24 },
      { x: 0.44, y: 0.40, r: 0.20 },
      { x: 0.58, y: 0.42, r: 0.18 },
      { x: 0.26, y: 0.60, r: 0.16 },
      { x: 0.74, y: 0.58, r: 0.18 },
      { x: 0.50, y: 0.34, r: 0.14 },
    ];

    for (const blob of blobs) {
      const cx = blob.x * size;
      const cy = blob.y * size;
      const rr = blob.r * size;
      const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, rr);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
      gradient.addColorStop(0.4, 'rgba(255, 255, 255, 0.50)');
      gradient.addColorStop(0.75, 'rgba(255, 255, 255, 0.15)');
      gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, size, size);
    }

    // Subtle bottom shadow for depth
    const shadow = ctx.createLinearGradient(0, size * 0.5, 0, size);
    shadow.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shadow.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = shadow;
    ctx.fillRect(0, 0, size, size);

    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }
}
