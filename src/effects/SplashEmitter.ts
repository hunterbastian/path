import { VehicleController } from '../vehicle/VehicleController';
import { Terrain } from '../world/Terrain';
import { Water } from '../world/Water';
import {
  HEAVY_SPLASH,
  SHALLOW_SPLASH,
  type SplashConfig,
  SplashSystem,
} from './SplashSystem';

const MUD_SPLASH: SplashConfig = {
  size: 0.72,
  growth: 0.62,
  life: 0.68,
  spread: 0.38,
  lift: 0.78,
  jitter: 0.84,
};

interface SplashEmitterOptions {
  terrain: Terrain;
  mudSystem: SplashSystem;
}

export class SplashEmitter {
  readonly #splash: SplashSystem;
  readonly #mud: SplashSystem;
  readonly #terrain: Terrain;
  #timer = 0;

  constructor(splashSystem: SplashSystem, options: SplashEmitterOptions) {
    this.#splash = splashSystem;
    this.#mud = options.mudSystem;
    this.#terrain = options.terrain;
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
      const surfaceBelow = this.#terrain.getSurfaceAt(wheel.x, wheel.z);
      const terrainHeight = this.#terrain.getHeightAt(wheel.x, wheel.z);
      const waterDepth = Math.max(0, waterHeight - terrainHeight);
      const roadInfluence = this.#terrain.getRoadInfluence(wheel.x, wheel.z);
      const muddySurface =
        surfaceBelow === 'dirt'
        || surfaceBelow === 'grass'
        || surfaceBelow === 'sand'
        || roadInfluence > 0.22;

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

      if (muddySurface && waterDepth < 0.58) {
        this.#mud.emit(
          { x: wheel.x, y: waterHeight + 0.04, z: wheel.z },
          {
            x: vehicle.velocity.x * 0.28,
            y: 0.44,
            z: vehicle.velocity.z * 0.28,
          },
          MUD_SPLASH,
          vehicle.state.speed > 14 ? 3 : 2,
        );
      }
    }
  }
}
