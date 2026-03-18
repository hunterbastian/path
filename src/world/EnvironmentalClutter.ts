import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeededRandom } from '../core/SeededRandom';
import { SEA_LEVEL } from './Terrain';
import type { Terrain } from './Terrain';

/**
 * Static environmental objects scattered along the road network:
 * wrecked vehicles, old road signs, debris clusters.
 * No physics — purely visual breadcrumbs that tell the post-apocalyptic story.
 */

const WRECK_BODY_COLORS = [0x3a3028, 0x2e2622, 0x44382e, 0x322a24, 0x282420];
const RUST_COLORS = [0x6e4830, 0x7a5038, 0x5c3e28, 0x8a5a3a];
const SIGN_TEXTS = [
  'TOWER BASIN', 'RELAY STATION', 'ROAD CLOSED',
  'DANGER', 'NO ENTRY', 'CAUTION', 'DETOUR',
  'SUMMIT 12', 'CAMP 8', 'OUTPOST',
];

interface ClutterCollider {
  x: number;
  z: number;
  radius: number;
  /** Height of the obstacle above terrain — skip if player is above */
  height: number;
  /** Index into #groups — skip collision when group is LOD-hidden */
  groupIndex: number;
}

interface ClutterGroup {
  root: THREE.Group;
  materials: THREE.Material[];
  /** World-space position for LOD distance checks */
  x: number;
  z: number;
}

export interface ClutterPlayerInteraction {
  collision: boolean;
  correction: THREE.Vector3;
  impulse: THREE.Vector3;
}

const PLAYER_COLLISION_RADIUS = 1.65;

/** Distance beyond which clutter groups are hidden to save draw calls */
const LOD_HIDE_DISTANCE = 140;
/** Hysteresis buffer to prevent flicker at the boundary */
const LOD_SHOW_DISTANCE = 125;

