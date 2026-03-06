import * as THREE from 'three';
import type { GameTuning } from '../config/GameTuning';
import { RainSystem } from '../effects/RainSystem';
import { Sky } from '../world/Sky';

export interface WeatherSnapshot {
  label: string;
  rainDensity: number;
  fogNear: number;
  fogFar: number;
  mistStrength: number;
}

export class WeatherState {
  readonly #tuning: GameTuning;
  readonly #sky: Sky;
  readonly #rainSystem: RainSystem;
  #snapshot: WeatherSnapshot;

  constructor(tuning: GameTuning, sky: Sky, rainSystem: RainSystem) {
    this.#tuning = tuning;
    this.#sky = sky;
    this.#rainSystem = rainSystem;
    this.#snapshot = {
      label: tuning.weather.label,
      rainDensity: tuning.weather.rainDensity,
      fogNear: tuning.weather.fogNear,
      fogFar: tuning.weather.fogFar,
      mistStrength: tuning.weather.mistStrength,
    };
    this.update(1);
  }

  get snapshot(): WeatherSnapshot {
    return this.#snapshot;
  }

  update(routeActivity: number): WeatherSnapshot {
    const density = Math.max(0, this.#tuning.weather.rainDensity * routeActivity);
    const fogDistanceMultiplier = Math.max(0.2, this.#tuning.weather.fogDistanceMultiplier);
    const fogNear = this.#tuning.weather.fogNear * fogDistanceMultiplier;
    const fogFar = this.#tuning.weather.fogFar * fogDistanceMultiplier;
    const mistStrength = this.#tuning.weather.mistStrength * THREE.MathUtils.lerp(0.72, 1, routeActivity);

    this.#rainSystem.setDensityScale(density);
    this.#sky.setAtmosphere(fogNear, fogFar, mistStrength);

    this.#snapshot = {
      label: this.#tuning.weather.label,
      rainDensity: Number(density.toFixed(2)),
      fogNear: Number(fogNear.toFixed(1)),
      fogFar: Number(fogFar.toFixed(1)),
      mistStrength: Number(mistStrength.toFixed(2)),
    };

    return this.#snapshot;
  }
}
