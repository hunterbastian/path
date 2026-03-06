import * as THREE from 'three';
import { SeededRandom } from '../core/SeededRandom';
import { SpriteParticleField } from './SpriteParticleField';

const TARGET_PARTICLES = 110;

export class WindSystem {
  readonly #field: SpriteParticleField;
  readonly #random = new SeededRandom(0x57494e44);
  readonly #windDirection = new THREE.Vector3(-1, -0.04, 0.35).normalize();
  #densityScale = 1;

  constructor(scene: THREE.Scene) {
    this.#field = new SpriteParticleField(scene, {
      capacity: 160,
      color: 0xdacdb4,
      opacity: 0.16,
      gravity: -0.12,
      drag: 0.985,
      fade: (lifeFraction) =>
        lifeFraction < 0.12
          ? lifeFraction / 0.12
          : Math.pow(1 - lifeFraction, 0.7),
    });
  }

  setDensityScale(scale: number): void {
    this.#densityScale = Math.max(0, scale);
  }

  update(dt: number, cameraPosition: THREE.Vector3): void {
    const targetParticles = Math.round(TARGET_PARTICLES * this.#densityScale);
    const deficit = Math.max(0, targetParticles - this.#field.activeCount);

    for (let index = 0; index < Math.min(deficit, 10); index += 1) {
      const spawnX =
        cameraPosition.x +
        this.#random.signed() * 70 -
        this.#windDirection.x * this.#random.range(30, 80);
      const spawnY = cameraPosition.y + this.#random.range(-6, 28);
      const spawnZ =
        cameraPosition.z +
        this.#random.signed() * 55 -
        this.#windDirection.z * this.#random.range(30, 80);

      this.#field.emit({
        position: { x: spawnX, y: Math.max(spawnY, 2), z: spawnZ },
        velocity: {
          x: this.#windDirection.x * this.#random.range(6.5, 9),
          y: this.#windDirection.y * this.#random.range(0.4, 1.2),
          z: this.#windDirection.z * this.#random.range(6.5, 9),
        },
        size: this.#random.range(5, 8),
        growth: this.#random.range(0.15, 0.4),
        life: this.#random.range(4.5, 7.5),
      });
    }

    this.#field.update(dt);
  }
}
