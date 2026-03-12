import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';
import { SpriteParticleField } from './SpriteParticleField';

export interface DustConfig {
  size: number;
  growth: number;
  life: number;
  spread: number;
  lift: number;
  jitter: number;
}

interface DustSystemOptions {
  capacity?: number;
  color?: THREE.ColorRepresentation;
  opacity?: number;
  gravity?: number;
  drag?: number;
  fade?: (lifeFraction: number) => number;
  blending?: THREE.Blending;
}

export class DustSystem {
  readonly #field: SpriteParticleField;
  readonly #random = new SeededRandom(0x44555354);

  constructor(scene: THREE.Scene, options: DustSystemOptions = {}) {
    const fieldOptions = {
      capacity: options.capacity ?? 360,
      color: options.color ?? 0xd7c0a0,
      opacity: options.opacity ?? 0.34,
      gravity: options.gravity ?? -2.8,
      drag: options.drag ?? 0.94,
      fade: options.fade ?? ((lifeFraction: number) => Math.pow(1 - lifeFraction, 1.8)),
      ...(options.blending != null ? { blending: options.blending } : {}),
    };
    this.#field = new SpriteParticleField(scene, fieldOptions);
  }

  get activeCount(): number {
    return this.#field.activeCount;
  }

  emit(
    origin: { x: number; y: number; z: number },
    velocity: { x: number; y: number; z: number },
    config: DustConfig,
    count: number,
  ): void {
    for (let burst = 0; burst < count; burst += 1) {
      this.#field.emit({
        position: {
          x: origin.x + this.#random.signed() * config.spread,
          y: origin.y + this.#random.range(0, config.spread * 0.3),
          z: origin.z + this.#random.signed() * config.spread,
        },
        velocity: {
          x: velocity.x + this.#random.signed() * config.jitter,
          y: velocity.y + config.lift + this.#random.range(0, config.lift),
          z: velocity.z + this.#random.signed() * config.jitter,
        },
        size: config.size * this.#random.range(0.86, 1.18),
        growth: config.growth * this.#random.range(0.8, 1.2),
        life: config.life * this.#random.range(0.82, 1.18),
      });
    }
  }

  update(dt: number): void {
    this.#field.update(dt);
  }

  dispose(): void {
    this.#field.dispose();
  }
}
