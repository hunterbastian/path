import { DustSystem, type DustConfig } from './DustSystem';
import type { SparkSystem } from './SparkSystem';
import { VehicleController } from '../vehicle/VehicleController';
import { Terrain } from '../world/Terrain';

const DRIVE_DUST: DustConfig = {
  size: 0.8,
  growth: 1.4,
  life: 0.65,
  spread: 0.32,
  lift: 0.4,
  jitter: 0.8,
};

const DRIFT_DUST: DustConfig = {
  size: 1.05,
  growth: 2.0,
  life: 0.9,
  spread: 0.55,
  lift: 0.55,
  jitter: 1.4,
};

const BRAKE_DUST: DustConfig = {
  size: 0.7,
  growth: 1.1,
  life: 0.55,
  spread: 0.28,
  lift: 0.25,
  jitter: 0.7,
};

const SOFT_SAND_DUST: DustConfig = {
  size: 0.98,
  growth: 1.7,
  life: 0.82,
  spread: 0.46,
  lift: 0.22,
  jitter: 0.95,
};

const ROAD_DUST: DustConfig = {
  size: 0.94,
  growth: 1.58,
  life: 0.76,
  spread: 0.4,
  lift: 0.34,
  jitter: 0.9,
};

const SNOW_SPRAY: DustConfig = {
  size: 0.94,
  growth: 1.9,
  life: 0.88,
  spread: 0.48,
  lift: 0.58,
  jitter: 1.08,
};

const ROCK_DEBRIS: DustConfig = {
  size: 0.26,
  growth: 0.12,
  life: 0.56,
  spread: 0.2,
  lift: 0.24,
  jitter: 1.26,
};

interface DustEmitterOptions {
  terrain: Terrain;
  snowSystem: DustSystem;
  debrisSystem: DustSystem;
  sparkSystem?: SparkSystem;
}

export class DustEmitter {
  readonly #dust: DustSystem;
  readonly #snow: DustSystem;
  readonly #debris: DustSystem;
  readonly #sparks: SparkSystem | null;
  readonly #terrain: Terrain;
  #driveTimer = 0;
  #driftTimer = 0;
  #brakeTimer = 0;
  #debrisTimer = 0;
  #sparkTimer = 0;
  /** Pre-allocated config used to apply high-speed persistence scaling without allocation. */
  readonly #scaledConfig: DustConfig = { size: 0, growth: 0, life: 0, spread: 0, lift: 0, jitter: 0 };

  constructor(dustSystem: DustSystem, options: DustEmitterOptions) {
    this.#dust = dustSystem;
    this.#terrain = options.terrain;
    this.#snow = options.snowSystem;
    this.#debris = options.debrisSystem;
    this.#sparks = options.sparkSystem ?? null;
  }

  update(dt: number, vehicle: VehicleController): void {
    const state = vehicle.state;
    if (!state.isGrounded || state.surface === 'water') return;

    this.#driveTimer += dt;
    this.#driftTimer += dt;
    this.#brakeTimer += dt;
    this.#debrisTimer += dt;
    const roadInfluence = this.#terrain.getRoadInfluence(
      vehicle.position.x,
      vehicle.position.z,
    );

    if (state.isAccelerating && this.#driveTimer >= 0.06) {
      this.#driveTimer = 0;
      const surfaceSystem =
        state.surface === 'snow'
          ? this.#snow
          : this.#dust;
      const driveConfig =
        state.surface === 'sand'
          ? SOFT_SAND_DUST
          : state.surface === 'snow'
            ? SNOW_SPRAY
            : state.surface === 'dirt' && roadInfluence > 0.34
              ? ROAD_DUST
              : DRIVE_DUST;
      const wheels =
        state.surface === 'sand' || state.surface === 'snow'
          ? ([0, 1, 2, 3] as const)
          : roadInfluence > 0.34
            ? ([0, 1, 2, 3] as const)
            : ([2, 3] as const);
      const count =
        state.surface === 'sand'
          ? (state.sinkDepth > 0.1 || state.surfaceBuildup > 0.3 ? 2 : 1)
          : state.surface === 'snow'
            ? (state.speed > 10 ? 2 : 1)
            : roadInfluence > 0.34
              ? 2
              : 1;
      for (const wheelIndex of wheels) {
        this.#emit(surfaceSystem, vehicle, wheelIndex, driveConfig, count);
      }
    }

    if (state.isDrifting && this.#driftTimer >= 0.045) {
      this.#driftTimer = 0;
      const system = state.surface === 'snow' ? this.#snow : this.#dust;
      const config = state.surface === 'snow' ? SNOW_SPRAY : DRIFT_DUST;
      const count = state.speed > 18 ? 3 : 2;
      for (let wheelIndex = 0; wheelIndex < 4; wheelIndex += 1) {
        if (!state.wheelContact[wheelIndex]) continue;
        this.#emit(system, vehicle, wheelIndex, config, count);
      }
    }

