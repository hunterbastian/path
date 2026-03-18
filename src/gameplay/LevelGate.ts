/**
 * LevelGateSystem — physical barriers at biome boundaries that require a minimum level to pass.
 *
 * Gates are positioned near the Alpine Meadows radius (~120m from center) where paths
 * lead into harder biomes. Under-leveled players are gently pushed back; at or above
 * the required level the gate has no effect.
 */

import * as THREE from 'three';
import type { Terrain } from '../world/Terrain';

interface GateDefinition {
  id: string;
  x: number;
  z: number;
  radius: number;
  requiredLevel: number;
  label: string;
}

const GATES: GateDefinition[] = [
  { id: 'canyon-pass',   x: 85,   z: -85,  radius: 12, requiredLevel: 2, label: 'Canyon Pass' },
  { id: 'peak-trail',   x: 85,   z: 85,   radius: 12, requiredLevel: 3, label: 'Peak Trail' },
  { id: 'coast-gate',   x: -85,  z: 85,   radius: 12, requiredLevel: 2, label: 'Coast Gate' },
  { id: 'salt-crossing', x: -85, z: -85,  radius: 12, requiredLevel: 2, label: 'Salt Crossing' },
  { id: 'summit-path',  x: 170,  z: 170,  radius: 12, requiredLevel: 5, label: 'Summit Path' },
] as const;

/** Height of each gate post in world units. */
const POST_HEIGHT = 9;
/** Half-width spacing between the two posts of a gate. */
const POST_SPREAD = 5;

interface GateVisual {
  gateId: string;
  requiredLevel: number;
  left: THREE.Mesh;
  right: THREE.Mesh;
}

export class LevelGateSystem {
  readonly #gates: GateDefinition[];
  #visuals: GateVisual[] = [];

  constructor() {
    this.#gates = [...GATES];
  }

  // ── Visuals ──

  /** Create glowing amber gate-post meshes and add them to the scene. */
  createGateVisuals(scene: THREE.Scene, terrain: Terrain): void {
    const postGeometry = new THREE.BoxGeometry(0.25, POST_HEIGHT, 0.25);
    const postMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4a74a,
      emissive: 0xd4a74a,
      emissiveIntensity: 0.6,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });

    for (const gate of this.#gates) {
      // Direction from gate center toward world origin — posts are perpendicular to this
      const toOriginX = -gate.x;
      const toOriginZ = -gate.z;
      const len = Math.sqrt(toOriginX * toOriginX + toOriginZ * toOriginZ) || 1;
      // Perpendicular direction (rotated 90 degrees)
      const perpX = -toOriginZ / len;
      const perpZ = toOriginX / len;

      const baseY = terrain.getHeightAt(gate.x, gate.z);

      const leftMesh = new THREE.Mesh(postGeometry, postMaterial.clone());
      leftMesh.position.set(
        gate.x + perpX * POST_SPREAD,
        baseY + POST_HEIGHT / 2,
        gate.z + perpZ * POST_SPREAD,
      );

      const rightMesh = new THREE.Mesh(postGeometry, postMaterial.clone());
      rightMesh.position.set(
        gate.x - perpX * POST_SPREAD,
        baseY + POST_HEIGHT / 2,
        gate.z - perpZ * POST_SPREAD,
      );

      scene.add(leftMesh, rightMesh);

      this.#visuals.push({
        gateId: gate.id,
        requiredLevel: gate.requiredLevel,
        left: leftMesh,
        right: rightMesh,
      });
    }
  }

  /** Hide gate visuals the player has surpassed. */
  updateVisuals(playerLevel: number): void {
    for (const visual of this.#visuals) {
      const visible = playerLevel < visual.requiredLevel;
      visual.left.visible = visible;
      visual.right.visible = visible;
    }
  }

  // ── Queries ──

  /** Check player position against gates. Returns gate label if blocked, null if clear. */
  check(playerX: number, playerZ: number, playerLevel: number): string | null {
    for (const gate of this.#gates) {
      if (playerLevel >= gate.requiredLevel) continue;

      const dx = playerX - gate.x;
      const dz = playerZ - gate.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < gate.radius * gate.radius) {
        return gate.label;
      }
    }

    return null;
  }

  /**
   * Get push-back force direction if the player is inside a gate zone while under-leveled.
   * Returns a normalized vector pointing away from the gate center, or null if no gate applies.
   */
  getPushBack(
    playerX: number,
    playerZ: number,
    playerLevel: number,
  ): { x: number; z: number } | null {
    for (const gate of this.#gates) {
      if (playerLevel >= gate.requiredLevel) continue;

      const dx = playerX - gate.x;
      const dz = playerZ - gate.z;
      const distSq = dx * dx + dz * dz;

      if (distSq < gate.radius * gate.radius) {
        const dist = Math.sqrt(distSq);

        // Player is exactly on the gate center — push toward world origin as fallback
        if (dist < 0.001) {
          const fallbackDist = Math.sqrt(gate.x * gate.x + gate.z * gate.z);
          if (fallbackDist < 0.001) return { x: 1, z: 0 };
          return { x: -gate.x / fallbackDist, z: -gate.z / fallbackDist };
        }

        return { x: dx / dist, z: dz / dist };
      }
    }

    return null;
  }

  /** Returns gate labels whose requiredLevel matches the given level. */
  getUnlocksForLevel(level: number): string[] {
    const unlocks: string[] = [];
    for (const gate of this.#gates) {
      if (gate.requiredLevel === level) {
        unlocks.push(`${gate.label} now accessible`);
      }
    }
    return unlocks;
  }
}
