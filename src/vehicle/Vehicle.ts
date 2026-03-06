import * as THREE from 'three';
import { DrivingState } from './DrivingState';
import { VEHICLE_WHEEL_OFFSETS } from './vehicleShared';

export class Vehicle {
  readonly mesh = new THREE.Group();
  readonly #bodyVisual = new THREE.Group();
  readonly #wheelMounts: THREE.Group[] = [];
  readonly #wheelMeshes: THREE.Mesh[] = [];
  readonly #boostStripMaterial: THREE.MeshStandardMaterial;
  #bodyRoll = 0;
  #bodyPitch = 0;

  constructor(scene: THREE.Scene) {
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0x6a281a,
      roughness: 0.7,
      metalness: 0.32,
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x4f4c48,
      roughness: 0.58,
      metalness: 0.82,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: 0x8b6842,
      roughness: 0.74,
      metalness: 0.22,
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x8ca2a0,
      roughness: 0.18,
      metalness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.15,
      opacity: 0.52,
      transparent: true,
    });
    this.#boostStripMaterial = new THREE.MeshStandardMaterial({
      color: 0xcba266,
      emissive: 0xffb45a,
      emissiveIntensity: 0.7,
      roughness: 0.3,
      metalness: 0.6,
    });

    this.mesh.add(this.#bodyVisual);

    this.#bodyVisual.add(this.#box(bodyMaterial, [2.25, 0.72, 4.8], [0, 0.02, 0]));
    this.#bodyVisual.add(this.#box(metalMaterial, [1.98, 0.18, 4.95], [0, -0.28, 0.05]));
    this.#bodyVisual.add(this.#box(bodyMaterial, [1.78, 0.5, 1.68], [0, 0.44, 1.35]));
    this.#bodyVisual.add(this.#box(metalMaterial, [1.52, 0.86, 2.08], [-0.04, 0.72, -0.2]));
    this.#bodyVisual.add(this.#box(glassMaterial, [1.36, 0.42, 0.06], [0, 0.82, 0.45], [-0.58, 0, 0]));
    this.#bodyVisual.add(this.#box(glassMaterial, [1.14, 0.32, 0.05], [0, 0.78, -1.02], [0.34, 0, 0]));
    this.#bodyVisual.add(this.#box(trimMaterial, [0.9, 0.16, 1.02], [0, 0.52, 1.64]));
    this.#bodyVisual.add(this.#box(metalMaterial, [0.42, 0.38, 0.7], [0, 0.72, 1.74]));
    this.#bodyVisual.add(this.#box(this.#boostStripMaterial, [0.8, 0.12, 0.22], [0, 0.12, -2.38]));

    const ram = new THREE.Group();
    ram.position.set(0, 0.02, 2.44);
    ram.add(this.#box(metalMaterial, [1.8, 0.08, 0.12], [0, 0, 0]));
    ram.add(this.#box(metalMaterial, [1.58, 0.08, 0.12], [0, 0.22, -0.06]));
    ram.add(this.#box(metalMaterial, [0.08, 0.34, 0.1], [-0.66, 0.12, -0.03]));
    ram.add(this.#box(metalMaterial, [0.08, 0.34, 0.1], [0.66, 0.12, -0.03]));
    this.#bodyVisual.add(ram);

    const rack = new THREE.Group();
    rack.position.set(0, 1.2, -0.24);
    rack.add(this.#box(metalMaterial, [1.72, 0.06, 1.92], [0, 0, 0]));
    rack.add(this.#box(trimMaterial, [0.56, 0.28, 0.72], [-0.34, 0.18, -0.18]));
    rack.add(this.#box(trimMaterial, [0.38, 0.22, 0.46], [0.38, 0.14, 0.22]));
    this.#bodyVisual.add(rack);

    const exhaustLeft = this.#cylinder(metalMaterial, 0.06, 0.9, [-0.82, 0.48, -1.98], [0.2, 0, 0]);
    const exhaustRight = this.#cylinder(metalMaterial, 0.06, 0.9, [0.82, 0.48, -1.98], [0.2, 0, 0]);
    this.#bodyVisual.add(exhaustLeft, exhaustRight);

    for (const offset of VEHICLE_WHEEL_OFFSETS) {
      const mount = new THREE.Group();
      mount.position.copy(offset);
      const tire = this.#wheel(metalMaterial);
      mount.add(tire);
      this.#wheelMounts.push(mount);
      this.#wheelMeshes.push(tire);
      this.mesh.add(mount);
    }

    scene.add(this.mesh);
  }

  setPose(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    this.mesh.position.copy(position);
    this.mesh.quaternion.copy(quaternion);
  }

  updateVisuals(dt: number, state: DrivingState): void {
    const spin = (state.forwardSpeed / 0.48) * dt;
    for (const wheel of this.#wheelMeshes) {
      wheel.rotation.x += spin;
    }

    const frontLeft = this.#wheelMounts[0];
    const frontRight = this.#wheelMounts[1];
    if (frontLeft) frontLeft.rotation.y = state.steering * 0.48;
    if (frontRight) frontRight.rotation.y = state.steering * 0.48;

    const targetRoll = THREE.MathUtils.clamp(-state.lateralSpeed * 0.018, -0.12, 0.12);
    const targetPitch = state.isBraking ? -0.05 : state.isAccelerating ? 0.03 : 0;
    this.#bodyRoll += (targetRoll - this.#bodyRoll) * (1 - Math.exp(-8 * dt));
    this.#bodyPitch += (targetPitch - this.#bodyPitch) * (1 - Math.exp(-8 * dt));
    this.#bodyVisual.rotation.z = this.#bodyRoll;
    this.#bodyVisual.rotation.x = this.#bodyPitch;

    this.#boostStripMaterial.emissiveIntensity = state.isBoosting ? 1.8 : 0.7;

    for (let index = 0; index < this.#wheelMounts.length; index += 1) {
      const mount = this.#wheelMounts[index];
      const offset = VEHICLE_WHEEL_OFFSETS[index];
      if (!mount || !offset) continue;
      const compression = state.wheelCompression[index] ?? 0;
      mount.position.set(
        offset.x,
        offset.y + compression * 0.16,
        offset.z,
      );
    }
  }

  #wheel(
    hubMaterial: THREE.MeshStandardMaterial,
  ): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial> {
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.36, 18),
      new THREE.MeshStandardMaterial({
        color: 0x171513,
        roughness: 0.96,
        metalness: 0.04,
      }),
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    tire.receiveShadow = true;

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.4, 12),
      hubMaterial,
    );
    hub.rotation.z = Math.PI / 2;
    tire.add(hub);

    return tire;
  }

  #box(
    material: THREE.Material,
    size: [number, number, number],
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  #cylinder(
    material: THREE.Material,
    radius: number,
    height: number,
    position: [number, number, number],
    rotation: [number, number, number],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 12),
      material,
    );
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
