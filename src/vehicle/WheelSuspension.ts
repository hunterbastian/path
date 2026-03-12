import * as THREE from 'three';
import { expLerp } from '../core/math';
import type { Terrain } from '../world/Terrain';
import {
  VEHICLE_WHEEL_OFFSETS,
  VEHICLE_WHEEL_RADIUS,
  VEHICLE_WHEEL_CONTACT_CLEARANCE,
  VEHICLE_WHEEL_TRAVEL,
} from './vehicleShared';

/**
 * Per-wheel spring-damper suspension model.
 *
 * Each wheel has its own spring that compresses/extends based on terrain contact.
 * The differential compression across wheels produces body pitch (front/rear) and
 * roll (left/right). Individual wheel loads feed into grip calculations.
 *
 * Wheel indices: FL=0, FR=1, RL=2, RR=3
 */

export interface WheelState {
  /** Spring compression: -1 (fully extended) to +1 (fully compressed). */
  compression: number;
  /** Whether this wheel is in contact with terrain. */
  contact: boolean;
  /** World-space position of the wheel hub. */
  worldPosition: THREE.Vector3;
  /** Vertical spring velocity (m/s) for damping calculation. */
  springVelocity: number;
  /** Normalized load on this wheel (0..~2). 1.0 = static weight, >1 = extra load. */
  load: number;
}

export interface SuspensionOutput {
  /** Body pitch offset in radians. Positive = nose down. */
  pitch: number;
  /** Body roll offset in radians. Positive = lean right. */
  roll: number;
  /** Total vertical force from all springs (used to supplement gravity response). */
  verticalForce: number;
  /** Per-wheel load factors for grip scaling (FL, FR, RL, RR). */
  wheelLoads: [number, number, number, number];
  /** Per-wheel compression for visual animation. */
  wheelCompression: [number, number, number, number];
  /** Per-wheel contact booleans. */
  wheelContact: [boolean, boolean, boolean, boolean];
  /** Number of wheels in contact with ground. */
  contactCount: number;
}

/** Spring-damper tuning constants. */
const SPRING_RATE = 62;        // N/m equivalent — stiffness of each spring
const DAMPING_RATE = 18;       // Damping coefficient — higher = less bounce
const REBOUND_DAMPING = 12;    // Damping on extension (lower = faster rebound)
const PITCH_GAIN = 0.032;      // Radians of pitch per unit compression differential
const ROLL_GAIN = 0.028;       // Radians of roll per unit compression differential
const PITCH_RESPONSE = 12;     // How fast pitch settles (higher = snappier)
const ROLL_RESPONSE = 10;      // How fast roll settles
const LOAD_BASE = 0.25;        // Static load per wheel (4 wheels, normalized to 1.0 total)

export class WheelSuspension {
  readonly #terrain: Terrain;
  readonly #wheels: WheelState[];
  #pitch = 0;
  #roll = 0;
  /** Previous frame compression for spring velocity. */
  readonly #prevCompression: [number, number, number, number] = [0, 0, 0, 0];