    if (state.isBraking && state.speed > 2 && this.#brakeTimer >= 0.07) {
      this.#brakeTimer = 0;
      const system = state.surface === 'snow' ? this.#snow : this.#dust;
      const config = state.surface === 'snow' ? SNOW_SPRAY : BRAKE_DUST;
      for (let wheelIndex = 0; wheelIndex < 4; wheelIndex += 1) {
        if (!state.wheelContact[wheelIndex]) continue;
        this.#emit(system, vehicle, wheelIndex, config, 1);
      }
    }

    if (
      (state.surface === 'dirt' || state.surface === 'rock')
      && state.speed > 6
      && this.#debrisTimer >= 0.09
    ) {
      this.#debrisTimer = 0;
      const debrisCount =
        state.surface === 'rock'
          ? 2
          : roadInfluence > 0.28 || state.isDrifting
            ? 2
            : 1;
      for (const wheelIndex of [2, 3] as const) {
        if (!state.wheelContact[wheelIndex]) continue;
        this.#emit(this.#debris, vehicle, wheelIndex, ROCK_DEBRIS, debrisCount);
      }
    }

    // --- Sparks from missing wheels grinding on ground ---
    if (this.#sparks && state.isGrounded && state.speed > 2) {
      this.#sparkTimer += dt;
      // Emit every 0.03s — fast bursts
      if (this.#sparkTimer >= 0.03) {
        this.#sparkTimer = 0;
        const speedNorm = Math.min(state.speed / 25, 1);
        for (let i = 0; i < 4; i++) {
          if (state.wheelAttached[i]) continue;
          const wheel = vehicle.wheelWorldPositions[i];
          if (!wheel) continue;
          // More sparks at higher speed
          const count = speedNorm > 0.5 ? 3 : speedNorm > 0.25 ? 2 : 1;
          this.#sparks.emit(
            { x: wheel.x, y: wheel.y - 0.3, z: wheel.z },
            vehicle.velocity,
            count,
            speedNorm,
          );
        }
      }
    }
  }

  #emit(
    system: DustSystem,
    vehicle: VehicleController,
    wheelIndex: number,
    config: DustConfig,
    count: number,
  ): void {
    const wheel = vehicle.wheelWorldPositions[wheelIndex];
    if (!wheel) return;

    // Feature 4: At high speed, increase particle lifetime, size, and spread
    // for a more visible, lingering dust trail.
    const speed = vehicle.state.speed;
    const speedFactor = Math.min(speed / 40, 1); // 0..1 as speed goes 0..40
    const lifeScale = 1 + speedFactor * 0.8;     // up to 1.8x lifetime
    const sizeScale = 1 + speedFactor * 0.35;    // up to 1.35x size
    const growthScale = 1 + speedFactor * 0.3;   // up to 1.3x growth (slower fade-out look)

    this.#scaledConfig.size = config.size * sizeScale;
    this.#scaledConfig.growth = config.growth * growthScale;
    this.#scaledConfig.life = config.life * lifeScale;
    this.#scaledConfig.spread = config.spread * (1 + speedFactor * 0.25);
    this.#scaledConfig.lift = config.lift;
    this.#scaledConfig.jitter = config.jitter;

    system.emit(
      wheel,
      {
        x: vehicle.velocity.x * 0.25,
        y: 0.18,
        z: vehicle.velocity.z * 0.25,
      },
      this.#scaledConfig,
      count,
    );
  }

  /** Burst of dust/debris when landing hard from a jump or tumble. */
  emitLandingBurst(vehicle: VehicleController, magnitude: number): void {
    if (vehicle.state.surface === 'water') return;
    const intensity = Math.min(magnitude / 10, 1);
    const count = Math.round(3 + intensity * 5);
    const burstConfig: DustConfig = {
      size: 1.4 + intensity * 0.8,
      growth: 2.8,
      life: 0.9 + intensity * 0.5,
      spread: 1.2 + intensity * 0.6,
      lift: 0.6 + intensity * 0.4,
      jitter: 2.0,
    };
    // Emit from all 4 wheels for a radial burst
    for (let i = 0; i < 4; i++) {
      const wheel = vehicle.wheelWorldPositions[i];
      if (!wheel) continue;
      const system = vehicle.state.surface === 'snow' ? this.#snow : this.#dust;
      system.emit(
        wheel,
        { x: (Math.random() - 0.5) * 3, y: 1.2 + intensity * 0.8, z: (Math.random() - 0.5) * 3 },
        burstConfig,
        count,
      );
    }
  }
}
