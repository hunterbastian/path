/**
 * LevelGateSystem — physical barriers at biome boundaries that require a minimum level to pass.
 *
 * Gates are positioned near the Alpine Meadows radius (~120m from center) where paths
 * lead into harder biomes. Under-leveled players are gently pushed back; at or above
 * the required level the gate has no effect.
 */

interface GateDefinition {
  id: string;
  x: number;
  z: number;
  radius: number;
  requiredLevel: number;
  label: string;
}

const GATES: GateDefinition[] = [
  { id: 'canyon-pass', x: 100, z: -60, radius: 8, requiredLevel: 2, label: 'Canyon Pass' },
  { id: 'peak-trail', x: -40, z: 110, radius: 8, requiredLevel: 3, label: 'Peak Trail' },
  { id: 'salt-crossing', x: -110, z: -30, radius: 8, requiredLevel: 2, label: 'Salt Crossing' },
  { id: 'summit-path', x: -20, z: 90, radius: 8, requiredLevel: 5, label: 'Summit Path' },
] as const;

export class LevelGateSystem {
  readonly #gates: GateDefinition[];

  constructor() {
    this.#gates = [...GATES];
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
}