  constructor(terrain: Terrain) {
    this.#terrain = terrain;
    this.#wheels = Array.from({ length: 4 }, () => ({
      compression: 0,
      contact: true,
      worldPosition: new THREE.Vector3(),
      springVelocity: 0,
      load: LOAD_BASE,
    }));
  }

  /**
   * Update all wheel springs and compute body tilt.
   *
   * @param dt - Time step in seconds.
   * @param vehiclePosition - Current vehicle center position.
   * @param right - Vehicle's local right vector (world space).
   * @param forward - Vehicle's corrected forward vector (world space).
   * @param groundNormal - Smoothed ground normal under the vehicle.
   * @param isGrounded - Whether the vehicle body is in ground contact.
   * @param attached - Which wheels are still physically attached.
   */
  update(
    dt: number,
    vehiclePosition: THREE.Vector3,
    right: THREE.Vector3,
    forward: THREE.Vector3,
    groundNormal: THREE.Vector3,
    isGrounded: boolean,
    attached: [boolean, boolean, boolean, boolean],
  ): SuspensionOutput {
    let contactCount = 0;
    const compressions: [number, number, number, number] = [0, 0, 0, 0];
    const contacts: [boolean, boolean, boolean, boolean] = [true, true, true, true];
    const loads: [number, number, number, number] = [LOAD_BASE, LOAD_BASE, LOAD_BASE, LOAD_BASE];

    for (let i = 0; i < 4; i += 1) {
      const offset = VEHICLE_WHEEL_OFFSETS[i];
      const wheel = this.#wheels[i];
      if (!offset || !wheel) continue;

      // Compute wheel world position
      wheel.worldPosition
        .copy(vehiclePosition)
        .addScaledVector(right, offset.x)
        .addScaledVector(forward, offset.z)
        .addScaledVector(groundNormal, offset.y);

      if (!attached[i]) {
        // Detached wheel — no contact, no load
        wheel.compression = 0;
        wheel.contact = false;
        wheel.springVelocity = 0;
        wheel.load = 0;
        compressions[i] = 0;
        contacts[i] = false;
        continue;
      }

      const wheelGround = this.#terrain.getHeightAt(
        wheel.worldPosition.x,
        wheel.worldPosition.z,
      );
      const contactDistance = VEHICLE_WHEEL_RADIUS + VEHICLE_WHEEL_CONTACT_CLEARANCE;
      const groundDistance = wheel.worldPosition.y - wheelGround;

      // Spring compression: 0 = neutral, positive = compressed, negative = extended
      const rawCompression = THREE.MathUtils.clamp(
        (contactDistance - groundDistance) / VEHICLE_WHEEL_TRAVEL,
        -1,
        1,
      );

      // Spring velocity = rate of change of compression (for damping)
      const prevComp = this.#prevCompression[i] ?? 0;
      wheel.springVelocity = (rawCompression - prevComp) / Math.max(dt, 0.001);
      this.#prevCompression[i] = rawCompression;

      // Damped spring: compress damping is stronger than rebound
      const dampingCoeff = wheel.springVelocity > 0 ? DAMPING_RATE : REBOUND_DAMPING;
      const dampedCompression = rawCompression - wheel.springVelocity * dampingCoeff * 0.001;
      wheel.compression = THREE.MathUtils.clamp(dampedCompression, -1, 1);

      // Contact detection with hysteresis
      const inContact = groundDistance <= contactDistance + 0.05;
      wheel.contact = inContact;
      contacts[i] = inContact;
      compressions[i] = wheel.compression;

      if (inContact) {
        contactCount += 1;
        // Load: baseline + spring force contribution
        // More compressed = more load on this wheel
        wheel.load = LOAD_BASE + Math.max(wheel.compression, 0) * 0.4;
      } else {
        wheel.load = 0;
      }

      loads[i] = wheel.load;
    }

    // Normalize loads so they sum to ~1.0 (total vehicle weight = 1)
    const totalLoad = loads[0] + loads[1] + loads[2] + loads[3];
    if (totalLoad > 0.01) {
      const scale = 1 / totalLoad;
      loads[0] *= scale;
      loads[1] *= scale;
      loads[2] *= scale;
      loads[3] *= scale;
    }

    // Compute body tilt from compression differentials
    if (isGrounded && contactCount >= 2) {
      const frontAvg = (compressions[0] + compressions[1]) * 0.5;
      const rearAvg = (compressions[2] + compressions[3]) * 0.5;
      const leftAvg = (compressions[0] + compressions[2]) * 0.5;
      const rightAvg = (compressions[1] + compressions[3]) * 0.5;

      const targetPitch = (frontAvg - rearAvg) * PITCH_GAIN;
      const targetRoll = (rightAvg - leftAvg) * ROLL_GAIN;

      this.#pitch = expLerp(this.#pitch, targetPitch, PITCH_RESPONSE, dt);
      this.#roll = expLerp(this.#roll, targetRoll, ROLL_RESPONSE, dt);
    } else {
      // Airborne — springs return to neutral
      this.#pitch = expLerp(this.#pitch, 0, 4, dt);
      this.#roll = expLerp(this.#roll, 0, 4, dt);
    }

    // Total vertical spring force (sum of compression × spring rate)
    const verticalForce =
      (Math.max(compressions[0], 0) +
        Math.max(compressions[1], 0) +
        Math.max(compressions[2], 0) +
        Math.max(compressions[3], 0)) *
      SPRING_RATE *
      0.25;

    return {
      pitch: this.#pitch,
      roll: this.#roll,
      verticalForce,
      wheelLoads: loads,
      wheelCompression: compressions,
      wheelContact: contacts,
      contactCount,
    };
  }

  reset(): void {
    this.#pitch = 0;
    this.#roll = 0;
    for (let i = 0; i < 4; i += 1) {
      this.#prevCompression[i] = 0;
      const wheel = this.#wheels[i];
      if (wheel) {
        wheel.compression = 0;
        wheel.contact = true;
        wheel.springVelocity = 0;
        wheel.load = LOAD_BASE;
      }
    }
  }
}
