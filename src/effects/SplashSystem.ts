import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';
import { SpriteParticleField } from './SpriteParticleField';

export interface SplashConfig {
  size: number;
  growth: number;
  life: number;
  spread: number;
  lift: number;
  jitter: number;
}

export const SHALLOW_SPLASH: SplashConfig = {
  size: 0.85,
  growth: 1.0,
  life: 0.75,
  spread: 0.45,
  lift: 1.1,
  jitter: 1.2,
};

export const HEAVY_SPLASH: SplashConfig = {
  size: 1.05,
  growth: 1.3,
  life: 0.92,
  spread: 0.6,
  lift: 1.6,
  jitter: 1.7,
};

export class SplashSystem {
  readonly #field: SpriteParticleField;
  readonly #random = new SeededRandom(0x53504c53);

  constructor(scene: THREE.Scene) {
    this.#field = new SpriteParticleField(scene, {
      capacity: 220,
      color: 0x8fd0dc,
      opacity: 0.42,
      gravity: -8.2,
      drag: 0.92,
      fade: (lifeFraction) =>
        lifeFraction < 0.55 ? 1 : 1 - (lifeFraction - 0.55) / 0.45,
    });
  }

  emit(
    origin: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
    config: SplashConfig,
    count: number,
  ): void {
    for (let burst = 0; burst < count; burst += 1) {
      this.#field.emit({
        position: {
          x: origin.x + this.#random.signed() * config.spread,
          y: origin.y + this.#random.range(0, config.spread * 0.25),
          z: origin.z + this.#random.signed() * config.spread,
        },
        velocity: {
          x: velocity.x + this.#random.signed() * config.jitter,
          y: velocity.y + config.lift + this.#random.range(0, config.lift * 1.1),
          z: velocity.z + this.#random.signed() * config.jitter,
        },
        size: config.size * this.#random.range(0.86, 1.14),
        growth: config.growth * this.#random.range(0.86, 1.18),
        life: config.life * this.#random.range(0.82, 1.12),
      });
    }
  }

  update(dt: number): void {
    this.#field.update(dt);
  }
}
