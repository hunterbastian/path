import { DustSystem, type DustConfig } from './DustSystem';
import { VehicleController } from '../vehicle/VehicleController';

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

export class DustEmitter {
  readonly #dust: DustSystem;
  #driveTimer = 0;
  #driftTimer = 0;
  #brakeTimer = 0;

  constructor(dustSystem: DustSystem) {
    this.#dust = dustSystem;
  }

  update(dt: number, vehicle: VehicleController): void {
    const state = vehicle.state;
    if (!state.isGrounded || state.surface === 'water') return;

    this.#driveTimer += dt;
    this.#driftTimer += dt;
    this.#brakeTimer += dt;

    if (state.isAccelerating && this.#driveTimer >= 0.06) {
      this.#driveTimer = 0;
      for (const wheelIndex of [2, 3] as const) {
        this.#emit(vehicle, wheelIndex, DRIVE_DUST, 1);
      }
    }

    if (state.isDrifting && this.#driftTimer >= 0.045) {
      this.#driftTimer = 0;
      const count = state.speed > 18 ? 3 : 2;
      for (let wheelIndex = 0; wheelIndex < 4; wheelIndex += 1) {
        if (!state.wheelContact[wheelIndex]) continue;
        this.#emit(vehicle, wheelIndex, DRIFT_DUST, count);
      }
    }

    if (state.isBraking && state.speed > 2 && this.#brakeTimer >= 0.07) {
      this.#brakeTimer = 0;
      for (let wheelIndex = 0; wheelIndex < 4; wheelIndex += 1) {
        if (!state.wheelContact[wheelIndex]) continue;
        this.#emit(vehicle, wheelIndex, BRAKE_DUST, 1);
      }
    }
  }

  #emit(
    vehicle: VehicleController,
    wheelIndex: number,
    config: DustConfig,
    count: number,
  ): void {
    const wheel = vehicle.wheelWorldPositions[wheelIndex];
    if (!wheel) return;
    this.#dust.emit(
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
