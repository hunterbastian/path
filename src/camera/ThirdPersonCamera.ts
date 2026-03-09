import * as THREE from 'three';
import type { GameTuning } from '../config/GameTuning';
import type { InputManager } from '../core/InputManager';
import { expDecay, expLerp } from '../core/math';
import type { DrivingState } from '../vehicle/DrivingState';
import type { Terrain } from '../world/Terrain';

export class ThirdPersonCamera {
  readonly #canvas: HTMLCanvasElement;
  readonly #tuning: GameTuning;
  readonly #terrain: Terrain;
  readonly #prefersReducedMotion: boolean;
  #isDragging = false;
  #pointerId = -1;
  #yawOrbit = 0;
  #yawOrbitTarget = 0;
  #yawOrbitMomentum = 0;
  #pitchOrbit = 0.16;
  #pitchOrbitTarget = 0.16;
  #pitchOrbitMomentum = 0;
  #lastPointerTime = 0;
  #currentPosition = new THREE.Vector3();
  #currentLookTarget = new THREE.Vector3();
  #worldUp = new THREE.Vector3(0, 1, 0);
  #pitchAxis = new THREE.Vector3(1, 0, 0);
  #localOffset = new THREE.Vector3();
  #desiredPosition = new THREE.Vector3();
  #resolvedPosition = new THREE.Vector3();
  #forward = new THREE.Vector3();
  #right = new THREE.Vector3();
  #velocityLead = new THREE.Vector3();
  #lookTarget = new THREE.Vector3();
  #focusPoint = new THREE.Vector3();
  #samplePoint = new THREE.Vector3();
  #checkpointFocus = new THREE.Vector3();
  #initialized = false;
  #lookInitialized = false;
  #titleAngle = Math.PI * 0.15;
  #arrivalElapsed = 0;
  #driveMotionTime = 0;
  #driveHeave = 0;
  #driveRoll = 0;
  #driveImpact = 0;
  #driveFov = 60;
  #driveOcclusionPull = 0;
  #godModeActive = false;
  #godPosition = new THREE.Vector3();
  #godDirection = new THREE.Vector3();
  #godForward = new THREE.Vector3();
  #godRight = new THREE.Vector3();
  #godMove = new THREE.Vector3();
  #godYaw = 0;
  #godYawTarget = 0;
  #godYawMomentum = 0;
  #godPitch = 0;
  #godPitchTarget = 0;
  #godPitchMomentum = 0;

