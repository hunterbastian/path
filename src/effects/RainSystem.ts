import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';
import { Terrain } from '../world/Terrain';

interface DropRecord {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  speed: number;
  length: number;
  drift: number;
  cachedGroundY: number;
}

const DROP_COUNT = 120;
const FIELD_WIDTH = 92;
const FIELD_DEPTH = 74;
const FIELD_HEIGHT = 46;

// Rain vs snow constants
const RAIN_COLOR = 0xc7d6da;
const SNOW_COLOR = 0xe8e8f0;
const RAIN_OPACITY = 0.22;
const SNOW_OPACITY = 0.16;
const RAIN_SPEED_MIN = 28;
const RAIN_SPEED_MAX = 40;
const SNOW_SPEED_MIN = 8;
const SNOW_SPEED_MAX = 12;
const RAIN_LENGTH_MIN = 2.6;
const RAIN_LENGTH_MAX = 4.4;
const SNOW_LENGTH_MIN = 0.4;
const SNOW_LENGTH_MAX = 0.8;
const RAIN_DRIFT_MIN = 0.82;
const RAIN_DRIFT_MAX = 1.18;
const SNOW_DRIFT_MIN = 1.6;
const SNOW_DRIFT_MAX = 2.8;

export type PrecipitationMode = 'rain' | 'snow';

export class RainSystem {
  readonly #terrain: Terrain;
  readonly #geometry: THREE.BufferGeometry;
  readonly #lines: THREE.LineSegments;
  readonly #material: THREE.LineBasicMaterial;
  readonly #positions: Float32Array;
  readonly #drops: DropRecord[];
  readonly #random = new SeededRandom(0x5241494e);
  readonly #wind = new THREE.Vector3(-2.8, -1, 1.05);
  #densityScale = 1;
  #sampleFrame = 0;
  #mode: PrecipitationMode = 'rain';

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.#terrain = terrain;
    this.#positions = new Float32Array(DROP_COUNT * 2 * 3);
    this.#drops = Array.from({ length: DROP_COUNT }, () => ({
      offsetX: 0,
      offsetY: 0,
      offsetZ: 0,
      speed: 0,
      length: 0,
      drift: 0,
      cachedGroundY: 0,
    }));

    this.#geometry = new THREE.BufferGeometry();
    this.#geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.#positions, 3),
    );

    this.#material = new THREE.LineBasicMaterial({
      color: 0xc7d6da,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });

    this.#lines = new THREE.LineSegments(this.#geometry, this.#material);
    this.#lines.frustumCulled = false;
    scene.add(this.#lines);
  }

  setDensityScale(scale: number): void {
    this.#densityScale = Math.max(0, scale);
    const baseOpacity = this.#mode === 'snow' ? SNOW_OPACITY : RAIN_OPACITY;
    this.#material.opacity =
      baseOpacity * THREE.MathUtils.clamp(0.2 + this.#densityScale * 0.8, 0, 1.5);
  }

  setMode(mode: PrecipitationMode): void {
    if (mode === this.#mode) return;
    this.#mode = mode;
    this.#material.color.setHex(mode === 'snow' ? SNOW_COLOR : RAIN_COLOR);
    // Re-apply opacity for the new base
    this.setDensityScale(this.#densityScale);
  }

  update(dt: number, cameraPosition: THREE.Vector3): void {
    this.#sampleFrame++;
    const anchorX = cameraPosition.x + 8;
    const anchorY = Math.max(cameraPosition.y + 10, 30);
    const anchorZ = cameraPosition.z + 12;
    const activeDrops = Math.min(
      this.#drops.length,
      Math.ceil(this.#drops.length * Math.min(this.#densityScale, 1)),
    );

    for (let index = 0; index < this.#drops.length; index += 1) {
      const positionIndex = index * 6;
      if (index >= activeDrops) {
        this.#positions[positionIndex] = 0;
        this.#positions[positionIndex + 1] = -9999;
        this.#positions[positionIndex + 2] = 0;
        this.#positions[positionIndex + 3] = 0;
        this.#positions[positionIndex + 4] = -9999;
        this.#positions[positionIndex + 5] = 0;
        continue;
      }

      const drop = this.#drops[index];
      if (!drop) continue;

      if (drop.speed === 0) {
        this.#respawnDrop(drop, anchorY, true);
      } else {
        drop.offsetY -= drop.speed * dt;
        drop.offsetX += this.#wind.x * drop.drift * dt;
        drop.offsetZ += this.#wind.z * drop.drift * dt;
      }

      const worldX = anchorX + drop.offsetX;
      const worldY = anchorY + drop.offsetY;
      const worldZ = anchorZ + drop.offsetZ;

      // Stagger terrain queries — only 1/8 of drops re-sample per frame
      if (drop.cachedGroundY === 0 || (index & 7) === (this.#sampleFrame & 7)) {
        drop.cachedGroundY = this.#terrain.getHeightAt(worldX, worldZ) + 2.2;
      }
      const groundY = drop.cachedGroundY;

      if (
        worldY <= groundY ||
        Math.abs(drop.offsetX) > FIELD_WIDTH * 0.62 ||
        Math.abs(drop.offsetZ) > FIELD_DEPTH * 0.62
      ) {
        this.#respawnDrop(drop, anchorY, false);
      }

      const updatedWorldX = anchorX + drop.offsetX;
      const updatedWorldY = anchorY + drop.offsetY;
      const updatedWorldZ = anchorZ + drop.offsetZ;
      const tailX = updatedWorldX - this.#wind.x * 0.08;
      const tailY = updatedWorldY + drop.length;
      const tailZ = updatedWorldZ - this.#wind.z * 0.08;
      this.#positions[positionIndex] = updatedWorldX;
      this.#positions[positionIndex + 1] = updatedWorldY;
      this.#positions[positionIndex + 2] = updatedWorldZ;
      this.#positions[positionIndex + 3] = tailX;
      this.#positions[positionIndex + 4] = tailY;
      this.#positions[positionIndex + 5] = tailZ;
    }

    (
      this.#geometry.attributes.position as THREE.BufferAttribute
    ).needsUpdate = true;
  }

  dispose(): void {
    this.#geometry.dispose();
    this.#material.dispose();
  }

  #respawnDrop(drop: DropRecord, anchorY: number, initial: boolean): void {
    drop.cachedGroundY = 0;
    drop.offsetX = this.#random.signed() * FIELD_WIDTH * 0.5;
    drop.offsetZ = this.#random.signed() * FIELD_DEPTH * 0.5;
    drop.offsetY = initial
      ? this.#random.range(-FIELD_HEIGHT * 0.8, FIELD_HEIGHT * 0.5)
      : this.#random.range(FIELD_HEIGHT * 0.12, FIELD_HEIGHT);
    drop.speed = this.#random.range(28, 40);
    drop.length = this.#random.range(2.6, 4.4);
    drop.drift = this.#random.range(0.82, 1.18);
    if (anchorY + drop.offsetY < 10) {
      drop.offsetY += 10 - (anchorY + drop.offsetY);
    }
  }
}