export class EnvironmentalClutter {
  readonly #terrain: Terrain;
  readonly #groups: ClutterGroup[] = [];
  readonly #colliders: ClutterCollider[] = [];
  readonly #correction = new THREE.Vector3();
  readonly #impulse = new THREE.Vector3();
  readonly #interaction: ClutterPlayerInteraction = {
    collision: false,
    correction: new THREE.Vector3(),
    impulse: new THREE.Vector3(),
  };

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.#terrain = terrain;
    const random = new SeededRandom(0x434C5554);

    this.#placeWreckedVehicles(scene, random);
    this.#placeRoadSigns(scene, random);
    this.#placeDebrisClusters(scene, random);

    // Merge each group's children into a single mesh to reduce draw calls
    for (const group of this.#groups) {
      this.#mergeGroupChildren(group);
    }
  }

  /** Merge all child meshes in a group into one mesh, preserving per-material groups. */
  #mergeGroupChildren(group: ClutterGroup): void {
    if (group.materials.length === 0) return;

    const entries: { geometry: THREE.BufferGeometry; materialIndex: number }[] = [];

    group.root.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.updateMatrix();
        const cloned = child.geometry.clone();
        cloned.applyMatrix4(child.matrix);
        const matIdx = group.materials.indexOf(child.material as THREE.Material);
        entries.push({ geometry: cloned, materialIndex: matIdx === -1 ? 0 : matIdx });
      }
    });

    if (entries.length < 2) return;

    // Sort by material so same-material groups are adjacent (better GPU batching)
    entries.sort((a, b) => a.materialIndex - b.materialIndex);

    const merged = mergeGeometries(entries.map((e) => e.geometry), true);
    if (!merged) return;

    // Remap each draw group's materialIndex to the actual material slot
    for (let i = 0; i < merged.groups.length; i++) {
      merged.groups[i]!.materialIndex = entries[i]!.materialIndex;
    }

    // Remove all children and replace with single merged mesh
    while (group.root.children.length > 0) {
      const child = group.root.children[0];
      if (child) group.root.remove(child);
    }

    const mesh = new THREE.Mesh(merged, group.materials);
    mesh.receiveShadow = true;
    group.root.add(mesh);

    for (const e of entries) e.geometry.dispose();
  }

  get playerInteraction(): ClutterPlayerInteraction {
    return this.#interaction;
  }

  /**
   * Check player collision against all static clutter colliders.
   * Must be called each frame with player position and velocity.
   */
  update(
    playerPosition: THREE.Vector3,
    playerVelocity: THREE.Vector3,
  ): void {
    // LOD: hide/show clutter groups based on distance to save draw calls
    for (const group of this.#groups) {
      const dx = playerPosition.x - group.x;
      const dz = playerPosition.z - group.z;
      const distSq = dx * dx + dz * dz;
      if (group.root.visible) {
        if (distSq > LOD_HIDE_DISTANCE * LOD_HIDE_DISTANCE) {
          group.root.visible = false;
        }
      } else {
        if (distSq < LOD_SHOW_DISTANCE * LOD_SHOW_DISTANCE) {
          group.root.visible = true;
        }
      }
    }

    this.#correction.set(0, 0, 0);
    this.#impulse.set(0, 0, 0);
    let hasCollision = false;

    const playerSpeed = Math.hypot(playerVelocity.x, playerVelocity.z);

    for (const collider of this.#colliders) {
      // Skip colliders whose group is LOD-hidden (140m+ away)
      if (!this.#groups[collider.groupIndex]?.root.visible) continue;

      const dx = playerPosition.x - collider.x;
      const dz = playerPosition.z - collider.z;
      const dist = Math.hypot(dx, dz);
      const combinedRadius = PLAYER_COLLISION_RADIUS + collider.radius;

      if (dist >= combinedRadius || dist < 0.001) continue;

      // Height check — skip if player is well above the obstacle
      const groundY = this.#terrain.getHeightAt(collider.x, collider.z);
      if (playerPosition.y > groundY + collider.height + 2) continue;

      hasCollision = true;
      const overlap = combinedRadius - dist;
      const nx = dx / dist;
      const nz = dz / dist;

      // Correction — push player out of the obstacle
      this.#correction.x += nx * (overlap * 0.6 + 0.06);
      this.#correction.z += nz * (overlap * 0.6 + 0.06);

      // Impulse — reflect velocity off the obstacle
      const impactForce = 0.3 + playerSpeed * 0.16;
      this.#impulse.x += nx * impactForce;
      this.#impulse.z += nz * impactForce;
    }

    this.#interaction.collision = hasCollision;
    this.#interaction.correction.copy(this.#correction);
    this.#interaction.impulse.copy(this.#impulse);
  }

  dispose(): void {
    for (const group of this.#groups) {
      group.root.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry.dispose();
        }
      });
      group.root.removeFromParent();
      for (const material of group.materials) {
        material.dispose();
      }
    }
  }

  // ── Wrecked Vehicles ──────────────────────────────────────

  #placeWreckedVehicles(scene: THREE.Scene, random: SeededRandom): void {
    const roads = this.#terrain.serviceRoadPaths;
    const positions = this.#sampleRoadPositions(random, 10, 38);

    for (let i = 0; i < positions.length; i++) {
      const { x, z, tangentAngle } = positions[i]!;

      // Offset from road center (crashed off-road)
      const offsetDist = random.range(4, 12) * (random.next() > 0.5 ? 1 : -1);
      const perpAngle = tangentAngle + Math.PI * 0.5;
      const wx = x + Math.cos(perpAngle) * offsetDist;
      const wz = z + Math.sin(perpAngle) * offsetDist;
      if (!this.#terrain.isWithinBounds(wx, wz)) continue;

      const wy = this.#terrain.getHeightAt(wx, wz);
      if (wy < SEA_LEVEL) continue;
      const variant = i % 3;
      const group = variant === 0
        ? this.#createWreckSedan(random)
        : variant === 1
          ? this.#createWreckTruck(random)
          : this.#createWreckVan(random);

      // Random crash orientation
      const crashYaw = tangentAngle + random.range(-0.8, 0.8);
      const crashTilt = random.range(-0.12, 0.18);
      const crashRoll = random.range(-0.15, 0.15);

      // Some are flipped on their side
      const flipped = random.next() < 0.2;
      group.root.position.set(wx, wy + (flipped ? 0.6 : 0.08), wz);
      group.root.rotation.set(
        crashTilt,
        crashYaw,
        flipped ? Math.PI * 0.45 + crashRoll : crashRoll,
      );

      group.x = wx;
      group.z = wz;
      scene.add(group.root);
      this.#groups.push(group);

      // Register collision — wrecked vehicles are solid obstacles
      const gi = this.#groups.length - 1;
      if (!flipped) {
        this.#colliders.push({ x: wx, z: wz, radius: 2.0, height: 1.2, groupIndex: gi });
      } else {
        // Flipped vehicles are wider but lower profile
        this.#colliders.push({ x: wx, z: wz, radius: 2.4, height: 0.8, groupIndex: gi });
      }
    }
  }

  #createWreckSedan(random: SeededRandom): ClutterGroup {
    const root = new THREE.Group();
    const materials: THREE.Material[] = [];

    const bodyColor = WRECK_BODY_COLORS[Math.floor(random.next() * WRECK_BODY_COLORS.length)]!;
    const rustColor = RUST_COLORS[Math.floor(random.next() * RUST_COLORS.length)]!;

    const bodyMat = new THREE.MeshLambertMaterial({
      color: bodyColor,
    });
    const rustMat = new THREE.MeshLambertMaterial({
      color: rustColor,
    });
    const darkMat = new THREE.MeshLambertMaterial({
      color: 0x1a1816,
    });
    materials.push(bodyMat, rustMat, darkMat);

    // Body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 3.8), bodyMat);
    body.position.set(0, 0.38, 0);
    body.receiveShadow = true;
    root.add(body);

    // Roof (sometimes missing)
    if (random.next() > 0.3) {
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.28, 2.1), rustMat);
      roof.position.set(0, 0.82, -0.2);
      root.add(roof);
    }

    // Remaining wheels (0-2)
    const wheelCount = random.int(0, 2);
    const wheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.18, 8);
    const wheelPositions = [
      [-0.86, 0.28, 1.2], [0.86, 0.28, 1.2],
      [-0.86, 0.28, -1.3], [0.86, 0.28, -1.3],
    ];
    for (let w = 0; w < wheelCount; w++) {
      const wp = wheelPositions[Math.floor(random.next() * wheelPositions.length)]!;
      const wheel = new THREE.Mesh(wheelGeo, darkMat);
      wheel.position.set(wp[0] ?? 0, wp[1] ?? 0, wp[2] ?? 0);
      wheel.rotation.z = Math.PI * 0.5;
      root.add(wheel);
    }

    // Rust patches
    const patch = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 1.2), rustMat);
    patch.position.set(random.range(-0.3, 0.3), 0.7, random.range(-0.6, 0.6));
    root.add(patch);

    return { root, materials, x: 0, z: 0 };
  }

  #createWreckTruck(random: SeededRandom): ClutterGroup {
    const root = new THREE.Group();
    const materials: THREE.Material[] = [];

    const bodyColor = WRECK_BODY_COLORS[Math.floor(random.next() * WRECK_BODY_COLORS.length)]!;
    const bodyMat = new THREE.MeshLambertMaterial({
      color: bodyColor,
    });
    const bedMat = new THREE.MeshLambertMaterial({
      color: 0x3e342c,
    });
    const darkMat = new THREE.MeshLambertMaterial({
      color: 0x1a1816,
    });
    materials.push(bodyMat, bedMat, darkMat);

    // Cab
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.9, 1.6), bodyMat);
    cab.position.set(0, 0.55, 1.3);
    cab.receiveShadow = true;
    root.add(cab);

    // Truck bed
    const bed = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 2.8), bedMat);
    bed.position.set(0, 0.25, -0.5);
    bed.receiveShadow = true;
    root.add(bed);

    // Bed sides
    const sideGeo = new THREE.BoxGeometry(0.08, 0.5, 2.8);
    const sideL = new THREE.Mesh(sideGeo, bedMat);
    sideL.position.set(-0.84, 0.65, -0.5);
    root.add(sideL);
    if (random.next() > 0.4) {
      const sideR = new THREE.Mesh(sideGeo, bedMat);
      sideR.position.set(0.84, 0.65, -0.5);
      root.add(sideR);
    }

    // Some wheels
    const wheelGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.2, 8);
    if (random.next() > 0.4) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(-0.92, 0.32, 1.3);
      w.rotation.z = Math.PI * 0.5;
      root.add(w);
    }
    if (random.next() > 0.5) {
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(0.92, 0.32, -1.4);
      w.rotation.z = Math.PI * 0.5;
      root.add(w);
    }

    return { root, materials, x: 0, z: 0 };
  }

  #createWreckVan(random: SeededRandom): ClutterGroup {
    const root = new THREE.Group();
    const materials: THREE.Material[] = [];

    const bodyColor = WRECK_BODY_COLORS[Math.floor(random.next() * WRECK_BODY_COLORS.length)]!;
    const bodyMat = new THREE.MeshLambertMaterial({
      color: bodyColor,
    });
    const rustMat = new THREE.MeshLambertMaterial({
      color: 0x6e4830,
    });
    const darkMat = new THREE.MeshLambertMaterial({
      color: 0x1a1816,
    });
    materials.push(bodyMat, rustMat, darkMat);

    // Box body
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.1, 3.6), bodyMat);
    body.position.set(0, 0.65, 0);
    body.receiveShadow = true;
    root.add(body);

    // Roof damage — hole
    const hole = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.16, 1.2), rustMat);
    hole.position.set(random.range(-0.2, 0.2), 1.26, random.range(-0.4, 0.4));
    root.add(hole);

    // 0-1 wheels
    if (random.next() > 0.5) {
      const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.2, 8);
      const w = new THREE.Mesh(wheelGeo, darkMat);
      w.position.set(-0.92, 0.3, random.range(-1, 1));
      w.rotation.z = Math.PI * 0.5;
      root.add(w);
    }

    return { root, materials, x: 0, z: 0 };
  }

  // ── Road Signs ────────────────────────────────────────────

  #placeRoadSigns(scene: THREE.Scene, random: SeededRandom): void {
    const positions = this.#sampleRoadPositions(random, 10, 52);

    for (let i = 0; i < positions.length; i++) {
      const { x, z, tangentAngle } = positions[i]!;

      // Place sign beside the road
      const side = random.next() > 0.5 ? 1 : -1;
      const perpAngle = tangentAngle + Math.PI * 0.5;
      const sx = x + Math.cos(perpAngle) * (3.5 + random.range(0, 2)) * side;
      const sz = z + Math.sin(perpAngle) * (3.5 + random.range(0, 2)) * side;
      if (!this.#terrain.isWithinBounds(sx, sz)) continue;

      const sy = this.#terrain.getHeightAt(sx, sz);
      if (sy < SEA_LEVEL) continue;
      const text = SIGN_TEXTS[i % SIGN_TEXTS.length]!;
      const group = this.#createRoadSign(random, text);

      // Face the road, with some weathered tilt
      const facingAngle = tangentAngle + Math.PI * 0.5 * side;
      group.root.position.set(sx, sy + 0.04, sz);
      group.root.rotation.set(
        random.range(-0.06, 0.1),
        facingAngle + random.range(-0.3, 0.3),
        random.range(-0.08, 0.08),
      );

      group.x = sx;
      group.z = sz;
      scene.add(group.root);
      this.#groups.push(group);

      // Signs are thin posts — small collision radius
      this.#colliders.push({ x: sx, z: sz, radius: 0.5, height: 2.8, groupIndex: this.#groups.length - 1 });
    }
  }

  #createRoadSign(random: SeededRandom, _text: string): ClutterGroup {
    const root = new THREE.Group();
    const materials: THREE.Material[] = [];

    const tall = random.next() > 0.4;
    const postHeight = tall ? 2.8 : 1.8;
    const broken = random.next() < 0.25;

    const postMat = new THREE.MeshLambertMaterial({
      color: 0x5a5550,
    });
    const signMat = new THREE.MeshLambertMaterial({
      color: broken ? 0x8a7a60 : 0xc8b88a,
    });
    const textMat = new THREE.MeshLambertMaterial({
      color: 0x2a2420,
    });
    materials.push(postMat, signMat, textMat);

    // Post
    const post = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.08, postHeight, 6),
      postMat,
    );
    post.position.set(0, postHeight * 0.5, 0);
    root.add(post);

    if (!broken) {
      // Sign panel
      const panelW = random.range(1.2, 1.8);
      const panelH = random.range(0.6, 1.0);
      const panel = new THREE.Mesh(
        new THREE.BoxGeometry(panelW, panelH, 0.06),
        signMat,
      );
      panel.position.set(0, postHeight - panelH * 0.3, 0.08);
      root.add(panel);

      // Text stripe
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(panelW * 0.7, panelH * 0.18, 0.02),
        textMat,
      );
      stripe.position.set(0, postHeight - panelH * 0.3, 0.12);
      root.add(stripe);

      // Border stripe (warns about danger)
      if (random.next() > 0.5) {
        const borderMat = new THREE.MeshLambertMaterial({
          color: 0xc47020,
          emissive: new THREE.Color(0x6a3810),
          emissiveIntensity: 0.2,
        });
        materials.push(borderMat);
        const border = new THREE.Mesh(
          new THREE.BoxGeometry(panelW + 0.08, 0.06, 0.04),
          borderMat,
        );
        border.position.set(0, postHeight - panelH * 0.3 + panelH * 0.5, 0.1);
        root.add(border);
      }
    }

    // Base plate
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.4, 0.08, 0.4),
      postMat,
    );
    base.position.set(0, 0.04, 0);
    root.add(base);

    return { root, materials, x: 0, z: 0 };
  }

  // ── Debris Clusters ───────────────────────────────────────

  #placeDebrisClusters(scene: THREE.Scene, random: SeededRandom): void {
    const positions = this.#sampleRoadPositions(random, 12, 44);

    for (let i = 0; i < positions.length; i++) {
      const { x, z, tangentAngle } = positions[i]!;

      const perpAngle = tangentAngle + Math.PI * 0.5;
      const side = random.next() > 0.5 ? 1 : -1;
      const dist = random.range(1, 6) * side;
      const dx = x + Math.cos(perpAngle) * dist;
      const dz = z + Math.sin(perpAngle) * dist;
      if (!this.#terrain.isWithinBounds(dx, dz)) continue;

      const dy = this.#terrain.getHeightAt(dx, dz);
      if (dy < SEA_LEVEL) continue;
      const variant = i % 3;
      const group = variant === 0
        ? this.#createConcreteDebris(random)
        : variant === 1
          ? this.#createBarrelCluster(random)
          : this.#createMetalScrap(random);

      group.root.position.set(dx, dy + 0.02, dz);
      group.root.rotation.y = random.range(0, Math.PI * 2);

      group.x = dx;
      group.z = dz;
      scene.add(group.root);
      this.#groups.push(group);

      // Debris clusters — medium radius, low profile
      const debrisRadius = variant === 1 ? 1.0 : 1.3; // barrels smaller
      this.#colliders.push({ x: dx, z: dz, radius: debrisRadius, height: 0.9, groupIndex: this.#groups.length - 1 });
    }
  }

  #createConcreteDebris(random: SeededRandom): ClutterGroup {
    const root = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({
      color: 0x7a726a,
    });
    const rebarMat = new THREE.MeshLambertMaterial({
      color: 0x6e4a30,
    });
    const materials = [mat, rebarMat];

    // Concrete chunks (3-5 pieces)
    const count = random.int(3, 5);
    for (let i = 0; i < count; i++) {
      const size = random.range(0.3, 0.8);
      const chunk = new THREE.Mesh(
        new THREE.BoxGeometry(
          size * random.range(0.6, 1.4),
          size * random.range(0.3, 0.8),
          size * random.range(0.6, 1.4),
        ),
        mat,
      );
      chunk.position.set(
        random.range(-1.2, 1.2),
        size * 0.2,
        random.range(-1.2, 1.2),
      );
      chunk.rotation.set(
        random.range(-0.3, 0.3),
        random.range(0, Math.PI),
        random.range(-0.2, 0.2),
      );
      chunk.receiveShadow = true;
      root.add(chunk);
    }

    // Rebar sticking out
    if (random.next() > 0.4) {
      const rebar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.02, 0.02, 1.2, 4),
        rebarMat,
      );
      rebar.position.set(random.range(-0.5, 0.5), 0.4, random.range(-0.5, 0.5));
      rebar.rotation.set(random.range(-0.4, 0.1), 0, random.range(-0.6, 0.6));
      root.add(rebar);
    }

    return { root, materials, x: 0, z: 0 };
  }

  #createBarrelCluster(random: SeededRandom): ClutterGroup {
    const root = new THREE.Group();
    const barrelMat = new THREE.MeshLambertMaterial({
      color: 0x4a5048,
    });
    const rustMat = new THREE.MeshLambertMaterial({
      color: 0x7a4e2e,
    });
    const materials = [barrelMat, rustMat];

    const count = random.int(2, 4);
    const barrelGeo = new THREE.CylinderGeometry(0.3, 0.32, 0.82, 8);

    for (let i = 0; i < count; i++) {
      const mat = random.next() > 0.5 ? barrelMat : rustMat;
      const barrel = new THREE.Mesh(barrelGeo, mat);
      const upright = random.next() > 0.35;
      barrel.position.set(
        random.range(-1, 1),
        upright ? 0.41 : 0.3,
        random.range(-1, 1),
      );
      if (!upright) {
        barrel.rotation.z = Math.PI * 0.5 + random.range(-0.2, 0.2);
        barrel.rotation.y = random.range(0, Math.PI);
      }
      barrel.receiveShadow = true;
      root.add(barrel);
    }

    return { root, materials, x: 0, z: 0 };
  }

  #createMetalScrap(random: SeededRandom): ClutterGroup {
    const root = new THREE.Group();
    const metalMat = new THREE.MeshLambertMaterial({
      color: 0x4e4a44,
    });
    const rustMat = new THREE.MeshLambertMaterial({
      color: 0x6a4228,
    });
    const materials = [metalMat, rustMat];

    // Flat metal plates
    const plateCount = random.int(2, 4);
    for (let i = 0; i < plateCount; i++) {
      const mat = random.next() > 0.5 ? metalMat : rustMat;
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(
          random.range(0.4, 1.2),
          0.04,
          random.range(0.3, 0.9),
        ),
        mat,
      );
      plate.position.set(
        random.range(-1.4, 1.4),
        0.04 + random.range(0, 0.08),
        random.range(-1.4, 1.4),
      );
      plate.rotation.set(
        random.range(-0.15, 0.15),
        random.range(0, Math.PI),
        random.range(-0.1, 0.1),
      );
      root.add(plate);
    }

    // Bent pipe/rod
    if (random.next() > 0.3) {
      const pipe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.04, 0.04, random.range(0.8, 1.6), 6),
        metalMat,
      );
      pipe.position.set(
        random.range(-0.8, 0.8),
        0.3,
        random.range(-0.8, 0.8),
      );
      pipe.rotation.set(random.range(-0.5, 0.2), 0, random.range(-0.8, 0.8));
      root.add(pipe);
    }

    return { root, materials, x: 0, z: 0 };
  }

  // ── Placement Helpers ─────────────────────────────────────

  /** Sample evenly-spaced positions along the road network. */
  #sampleRoadPositions(
    random: SeededRandom,
    count: number,
    minSpacing: number,
  ): Array<{ x: number; z: number; tangentAngle: number }> {
    const results: Array<{ x: number; z: number; tangentAngle: number }> = [];
    const allRoads = this.#terrain.serviceRoadPaths;

    // Also include main path samples
    const mainPathSamples: THREE.Vector2[] = [];
    for (let z = -40; z <= 340; z += 24) {
      mainPathSamples.push(new THREE.Vector2(this.#terrain.getPathCenterX(z), z));
    }
    const allPaths = [...allRoads, mainPathSamples];

    for (let attempt = 0; attempt < count * 5 && results.length < count; attempt++) {
      // Pick a random road
      const roadIndex = Math.floor(random.next() * allPaths.length);
      const road = allPaths[roadIndex];
      if (!road || road.length < 2) continue;

      // Pick a random t along the road
      const t = random.range(0.1, 0.9);
      const sample = this.#samplePolyline(road, t);
      if (!sample) continue;

      // Ensure minimum spacing from existing placements
      let tooClose = false;
      for (const existing of results) {
        if (Math.hypot(existing.x - sample.x, existing.z - sample.z) < minSpacing) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      if (!this.#terrain.isWithinBounds(sample.x, sample.z)) continue;

      results.push(sample);
    }

    return results;
  }

  #samplePolyline(
    path: THREE.Vector2[],
    t: number,
  ): { x: number; z: number; tangentAngle: number } | null {
    if (path.length < 2) return null;

    let totalLength = 0;
    const lengths: number[] = [];
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const len = Math.hypot(b.x - a.x, b.y - a.y);
      lengths.push(len);
      totalLength += len;
    }
    if (totalLength < 0.01) return null;

    const target = totalLength * THREE.MathUtils.clamp(t, 0, 1);
    let traversed = 0;
    for (let i = 0; i < lengths.length; i++) {
      const segLen = lengths[i]!;
      if (traversed + segLen >= target || i === lengths.length - 1) {
        const localT = segLen > 0 ? (target - traversed) / segLen : 0;
        const a = path[i]!;
        const b = path[i + 1]!;
        const x = THREE.MathUtils.lerp(a.x, b.x, localT);
        const z = THREE.MathUtils.lerp(a.y, b.y, localT);
        const tangentAngle = Math.atan2(b.x - a.x, b.y - a.y);
        return { x, z, tangentAngle };
      }
      traversed += segLen;
    }

    return null;
  }
}