  constructor(tuning: GameTuning, terrain: Terrain, canvas: HTMLCanvasElement) {
    this.#tuning = tuning;
    this.#terrain = terrain;
    this.#canvas = canvas;
    this.#prefersReducedMotion =
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    canvas.addEventListener('pointerdown', this.#handlePointerDown);
    canvas.addEventListener('pointerup', this.#handlePointerUp);
    canvas.addEventListener('pointermove', this.#handlePointerMove);
    canvas.addEventListener('pointercancel', this.#handlePointerUp);
    canvas.addEventListener('dblclick', this.#handleDoubleClick);
    canvas.addEventListener('contextmenu', this.#handleContextMenu);
  }

  dispose(): void {
    this.#canvas.removeEventListener('pointerdown', this.#handlePointerDown);
    this.#canvas.removeEventListener('pointerup', this.#handlePointerUp);
    this.#canvas.removeEventListener('pointermove', this.#handlePointerMove);
    this.#canvas.removeEventListener('pointercancel', this.#handlePointerUp);
    this.#canvas.removeEventListener('dblclick', this.#handleDoubleClick);
    this.#canvas.removeEventListener('contextmenu', this.#handleContextMenu);
  }

  beginArrivalSequence(): void {
    this.#arrivalElapsed = 0;
  }

  resetArrivalSequence(): void {
    this.#arrivalElapsed = 0;
  }

  resetDriveMotion(): void {
    this.#driveMotionTime = 0;
    this.#driveHeave = 0;
    this.#driveRoll = 0;
    this.#driveImpact = 0;
    this.#driveFov = this.#tuning.camera.drive.fovBase;
    this.#driveOcclusionPull = 0;
    this.#yawOrbitTarget = this.#yawOrbit;
    this.#pitchOrbitTarget = this.#pitchOrbit;
    this.#yawOrbitMomentum = 0;
    this.#pitchOrbitMomentum = 0;
    this.#lookInitialized = false;
  }

  enterGodMode(camera: THREE.PerspectiveCamera): void {
    const godTuning = this.#tuning.camera.god;
    this.#releasePointerCapture();
    this.#godModeActive = true;
    this.#godPosition.copy(camera.position);
    camera.getWorldDirection(this.#godDirection);
    this.#godYaw = Math.atan2(this.#godDirection.x, this.#godDirection.z);
    this.#godPitch = THREE.MathUtils.clamp(
      Math.asin(THREE.MathUtils.clamp(this.#godDirection.y, -0.98, 0.98)),
      godTuning.pitchMin,
      godTuning.pitchMax,
    );
    this.#godYawTarget = this.#godYaw;
    this.#godPitchTarget = this.#godPitch;
    this.#godYawMomentum = 0;
    this.#godPitchMomentum = 0;
    this.#currentPosition.copy(camera.position);
    this.#currentLookTarget
      .copy(camera.position)
      .addScaledVector(this.#godDirection, 10);
    this.#initialized = true;
    this.#lookInitialized = true;
  }

  exitGodMode(): void {
    this.#releasePointerCapture();
    this.#godModeActive = false;
  }

  snapToDrive(
    camera: THREE.PerspectiveCamera,
    vehiclePosition: THREE.Vector3,
    vehicleQuaternion: THREE.Quaternion,
    state: DrivingState,
    nextCheckpointPoint: THREE.Vector3 | null,
  ): void {
    this.#godModeActive = false;
    this.#initialized = false;
    this.#lookInitialized = false;
    this.updateDrive(
      1 / 60,
      camera,
      vehiclePosition,
      vehicleQuaternion,
      state,
      nextCheckpointPoint,
    );
  }

  getDriveDebugState(): {
    mode: 'drive' | 'god';
    heave: number;
    rollDegrees: number;
    motionTime: number;
    impact: number;
    fov: number;
    occlusionPull: number;
    dragging: boolean;
    yawDegrees: number;
    yawTargetDegrees: number;
    pitchDegrees: number;
    pitchTargetDegrees: number;
    returnDelayRemainingSeconds: number;
    returningToChase: boolean;
    godPosition: { x: number; y: number; z: number } | null;
  } {
    const yaw = this.#godModeActive ? this.#godYaw : this.#yawOrbit;
    const yawTarget = this.#godModeActive ? this.#godYawTarget : this.#yawOrbitTarget;
    const pitch = this.#godModeActive ? this.#godPitch : this.#pitchOrbit;
    const pitchTarget = this.#godModeActive
      ? this.#godPitchTarget
      : this.#pitchOrbitTarget;
    return {
      mode: this.#godModeActive ? 'god' : 'drive',
      heave: Number(this.#driveHeave.toFixed(3)),
      rollDegrees: Number(THREE.MathUtils.radToDeg(this.#driveRoll).toFixed(2)),
      motionTime: Number(this.#driveMotionTime.toFixed(2)),
      impact: Number(this.#driveImpact.toFixed(3)),
      fov: Number(this.#driveFov.toFixed(2)),
      occlusionPull: Number(this.#driveOcclusionPull.toFixed(2)),
      dragging: this.#isDragging,
      yawDegrees: Number(THREE.MathUtils.radToDeg(yaw).toFixed(2)),
      yawTargetDegrees: Number(THREE.MathUtils.radToDeg(yawTarget).toFixed(2)),
      pitchDegrees: Number(THREE.MathUtils.radToDeg(pitch).toFixed(2)),
      pitchTargetDegrees: Number(
        THREE.MathUtils.radToDeg(pitchTarget).toFixed(2),
      ),
      returnDelayRemainingSeconds: 0,
      returningToChase: false,
      godPosition: this.#godModeActive
        ? {
            x: Number(this.#godPosition.x.toFixed(2)),
            y: Number(this.#godPosition.y.toFixed(2)),
            z: Number(this.#godPosition.z.toFixed(2)),
          }
        : null,
    };
  }

  updateDrive(
    dt: number,
    camera: THREE.PerspectiveCamera,
    vehiclePosition: THREE.Vector3,
    vehicleQuaternion: THREE.Quaternion,
    state: DrivingState,
    nextCheckpointPoint: THREE.Vector3 | null,
  ): void {
    const driveTuning = this.#tuning.camera.drive;
    this.#updateOrbitDrag(dt);

    const speed = state.speed;
    this.#driveMotionTime += dt * (1.4 + speed * 0.18);

    const speedBlend = Math.min(speed / driveTuning.speedReference, 1);
    const chaseDistance =
      THREE.MathUtils.lerp(
        driveTuning.closeDistance,
        driveTuning.farDistance,
        speedBlend,
      ) + driveTuning.distanceOffset;
    const chaseHeight =
      THREE.MathUtils.lerp(
        driveTuning.closeHeight,
        driveTuning.farHeight,
        speedBlend,
      ) + driveTuning.heightOffset;
    const averageCompression =
      state.wheelCompression.reduce(
        (sum, compression) => sum + Math.max(compression, 0),
        0,
      ) / state.wheelCompression.length;
    const compressionSpread = Math.max(...state.wheelCompression)
      - Math.min(...state.wheelCompression);
    const roughness =
      THREE.MathUtils.clamp(
        compressionSpread * 0.5
          + (state.wasAirborne ? 0.34 : 0)
          + (state.isDrifting ? 0.18 : 0),
        0,
        1,
      );
    const targetHeave = THREE.MathUtils.clamp(
      averageCompression * driveTuning.suspensionHeave
        + (state.isBraking ? 0.08 : 0)
        + (state.wasAirborne ? 0.12 : 0),
      0,
      0.34,
    );
    this.#driveHeave = expLerp(this.#driveHeave, targetHeave, 6.8, dt);
    const targetRoll = THREE.MathUtils.clamp(
      -state.steering * driveTuning.rollStrength
        - state.lateralSpeed * 0.012,
      -0.12,
      0.12,
    );
    this.#driveRoll = expLerp(this.#driveRoll, targetRoll, 5.5, dt);
    const shakeAmount = driveTuning.roughnessShake
      * roughness
      * THREE.MathUtils.clamp(speed / 24, 0, 1.2);
    const landingKick = state.wasAirborne
      ? driveTuning.landingKick
        + THREE.MathUtils.clamp(Math.abs(state.verticalSpeed) * 0.08, 0, 0.16)
      : 0;
    this.#driveImpact = Math.max(expDecay(this.#driveImpact, 5.6, dt), landingKick);
    const lateralOffset = THREE.MathUtils.clamp(
      state.steering * driveTuning.steeringOffset
        + state.lateralSpeed * 0.05,
      -driveTuning.driftLook,
      driveTuning.driftLook,
    );

    const localOffset = this.#localOffset.set(
      lateralOffset + Math.sin(this.#driveMotionTime * 1.8) * shakeAmount * 0.24,
      chaseHeight
        + this.#driveHeave
        + Math.min(state.airborneTime * 0.42, 0.34)
        - this.#driveImpact * 0.24
        + Math.sin(this.#driveMotionTime * 3.4) * shakeAmount,
      -chaseDistance
        - this.#driveImpact * 0.52
        - (state.isBoosting ? 0.36 : 0)
        - Math.min(state.airborneTime * 1.8, 0.9)
        + Math.cos(this.#driveMotionTime * 2.2) * shakeAmount * 0.34,
    );
    localOffset.applyAxisAngle(this.#pitchAxis, -this.#pitchOrbit);
    localOffset.applyAxisAngle(this.#worldUp, this.#yawOrbit);

    const desiredPosition = this.#desiredPosition
      .copy(vehiclePosition)
      .add(localOffset.applyQuaternion(vehicleQuaternion));
    const terrainClearance =
      driveTuning.terrainClearance
      + speedBlend * driveTuning.terrainLift
      + (state.airborneTime > 0 ? 0.35 : 0);
    const resolvedDesiredPosition = this.#resolveDriveOcclusion(
      vehiclePosition,
      desiredPosition,
      terrainClearance,
    );

    if (!this.#initialized) {
      this.#currentPosition.copy(resolvedDesiredPosition);
      this.#initialized = true;
    }

    this.#currentPosition.lerp(resolvedDesiredPosition, 1 - Math.exp(-5.4 * dt));
    this.#currentPosition.y = Math.max(
      this.#currentPosition.y,
      this.#getTerrainFloor(this.#currentPosition) + terrainClearance * 0.92,
    );
    camera.position.copy(this.#currentPosition);

    const forward = this.#forward.set(0, 0, 1).applyQuaternion(vehicleQuaternion);
    const right = this.#right.set(1, 0, 0)
      .applyQuaternion(vehicleQuaternion)
      .projectOnPlane(this.#worldUp)
      .normalize();
    const velocityLead = this.#velocityLead
      .copy(forward)
      .multiplyScalar(Math.max(state.forwardSpeed, 0) * driveTuning.velocityLead)
      .addScaledVector(
        right,
        state.lateralSpeed * driveTuning.velocityLead * 0.9,
      );
    const lookTarget = this.#lookTarget
      .copy(vehiclePosition)
      .addScaledVector(forward, driveTuning.lookAhead + speedBlend * 1.2)
      .addScaledVector(right, lateralOffset * 0.32);
    lookTarget.add(velocityLead);
    lookTarget.y +=
      driveTuning.lookHeight
      + this.#driveHeave * 0.42
      + Math.min(state.airborneTime * 0.7, 0.65);
    if (nextCheckpointPoint && !this.#isDragging) {
      const checkpointFocus = this.#checkpointFocus.copy(nextCheckpointPoint);
      checkpointFocus.y += 3.2;
      lookTarget.lerp(
        checkpointFocus,
        driveTuning.checkpointBias * THREE.MathUtils.clamp(speedBlend + 0.22, 0, 1),
      );
    }
    if (!this.#lookInitialized) {
      this.#currentLookTarget.copy(lookTarget);
      this.#lookInitialized = true;
    }
    this.#currentLookTarget.lerp(lookTarget, 1 - Math.exp(-driveTuning.lookSmoothing * dt));
    const targetFov =
      driveTuning.fovBase
      + speedBlend * driveTuning.fovSpeedGain
      + (state.isBoosting ? driveTuning.fovBoostGain : 0)
      + Math.min(state.airborneTime * driveTuning.fovAirborneGain, driveTuning.fovAirborneGain)
      + this.#driveImpact * driveTuning.fovImpactGain;
    this.#updateCameraFov(camera, targetFov, dt, 5.4);
    camera.up.copy(this.#worldUp);
    camera.up.applyAxisAngle(forward.normalize(), this.#driveRoll);
    camera.lookAt(this.#currentLookTarget);
  }

  updateTitle(
    dt: number,
    camera: THREE.PerspectiveCamera,
    focusPoint: THREE.Vector3,
    landmarkPoint: THREE.Vector3,
  ): void {
    this.#titleAngle += dt * 0.14;

    const titleTuning = this.#tuning.camera.title;
    const radius = titleTuning.radius;
    const desiredPosition = this.#desiredPosition.set(
      focusPoint.x + Math.cos(this.#titleAngle) * radius,
      focusPoint.y +
        titleTuning.height +
        Math.sin(this.#titleAngle * 0.6) * titleTuning.verticalWave,
      focusPoint.z + Math.sin(this.#titleAngle) * titleTuning.horizontalDepth - 8,
    );

    if (!this.#initialized) {
      this.#currentPosition.copy(desiredPosition);
      this.#initialized = true;
    }

    this.#currentPosition.lerp(desiredPosition, 1 - Math.exp(-2.2 * dt));
    camera.position.copy(this.#currentPosition);
    this.#updateCameraFov(camera, this.#tuning.camera.drive.fovBase, dt, 2.8);

    const lookTarget = this.#lookTarget.copy(focusPoint).lerp(landmarkPoint, 0.32);
    lookTarget.y += 8;
    camera.up.copy(this.#worldUp);
    camera.lookAt(lookTarget);
  }

  updateArrival(
    dt: number,
    camera: THREE.PerspectiveCamera,
    vehiclePosition: THREE.Vector3,
    objectivePoint: THREE.Vector3,
    landmarkPoint: THREE.Vector3,
  ): void {
    this.#arrivalElapsed += dt;

    const focusPoint = this.#focusPoint.copy(vehiclePosition).lerp(objectivePoint, 0.45);
    const arrivalTuning = this.#tuning.camera.arrival;
    const holdProgress = THREE.MathUtils.clamp(
      this.#arrivalElapsed / arrivalTuning.holdSeconds,
      0,
      1,
    );
    const orbitProgress = THREE.MathUtils.smoothstep(
      Math.max(0, this.#arrivalElapsed - arrivalTuning.holdSeconds * 0.25),
      0,
      arrivalTuning.holdSeconds * 1.45,
    );
    this.#titleAngle +=
      dt * THREE.MathUtils.lerp(0.03, arrivalTuning.orbitSpeed, orbitProgress);

    const angle = this.#titleAngle - (1 - holdProgress) * 0.7;
    const radius = THREE.MathUtils.lerp(
      arrivalTuning.introRadius,
      arrivalTuning.radius,
      orbitProgress,
    );
    const height = THREE.MathUtils.lerp(
      arrivalTuning.introHeight,
      arrivalTuning.height,
      orbitProgress,
    );
    const horizontalDepth = THREE.MathUtils.lerp(
      8,
      arrivalTuning.horizontalDepth,
      orbitProgress,
    );
    const desiredPosition = this.#desiredPosition.set(
      focusPoint.x + Math.cos(angle) * radius,
      focusPoint.y +
        height +
        Math.sin(this.#titleAngle * 0.7) * arrivalTuning.verticalWave * orbitProgress,
      focusPoint.z + Math.sin(angle) * horizontalDepth - (1.2 + orbitProgress * 0.9),
    );

    if (!this.#initialized) {
      this.#currentPosition.copy(desiredPosition);
      this.#initialized = true;
    }

    this.#currentPosition.lerp(
      desiredPosition,
      1 - Math.exp(-THREE.MathUtils.lerp(2.1, 3.2, orbitProgress) * dt),
    );
    camera.position.copy(this.#currentPosition);
    this.#updateCameraFov(camera, this.#tuning.camera.drive.fovBase + 2.4, dt, 2.4);

    const lookTarget = this.#lookTarget.copy(objectivePoint).lerp(
      landmarkPoint,
      THREE.MathUtils.lerp(0.08, 0.22, orbitProgress),
    );
    lookTarget.y += THREE.MathUtils.lerp(
      arrivalTuning.holdLookHeight,
      6.1,
      orbitProgress,
    );
    camera.up.copy(this.#worldUp);
    camera.lookAt(lookTarget);
  }

  updateGodMode(
    dt: number,
    camera: THREE.PerspectiveCamera,
    input: InputManager,
  ): void {
    const godTuning = this.#tuning.camera.god;
    this.#updateGodLook(dt);

    const forward = this.#godForward.set(
      Math.sin(this.#godYaw),
      0,
      Math.cos(this.#godYaw),
    );
    const right = this.#godRight.set(
      Math.cos(this.#godYaw),
      0,
      -Math.sin(this.#godYaw),
    );
    const vertical =
      (input.boost ? 1 : 0)
      - (input.brake ? 1 : 0)
      + (input.isDown('KeyE') ? 1 : 0)
      - (input.isDown('KeyQ') ? 1 : 0);
    const move = this.#godMove
      .set(0, 0, 0)
      .addScaledVector(forward, input.throttle)
      .addScaledVector(right, input.steering);
    if (move.lengthSq() > 1) {
      move.normalize();
    }

    this.#godPosition.addScaledVector(move, godTuning.moveSpeed * dt);
    this.#godPosition.y += vertical * godTuning.verticalSpeed * dt;
    this.#godPosition.y = Math.max(
      this.#godPosition.y,
      this.#getTerrainFloor(this.#godPosition) + godTuning.terrainClearance,
    );

    this.#currentPosition.copy(this.#godPosition);
    camera.position.copy(this.#currentPosition);

    const horizontalLength = Math.cos(this.#godPitch);
    const direction = this.#godDirection
      .set(
        Math.sin(this.#godYaw) * horizontalLength,
        Math.sin(this.#godPitch),
        Math.cos(this.#godYaw) * horizontalLength,
      )
      .normalize();
    this.#currentLookTarget
      .copy(this.#godPosition)
      .addScaledVector(direction, 14);
    this.#updateCameraFov(camera, this.#tuning.camera.drive.fovBase, dt, 6.2);
    camera.up.copy(this.#worldUp);
    camera.lookAt(this.#currentLookTarget);
  }

  #updateCameraFov(
    camera: THREE.PerspectiveCamera,
    targetFov: number,
    dt: number,
    response: number,
  ): void {
    camera.fov = expLerp(camera.fov, targetFov, response, dt);
    this.#driveFov = camera.fov;
    camera.updateProjectionMatrix();
  }

  #getTerrainFloor(position: THREE.Vector3): number {
    if (!this.#terrain.isWithinBounds(position.x, position.z)) {
      return position.y - this.#tuning.camera.drive.terrainClearance;
    }
    return this.#terrain.getHeightAt(position.x, position.z);
  }

  #resolveDriveOcclusion(
    vehiclePosition: THREE.Vector3,
    desiredPosition: THREE.Vector3,
    terrainClearance: number,
  ): THREE.Vector3 {
    const focusPoint = this.#focusPoint.copy(vehiclePosition);
    focusPoint.y += this.#tuning.camera.drive.lookHeight + 0.6;

    const resolvedPosition = this.#resolvedPosition.copy(desiredPosition);
    resolvedPosition.y = Math.max(
      resolvedPosition.y,
      this.#getTerrainFloor(resolvedPosition) + terrainClearance,
    );

    let visibleT = 1;
    const samplePoint = this.#samplePoint;
    for (let index = 1; index <= 7; index += 1) {
      const t = index / 7;
      samplePoint.lerpVectors(focusPoint, resolvedPosition, t);
      if (!this.#terrain.isWithinBounds(samplePoint.x, samplePoint.z)) {
        continue;
      }
      const terrainHeight = this.#terrain.getHeightAt(samplePoint.x, samplePoint.z) + 1.3;
      if (samplePoint.y < terrainHeight) {
        visibleT = Math.max(0.36, t - 1 / 7);
        break;
      }
    }

    if (visibleT < 1) {
      resolvedPosition.lerpVectors(focusPoint, resolvedPosition, visibleT);
      resolvedPosition.y = Math.max(
        resolvedPosition.y,
        this.#getTerrainFloor(resolvedPosition) + terrainClearance * 0.74,
      );
    }

    this.#driveOcclusionPull = 1 - visibleT;
    return resolvedPosition;
  }

  #handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.#isDragging = true;
    this.#pointerId = event.pointerId;
    if (this.#godModeActive) {
      this.#godYawTarget = this.#godYaw;
      this.#godPitchTarget = this.#godPitch;
      this.#godYawMomentum = 0;
      this.#godPitchMomentum = 0;
    } else {
      this.#yawOrbitTarget = this.#yawOrbit;
      this.#pitchOrbitTarget = this.#pitchOrbit;
      this.#yawOrbitMomentum = 0;
      this.#pitchOrbitMomentum = 0;
    }
    this.#lastPointerTime = event.timeStamp;
    this.#canvas.setPointerCapture(event.pointerId);
  };

  #handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return;
    this.#isDragging = false;
    this.#pointerId = -1;
    this.#lastPointerTime = 0;
    if (this.#canvas.hasPointerCapture(event.pointerId)) {
      this.#canvas.releasePointerCapture(event.pointerId);
    }
  };

  #handlePointerMove = (event: PointerEvent): void => {
    if (!this.#isDragging || event.pointerId !== this.#pointerId) return;
    const elapsedMs = THREE.MathUtils.clamp(
      event.timeStamp - (this.#lastPointerTime || event.timeStamp - 16),
      8,
      34,
    );
    this.#lastPointerTime = event.timeStamp;
    const deltaYaw = -event.movementX * 0.0034;
    const deltaPitch = event.movementY * 0.003;
    const seconds = elapsedMs / 1000;
    const yawVelocity = THREE.MathUtils.clamp(deltaYaw / seconds, -6.4, 6.4);
    const pitchVelocity = THREE.MathUtils.clamp(deltaPitch / seconds, -4.2, 4.2);
    if (this.#godModeActive) {
      const godTuning = this.#tuning.camera.god;
      this.#godYawTarget += deltaYaw;
      this.#godPitchTarget = THREE.MathUtils.clamp(
        this.#godPitchTarget + deltaPitch,
        godTuning.pitchMin,
        godTuning.pitchMax,
      );
      if (this.#prefersReducedMotion) {
        this.#godYawMomentum = 0;
        this.#godPitchMomentum = 0;
        return;
      }
      this.#godYawMomentum = THREE.MathUtils.lerp(
        this.#godYawMomentum,
        yawVelocity,
        0.42,
      );
      this.#godPitchMomentum = THREE.MathUtils.lerp(
        this.#godPitchMomentum,
        pitchVelocity,
        0.42,
      );
      return;
    }
    this.#yawOrbitTarget += deltaYaw;
    this.#pitchOrbitTarget = THREE.MathUtils.clamp(
      this.#pitchOrbitTarget + deltaPitch,
      -0.12,
      0.8,
    );
    if (this.#prefersReducedMotion) {
      this.#yawOrbitMomentum = 0;
      this.#pitchOrbitMomentum = 0;
      return;
    }
    this.#yawOrbitMomentum = THREE.MathUtils.lerp(
      this.#yawOrbitMomentum,
      yawVelocity,
      0.42,
    );
    this.#pitchOrbitMomentum = THREE.MathUtils.lerp(
      this.#pitchOrbitMomentum,
      pitchVelocity,
      0.42,
    );
  };

  #handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  #handleDoubleClick = (): void => {
    if (this.#godModeActive) return;
    this.#yawOrbitTarget = 0;
    this.#pitchOrbitTarget = 0.16;
    this.#yawOrbitMomentum = 0;
    this.#pitchOrbitMomentum = 0;
    if (this.#prefersReducedMotion) {
      this.#yawOrbit = 0;
      this.#pitchOrbit = 0.16;
    }
  };

  #updateOrbitDrag(dt: number): void {
    if (!this.#isDragging) {
      if (!this.#prefersReducedMotion) {
        this.#yawOrbitTarget += this.#yawOrbitMomentum * dt * 0.24;
        this.#pitchOrbitTarget = THREE.MathUtils.clamp(
          this.#pitchOrbitTarget + this.#pitchOrbitMomentum * dt * 0.18,
          -0.12,
          0.8,
        );
        this.#yawOrbitMomentum = expDecay(this.#yawOrbitMomentum, 9.5, dt);
        this.#pitchOrbitMomentum = expDecay(this.#pitchOrbitMomentum, 9.5, dt);
      }
    }

    const response = this.#prefersReducedMotion
      ? this.#isDragging
        ? 24
        : 14
      : this.#isDragging
        ? 16
        : 8.5;
    this.#yawOrbit = expLerp(this.#yawOrbit, this.#yawOrbitTarget, response, dt);
    this.#pitchOrbit = expLerp(this.#pitchOrbit, this.#pitchOrbitTarget, response, dt);
  }

  #updateGodLook(dt: number): void {
    const godTuning = this.#tuning.camera.god;
    if (!this.#isDragging && !this.#prefersReducedMotion) {
      this.#godYawTarget += this.#godYawMomentum * dt * 0.22;
      this.#godPitchTarget = THREE.MathUtils.clamp(
        this.#godPitchTarget + this.#godPitchMomentum * dt * 0.16,
        godTuning.pitchMin,
        godTuning.pitchMax,
      );
      this.#godYawMomentum = expDecay(this.#godYawMomentum, godTuning.momentumDamping, dt);
      this.#godPitchMomentum = expDecay(this.#godPitchMomentum, godTuning.momentumDamping, dt);
    }

    const response = this.#prefersReducedMotion
      ? Math.max(godTuning.lookResponse, godTuning.dragResponse)
      : this.#isDragging
        ? godTuning.dragResponse
        : godTuning.lookResponse;
    this.#godYaw = expLerp(this.#godYaw, this.#godYawTarget, response, dt);
    this.#godPitch = expLerp(this.#godPitch, this.#godPitchTarget, response, dt);
  }

  #releasePointerCapture(): void {
    if (this.#pointerId !== -1 && this.#canvas.hasPointerCapture(this.#pointerId)) {
      this.#canvas.releasePointerCapture(this.#pointerId);
    }
    this.#isDragging = false;
    this.#pointerId = -1;
    this.#lastPointerTime = 0;
  }
}
