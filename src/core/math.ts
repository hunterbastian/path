import * as THREE from 'three';

/**
 * Smooth exponential interpolation toward a target value.
 * Framerate-independent alternative to `value += (target - value) * factor`.
 */
export function expLerp(
  current: number,
  target: number,
  response: number,
  dt: number,
): number {
  return current + (target - current) * (1 - Math.exp(-response * dt));
}

/**
 * Framerate-independent exponential decay: `value *= exp(-rate * dt)`.
 */
export function expDecay(value: number, rate: number, dt: number): number {
  return value * Math.exp(-rate * dt);
}

/**
 * Reusable forward/right basis computed from a Y-axis heading angle.
 * Avoids repeated sin/cos + cross product boilerplate.
 */
export class HeadingBasis {
  readonly forward = new THREE.Vector3(0, 0, 1);
  readonly right = new THREE.Vector3(1, 0, 0);

  update(heading: number): void {
    this.forward.set(Math.sin(heading), 0, Math.cos(heading));
    this.right.set(this.forward.z, 0, -this.forward.x);
  }
}
