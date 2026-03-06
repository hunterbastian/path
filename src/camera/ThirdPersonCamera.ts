import * as THREE from 'three';

export class ThirdPersonCamera {
  readonly #canvas: HTMLCanvasElement;
  #isDragging = false;
  #pointerId = -1;
  #yawOrbit = 0;
  #pitchOrbit = 0.16;
  #currentPosition = new THREE.Vector3();
  #initialized = false;
  #titleAngle = Math.PI * 0.15;

  constructor(canvas: HTMLCanvasElement) {
    this.#canvas = canvas;
    canvas.addEventListener('pointerdown', this.#handlePointerDown);
    canvas.addEventListener('pointerup', this.#handlePointerUp);
    canvas.addEventListener('pointermove', this.#handlePointerMove);
    canvas.addEventListener('pointercancel', this.#handlePointerUp);
    canvas.addEventListener('contextmenu', this.#handleContextMenu);
  }

  dispose(): void {
    this.#canvas.removeEventListener('pointerdown', this.#handlePointerDown);
    this.#canvas.removeEventListener('pointerup', this.#handlePointerUp);
    this.#canvas.removeEventListener('pointermove', this.#handlePointerMove);
    this.#canvas.removeEventListener('pointercancel', this.#handlePointerUp);
    this.#canvas.removeEventListener('contextmenu', this.#handleContextMenu);
  }

  updateDrive(
    dt: number,
    camera: THREE.PerspectiveCamera,
    vehiclePosition: THREE.Vector3,
    vehicleQuaternion: THREE.Quaternion,
    speed: number,
  ): void {
    if (!this.#isDragging) {
      const settle = 1 - Math.exp(-2.5 * dt);
      this.#yawOrbit *= 1 - settle;
      this.#pitchOrbit += (0.18 - this.#pitchOrbit) * settle;
    }

    const chaseDistance = THREE.MathUtils.lerp(10.5, 13.5, Math.min(speed / 28, 1));
    const chaseHeight = THREE.MathUtils.lerp(4.8, 5.8, Math.min(speed / 28, 1));

    const localOffset = new THREE.Vector3(0, chaseHeight, -chaseDistance);
    localOffset.applyAxisAngle(new THREE.Vector3(1, 0, 0), -this.#pitchOrbit);
    localOffset.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.#yawOrbit);

    const desiredPosition = vehiclePosition
      .clone()
      .add(localOffset.applyQuaternion(vehicleQuaternion));

    if (!this.#initialized) {
      this.#currentPosition.copy(desiredPosition);
      this.#initialized = true;
    }

    this.#currentPosition.lerp(desiredPosition, 1 - Math.exp(-5.4 * dt));
    camera.position.copy(this.#currentPosition);

    const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(vehicleQuaternion);
    const lookTarget = vehiclePosition.clone().add(forward.multiplyScalar(5.6));
    lookTarget.y += 1.8;
    camera.lookAt(lookTarget);
  }

  updateTitle(
    dt: number,
    camera: THREE.PerspectiveCamera,
    focusPoint: THREE.Vector3,
    landmarkPoint: THREE.Vector3,
  ): void {
    this.#titleAngle += dt * 0.14;

    const radius = 34;
    const desiredPosition = new THREE.Vector3(
      focusPoint.x + Math.cos(this.#titleAngle) * radius,
      focusPoint.y + 13 + Math.sin(this.#titleAngle * 0.6) * 2.2,
      focusPoint.z + Math.sin(this.#titleAngle) * 18 - 8,
    );

    if (!this.#initialized) {
      this.#currentPosition.copy(desiredPosition);
      this.#initialized = true;
    }

    this.#currentPosition.lerp(desiredPosition, 1 - Math.exp(-2.2 * dt));
    camera.position.copy(this.#currentPosition);

    const lookTarget = focusPoint.clone().lerp(landmarkPoint, 0.32);
    lookTarget.y += 8;
    camera.lookAt(lookTarget);
  }

  updateArrival(
    dt: number,
    camera: THREE.PerspectiveCamera,
    vehiclePosition: THREE.Vector3,
    objectivePoint: THREE.Vector3,
    landmarkPoint: THREE.Vector3,
  ): void {
    this.#titleAngle += dt * 0.18;

    const focusPoint = vehiclePosition.clone().lerp(objectivePoint, 0.45);
    const radius = 18;
    const desiredPosition = new THREE.Vector3(
      focusPoint.x + Math.cos(this.#titleAngle) * radius,
      focusPoint.y + 8.4 + Math.sin(this.#titleAngle * 0.7) * 1.4,
      focusPoint.z + Math.sin(this.#titleAngle) * 12 - 2,
    );

    if (!this.#initialized) {
      this.#currentPosition.copy(desiredPosition);
      this.#initialized = true;
    }

    this.#currentPosition.lerp(desiredPosition, 1 - Math.exp(-2.8 * dt));
    camera.position.copy(this.#currentPosition);

    const lookTarget = objectivePoint.clone().lerp(landmarkPoint, 0.2);
    lookTarget.y += 6;
    camera.lookAt(lookTarget);
  }

  #handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) return;
    this.#isDragging = true;
    this.#pointerId = event.pointerId;
    this.#canvas.setPointerCapture(event.pointerId);
  };

  #handlePointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.#pointerId) return;
    this.#isDragging = false;
    this.#pointerId = -1;
    if (this.#canvas.hasPointerCapture(event.pointerId)) {
      this.#canvas.releasePointerCapture(event.pointerId);
    }
  };

  #handlePointerMove = (event: PointerEvent): void => {
    if (!this.#isDragging || event.pointerId !== this.#pointerId) return;
    this.#yawOrbit -= event.movementX * 0.004;
    this.#pitchOrbit = THREE.MathUtils.clamp(
      this.#pitchOrbit + event.movementY * 0.0035,
      -0.12,
      0.8,
    );
  };

  #handleContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };
}
