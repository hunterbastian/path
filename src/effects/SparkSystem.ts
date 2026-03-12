import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';
import { SpriteParticleField } from './SpriteParticleField';

/**
 * Spark particle system for metal-on-ground grinding effects.
 * Small, bright, fast-moving particles with high gravity and short life.
 */
export class SparkSystem {
  readonly #field: SpriteParticleField;
  readonly #random = new SeededRandom(0x5350524b);

  constructor(scene: THREE.Scene) {
    this.#field = new SpriteParticleField(scene, {
      capacity: 200,
      color: 0xffcc44,
      opacity: 0.92,
      gravity: 18,
      drag: 0.98,
      fade: (f) => f < 0.5 ? 1 : Math.pow(1 - (f - 0.5) * 2, 0.6),
    });
  }

  get activeCount(): number {
    return this.#field.activeCount;
  }

  /**
   * Emit sparks from a world-space position with a base velocity.
   * @param origin World position of the spark source
   * @param baseVelocity Vehicle velocity for spark direction
   * @param count Number of sparks to emit
   * @param intensity 0–1 scaling for spark energy
   */
  emit(
    origin: { x: number; y: number; z: number },
    baseVelocity: { x: number; y: number; z: number },
    count: number,
    intensity: number,
  ): void {
    const speed = Math.sqrt(
      baseVelocity.x * baseVelocity.x + baseVelocity.z * baseVelocity.z,
    );
    const sparkSpeed = 2 + speed * 0.3 + intensity * 3;

    for (let i = 0; i < count; i++) {
      this.#field.emit({
        position: {
          x: origin.x + this.#random.signed() * 0.15,
          y: origin.y + this.#random.range(-0.05, 0.1),
          z: origin.z + this.#random.signed() * 0.15,
        },
        velocity: {
          x: baseVelocity.x * 0.4 + this.#random.signed() * sparkSpeed,
          y: 1.2 + this.#random.range(0, 2.5) * intensity,
          z: baseVelocity.z * 0.4 + this.#random.signed() * sparkSpeed,
        },
        size: 0.06 + this.#random.range(0, 0.08) * intensity,
        growth: -0.04,
        life: 0.15 + this.#random.range(0, 0.25),
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
