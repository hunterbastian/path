import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeededRandom } from '../core/SeededRandom';
import { ISLAND_EDGE, SEA_LEVEL, type Terrain } from './Terrain';

const ROCK_COUNT = 60;
const SEA_STACK_COUNT = 12;

/**
 * Coastal rock formations — boulders at the waterline and sea stacks
 * rising from the ocean near the island's edge.
 */
export class CoastalRocks {
  readonly #group: THREE.Group;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.#group = new THREE.Group();

    const random = new SeededRandom(0x524f434b); // "ROCK"
    const boulderGeometries: THREE.BufferGeometry[] = [];
    const stackGeometries: THREE.BufferGeometry[] = [];

    // ── Boulders at the waterline ──
    for (let i = 0; i < ROCK_COUNT; i++) {
      const angle = random.next() * Math.PI * 2;
      const coastNoise = terrain.getHeightAt(
        Math.cos(angle) * ISLAND_EDGE,
        Math.sin(angle) * ISLAND_EDGE,
      );
      // Scatter around the coastline where terrain ≈ sea level
      const radius = ISLAND_EDGE + random.range(-40, 30);
      const x = Math.cos(angle) * radius + random.signed() * 12;
      const z = Math.sin(angle) * radius + random.signed() * 12;

      if (!terrain.isWithinBounds(x, z)) continue;
      const height = terrain.getHeightAt(x, z);
      // Only place where terrain is near or just below sea level
      if (height > SEA_LEVEL + 3 || height < SEA_LEVEL - 4) continue;

      const scale = random.range(0.8, 2.8);
      const geo = CoastalRocks.#createBoulder(random, scale);
      geo.translate(x, height - scale * 0.15, z);
      boulderGeometries.push(geo);
    }

    // ── Sea stacks — tall pillars rising from the water ──
    for (let i = 0; i < SEA_STACK_COUNT; i++) {
      const angle = random.next() * Math.PI * 2;
      const radius = ISLAND_EDGE + random.range(10, 55);
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;

      if (!terrain.isWithinBounds(x, z)) continue;
      const groundH = terrain.getHeightAt(x, z);
      // Sea stacks only in water
      if (groundH > SEA_LEVEL) continue;

      const stackHeight = random.range(4, 14);
      const stackRadius = random.range(1.2, 3.5);
      const geo = CoastalRocks.#createSeaStack(random, stackRadius, stackHeight);
      geo.translate(x, groundH, z);
      stackGeometries.push(geo);
    }

    // Merge into single draw calls
    const rockColor = new THREE.Color(0x5a6668);
    const rockMat = new THREE.MeshStandardMaterial({
      color: rockColor,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: true,
    });

    if (boulderGeometries.length > 0) {
      const merged = mergeGeometries(boulderGeometries, false);
      if (merged) {
        const mesh = new THREE.Mesh(merged, rockMat);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        this.#group.add(mesh);
      }
    }

    if (stackGeometries.length > 0) {
      const merged = mergeGeometries(stackGeometries, false);
      if (merged) {
        // Slightly different color for stacks — darker, more weathered
        const stackMat = new THREE.MeshStandardMaterial({
          color: new THREE.Color(0x485458),
          roughness: 0.96,
          metalness: 0.01,
          flatShading: true,
        });
        const mesh = new THREE.Mesh(merged, stackMat);
        mesh.receiveShadow = true;
        mesh.castShadow = true;
        this.#group.add(mesh);
      }
    }

    scene.add(this.#group);
  }

  dispose(): void {
    for (const child of this.#group.children) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
    this.#group.removeFromParent();
  }

  /** Irregular boulder — deformed icosahedron. */
  static #createBoulder(random: SeededRandom, scale: number): THREE.BufferGeometry {
    const geo = new THREE.IcosahedronGeometry(scale, 1);
    const positions = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      const deform = 1 + random.signed() * 0.28;
      positions.setX(i, positions.getX(i) * deform);
      positions.setY(i, positions.getY(i) * (0.5 + random.next() * 0.6)); // squash vertically
      positions.setZ(i, positions.getZ(i) * (1 + random.signed() * 0.22));
    }
    // Random rotation
    const euler = new THREE.Euler(
      random.signed() * 0.3,
      random.next() * Math.PI * 2,
      random.signed() * 0.2,
    );
    geo.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(euler));
    return geo;
  }

  /** Sea stack — tapered cylinder with irregularities. */
  static #createSeaStack(random: SeededRandom, radius: number, height: number): THREE.BufferGeometry {
    const segments = 6;
    const geo = new THREE.CylinderGeometry(
      radius * 0.6, // top radius (tapered)
      radius,        // bottom radius
      height,
      segments,
      3,             // height segments for deformation
    );
    const positions = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      const heightFraction = (y + height * 0.5) / height;
      // Wider at base, narrower at top, with irregularity
      const bulge = 1 + random.signed() * 0.18;
      const taper = 1 - heightFraction * 0.3;
      positions.setX(i, positions.getX(i) * bulge * taper);
      positions.setZ(i, positions.getZ(i) * bulge * taper);
      // Slight vertical deformation
      positions.setY(i, y + random.signed() * 0.3);
    }
    // Shift so base sits at y=0
    geo.translate(0, height * 0.5, 0);
    // Random y rotation
    geo.rotateY(random.next() * Math.PI * 2);
    return geo;
  }
}
