import * as THREE from 'three';
import type { Terrain } from './Terrain';

/**
 * PointsOfInterest — discoverable nature landmarks scattered across the map.
 * Drive within range to discover. Persisted in localStorage.
 */

const STORAGE_KEY = 'path-pois-discovered';
const DISCOVER_RADIUS = 18;

interface POIDef {
  id: string;
  name: string;
  /** World position (y is computed from terrain). */
  x: number;
  z: number;
}

interface POIInstance {
  def: POIDef;
  group: THREE.Group;
  discovered: boolean;
  /** Distance squared for cheap checks. */
  y: number;
}

// ── Nature landmark definitions ──

const POI_DEFS: POIDef[] = [
  { id: 'dead_tree',     name: 'The Sentinel',       x: -88,  z: 220 },
  { id: 'hot_spring',    name: 'Sulfur Pool',        x: 120,  z: 85 },
  { id: 'boulder_field', name: 'Rockslide Crossing',  x: -45,  z: 155 },
  { id: 'cave_mouth',    name: 'Black Hollow',        x: 180,  z: 310 },
];

// ── Persistence ──

function loadDiscovered(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr as string[]);
    }
  } catch { /* ignore */ }
  return new Set();
}

function saveDiscovered(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch { /* ignore */ }
}

// ── System ──

export type POIDiscoverCallback = (name: string) => void;

export class PointsOfInterest {
  readonly #terrain: Terrain;
  readonly #instances: POIInstance[] = [];
  readonly #discovered: Set<string>;
  #onDiscover: POIDiscoverCallback | null = null;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.#terrain = terrain;
    this.#discovered = loadDiscovered();

