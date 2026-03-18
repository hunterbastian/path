import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';
import { SEA_LEVEL, Terrain, type BiomeType } from './Terrain';

/**
 * TreeSystem — instanced pine/spruce trees scattered across the landscape.
 * Ghibli-style conical conifers with layered canopy tiers.
 * Single draw call per mesh type via InstancedMesh.
 */

const MAX_TREES = 220;
const LOD_HIDE_DISTANCE_SQ = 220 * 220;
const LOD_SHOW_DISTANCE_SQ = 200 * 200;

interface TreeInstance {
  x: number;
  z: number;
  y: number;
  scale: number;
  yaw: number;
  biome: BiomeType;
}

export class TreeSystem {
  readonly #terrain: Terrain;
  readonly #trunkMesh: THREE.InstancedMesh;
  readonly #canopyMeshes: THREE.InstancedMesh[];
  readonly #trees: TreeInstance[] = [];
  readonly #dummy = new THREE.Object3D();
  readonly #hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  readonly #visible: boolean[];

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.#terrain = terrain;
    this.#trees = this.#placeTreeInstances(terrain);
    this.#visible = new Array(this.#trees.length).fill(false);

    // Trunk — cylinder, dark brown
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.25, 3.5, 6);
    trunkGeo.translate(0, 1.75, 0);
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x503828 });
    this.#trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, this.#trees.length);
    this.#trunkMesh.frustumCulled = false;
    this.#trunkMesh.castShadow = true;
    this.#trunkMesh.receiveShadow = false;
    scene.add(this.#trunkMesh);

    // Canopy — 3 stacked cone layers for Ghibli pine silhouette
    const canopyLayers = [
      { radius: 2.2, height: 3.5, y: 5.8 },   // bottom — widest
      { radius: 1.6, height: 3.0, y: 7.8 },   // middle
      { radius: 1.0, height: 2.5, y: 9.5 },   // top — smallest
    ];

    this.#canopyMeshes = canopyLayers.map((layer) => {
      const geo = new THREE.ConeGeometry(layer.radius, layer.height, 8);
      geo.translate(0, layer.y, 0);
      const mat = new THREE.MeshLambertMaterial({
        color: 0x607040,
        emissive: new THREE.Color(0x3a3820),
        emissiveIntensity: 0.18,
      });
      const mesh = new THREE.InstancedMesh(geo, mat, this.#trees.length);
      mesh.frustumCulled = false;
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      scene.add(mesh);
      return mesh;
    });

    // Set biome-tinted colors per instance
    const meadowGreen = new THREE.Color(0x708848);   // olive
    const hollowGreen = new THREE.Color(0x485838);   // dark sage
    const defaultGreen = new THREE.Color(0x607040);   // muted sage
    const desertGreen = new THREE.Color(0x788048);    // dusty olive
    const tempColor = new THREE.Color();

    for (let i = 0; i < this.#trees.length; i++) {
      const tree = this.#trees[i]!;
      const base = tree.biome === 'meadow' ? meadowGreen
        : tree.biome === 'hollow' ? hollowGreen
        : tree.biome === 'desert' ? desertGreen
        : defaultGreen;
      // Slight per-tree variation
      tempColor.copy(base).offsetHSL(
        (tree.yaw * 0.01) % 0.02 - 0.01,
        (tree.scale - 1) * 0.08,
        (tree.yaw * 0.007) % 0.04 - 0.02,
      );
      for (const canopy of this.#canopyMeshes) {
        canopy.setColorAt(i, tempColor);
      }
      // Hide all initially
      this.#trunkMesh.setMatrixAt(i, this.#hiddenMatrix);
      for (const canopy of this.#canopyMeshes) {
        canopy.setMatrixAt(i, this.#hiddenMatrix);
      }
    }

    this.#trunkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (const canopy of this.#canopyMeshes) {
      canopy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (canopy.instanceColor) canopy.instanceColor.needsUpdate = true;
    }
  }

  update(cameraPosition: THREE.Vector3): void {
    const camX = cameraPosition.x;
    const camZ = cameraPosition.z;
    let anyChanged = false;

    for (let i = 0; i < this.#trees.length; i++) {
      const tree = this.#trees[i]!;
      const dx = camX - tree.x;
      const dz = camZ - tree.z;
      const distSq = dx * dx + dz * dz;

      if (this.#visible[i]) {
        if (distSq > LOD_HIDE_DISTANCE_SQ) {
          this.#visible[i] = false;
          this.#trunkMesh.setMatrixAt(i, this.#hiddenMatrix);
          for (const canopy of this.#canopyMeshes) {
            canopy.setMatrixAt(i, this.#hiddenMatrix);
          }
          anyChanged = true;
        }
      } else {
        if (distSq < LOD_SHOW_DISTANCE_SQ) {
          this.#visible[i] = true;
          this.#dummy.position.set(tree.x, tree.y, tree.z);
          this.#dummy.rotation.set(0, tree.yaw, 0);
          this.#dummy.scale.setScalar(tree.scale);
          this.#dummy.updateMatrix();
          this.#trunkMesh.setMatrixAt(i, this.#dummy.matrix);
          for (const canopy of this.#canopyMeshes) {
            canopy.setMatrixAt(i, this.#dummy.matrix);
          }
          anyChanged = true;
        }
      }
    }

    if (anyChanged) {
      this.#trunkMesh.instanceMatrix.needsUpdate = true;
      for (const canopy of this.#canopyMeshes) {
        canopy.instanceMatrix.needsUpdate = true;
      }
    }
  }

  dispose(): void {
    this.#trunkMesh.geometry.dispose();
    (this.#trunkMesh.material as THREE.Material).dispose();
    this.#trunkMesh.removeFromParent();
    for (const canopy of this.#canopyMeshes) {
      canopy.geometry.dispose();
      (canopy.material as THREE.Material).dispose();
      canopy.removeFromParent();
    }
  }

  #placeTreeInstances(terrain: Terrain): TreeInstance[] {
    const random = new SeededRandom(0x54524545);
    const trees: TreeInstance[] = [];
    const halfSize = terrain.size * 0.46;

    for (let attempt = 0; attempt < 3000 && trees.length < MAX_TREES; attempt++) {
      const x = random.range(-halfSize, halfSize);
      const z = random.range(-halfSize, halfSize);
      if (!terrain.isWithinBounds(x, z)) continue;

      const surface = terrain.getSurfaceAt(x, z);
      // Trees grow on grass and dirt, not sand/rock/snow/water
      if (surface !== 'grass' && surface !== 'dirt') continue;

      const height = terrain.getHeightAt(x, z);
      if (height < SEA_LEVEL + 2) continue; // no trees below sea level
      if (height > 70) continue; // no trees above treeline

      const roadInfluence = terrain.getRoadInfluence(x, z);
      if (roadInfluence > 0.3) continue; // not on roads

      const slope = 1 - terrain.getNormalAt(x, z).y;
      if (slope > 0.25) continue; // not on steep slopes

      const { biome, influence: biomeStr } = terrain.getBiomeAt(x, z);

      // Biome placement density
      let placementChance: number;
      if (biome === 'meadow' && biomeStr > 0.2) {
        placementChance = 0.55; // moderate — meadows have scattered trees
      } else if (biome === 'hollow' && biomeStr > 0.2) {
        placementChance = 0.72; // dense — hollow is forested
      } else if (biome === 'desert') {
        placementChance = 0.08; // very sparse
      } else {
        placementChance = 0.35; // default moderate
      }
      if (random.next() > placementChance) continue;

      // Minimum spacing
      let tooClose = false;
      for (let j = trees.length - 1; j >= Math.max(0, trees.length - 30); j--) {
        const existing = trees[j]!;
        const tdx = existing.x - x;
        const tdz = existing.z - z;
        if (tdx * tdx + tdz * tdz < 64) { // 8m minimum
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      // Biome-aware scale
      const baseScale = biome === 'hollow' ? random.range(0.9, 1.4)
        : biome === 'meadow' ? random.range(0.7, 1.2)
        : biome === 'desert' ? random.range(0.4, 0.7)
        : random.range(0.6, 1.1);

      trees.push({
        x,
        z,
        y: height,
        scale: baseScale,
        yaw: random.range(0, Math.PI * 2),
        biome,
      });
    }

    return trees;
  }
}
