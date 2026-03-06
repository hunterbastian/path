import * as THREE from 'three';
import { InputManager } from '../core/InputManager';
import { Terrain } from '../world/Terrain';
import { Water } from '../world/Water';
import { createDefaultDrivingState, type DriveSurface, type DrivingState } from './DrivingState';
import { VEHICLE_CLEARANCE, VEHICLE_WHEEL_OFFSETS } from './vehicleShared';

type SurfaceHandlingTuning = {
  acceleration: number;
  grip: number;
  drag: number;
  turn: number;
  speed: number;
  steerResponse: number;
  slip: number;
  yawDamping: number;
  counterSteer: number;
};

const SURFACE_TUNING: Record<DriveSurface, SurfaceHandlingTuning> = {
  dirt: {
    acceleration: 1,
    grip: 6.6,
    drag: 1,
    turn: 1.08,
    speed: 1.02,
    steerResponse: 10.5,
    slip: 0.42,
    yawDamping: 7.2,
    counterSteer: 1.35,
  },
  sand: {
    acceleration: 0.82,
    grip: 5.1,
    drag: 1.28,
    turn: 0.86,
    speed: 0.82,
    steerResponse: 7.8,
    slip: 0.5,
    yawDamping: 5.8,
    counterSteer: 1.22,
  },
  grass: {
    acceleration: 0.9,
    grip: 5.6,
    drag: 1.12,
    turn: 0.94,
    speed: 0.9,
    steerResponse: 8.8,
    slip: 0.46,
    yawDamping: 6.2,
    counterSteer: 1.26,
  },
  rock: {
    acceleration: 0.88,
    grip: 6.0,
    drag: 1.06,
    turn: 0.92,
    speed: 0.88,
    steerResponse: 9.4,
    slip: 0.34,
    yawDamping: 7.5,
    counterSteer: 1.3,
  },
  snow: {
    acceleration: 0.74,
    grip: 4.2,
    drag: 1.14,
    turn: 0.78,
    speed: 0.76,
    steerResponse: 6.8,
    slip: 0.68,
    yawDamping: 4.8,
    counterSteer: 1.68,
  },
  water: {
    acceleration: 0.54,
    grip: 2.9,
    drag: 1.65,
    turn: 0.66,
    speed: 0.6,
    steerResponse: 5.2,
    slip: 0.74,
    yawDamping: 3.8,
    counterSteer: 1.84,
  },
};

export class VehicleController {
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly pose = {
    position: this.position,
    quaternion: new THREE.Quaternion(),
  };
  readonly state: DrivingState = createDefaultDrivingState();
  readonly wheelWorldPositions = Array.from({ length: 4 }, () => new THREE.Vector3());

  readonly #terrain: Terrain;
  readonly #water: Water;
  readonly #spawn: THREE.Vector3;
  readonly #basisMatrix = new THREE.Matrix4();
  readonly #groundNormal = new THREE.Vector3(0, 1, 0);
  readonly #forward = new THREE.Vector3(0, 0, 1);
  readonly #right = new THREE.Vector3(1, 0, 0);
  readonly #correctedForward = new THREE.Vector3(0, 0, 1);
  #heading = 0;
  #steering = 0;
  #yawVelocity = 0;
  #boostLevel = 1;
  #time = 0;

  get heading(): number {
    return this.#heading;
  }

  constructor(terrain: Terrain, water: Water, spawnPosition: THREE.Vector3) {
    this.#terrain = terrain;
    this.#water = water;
    this.#spawn = spawnPosition.clone();
    this.reset();
  }

