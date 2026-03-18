import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';
import { sampleBiome, type BiomeName } from './BiomeConfig';

interface CloudInstance {
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  speedX: number;
  speedZ: number;
}

/** Maximum cloud candidates to evaluate (actual count may be lower after biome filtering). */
const CLOUD_CANDIDATES = 36;
const DRIFT_WRAP = 700; // wrap distance from center

/** Cloud spawn density per biome (probability that a candidate survives). */
const BIOME_CLOUD_DENSITY: Record<BiomeName, number> = {
  'alpine-meadows': 1.0,
  'canyon': 0.4,
  'salt-flats': 0.15,
  'jagged-peaks': 1.0,   // capped at 1.0 but we generate extra candidates
  'coast': 1.0,
};

/** Per-biome altitude adjustment (added to base Y range). */
const BIOME_CLOUD_ALTITUDE: Record<BiomeName, { min: number; max: number }> = {
  'alpine-meadows': { min: 115, max: 195 },
  'canyon': { min: 115, max: 195 },
  'salt-flats': { min: 115, max: 195 },
  'jagged-peaks': { min: 80, max: 140 },   // lower altitude, hugging peaks
  'coast': { min: 70, max: 140 },           // lower altitude, coastal mist
};

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

    const random = new SeededRandom(0x434c4f55);
    const accepted: CloudInstance[] = [];

    // Generate more candidates than we need; biome density filtering will cull some
    for (let i = 0; i < CLOUD_CANDIDATES; i++) {
      const angle = random.next() * Math.PI * 2;
      const radius = random.range(80, 580);
      const cx = Math.cos(angle) * radius;
      const cz = Math.sin(angle) * radius;

      // Sample biome below this cloud position
      const biomeSample = sampleBiome(cx, cz);
      const biomeName = biomeSample.primary.name;
      const density = BIOME_CLOUD_DENSITY[biomeName];

      // Skip cloud based on biome density probability
      if (random.next() > density) continue;

      // Altitude adjusted per biome
      const alt = BIOME_CLOUD_ALTITUDE[biomeName];
      const y = random.range(alt.min, alt.max);

      accepted.push({
        x: cx,
        y,
        z: cz,
        width: random.range(45, 100),
        height: random.range(18, 38),
        speedX: random.range(0.8, 2.8) * (random.next() > 0.5 ? 1 : -0.3),
        speedZ: random.range(-0.4, 0.6),
      });
    }

    this.#clouds = accepted;
    this.#mesh = new THREE.InstancedMesh(geometry, material, accepted.length);
    this.#mesh.frustumCulled = false;
    this.#mesh.renderOrder = -1;
    scene.add(this.#mesh);
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
