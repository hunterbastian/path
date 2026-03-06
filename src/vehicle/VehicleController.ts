import * as THREE from 'three';
import type { GameTuning } from '../config/GameTuning';
import { InputManager } from '../core/InputManager';
import { Terrain } from '../world/Terrain';
import { Water } from '../world/Water';
import { createDefaultDrivingState, type DriveSurface, type DrivingState } from './DrivingState';
import {
  VEHICLE_CLEARANCE,
  VEHICLE_WHEEL_CONTACT_CLEARANCE,
  VEHICLE_WHEEL_OFFSETS,
  VEHICLE_WHEEL_RADIUS,
  VEHICLE_WHEEL_TRAVEL,
} from './vehicleShared';

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
  readonly #tuning: GameTuning;
  readonly #spawn: THREE.Vector3;
  readonly #basisMatrix = new THREE.Matrix4();
  readonly #groundNormal = new THREE.Vector3(0, 1, 0);
  readonly #worldUp = new THREE.Vector3(0, 1, 0);
  readonly #forward = new THREE.Vector3(0, 0, 1);
  readonly #right = new THREE.Vector3(1, 0, 0);
  readonly #correctedForward = new THREE.Vector3(0, 0, 1);
  readonly #landingBounceBySurface: Record<DriveSurface, number> = {
    dirt: 0.24,
    sand: 0.06,
    grass: 0.16,
    rock: 0.28,
    snow: 0.22,
    water: 0.04,
  };
  #heading = 0;
  #steering = 0;
  #yawVelocity = 0;
  #boostLevel = 1;
  #sinkDepth = 0;
  #surfaceBuildup = 0;
  #airborneTime = 0;
  #time = 0;

  get heading(): number {
    return this.#heading;
  }

  constructor(
    terrain: Terrain,
    water: Water,
    tuning: GameTuning,
    spawnPosition: THREE.Vector3,
  ) {
    this.#terrain = terrain;
    this.#water = water;
    this.#tuning = tuning;
    this.#spawn = spawnPosition.clone();
    this.reset();
  }

  reset(): void {
    const surfaceSample = this.#sampleSurfaceAt(this.#spawn.x, this.#spawn.z);
    this.position.set(this.#spawn.x, surfaceSample.rideHeight, this.#spawn.z);
    this.velocity.set(0, 0, 0);
    this.#heading = 0;
    this.#steering = 0;
    this.#yawVelocity = 0;
    this.#boostLevel = 1;
    this.#sinkDepth = 0;
    this.#surfaceBuildup = 0;
    this.#airborneTime = 0;
    this.#groundNormal.copy(this.#terrain.getNormalAt(this.position.x, this.position.z));
    this.#composeOrientation();
    this.#updateWheelData();
    Object.assign(this.state, createDefaultDrivingState());
    this.state.surface = surfaceSample.surface;
    this.state.boostLevel = this.#boostLevel;
    this.state.sinkDepth = this.#sinkDepth;
    this.state.surfaceBuildup = this.#surfaceBuildup;
  }

  teleport(position: THREE.Vector3, heading: number): void {
    const surfaceSample = this.#sampleSurfaceAt(position.x, position.z);
    this.position.set(position.x, surfaceSample.rideHeight, position.z);
    this.velocity.set(0, 0, 0);
    this.#heading = heading;
    this.#steering = 0;
    this.#yawVelocity = 0;
    this.#boostLevel = 1;
    this.#sinkDepth = 0;
    this.#surfaceBuildup = 0;
    this.#airborneTime = 0;
    this.#groundNormal.copy(this.#terrain.getNormalAt(this.position.x, this.position.z));
    this.#composeOrientation();
    this.#updateWheelData();
    Object.assign(this.state, createDefaultDrivingState());
    this.state.surface = surfaceSample.surface;
    this.state.boostLevel = this.#boostLevel;
    this.state.sinkDepth = this.#sinkDepth;
    this.state.surfaceBuildup = this.#surfaceBuildup;
  }

  halt(): void {
    this.velocity.set(0, 0, 0);
    this.#yawVelocity = 0;
    this.#sinkDepth = 0;
    this.#surfaceBuildup = 0;
    this.#airborneTime = 0;
    this.state.speed = 0;
    this.state.forwardSpeed = 0;
    this.state.lateralSpeed = 0;
    this.state.verticalSpeed = 0;
    this.state.airborneTime = 0;
    this.state.isAccelerating = false;
    this.state.isBoosting = false;
    this.state.isDrifting = false;
    this.state.isBraking = true;
  }

  update(dt: number, input: InputManager, controlsEnabled: boolean): void {
    this.#time += dt;
    const previousGrounded = this.state.isGrounded;

    const throttleIntent = controlsEnabled ? input.throttle : 0;

    const currentSurface = previousGrounded
      ? this.#sampleSurfaceAt(this.position.x, this.position.z).surface
      : this.state.surface;
    const vehicleTuning = this.#tuning.vehicle;
    const surfaceTuning = vehicleTuning.surfaces[currentSurface];
    const tuning = {
      ...surfaceTuning,
      acceleration: surfaceTuning.acceleration * vehicleTuning.accelerationMultiplier,
      grip: surfaceTuning.grip * vehicleTuning.gripMultiplier,
      speed: surfaceTuning.speed * vehicleTuning.speedMultiplier,
      yawDamping: surfaceTuning.yawDamping * vehicleTuning.yawDampingMultiplier,
    };
    const steerInput = controlsEnabled ? input.steering : 0;
    const maxSandSinkDepth = vehicleTuning.maxSandSinkDepth * vehicleTuning.sinkDepthMultiplier;
    const tractionControl = previousGrounded ? 1 : vehicleTuning.airControl;
    const turnControl = previousGrounded ? 1 : vehicleTuning.airTurnControl;
    const bogFactor = currentSurface === 'sand'
      ? 1 - THREE.MathUtils.clamp(this.#sinkDepth / maxSandSinkDepth, 0, 1) * 0.42
      : 1;

    this.#forward.set(Math.sin(this.#heading), 0, Math.cos(this.#heading)).normalize();
    this.#right.set(this.#forward.z, 0, -this.#forward.x).normalize();

    let forwardSpeed =
      this.velocity.x * this.#forward.x + this.velocity.z * this.#forward.z;
    let lateralSpeed =
      this.velocity.x * this.#right.x + this.velocity.z * this.#right.z;
    let planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);
    const autoBraking =
      throttleIntent < 0 && forwardSpeed > 2.2;
    const braking = controlsEnabled && (input.brake || autoBraking);
    const driveThrottle = autoBraking ? 0 : throttleIntent;
    const wantsBoost = controlsEnabled && input.boost && driveThrottle > 0 && !braking;
    const counterSteering =
      Math.abs(this.#steering) > 0.08
      && Math.abs(lateralSpeed) > 0.9
      && Math.sign(this.#steering) !== Math.sign(lateralSpeed);

    const isBoosting = wantsBoost && this.#boostLevel > 0.04;
    if (isBoosting) {
      this.#boostLevel = Math.max(
        0,
        this.#boostLevel - dt * vehicleTuning.boostDrainPerSecond,
      );
    } else {
      this.#boostLevel = Math.min(
        1,
        this.#boostLevel + dt * vehicleTuning.boostRegenPerSecond,
      );
    }

    const steeringResponse =
      tuning.steerResponse
      * (Math.abs(steerInput) < 0.01 ? 1.35 : 1)
      * (planarSpeed < 8 ? 1.16 : 1);
    this.#steering +=
      (steerInput - this.#steering) *
      (1 - Math.exp(-steeringResponse * dt));

    if (driveThrottle !== 0) {
      const acceleration = driveThrottle > 0
        ? vehicleTuning.baseAcceleration
        : vehicleTuning.reverseAcceleration;
      const boostMultiplier = isBoosting ? vehicleTuning.boostMultiplier : 1;
      const tractionWindow =
        1 - THREE.MathUtils.clamp(
          Math.abs(lateralSpeed) / (10 + Math.max(Math.abs(forwardSpeed), 0) * 0.6),
          0,
          0.36,
        );
      this.velocity.x +=
        this.#forward.x
        * driveThrottle
        * acceleration
        * tuning.acceleration
        * bogFactor
        * tractionWindow
        * boostMultiplier
        * tractionControl
        * dt;
      this.velocity.z +=
        this.#forward.z
        * driveThrottle
        * acceleration
        * tuning.acceleration
        * bogFactor
        * tractionWindow
        * boostMultiplier
        * tractionControl
        * dt;
    } else {
      const coastLoss =
        forwardSpeed
        * (1 - Math.exp(-(vehicleTuning.coastDragBase * tuning.drag + Math.abs(forwardSpeed) * 0.03) * dt));
      this.velocity.x -= this.#forward.x * coastLoss;
      this.velocity.z -= this.#forward.z * coastLoss;
    }

    if (braking) {
      const forwardBrake =
        forwardSpeed
        * (1 - Math.exp(-(vehicleTuning.brakeForwardBase + planarSpeed * 0.08) * dt))
        * tractionControl;
      const lateralBrake =
        lateralSpeed
        * (1 - Math.exp(-(vehicleTuning.brakeLateralBase + tuning.grip * 0.75) * dt))
        * tractionControl;
      this.velocity.x -= this.#forward.x * forwardBrake + this.#right.x * lateralBrake;
      this.velocity.z -= this.#forward.z * forwardBrake + this.#right.z * lateralBrake;
    }

    const driftPressure = THREE.MathUtils.clamp(
      Math.abs(this.#steering) * Math.max(forwardSpeed, 0) / 16,
      0,
      1.25,
    );
    const gripScale =
      1 - tuning.slip * driftPressure * (driveThrottle > 0 ? 0.42 : 0.2);
    const lateralGrip =
      tuning.grip
      * gripScale
      * (counterSteering ? tuning.counterSteer : 1)
      * (braking ? 1.18 : 1)
      * tractionControl;
    const lateralCorrection = lateralSpeed * lateralGrip * dt;
    this.velocity.x -= this.#right.x * lateralCorrection;
    this.velocity.z -= this.#right.z * lateralCorrection;

    const sinkDrag = currentSurface === 'sand'
      ? THREE.MathUtils.clamp(this.#sinkDepth * 4.5, 0, 1.2)
      : 0;
    const dragBase = previousGrounded
      ? 0.92 * tuning.drag + sinkDrag + planarSpeed * vehicleTuning.dragVelocityFactor
      : 0.14 + planarSpeed * vehicleTuning.dragVelocityFactor * 0.38;
    const dragFactor = Math.max(
      0,
      1 - dragBase * dt,
    );
    this.velocity.x *= dragFactor;
    this.velocity.z *= dragFactor;

    forwardSpeed = this.velocity.x * this.#forward.x + this.velocity.z * this.#forward.z;
    lateralSpeed = this.velocity.x * this.#right.x + this.velocity.z * this.#right.z;
    planarSpeed = Math.hypot(this.velocity.x, this.velocity.z);

    if (Math.abs(forwardSpeed) > 0.08) {
      const steerScale = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / 18, 0.18, 1.25);
      const lowSpeedTurnBoost = THREE.MathUtils.lerp(
        1.22,
        1,
        THREE.MathUtils.clamp(Math.abs(forwardSpeed) / 14, 0, 1),
      );
      const slipAngle = THREE.MathUtils.clamp(
        lateralSpeed / Math.max(Math.abs(forwardSpeed) + 4, 4),
        -1.3,
        1.3,
      );
      const yawAcceleration =
        (
          this.#steering
            * 3.3
            * tuning.turn
            * (0.45 + steerScale * 0.95)
            * lowSpeedTurnBoost
            * (forwardSpeed >= 0 ? 1 : -0.72)
          + slipAngle * tuning.slip * (driveThrottle > 0 ? 2.2 : 1.35)
        )
        * turnControl;
      this.#yawVelocity += yawAcceleration * dt;
    }
    const yawDamping =
      tuning.yawDamping
      + (counterSteering ? tuning.counterSteer * 1.6 : 0)
      + (braking ? 1.25 : 0)
      + (Math.abs(this.#steering) < 0.05 ? 1.2 : 0.2);
    this.#yawVelocity *= Math.exp(-yawDamping * dt);
    if (planarSpeed < 1.4) {
      this.#yawVelocity *= Math.exp(-10 * dt);
    }
    this.#heading += this.#yawVelocity * dt;

    const maxSpeed =
      (isBoosting ? vehicleTuning.maxBoostSpeed : vehicleTuning.maxCruiseSpeed)
      * tuning.speed;
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

    const groundHeight = this.#terrain.getHeightAt(this.position.x, this.position.z);
    const waterHeight = this.#water.getWaterHeightAt(this.position.x, this.position.z);
    const inWater = waterHeight !== null && waterHeight > groundHeight + 0.1;
    const surfaceBelow = inWater ? 'water' : this.#terrain.getSurfaceAt(this.position.x, this.position.z);
    const sandSinkOffset = surfaceBelow === 'sand' ? this.#sinkDepth * 0.38 : 0;
    const desiredHeight =
      groundHeight + VEHICLE_CLEARANCE + (inWater ? 0.08 : 0) - sandSinkOffset;
    const hoverDistance = this.position.y - desiredHeight;
    if (hoverDistance <= vehicleTuning.suspensionTravel) {
      const springCompression = Math.max(desiredHeight - this.position.y, 0);
      const suspensionLift =
        springCompression * vehicleTuning.suspensionSpring
        + (this.velocity.y < 0 ? -this.velocity.y * vehicleTuning.suspensionDamping : 0);
      this.velocity.y += (suspensionLift - vehicleTuning.gravity) * dt;
    } else {
      this.velocity.y -= vehicleTuning.gravity * dt;
    }

    const impactVelocity = this.velocity.y;
    this.position.y += this.velocity.y * dt;
    if (this.position.y < desiredHeight) {
      this.position.y = desiredHeight;
      if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
    }

    let isGrounded = this.position.y <= desiredHeight + 0.08;
    let landedThisFrame = false;

    if (surfaceBelow === 'sand' && isGrounded) {
      const wheelSpin = THREE.MathUtils.clamp(Math.abs(driveThrottle) - planarSpeed / 9.5, 0, 1.1);
      const slowBog = THREE.MathUtils.clamp(1 - planarSpeed / 8.5, 0, 1);
      const lateralBog = THREE.MathUtils.clamp(Math.abs(lateralSpeed) / 10, 0, 0.45);
      const escape = THREE.MathUtils.clamp((Math.max(forwardSpeed, 0) - 6.5) / 9.5, 0, 1);
      const sinkTarget = THREE.MathUtils.clamp(
        0.03
          + slowBog * 0.11
          + wheelSpin * 0.09
          + lateralBog * 0.03
          + (braking ? 0.025 : 0)
          - escape * 0.12
          - (isBoosting ? 0.03 : 0),
        0,
        maxSandSinkDepth,
      );
      const buildupTarget = THREE.MathUtils.clamp(
        0.1
          + sinkTarget * 3.8
          + wheelSpin * 0.46
          + slowBog * 0.18
          - escape * 0.28,
        0,
        1,
      );
      this.#sinkDepth += (sinkTarget - this.#sinkDepth) * (1 - Math.exp(-4.4 * dt));
      this.#surfaceBuildup += (buildupTarget - this.#surfaceBuildup) * (1 - Math.exp(-3.6 * dt));
    } else {
      this.#sinkDepth += (0 - this.#sinkDepth) * (1 - Math.exp(-5.8 * dt));
      this.#surfaceBuildup += (0 - this.#surfaceBuildup) * (1 - Math.exp(-4.5 * dt));
    }

    const finalSurfaceSample = this.#sampleSurfaceAt(
      this.position.x,
      this.position.z,
    );
    if (isGrounded) {
      this.position.y = finalSurfaceSample.rideHeight;
      if (this.velocity.y < 0) {
        this.velocity.y = 0;
      }
    }

    const resolvedSurface = isGrounded ? finalSurfaceSample.surface : currentSurface;
    if (isGrounded) {
      this.#airborneTime = 0;
    } else {
      this.#airborneTime += dt;
    }

    const driftThreshold = 3.2 - tuning.slip * 1.6;
    const isDrifting =
      isGrounded && Math.abs(lateralSpeed) > driftThreshold && planarSpeed > 6;

    this.#updateOrientation(dt, isGrounded);
    const wheelContactCount = this.#updateWheelData();
    if (!isGrounded && wheelContactCount >= 2 && this.position.y <= finalSurfaceSample.rideHeight + 0.12) {
      isGrounded = true;
      this.position.y = finalSurfaceSample.rideHeight;
      this.velocity.y = Math.max(this.velocity.y, 0);
      this.#airborneTime = 0;
    }
    landedThisFrame = !previousGrounded && isGrounded && impactVelocity < -0.9;
    if (landedThisFrame) {
      const landingBounceScale = this.#landingBounceBySurface[resolvedSurface];
      const reboundVelocity = Math.min(
        Math.abs(impactVelocity) * landingBounceScale + 0.14,
        1.55,
      );
      if (reboundVelocity > 0.08) {
        this.velocity.y = reboundVelocity;
        isGrounded = false;
        this.#airborneTime = dt;
      }
    }

    this.state.speed = planarSpeed;
    this.state.forwardSpeed = forwardSpeed;
    this.state.lateralSpeed = lateralSpeed;
    this.state.verticalSpeed = this.velocity.y;
    this.state.airborneTime = this.#airborneTime;
    this.state.steering = this.#steering;
    this.state.throttle = driveThrottle;
    this.state.isGrounded = isGrounded;
    this.state.isBraking = braking;
    this.state.isBoosting = isBoosting;
    this.state.isAccelerating = driveThrottle !== 0;
    this.state.isDrifting = isDrifting;
    this.state.wasAirborne = landedThisFrame;
    this.state.surface = resolvedSurface;
    this.state.boostLevel = this.#boostLevel;
    this.state.sinkDepth = this.#sinkDepth;
    this.state.surfaceBuildup = this.#surfaceBuildup;
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

  #sampleSurfaceAt(x: number, z: number): {
    surface: DriveSurface;
    rideHeight: number;
  } {
    const groundHeight = this.#terrain.getHeightAt(x, z);
    const waterHeight = this.#water.getWaterHeightAt(x, z);
    const inWater = waterHeight !== null && waterHeight > groundHeight + 0.1;
    const surface = inWater ? 'water' : this.#terrain.getSurfaceAt(x, z);
    const sandSinkOffset = surface === 'sand' ? this.#sinkDepth * 0.38 : 0;
    return {
      surface,
      rideHeight:
        groundHeight + VEHICLE_CLEARANCE + (inWater ? 0.08 : 0) - sandSinkOffset,
    };
  }

  #updateOrientation(dt: number, grounded: boolean): void {
    const targetNormal = grounded
      ? this.#terrain.getNormalAt(this.position.x, this.position.z)
      : this.#worldUp;
    const blend = 1 - Math.exp(-(grounded ? 14 : 2.4) * dt);
    this.#groundNormal.lerp(targetNormal, blend).normalize();
    this.#composeOrientation();
  }

  #composeOrientation(): void {
    this.#forward
      .set(Math.sin(this.#heading), 0, Math.cos(this.#heading))
      .projectOnPlane(this.#groundNormal);
    if (this.#forward.lengthSq() < 0.0001) {
      this.#forward.set(Math.sin(this.#heading), 0, Math.cos(this.#heading));
    }
    this.#forward.normalize();
    this.#right.crossVectors(this.#groundNormal, this.#forward).normalize();
    this.#correctedForward.crossVectors(this.#right, this.#groundNormal).normalize();
    this.#basisMatrix.makeBasis(this.#right, this.#groundNormal, this.#correctedForward);
    this.pose.quaternion.setFromRotationMatrix(this.#basisMatrix);
  }

  #updateWheelData(): number {
    const wheelCompression: [number, number, number, number] = [0, 0, 0, 0];
    const wheelContact: [boolean, boolean, boolean, boolean] = [true, true, true, true];
    let wheelContactCount = 0;

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
      const contactDistance =
        VEHICLE_WHEEL_RADIUS + VEHICLE_WHEEL_CONTACT_CLEARANCE;
      const groundDistance = wheel.y - wheelGround;
      wheelCompression[index] = THREE.MathUtils.clamp(
        (contactDistance - groundDistance) / VEHICLE_WHEEL_TRAVEL,
        -1,
        1,
      );
      wheelContact[index] = groundDistance <= contactDistance + 0.05;
      if (wheelContact[index]) {
        wheelContactCount += 1;
      }
    }

    this.state.wheelCompression = wheelCompression;
    this.state.wheelContact = wheelContact;
    return wheelContactCount;
  }
}