  reset(): void {
    this.position.copy(this.#spawn);
    this.velocity.set(0, 0, 0);
    this.#heading = 0;
    this.#steering = 0;
    this.#yawVelocity = 0;
    this.#boostLevel = 1;
    this.#updateOrientation();
    this.#updateWheelData();
    Object.assign(this.state, createDefaultDrivingState());
    this.state.surface = this.#resolveSurface(this.position.x, this.position.z);
    this.state.boostLevel = this.#boostLevel;
  }

  teleport(position: THREE.Vector3, heading: number): void {
    this.position.copy(position);
    this.velocity.set(0, 0, 0);
    this.#heading = heading;
    this.#steering = 0;
    this.#yawVelocity = 0;
    this.#boostLevel = 1;
    this.#updateOrientation();
    this.#updateWheelData();
    Object.assign(this.state, createDefaultDrivingState());
    this.state.surface = this.#resolveSurface(position.x, position.z);
    this.state.boostLevel = this.#boostLevel;
  }

  halt(): void {
    this.velocity.set(0, 0, 0);
    this.#yawVelocity = 0;
    this.state.speed = 0;
    this.state.forwardSpeed = 0;
    this.state.lateralSpeed = 0;
    this.state.isAccelerating = false;
    this.state.isBoosting = false;
    this.state.isDrifting = false;
    this.state.isBraking = true;
  }

  update(dt: number, input: InputManager, controlsEnabled: boolean): void {
    this.#time += dt;

    const throttle = controlsEnabled ? input.throttle : 0;
    const braking = controlsEnabled ? input.brake : false;
    const wantsBoost = controlsEnabled && input.boost && throttle > 0;

    const currentSurface = this.#resolveSurface(this.position.x, this.position.z);
    const tuning = SURFACE_TUNING[currentSurface];
    const steerInput = controlsEnabled ? input.steering : 0;

    this.#steering +=
      (steerInput - this.#steering) *
      (1 - Math.exp(-tuning.steerResponse * dt));

    this.#forward.set(Math.sin(this.#heading), 0, Math.cos(this.#heading)).normalize();
    this.#right.set(this.#forward.z, 0, -this.#forward.x).normalize();

    let forwardSpeed =
      this.velocity.x * this.#forward.x + this.velocity.z * this.#forward.z;
    let lateralSpeed =
      this.velocity.x * this.#right.x + this.velocity.z * this.#right.z;
    let planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const counterSteering =
      Math.abs(this.#steering) > 0.08
      && Math.abs(lateralSpeed) > 0.9
      && Math.sign(this.#steering) !== Math.sign(lateralSpeed);

    const isBoosting = wantsBoost && this.#boostLevel > 0.04;
    if (isBoosting) {
      this.#boostLevel = Math.max(0, this.#boostLevel - dt * 0.28);
    } else {
      this.#boostLevel = Math.min(1, this.#boostLevel + dt * 0.14);
    }

    if (throttle !== 0) {
      const acceleration = throttle > 0 ? 19.2 : 11;
      const boostMultiplier = isBoosting ? 1.34 : 1;
      const tractionWindow =
        1 - THREE.MathUtils.clamp(
          Math.abs(lateralSpeed) / (10 + Math.max(Math.abs(forwardSpeed), 0) * 0.6),
          0,
          0.36,
        );
      this.velocity.x +=
        this.#forward.x
        * throttle
        * acceleration
        * tuning.acceleration
        * tractionWindow
        * boostMultiplier
        * dt;
      this.velocity.z +=
        this.#forward.z
        * throttle
        * acceleration
        * tuning.acceleration
        * tractionWindow
        * boostMultiplier
        * dt;
    } else {
      const coastLoss =
        forwardSpeed * (1 - Math.exp(-(0.85 * tuning.drag + Math.abs(forwardSpeed) * 0.03) * dt));
      this.velocity.x -= this.#forward.x * coastLoss;
      this.velocity.z -= this.#forward.z * coastLoss;
    }

    if (braking) {
      const forwardBrake = forwardSpeed * (1 - Math.exp(-(7.8 + planarSpeed * 0.08) * dt));
      const lateralBrake = lateralSpeed * (1 - Math.exp(-(9.4 + tuning.grip * 0.75) * dt));
      this.velocity.x -= this.#forward.x * forwardBrake + this.#right.x * lateralBrake;
      this.velocity.z -= this.#forward.z * forwardBrake + this.#right.z * lateralBrake;
    }

    const driftPressure = THREE.MathUtils.clamp(
      Math.abs(this.#steering) * Math.max(forwardSpeed, 0) / 16,
      0,
      1.25,
    );
    const gripScale =
      1 - tuning.slip * driftPressure * (throttle > 0 ? 0.42 : 0.2);
    const lateralGrip =
      tuning.grip
      * gripScale
      * (counterSteering ? tuning.counterSteer : 1)
      * (braking ? 1.18 : 1);
    const lateralCorrection = lateralSpeed * lateralGrip * dt;
    this.velocity.x -= this.#right.x * lateralCorrection;
    this.velocity.z -= this.#right.z * lateralCorrection;

    const dragFactor = Math.max(0, 1 - (0.92 * tuning.drag + planarSpeed * 0.018) * dt);
    this.velocity.x *= dragFactor;
    this.velocity.z *= dragFactor;

    forwardSpeed = this.velocity.x * this.#forward.x + this.velocity.z * this.#forward.z;
    lateralSpeed = this.velocity.x * this.#right.x + this.velocity.z * this.#right.z;
    planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);

    if (Math.abs(forwardSpeed) > 0.08) {
      const steerScale = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / 18, 0.18, 1.25);
      const slipAngle = THREE.MathUtils.clamp(
        lateralSpeed / Math.max(Math.abs(forwardSpeed) + 4, 4),
        -1.3,
        1.3,
      );
      const yawAcceleration =
        this.#steering * 3.3 * tuning.turn * (0.45 + steerScale * 0.95) * (forwardSpeed >= 0 ? 1 : -0.72)
        + slipAngle * tuning.slip * (throttle > 0 ? 2.2 : 1.35);
      this.#yawVelocity += yawAcceleration * dt;
    }
    const yawDamping =
      tuning.yawDamping
      + (counterSteering ? tuning.counterSteer * 1.6 : 0)
      + (braking ? 1.25 : 0)
      + (Math.abs(this.#steering) < 0.05 ? 0.8 : 0);
    this.#yawVelocity *= Math.exp(-yawDamping * dt);
    if (planarSpeed < 1.4) {
      this.#yawVelocity *= Math.exp(-10 * dt);
    }
    this.#heading += this.#yawVelocity * dt;

    const maxSpeed = (isBoosting ? 38 : 30) * tuning.speed;
    if (planarSpeed > maxSpeed) {
      const scale = maxSpeed / planarSpeed;
      this.velocity.x *= scale;
      this.velocity.z *= scale;
      planarSpeed = maxSpeed;
    }

    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;

    if (!this.#terrain.isWithinBounds(this.position.x, this.position.z)) {
      this.reset();
      return;
    }

    const previousY = this.position.y;
    const groundHeight = this.#terrain.getHeightAt(this.position.x, this.position.z);
    const waterHeight = this.#water.getWaterHeightAt(this.position.x, this.position.z);
    const inWater = waterHeight !== null && waterHeight > groundHeight + 0.1;
    const bob = Math.sin(this.#time * 18) * Math.min(planarSpeed, 16) * 0.004;
    const desiredHeight = groundHeight + VEHICLE_CLEARANCE + bob + (inWater ? 0.08 : 0);
    this.position.y += (desiredHeight - this.position.y) * (1 - Math.exp(-10 * dt));
    this.velocity.y = (this.position.y - previousY) / dt;

    const resolvedSurface = inWater ? 'water' : this.#terrain.getSurfaceAt(this.position.x, this.position.z);
    const driftThreshold = 3.2 - tuning.slip * 1.6;
    const isDrifting = Math.abs(lateralSpeed) > driftThreshold && planarSpeed > 6;

    this.#updateOrientation();
    this.#updateWheelData();

    this.state.speed = planarSpeed;
    this.state.forwardSpeed = forwardSpeed;
    this.state.lateralSpeed = lateralSpeed;
    this.state.steering = this.#steering;
    this.state.throttle = throttle;
    this.state.isGrounded = true;
    this.state.isBraking = braking;
    this.state.isBoosting = isBoosting;
    this.state.isAccelerating = throttle !== 0;
    this.state.isDrifting = isDrifting;
    this.state.wasAirborne = false;
    this.state.surface = resolvedSurface;
    this.state.boostLevel = this.#boostLevel;
  }

  #resolveSurface(x: number, z: number): DriveSurface {
    const waterHeight = this.#water.getWaterHeightAt(x, z);
    if (waterHeight !== null) {
      const groundHeight = this.#terrain.getHeightAt(x, z);
      if (waterHeight > groundHeight + 0.1) {
        return 'water';
      }
    }
    return this.#terrain.getSurfaceAt(x, z);
  }

  #updateOrientation(): void {
    this.#groundNormal.copy(this.#terrain.getNormalAt(this.position.x, this.position.z));
    this.#forward
      .set(Math.sin(this.#heading), 0, Math.cos(this.#heading))
      .projectOnPlane(this.#groundNormal)
      .normalize();
    this.#right.crossVectors(this.#groundNormal, this.#forward).normalize();
    this.#correctedForward.crossVectors(this.#right, this.#groundNormal).normalize();
    this.#basisMatrix.makeBasis(this.#right, this.#groundNormal, this.#correctedForward);
    this.pose.quaternion.setFromRotationMatrix(this.#basisMatrix);
  }

  #updateWheelData(): void {
    const wheelCompression: [number, number, number, number] = [0, 0, 0, 0];
    const wheelContact: [boolean, boolean, boolean, boolean] = [true, true, true, true];
    const centerHeight = this.#terrain.getHeightAt(this.position.x, this.position.z);

    for (let index = 0; index < VEHICLE_WHEEL_OFFSETS.length; index += 1) {
      const offset = VEHICLE_WHEEL_OFFSETS[index];
      const wheel = this.wheelWorldPositions[index];
      if (!offset || !wheel) continue;
      wheel
        .copy(this.position)
        .addScaledVector(this.#right, offset.x)
        .addScaledVector(this.#correctedForward, offset.z)
        .addScaledVector(this.#groundNormal, offset.y);

      const wheelGround = this.#terrain.getHeightAt(wheel.x, wheel.z);
      wheelCompression[index] = THREE.MathUtils.clamp(
        (wheelGround - centerHeight) / 0.42,
        -1,
        1,
      );
      wheelContact[index] = true;
    }

    this.state.wheelCompression = wheelCompression;
    this.state.wheelContact = wheelContact;
  }
}
