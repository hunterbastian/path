import { VehicleController } from '../vehicle/VehicleController';
import { Water } from '../world/Water';
import {
  HEAVY_SPLASH,
  SHALLOW_SPLASH,
  SplashSystem,
} from './SplashSystem';

export class SplashEmitter {
  readonly #splash: SplashSystem;
  #timer = 0;

  constructor(splashSystem: SplashSystem) {
    this.#splash = splashSystem;
  }

  update(dt: number, vehicle: VehicleController, water: Water): void {
    this.#timer += dt;
    if (this.#timer < 0.05 || vehicle.state.speed < 3) return;
    this.#timer = 0;

    for (let wheelIndex = 0; wheelIndex < 4; wheelIndex += 1) {
      const wheel = vehicle.wheelWorldPositions[wheelIndex];
      if (!wheel) continue;
      const waterHeight = water.getWaterHeightAt(wheel.x, wheel.z);
      if (waterHeight === null) continue;
      if (Math.abs(wheel.y - waterHeight) > 0.75) continue;

      const profile = vehicle.state.speed > 14 ? HEAVY_SPLASH : SHALLOW_SPLASH;
      const count = vehicle.state.speed > 14 ? 4 : 2;

      this.#splash.emit(
        { x: wheel.x, y: waterHeight + 0.08, z: wheel.z },
        {
          x: vehicle.velocity.x * 0.35,
          y: 0.6,
          z: vehicle.velocity.z * 0.35,
        },
        profile,
        count,
      );
    }
  }
}
