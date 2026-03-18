import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';
import { SEA_LEVEL, Terrain, type BiomeType } from './Terrain';

/**
 * WildflowerField — tiny colored dots scattered across meadow and grass surfaces.
 * Yellow, white, purple, pink specks at ground level. Instanced quads, single draw call.
 * Ghibli "living meadow" feel.
 */

const MAX_FLOWERS = 400;
const DRAW_DISTANCE_SQ = 120 * 120;
const SHOW_DISTANCE_SQ = 110 * 110;

interface FlowerPatch {
  x: number;
  z: number;
  y: number;
  color: THREE.Color;
  size: number;
  phase: number;
}

const FLOWER_COLORS = [
  0xe0c048,  // dried buttercup
  0xf0e8d0,  // pale straw
  0xc09870,  // dusty mauve
  0xd8b888,  // faded tan
  0xe0b040,  // ochre
  0xe8e0d0,  // bleached white
  0xb8a080,  // dusty sage
  0xd0a838,  // amber gold
];

export class WildflowerField {
  readonly #terrain: Terrain;
  readonly #mesh: THREE.InstancedMesh;
  readonly #patches: FlowerPatch[];
  readonly #hidden: boolean[];
  readonly #dummy = new THREE.Object3D();
  readonly #hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  #time = 0;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.#terrain = terrain;
    this.#patches = this.#placePatch(terrain);
    this.#hidden = new Array(this.#patches.length).fill(true);

    // Tiny flat quad — billboard-style
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);

    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      transparent: true,
      alphaTest: 0.1,
      side: THREE.DoubleSide,
      emissive: 0x404020,
      emissiveIntensity: 0.3,
    });

    this.#mesh = new THREE.InstancedMesh(geo, mat, this.#patches.length);
    this.#mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#mesh.frustumCulled = false;
    this.#mesh.castShadow = false;
    this.#mesh.receiveShadow = false;

    // Set per-instance colors
    for (let i = 0; i < this.#patches.length; i++) {
      this.#mesh.setColorAt(i, this.#patches[i]!.color);
      this.#mesh.setMatrixAt(i, this.#hiddenMatrix);
    }
    if (this.#mesh.instanceColor) this.#mesh.instanceColor.needsUpdate = true;

    scene.add(this.#mesh);
  }

  update(dt: number, cameraPosition: THREE.Vector3): void {
    this.#time += dt;
    const camX = cameraPosition.x;
    const camZ = cameraPosition.z;
    let changed = false;

    for (let i = 0; i < this.#patches.length; i++) {
      const p = this.#patches[i]!;
      const dx = camX - p.x;
      const dz = camZ - p.z;
      const distSq = dx * dx + dz * dz;

      if (!this.#hidden[i] && distSq > DRAW_DISTANCE_SQ) {
        this.#mesh.setMatrixAt(i, this.#hiddenMatrix);
        this.#hidden[i] = true;
        changed = true;
      } else if (this.#hidden[i] && distSq < SHOW_DISTANCE_SQ) {
        // Gentle sway
        const sway = Math.sin(this.#time * 1.2 + p.phase) * 0.04;
        this.#dummy.position.set(p.x, p.y, p.z);
        this.#dummy.rotation.set(sway, p.phase, sway * 0.5);
        this.#dummy.scale.setScalar(p.size);
        this.#dummy.updateMatrix();
        this.#mesh.setMatrixAt(i, this.#dummy.matrix);
        this.#hidden[i] = false;
        changed = true;
      }
    }

    if (changed) {
      this.#mesh.instanceMatrix.needsUpdate = true;
    }
  }

  dispose(): void {
    this.#mesh.geometry.dispose();
    (this.#mesh.material as THREE.Material).dispose();
    this.#mesh.removeFromParent();
  }

  #placePatch(terrain: Terrain): FlowerPatch[] {
    const random = new SeededRandom(0x464C5752);
    const patches: FlowerPatch[] = [];
    const halfSize = terrain.size * 0.44;

    for (let attempt = 0; attempt < 6000 && patches.length < MAX_FLOWERS; attempt++) {
      const x = random.range(-halfSize, halfSize);
      const z = random.range(-halfSize, halfSize);
      if (!terrain.isWithinBounds(x, z)) continue;

      const surface = terrain.getSurfaceAt(x, z);
      if (surface !== 'grass') continue;

      const height = terrain.getHeightAt(x, z);
      if (height < SEA_LEVEL + 1) continue;
      if (height > 50) continue;

      const slope = 1 - terrain.getNormalAt(x, z).y;
      if (slope > 0.2) continue;

      const roadInfluence = terrain.getRoadInfluence(x, z);
      if (roadInfluence > 0.25) continue;

      const { biome, influence } = terrain.getBiomeAt(x, z);

      // Flowers concentrate in meadow, sparse elsewhere
      let chance: number;
      if (biome === 'meadow' && influence > 0.2) {
        chance = 0.7;
      } else if (biome === 'hollow') {
        chance = 0.15; // sparse in dark hollow
      } else if (biome === 'desert') {
        chance = 0.05; // almost none in desert
      } else {
        chance = 0.35;
      }
      if (random.next() > chance) continue;

      // Minimum spacing — flowers cluster but don't overlap
      let tooClose = false;
      for (let j = patches.length - 1; j >= Math.max(0, patches.length - 20); j--) {
        const ex = patches[j]!;
        const ddx = ex.x - x;
        const ddz = ex.z - z;
        if (ddx * ddx + ddz * ddz < 2.5) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // Biome-aware color selection
      const colorIndex = biome === 'hollow'
        ? (random.next() < 0.6 ? 6 : 5)  // mostly lavender and pale white
        : Math.floor(random.next() * FLOWER_COLORS.length);

      patches.push({
        x,
        z,
        y: height + 0.06,
        color: new THREE.Color(FLOWER_COLORS[colorIndex]!),
        size: 0.18 + random.next() * 0.22,
        phase: random.range(0, Math.PI * 2),
      });
    }

    return patches;
  }
}