    for (const def of POI_DEFS) {
      const y = terrain.getHeightAt(def.x, def.z);
      const group = this.#buildLandmark(def, y);
      group.position.set(def.x, y, def.z);
      scene.add(group);

      this.#instances.push({
        def,
        group,
        discovered: this.#discovered.has(def.id),
        y,
      });
    }
  }

  onDiscover(cb: POIDiscoverCallback): void {
    this.#onDiscover = cb;
  }

  get discoveredCount(): number {
    return this.#discovered.size;
  }

  get totalCount(): number {
    return POI_DEFS.length;
  }

  update(playerX: number, playerZ: number): void {
    const rSq = DISCOVER_RADIUS * DISCOVER_RADIUS;
    for (const poi of this.#instances) {
      if (poi.discovered) continue;
      const dx = playerX - poi.def.x;
      const dz = playerZ - poi.def.z;
      if (dx * dx + dz * dz <= rSq) {
        poi.discovered = true;
        this.#discovered.add(poi.def.id);
        saveDiscovered(this.#discovered);
        this.#onDiscover?.(poi.def.name);
      }
    }
  }

  dispose(): void {
    for (const poi of this.#instances) {
      poi.group.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
          if (child.material instanceof THREE.Material) {
            child.material.dispose();
          }
        }
      });
      poi.group.removeFromParent();
    }
  }

  // ── Landmark builders ──

  #buildLandmark(def: POIDef, groundY: number): THREE.Group {
    switch (def.id) {
      case 'dead_tree': return this.#buildDeadTree();
      case 'hot_spring': return this.#buildHotSpring(groundY);
      case 'boulder_field': return this.#buildBoulderField();
      case 'cave_mouth': return this.#buildCaveMouth();
      default: return new THREE.Group();
    }
  }

  /** Massive dead tree — tall trunk with gnarled branches, visible from far away. */
  #buildDeadTree(): THREE.Group {
    const group = new THREE.Group();
    const wood = new THREE.MeshLambertMaterial({ color: 0x3a3028 });
    const darkWood = new THREE.MeshLambertMaterial({ color: 0x2a2220 });

    // Trunk — thick, slightly tapered
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.7, 1.1, 14, 8),
      wood,
    );
    trunk.position.y = 7;
    trunk.rotation.z = 0.04;
    trunk.castShadow = true;
    group.add(trunk);

    // Main branches — angular, dead
    const branches: [number, number, number, number, number][] = [
      [0.3, 11.5, 0, 0.8, 5.5],   // [radius, y, z, lean, length]
      [0.25, 10, 0.3, -0.6, 4.2],
      [0.2, 8.5, -0.4, 0.9, 3.8],
      [0.18, 12.5, 0.1, -0.4, 3],
      [0.15, 9, 0.5, 0.5, 2.6],
    ];
    for (const [radius, y, zOff, lean, length] of branches) {
      const branch = new THREE.Mesh(
        new THREE.CylinderGeometry(radius * 0.3, radius, length, 6),
        darkWood,
      );
      branch.position.set(lean * 1.2, y, zOff);
      branch.rotation.z = lean * 0.6;
      branch.rotation.x = zOff * 0.4;
      branch.castShadow = true;
      group.add(branch);
    }

    // Exposed roots
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.3;
      const root = new THREE.Mesh(
        new THREE.CylinderGeometry(0.08, 0.22, 2.4, 5),
        darkWood,
      );
      root.position.set(Math.cos(angle) * 1.3, 0.6, Math.sin(angle) * 1.3);
      root.rotation.z = Math.cos(angle) * 0.5;
      root.rotation.x = Math.sin(angle) * 0.4;
      group.add(root);
    }

    return group;
  }

  /** Hot spring — shallow pool with steam-colored water and rocky rim. */
  #buildHotSpring(groundY: number): THREE.Group {
    const group = new THREE.Group();
    const rock = new THREE.MeshLambertMaterial({ color: 0x6a6660 });
    const warmRock = new THREE.MeshLambertMaterial({ color: 0x7a6a52 });
    const water = new THREE.MeshStandardMaterial({
      color: 0x5a9088,
      roughness: 0.15,
      metalness: 0.1,
      transparent: true,
      opacity: 0.72,
    });

    // Pool basin — slightly recessed circle
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(4.2, 16),
      water,
    );
    pool.rotation.x = -Math.PI / 2;
    pool.position.y = 0.15;
    group.add(pool);

    // Rocky rim — scattered boulders around the edge
    for (let i = 0; i < 10; i++) {
      const angle = (i / 10) * Math.PI * 2 + Math.sin(i * 2.7) * 0.3;
      const dist = 3.8 + Math.sin(i * 1.8) * 0.8;
      const size = 0.5 + Math.sin(i * 3.1) * 0.3;
      const boulder = new THREE.Mesh(
        new THREE.BoxGeometry(size * 1.3, size * 0.7, size),
        i % 3 === 0 ? warmRock : rock,
      );
      boulder.position.set(
        Math.cos(angle) * dist,
        size * 0.3,
        Math.sin(angle) * dist,
      );
      boulder.rotation.y = angle + 0.4;
      boulder.rotation.x = Math.sin(i) * 0.15;
      boulder.receiveShadow = true;
      group.add(boulder);
    }

    // Mineral deposits — yellowish stain on inner rocks
    const mineral = new THREE.MeshLambertMaterial({
      color: 0xc4a848,
      emissive: new THREE.Color(0x8a7830),
      emissiveIntensity: 0.15,
    });
    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2 + 0.8;
      const stain = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.06, 0.6),
        mineral,
      );
      stain.position.set(Math.cos(angle) * 3.2, 0.08, Math.sin(angle) * 3.2);
      stain.rotation.y = angle;
      group.add(stain);
    }

    return group;
  }

  /** Boulder field — scattered large rocks where a rockslide crossed. */
  #buildBoulderField(): THREE.Group {
    const group = new THREE.Group();
    const rockA = new THREE.MeshLambertMaterial({ color: 0x7a7672 });
    const rockB = new THREE.MeshLambertMaterial({ color: 0x686460 });
    const rockC = new THREE.MeshLambertMaterial({ color: 0x8a8680 });

    const mats = [rockA, rockB, rockC];

    // Large boulders — the main mass
    const boulders: [number, number, number, number][] = [
      [0, 0, 0, 2.8],
      [-3.2, 0, 1.4, 2.2],
      [2.4, 0, -1.8, 1.9],
      [-1.6, 0, -3.0, 2.4],
      [4.0, 0, 0.8, 1.6],
      [-4.5, 0, -1.2, 1.4],
      [1.2, 0, 3.2, 1.8],
      [-2.8, 0, 3.6, 1.2],
      [5.2, 0, -2.4, 1.1],
    ];

    for (let i = 0; i < boulders.length; i++) {
      const [bx, , bz, size] = boulders[i]!;
      const mat = mats[i % mats.length]!;
      const boulder = new THREE.Mesh(
        new THREE.BoxGeometry(
          size * (0.8 + Math.sin(i * 1.3) * 0.3),
          size * (0.5 + Math.sin(i * 2.1) * 0.2),
          size * (0.7 + Math.sin(i * 0.8) * 0.25),
        ),
        mat,
      );
      boulder.position.set(bx, size * 0.25, bz);
      boulder.rotation.set(
        Math.sin(i * 1.7) * 0.2,
        Math.sin(i * 2.3) * 0.8,
        Math.sin(i * 0.9) * 0.15,
      );
      boulder.castShadow = true;
      boulder.receiveShadow = true;
      group.add(boulder);
    }

    // Scatter of smaller rocks
    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 + i * 0.7;
      const dist = 2 + Math.sin(i * 2.3) * 3;
      const size = 0.3 + Math.sin(i * 1.4) * 0.2;
      const pebble = new THREE.Mesh(
        new THREE.BoxGeometry(size, size * 0.5, size * 0.8),
        mats[i % 3]!,
      );
      pebble.position.set(Math.cos(angle) * dist, size * 0.2, Math.sin(angle) * dist);
      pebble.rotation.set(Math.sin(i) * 0.3, i * 1.1, Math.sin(i * 0.6) * 0.2);
      pebble.receiveShadow = true;
      group.add(pebble);
    }

    return group;
  }

  /** Cave mouth — dark opening in a cliff face with rocky arch. */
  #buildCaveMouth(): THREE.Group {
    const group = new THREE.Group();
    const rock = new THREE.MeshLambertMaterial({ color: 0x5e5a56 });
    const darkRock = new THREE.MeshLambertMaterial({ color: 0x2a2826 });
    const voidMat = new THREE.MeshBasicMaterial({ color: 0x0a0a0c });

    // Cliff face — tall flat wall
    const cliff = new THREE.Mesh(
      new THREE.BoxGeometry(14, 10, 3),
      rock,
    );
    cliff.position.set(0, 5, -1.5);
    cliff.castShadow = true;
    cliff.receiveShadow = true;
    group.add(cliff);

    // Cave opening — dark void
    const opening = new THREE.Mesh(
      new THREE.BoxGeometry(3.2, 4.5, 2.8),
      voidMat,
    );
    opening.position.set(0, 2.25, 0);
    group.add(opening);

    // Arch — rocky overhang above the opening
    const arch = new THREE.Mesh(
      new THREE.BoxGeometry(4.8, 1.4, 2.2),
      darkRock,
    );
    arch.position.set(0, 4.8, 0.2);
    arch.rotation.z = 0.03;
    arch.castShadow = true;
    group.add(arch);

    // Side pillars
    for (const side of [-1, 1]) {
      const pillar = new THREE.Mesh(
        new THREE.BoxGeometry(1.6, 5.2, 2),
        rock,
      );
      pillar.position.set(side * 2.2, 2.6, 0.1);
      pillar.castShadow = true;
      group.add(pillar);
    }

    // Rubble at the entrance
    for (let i = 0; i < 6; i++) {
      const size = 0.3 + Math.sin(i * 1.7) * 0.2;
      const rubble = new THREE.Mesh(
        new THREE.BoxGeometry(size * 1.2, size * 0.6, size),
        darkRock,
      );
      rubble.position.set(
        (Math.sin(i * 2.1) - 0.5) * 3,
        size * 0.25,
        1.5 + Math.sin(i * 1.3) * 1,
      );
      rubble.rotation.y = i * 1.2;
      rubble.receiveShadow = true;
      group.add(rubble);
    }

    // Stalactite hints inside
    for (let i = 0; i < 3; i++) {
      const stala = new THREE.Mesh(
        new THREE.ConeGeometry(0.12, 0.8, 5),
        darkRock,
      );
      stala.position.set(
        (i - 1) * 0.8,
        4.2,
        -0.4,
      );
      stala.rotation.x = Math.PI;
      group.add(stala);
    }

    return group;
  }
}
