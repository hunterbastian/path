import { DustSystem, type DustConfig } from './DustSystem';
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
}

export class DustEmitter {
  readonly #dust: DustSystem;
  readonly #snow: DustSystem;
  readonly #debris: DustSystem;
  readonly #terrain: Terrain;
  #driveTimer = 0;
  #driftTimer = 0;
  #brakeTimer = 0;
  #debrisTimer = 0;

  constructor(dustSystem: DustSystem, options: DustEmitterOptions) {
    this.#dust = dustSystem;
    this.#terrain = options.terrain;
    this.#snow = options.snowSystem;
    this.#debris = options.debrisSystem;
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
    system.emit(
      wheel,
      {
        x: vehicle.velocity.x * 0.25,
        y: 0.18,
        z: vehicle.velocity.z * 0.25,
      },
      config,
      count,
    );
  }
}
