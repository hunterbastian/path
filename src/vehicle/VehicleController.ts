import * as THREE from 'three';
import type { GameTuning } from '../config/GameTuning';
import { expDecay, expLerp } from '../core/math';
import { InputManager } from '../core/InputManager';
import type { WeatherSnapshot } from '../gameplay/WeatherState';
import type { AmbientTrafficPlayerInteraction } from '../world/AmbientTrafficSystem';
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

/** Reusable quaternion for tumble integration — avoids per-frame allocation. */
const _tumbleIncrement = new THREE.Quaternion();

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
  readonly #downhill = new THREE.Vector3();
  readonly #surfaceNormal = new THREE.Vector3(0, 1, 0);
  readonly #roadPull = new THREE.Vector3();
  readonly #forward = new THREE.Vector3(0, 0, 1);
  readonly #right = new THREE.Vector3(1, 0, 0);
  readonly #correctedForward = new THREE.Vector3(0, 0, 1);
  readonly #landingBounceBySurface: Record<DriveSurface, number> = {
    dirt: 0.14,
    sand: 0.03,
    grass: 0.10,
    rock: 0.18,
    snow: 0.12,
    water: 0.02,
  };
  #heading = 0;
  #steering = 0;
  #yawVelocity = 0;
  #boostLevel = 1;
  #sinkDepth = 0;
  #surfaceBuildup = 0;
  #airborneTime = 0;
  #time = 0;
  #roadInfluence = 0;
  #rutPullStrength = 0;
  /** Angular velocity for airborne tumbling (rad/s around local right axis). */
  #tumblePitch = 0;
  /** Angular velocity for airborne tumbling (rad/s around local forward axis). */
  #tumbleRoll = 0;
  /** Quaternion accumulating tumble rotation while airborne. */
  readonly #tumbleQuat = new THREE.Quaternion();
  /** Whether the vehicle is currently tumbling (airborne with angular velocity). */
  #isTumbling = false;

  get heading(): number {
    return this.#heading;
  }

  get surfaceFeedback(): { roadInfluence: number; rutPullStrength: number } {
    return {
      roadInfluence: this.#roadInfluence,
      rutPullStrength: this.#rutPullStrength,
    };
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
    this.#roadInfluence = 0;
    this.#rutPullStrength = 0;
    this.#tumblePitch = 0;
    this.#tumbleRoll = 0;
    this.#tumbleQuat.identity();
    this.#isTumbling = false;
    this.#groundNormal.copy(this.#terrain.getNormalAt(this.position.x, this.position.z));
    this.#composeBaseOrientation();
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
    this.#roadInfluence = 0;
    this.#rutPullStrength = 0;
    this.#tumblePitch = 0;
    this.#tumbleRoll = 0;
    this.#tumbleQuat.identity();
    this.#isTumbling = false;
    this.#groundNormal.copy(this.#terrain.getNormalAt(this.position.x, this.position.z));
    this.#composeBaseOrientation();
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
    this.#roadInfluence = 0;
    this.#rutPullStrength = 0;
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

  applyTrafficInteraction(
    interaction: Pick<AmbientTrafficPlayerInteraction, 'collision' | 'correction' | 'impulse'>,
  ): void {
    this.#applyCollisionInteraction(interaction);
  }

  applyReactiveWorldInteraction(
    interaction: Pick<AmbientTrafficPlayerInteraction, 'collision' | 'correction' | 'impulse'>,
  ): void {
    this.#applyCollisionInteraction(interaction);
  }

  #applyCollisionInteraction(
    interaction: Pick<AmbientTrafficPlayerInteraction, 'collision' | 'correction' | 'impulse'>,
  ): void {
    if (!interaction.collision) return;

    const collisionMagnitude = interaction.impulse.length();
    if (collisionMagnitude > this.state.impactMagnitude) {
      this.state.impactMagnitude = collisionMagnitude;
      if (collisionMagnitude > 0.001) {
        this.state.impactDirection
          .copy(interaction.impulse)
          .normalize();
      }
    }

    this.position.add(interaction.correction);
    const halfSize = this.#terrain.size * 0.5 - 2;
    this.position.x = THREE.MathUtils.clamp(this.position.x, -halfSize, halfSize);
    this.position.z = THREE.MathUtils.clamp(this.position.z, -halfSize, halfSize);
    this.velocity.x = (this.velocity.x + interaction.impulse.x) * 0.82;
    this.velocity.z = (this.velocity.z + interaction.impulse.z) * 0.82;

    const forwardSpeed =
      this.velocity.x * this.#forward.x + this.velocity.z * this.#forward.z;
    const lateralSpeed =
      this.velocity.x * this.#right.x + this.velocity.z * this.#right.z;
    this.#yawVelocity += THREE.MathUtils.clamp(lateralSpeed * 0.08, -0.22, 0.22);

    if (this.state.isGrounded) {
      this.position.y = this.#sampleSurfaceAt(this.position.x, this.position.z).rideHeight;
    }

    this.#updateOrientation(1 / 60, this.state.isGrounded);
    this.#updateWheelData();
    this.state.speed = Math.hypot(this.velocity.x, this.velocity.z);
    this.state.forwardSpeed = forwardSpeed;
    this.state.lateralSpeed = lateralSpeed;
    this.state.verticalSpeed = this.velocity.y;
    this.state.isBraking = true;
    this.state.isBoosting = false;
    this.state.wasAirborne = false;
  }

  update(
    dt: number,
    input: InputManager,
    controlsEnabled: boolean,
    weather: Pick<WeatherSnapshot, 'gripMultiplier' | 'dragMultiplier' | 'rainDensity'>,
  ): void {
    this.#time += dt;
    const previousGrounded = this.state.isGrounded;
    this.state.impactMagnitude = 0;
    this.state.impactDirection.set(0, 0, 0);

    const throttleIntent = controlsEnabled ? input.throttle : 0;

    const currentSurface = previousGrounded
      ? this.#sampleSurfaceAt(this.position.x, this.position.z).surface
      : this.state.surface;
    const vehicleTuning = this.#tuning.vehicle;
    const surfaceTuning = vehicleTuning.surfaces[currentSurface];
    const tuning = {
      ...surfaceTuning,
      acceleration: surfaceTuning.acceleration * vehicleTuning.accelerationMultiplier,
      grip:
        surfaceTuning.grip
        * vehicleTuning.gripMultiplier
        * weather.gripMultiplier,
      drag: surfaceTuning.drag * weather.dragMultiplier,
      speed: surfaceTuning.speed * vehicleTuning.speedMultiplier,
      yawDamping: surfaceTuning.yawDamping * vehicleTuning.yawDampingMultiplier,
    };
    let slopeMagnitude = 0;
    const steerInput = controlsEnabled ? input.steering : 0;
    const maxSandSinkDepth = vehicleTuning.maxSandSinkDepth * vehicleTuning.sinkDepthMultiplier;
    const tractionControl = previousGrounded ? 1 : vehicleTuning.airControl;
    const turnControl = previousGrounded ? 1 : vehicleTuning.airTurnControl;
    const bogFactor = currentSurface === 'sand'
      ? 1 - THREE.MathUtils.clamp(this.#sinkDepth / maxSandSinkDepth, 0, 1) * 0.42
      : 1;
    this.#roadInfluence = this.#terrain.getRoadInfluence(this.position.x, this.position.z);
    this.#rutPullStrength = 0;
    this.#surfaceNormal.copy(
      previousGrounded
        ? this.#terrain.getNormalAt(this.position.x, this.position.z)
        : this.#groundNormal,
    );

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
    this.#steering = expLerp(this.#steering, steerInput, steeringResponse, dt);

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
      // Momentum — the faster you're already going, the harder you push
      const speedRatio = THREE.MathUtils.clamp(Math.abs(forwardSpeed) / vehicleTuning.maxCruiseSpeed, 0, 1);
      const momentumMultiplier = 1 + speedRatio * 0.6;
      this.velocity.x +=
        this.#forward.x
        * driveThrottle
        * acceleration
        * tuning.acceleration
        * bogFactor
        * tractionWindow
        * boostMultiplier
        * momentumMultiplier
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
        * momentumMultiplier
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

    if (previousGrounded) {
      this.#downhill
        .copy(this.#worldUp)
        .negate()
        .projectOnPlane(this.#surfaceNormal);
      slopeMagnitude = this.#downhill.length();
      if (slopeMagnitude > vehicleTuning.slopeRollStart) {
        this.#downhill.multiplyScalar(1 / slopeMagnitude);
        const slopeFactor = THREE.MathUtils.clamp(
          (slopeMagnitude - vehicleTuning.slopeRollStart)
            / (1 - vehicleTuning.slopeRollStart),
          0,
          1,
        );
        const surfaceRollScale = THREE.MathUtils.lerp(
          0.78,
          1.28,
          THREE.MathUtils.clamp(tuning.slip / 0.74, 0, 1),
        );
        const idleSlideWindow = THREE.MathUtils.clamp(
          1 - planarSpeed / vehicleTuning.slopeIdleSpeedWindow,
          0,
          1,
        );
        const downhillAlignment = Math.abs(this.#downhill.dot(this.#forward));
        const idleBoost =
          Math.abs(driveThrottle) < 0.05 && !braking
            ? THREE.MathUtils.lerp(
              1.16,
              vehicleTuning.slopeIdleSlideBoost,
              idleSlideWindow * (0.42 + downhillAlignment * 0.58),
            )
            : 0.82;
        const brakeHold = braking ? vehicleTuning.slopeBrakeHold : 1;
        const lateralSlopeBias = 0.92 + Math.abs(this.#downhill.dot(this.#right)) * 0.22;
        const slopeAcceleration =
          vehicleTuning.gravity
          * vehicleTuning.slopeRollStrength
          * slopeFactor
          * surfaceRollScale
          * idleBoost
          * brakeHold
          * lateralSlopeBias;
        this.velocity.x += this.#downhill.x * slopeAcceleration * dt;
        this.velocity.z += this.#downhill.z * slopeAcceleration * dt;
      }
    }

    if (previousGrounded && currentSurface === 'dirt' && this.#roadInfluence > 0.16) {
      const sampleDistance = 2.8;
      const roadGradientX =
        this.#terrain.getRoadInfluence(this.position.x + sampleDistance, this.position.z)
        - this.#terrain.getRoadInfluence(this.position.x - sampleDistance, this.position.z);
      const roadGradientZ =
        this.#terrain.getRoadInfluence(this.position.x, this.position.z + sampleDistance)
        - this.#terrain.getRoadInfluence(this.position.x, this.position.z - sampleDistance);
      this.#roadPull.set(roadGradientX, 0, roadGradientZ);
      const roadGradientStrength = this.#roadPull.length();
      if (roadGradientStrength > 0.0001) {
        this.#roadPull.multiplyScalar(1 / roadGradientStrength);
        const rutStrength =
          THREE.MathUtils.lerp(0, 3.6, this.#roadInfluence)
          * THREE.MathUtils.lerp(1, 1.3, weather.rainDensity)
          * THREE.MathUtils.lerp(0.7, 1.15, THREE.MathUtils.clamp(planarSpeed / 12, 0, 1));
        this.#rutPullStrength = rutStrength;
        this.velocity.x += this.#roadPull.x * rutStrength * dt;
        this.velocity.z += this.#roadPull.z * rutStrength * dt;
      }
    }

    const sinkDrag = currentSurface === 'sand'
      ? THREE.MathUtils.clamp(this.#sinkDepth * 4.5, 0, 1.2)
      : 0;
    const idleSlopeRelease =
      previousGrounded
      && !braking
      && Math.abs(driveThrottle) < 0.05
      && slopeMagnitude > vehicleTuning.slopeRollStart;
    const slopeDragScale = idleSlopeRelease
      ? THREE.MathUtils.lerp(
        1,
        vehicleTuning.slopeIdleDragScale,
        THREE.MathUtils.clamp(
          (slopeMagnitude - vehicleTuning.slopeRollStart)
            / Math.max(0.0001, 1 - vehicleTuning.slopeRollStart),
          0,
          1,
        )
        * THREE.MathUtils.clamp(
          1 - planarSpeed / vehicleTuning.slopeIdleSpeedWindow,
          0,
          1,
        ),
      )
      : 1;
    const dragBase = previousGrounded
      ? (0.92 * tuning.drag + sinkDrag + planarSpeed * vehicleTuning.dragVelocityFactor)
        * slopeDragScale
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
    this.#yawVelocity = expDecay(this.#yawVelocity, yawDamping, dt);
    if (planarSpeed < 1.4) {
      this.#yawVelocity = expDecay(this.#yawVelocity, 10, dt);
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
      this.#sinkDepth = expLerp(this.#sinkDepth, sinkTarget, 4.4, dt);
      this.#surfaceBuildup = expLerp(this.#surfaceBuildup, buildupTarget, 3.6, dt);
    } else {
      this.#sinkDepth = expLerp(this.#sinkDepth, 0, 5.8, dt);
      this.#surfaceBuildup = expLerp(this.#surfaceBuildup, 0, 4.5, dt);
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

    // --- Tumble physics ---
    // Seed angular velocity when leaving the ground
    if (previousGrounded && !isGrounded) {
      // How tilted is the ground the vehicle launched from?
      // surfaceNormal dot worldUp = 1 on flat ground, < 1 on slopes
      const slopeForward = this.#surfaceNormal.dot(this.#forward);  // nose-up/down tilt
      const slopeRight = this.#surfaceNormal.dot(this.#right);      // left/right bank

      // Angular velocity from slope × speed — driving fast off a ramp = big pitch
      this.#tumblePitch = -slopeForward * planarSpeed * 0.12;
      this.#tumbleRoll = slopeRight * planarSpeed * 0.10 + lateralSpeed * 0.06;

      // Vertical launch velocity adds pitch (popping off a bump at speed)
      if (this.velocity.y > 1.5) {
        this.#tumblePitch -= this.velocity.y * 0.08;
      }

      this.#tumbleQuat.identity();
      this.#isTumbling = false;
    }

    // Collisions while airborne add tumble spin
    if (!isGrounded && this.state.impactMagnitude > 2) {
      const collisionSpin = this.state.impactMagnitude * 0.15;
      this.#tumblePitch += this.state.impactDirection.y * collisionSpin;
      this.#tumbleRoll += this.state.impactDirection.x * collisionSpin;
    }

    // Activate tumbling after brief airtime with enough angular velocity
    if (
      !isGrounded
      && this.#airborneTime > 0.18
      && (Math.abs(this.#tumblePitch) > 0.5 || Math.abs(this.#tumbleRoll) > 0.5)
    ) {
      this.#isTumbling = true;
    }

    // Integrate tumble while airborne
    if (!isGrounded && this.#isTumbling) {
      // Air drag — heavy vehicle doesn't spin forever
      this.#tumblePitch *= 1 - 0.4 * dt;
      this.#tumbleRoll *= 1 - 0.5 * dt;
      // Gravity pitches the nose down (like a real falling object with front-heavy mass)
      this.#tumblePitch += 1.8 * dt;
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
    // Kill tumble on landing — tumbling landings hit harder
    const wasTumbling = this.#isTumbling;
    if (!previousGrounded && isGrounded) {
      this.#tumblePitch = 0;
      this.#tumbleRoll = 0;
      this.#tumbleQuat.identity();
      this.#isTumbling = false;
    }
    const landingThreshold = wasTumbling ? -0.4 : -0.9;
    landedThisFrame = !previousGrounded && isGrounded && impactVelocity < landingThreshold;
    if (landedThisFrame) {
      const landingImpact = Math.abs(impactVelocity);
      if (landingImpact > this.state.impactMagnitude) {
        this.state.impactMagnitude = landingImpact;
        this.state.impactDirection.set(0, -1, 0);
      }
      const landingBounceScale = this.#landingBounceBySurface[resolvedSurface];
      const reboundVelocity = Math.min(
        landingImpact * landingBounceScale + 0.14,
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
    this.state.isTumbling = this.#isTumbling;
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
    if (this.#isTumbling && !grounded) {
      // Build incremental tumble rotation from angular velocity
      const pitchDelta = this.#tumblePitch * dt;
      const rollDelta = this.#tumbleRoll * dt;
      _tumbleIncrement.set(pitchDelta, 0, rollDelta, 1).normalize();
      this.#tumbleQuat.multiply(_tumbleIncrement);
      this.#tumbleQuat.normalize();
      // Compose base orientation then layer tumble on top
      this.#composeBaseOrientation();
      this.pose.quaternion.multiply(this.#tumbleQuat);
    } else {
      const targetNormal = grounded
        ? this.#terrain.getNormalAt(this.position.x, this.position.z)
        : this.#worldUp;
      const blend = 1 - Math.exp(-(grounded ? 14 : 2.4) * dt);
      this.#groundNormal.lerp(targetNormal, blend).normalize();
      this.#composeBaseOrientation();
    }
  }

  #composeBaseOrientation(): void {
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
