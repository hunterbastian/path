import * as THREE from 'three';
import { DustSystem, type DustConfig } from './DustSystem';
import type { VehicleController } from '../vehicle/VehicleController';

/**
 * Tire smoke — white/grey puffs emitted from rear wheels during handbrake drift.
 * Reuses DustSystem with additive blending for a light, smoky look.
 */

/** Returns a drift-intensity-scaled smoke config. */
function smokeConfig(intensity: number): DustConfig {
  // intensity 0→1: light puff → thick billowing cloud
  return {
    size: 1.2 + intensity * 0.6,
    growth: 2.6 + intensity * 1.0,
    life: 1.1 + intensity * 0.4,
    spread: 0.4 + intensity * 0.25,
    lift: 0.7 + intensity * 0.35,
    jitter: 0.9 + intensity * 0.4,
  };
}

export class TireSmokeSystem {
  readonly #smoke: DustSystem;
  #emitTimer = 0;

  constructor(scene: THREE.Scene) {
    this.#smoke = new DustSystem(scene, {
      capacity: 120,
      color: 0xd8d4cc,
      opacity: 0.22,
      gravity: -0.8,
      drag: 0.96,
      fade: (f: number) => {
        // Quick fade-in, slow fade-out for lingering smoke
        if (f < 0.1) return f / 0.1;
        return Math.pow(1 - (f - 0.1) / 0.9, 1.6);
      },
    });
  }

  get activeCount(): number {
    return this.#smoke.activeCount;
  }

  update(dt: number, vehicle: VehicleController): void {
    this.#smoke.update(dt);

    const state = vehicle.state;
    // Only emit when drifting on ground (handbrake or natural drift)
    if (!state.isGrounded || !state.isDrifting || state.surface === 'water') return;
    // Skip snow/sand — those have their own spray systems
    if (state.surface === 'snow' || state.surface === 'sand') return;

    this.#emitTimer += dt;
    // Emit rate scales with lateral speed intensity
    const lateralIntensity = Math.min(Math.abs(state.lateralSpeed) / 8, 1);
    const interval = 0.05 - lateralIntensity * 0.02; // 0.05s → 0.03s
    if (this.#emitTimer < interval) return;
    this.#emitTimer = 0;

    const config = smokeConfig(lateralIntensity);
    const count = lateralIntensity > 0.7 ? 2 : 1;

    // Emit from rear wheels only (indices 2, 3)
    for (const wheelIndex of [2, 3] as const) {
      if (!state.wheelContact[wheelIndex]) continue;
      const wheel = vehicle.wheelWorldPositions[wheelIndex];
      if (!wheel) continue;

      this.#smoke.emit(
        wheel,
        {
          x: vehicle.velocity.x * 0.15,
          y: 0.3,
          z: vehicle.velocity.z * 0.15,
        },
        config,
        count,
      );
    }
  }

  dispose(): void {
    this.#smoke.dispose();
  }
}
