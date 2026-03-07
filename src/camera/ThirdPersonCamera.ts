import * as THREE from 'three';
import type { GameTuning } from '../config/GameTuning';
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

  getDriveDebugState(): {
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
  } {
    return {
      heave: Number(this.#driveHeave.toFixed(3)),
      rollDegrees: Number(THREE.MathUtils.radToDeg(this.#driveRoll).toFixed(2)),
      motionTime: Number(this.#driveMotionTime.toFixed(2)),
      impact: Number(this.#driveImpact.toFixed(3)),
      fov: Number(this.#driveFov.toFixed(2)),
      occlusionPull: Number(this.#driveOcclusionPull.toFixed(2)),
      dragging: this.#isDragging,
      yawDegrees: Number(THREE.MathUtils.radToDeg(this.#yawOrbit).toFixed(2)),
      yawTargetDegrees: Number(
        THREE.MathUtils.radToDeg(this.#yawOrbitTarget).toFixed(2),
      ),
      pitchDegrees: Number(
        THREE.MathUtils.radToDeg(this.#pitchOrbit).toFixed(2),
      ),
      pitchTargetDegrees: Number(
        THREE.MathUtils.radToDeg(this.#pitchOrbitTarget).toFixed(2),
      ),
      returnDelayRemainingSeconds: 0,
      returningToChase: false,
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
    this.#driveHeave +=
      (targetHeave - this.#driveHeave) * (1 - Math.exp(-6.8 * dt));
    const targetRoll = THREE.MathUtils.clamp(
      -state.steering * driveTuning.rollStrength
        - state.lateralSpeed * 0.012,
      -0.12,
      0.12,
    );
    this.#driveRoll +=
      (targetRoll - this.#driveRoll) * (1 - Math.exp(-5.5 * dt));
    const shakeAmount = driveTuning.roughnessShake
      * roughness
      * THREE.MathUtils.clamp(speed / 24, 0, 1.2);
    const landingKick = state.wasAirborne
      ? driveTuning.landingKick
        + THREE.MathUtils.clamp(Math.abs(state.verticalSpeed) * 0.08, 0, 0.16)
      : 0;
    this.#driveImpact = Math.max(
      this.#driveImpact * Math.exp(-5.6 * dt),
      landingKick,
    );
    const lateralOffset = THREE.MathUtils.clamp(
      state.steering * driveTuning.steeringOffset
        + state.lateralSpeed * 0.05,
      -driveTuning.driftLook,
      driveTuning.driftLook,
    );

    const localOffset = new THREE.Vector3(
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
    localOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), -this.#pitchOrbit);
    localOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.#yawOrbit);

    const desiredPosition = vehiclePosition
      .clone()
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

    this.#currentPosition.lerp(
      resolvedDesiredPosition,
      1 - Math.exp(-5.4 * dt),
    );
    this.#currentPosition.y = Math.max(
      this.#currentPosition.y,
      this.#getTerrainFloor(this.#currentPosition) + terrainClearance * 0.92,
    );
    camera.position.copy(this.#currentPosition);

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(vehicleQuaternion);
    const right = new THREE.Vector3(1, 0, 0)
      .applyQuaternion(vehicleQuaternion)
      .projectOnPlane(new THREE.Vector3(0, 1, 0))
      .normalize();
    const velocityLead = forward
      .clone()
      .multiplyScalar(Math.max(state.forwardSpeed, 0) * driveTuning.velocityLead)
      .addScaledVector(
        right,
        state.lateralSpeed * driveTuning.velocityLead * 0.9,
      );
    const lookTarget = vehiclePosition
      .clone()
      .add(forward.multiplyScalar(driveTuning.lookAhead + speedBlend * 1.2))
      .add(right.multiplyScalar(lateralOffset * 0.32));
    lookTarget.add(velocityLead);
    lookTarget.y +=
      driveTuning.lookHeight
      + this.#driveHeave * 0.42
      + Math.min(state.airborneTime * 0.7, 0.65);
    if (nextCheckpointPoint && !this.#isDragging) {
      const checkpointFocus = nextCheckpointPoint.clone();
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
    this.#currentLookTarget.lerp(
      lookTarget,
      1 - Math.exp(-driveTuning.lookSmoothing * dt),
    );
    const targetFov =
      driveTuning.fovBase
      + speedBlend * driveTuning.fovSpeedGain
      + (state.isBoosting ? driveTuning.fovBoostGain : 0)
      + Math.min(state.airborneTime * driveTuning.fovAirborneGain, driveTuning.fovAirborneGain)
      + this.#driveImpact * driveTuning.fovImpactGain;
    this.#updateCameraFov(camera, targetFov, dt, 5.4);
    camera.up.set(0, 1, 0);
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
    const desiredPosition = new THREE.Vector3(
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

    const lookTarget = focusPoint.clone().lerp(landmarkPoint, 0.32);
    lookTarget.y += 8;
    camera.up.set(0, 1, 0);
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

    const focusPoint = vehiclePosition.clone().lerp(objectivePoint, 0.45);
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
    const desiredPosition = new THREE.Vector3(
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

    const lookTarget = objectivePoint.clone().lerp(
      landmarkPoint,
      THREE.MathUtils.lerp(0.08, 0.22, orbitProgress),
    );
    lookTarget.y += THREE.MathUtils.lerp(
      arrivalTuning.holdLookHeight,
      6.1,
      orbitProgress,
    );
    camera.up.set(0, 1, 0);
    camera.lookAt(lookTarget);
  }

  #updateCameraFov(
    camera: THREE.PerspectiveCamera,
    targetFov: number,
    dt: number,
    response: number,
  ): void {
    const blend = 1 - Math.exp(-response * dt);
    camera.fov += (targetFov - camera.fov) * blend;
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
    const focusPoint = vehiclePosition.clone();
    focusPoint.y += this.#tuning.camera.drive.lookHeight + 0.6;

    const resolvedPosition = desiredPosition.clone();
    resolvedPosition.y = Math.max(
      resolvedPosition.y,
      this.#getTerrainFloor(resolvedPosition) + terrainClearance,
    );

    let visibleT = 1;
    const samplePoint = new THREE.Vector3();
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
    this.#yawOrbitTarget = this.#yawOrbit;
    this.#pitchOrbitTarget = this.#pitchOrbit;
    this.#yawOrbitMomentum = 0;
    this.#pitchOrbitMomentum = 0;
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
    this.#yawOrbitTarget += deltaYaw;
    this.#pitchOrbitTarget = THREE.MathUtils.clamp(
      this.#pitchOrbitTarget + deltaPitch,
      -0.12,
      0.8,
    );
    const seconds = elapsedMs / 1000;
    const yawVelocity = THREE.MathUtils.clamp(deltaYaw / seconds, -6.4, 6.4);
    const pitchVelocity = THREE.MathUtils.clamp(deltaPitch / seconds, -4.2, 4.2);
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
        const momentumDamping = Math.exp(-9.5 * dt);
        this.#yawOrbitMomentum *= momentumDamping;
        this.#pitchOrbitMomentum *= momentumDamping;
      }
    }

    const response = this.#prefersReducedMotion
      ? this.#isDragging
        ? 24
        : 14
      : this.#isDragging
        ? 16
        : 8.5;
    const blend = 1 - Math.exp(-response * dt);
    this.#yawOrbit += (this.#yawOrbitTarget - this.#yawOrbit) * blend;
    this.#pitchOrbit += (this.#pitchOrbitTarget - this.#pitchOrbit) * blend;
  }
}
