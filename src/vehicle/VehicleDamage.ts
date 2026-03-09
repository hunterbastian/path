import * as THREE from 'three';

export interface DetachablePartConfig {
  name: string;
  group: THREE.Object3D;
  parent: THREE.Object3D;
  health: number;
  fragility: number;
  detachThreshold: number;
  /** Normalized direction in vehicle-local space that this part is most vulnerable to. */
  directionalBias: THREE.Vector3;
  /** 0 = omnidirectional, 1 = fully directional. */
  directionalWeight: number;
}

interface DetachedPart {
  mesh: THREE.Object3D;
  velocity: THREE.Vector3;
  angularVelocity: THREE.Vector3;
  age: number;
  maxAge: number;
  materials: THREE.Material[];
}

interface PartRecord {
  config: DetachablePartConfig;
  initialPosition: THREE.Vector3;
  initialQuaternion: THREE.Quaternion;
}

const GRAVITY = 24;
const _worldPos = new THREE.Vector3();

export class VehicleDamage {
  readonly #parts = new Map<string, PartRecord>();
  readonly #detached: DetachedPart[] = [];
  readonly #scene: THREE.Scene;

  constructor(scene: THREE.Scene) {
    this.#scene = scene;
  }

  registerPart(config: DetachablePartConfig): void {
    this.#parts.set(config.name, {
      config: { ...config },
      initialPosition: config.group.position.clone(),
      initialQuaternion: config.group.quaternion.clone(),
    });
  }

  applyImpact(
    magnitude: number,
    direction: THREE.Vector3,
    vehiclePosition: THREE.Vector3,
    vehicleQuaternion: THREE.Quaternion,
    vehicleVelocity: THREE.Vector3,
  ): void {
    const localDir = direction.clone().applyQuaternion(
      vehicleQuaternion.clone().invert(),
    );

    for (const [name, record] of this.#parts) {
      const config = record.config;
      if (config.health <= 0) continue;
      if (magnitude < config.detachThreshold) continue;

      let directionalFactor = 1;
      if (config.directionalWeight > 0) {
        const dot = localDir.dot(config.directionalBias);
        directionalFactor = THREE.MathUtils.lerp(
          1,
          Math.max(dot + 0.2, 0.08),
          config.directionalWeight,
        );
      }

      const damage =
        (magnitude - config.detachThreshold) * config.fragility * directionalFactor;
      config.health = Math.max(0, config.health - damage);

      if (config.health <= 0) {
        this.#detachPart(
          name,
          record,
          vehiclePosition,
          vehicleQuaternion,
          vehicleVelocity,
          direction,
          magnitude,
        );
      }
    }
  }

  #detachPart(
    _name: string,
    record: PartRecord,
    _vehiclePosition: THREE.Vector3,
    _vehicleQuaternion: THREE.Quaternion,
    vehicleVelocity: THREE.Vector3,
    impactDirection: THREE.Vector3,
    impactMagnitude: number,
  ): void {
    const obj = record.config.group;

    obj.getWorldPosition(_worldPos);
    const worldQuat = new THREE.Quaternion();
    obj.getWorldQuaternion(worldQuat);

    record.config.parent.remove(obj);

    obj.position.copy(_worldPos);
    obj.quaternion.copy(worldQuat);
    this.#scene.add(obj);

    const ejectSpeed = 1.8 + impactMagnitude * 0.22;
    const outward = new THREE.Vector3(
      -impactDirection.x + (Math.random() - 0.5) * 0.5,
      0.35 + Math.random() * 0.25,
      -impactDirection.z + (Math.random() - 0.5) * 0.5,
    )
      .normalize()
      .multiplyScalar(ejectSpeed);

    const velocity = vehicleVelocity.clone().multiplyScalar(0.6).add(outward);

    const angularVelocity = new THREE.Vector3(
      (Math.random() - 0.5) * 3.5,
      (Math.random() - 0.5) * 3.5,
      (Math.random() - 0.5) * 3.5,
    );

    const materials: THREE.Material[] = [];
    obj.traverse((child) => {
      if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
        const cloned = child.material.clone();
        cloned.userData.originalOpacity =
          child.material.userData.originalOpacity ?? child.material.opacity;
        child.material = cloned;
        materials.push(cloned);
      }
    });

    this.#detached.push({
      mesh: obj,
      velocity,
      angularVelocity,
      age: 0,
      maxAge: 3.5 + Math.random() * 1.5,
      materials,
    });
  }

  update(dt: number, groundHeightEstimate: number): void {
    for (let i = this.#detached.length - 1; i >= 0; i--) {
      const part = this.#detached[i]!;
      part.age += dt;

      part.velocity.y -= GRAVITY * dt;

      part.mesh.position.addScaledVector(part.velocity, dt);

      part.mesh.rotation.x += part.angularVelocity.x * dt;
      part.mesh.rotation.y += part.angularVelocity.y * dt;
      part.mesh.rotation.z += part.angularVelocity.z * dt;

      if (part.mesh.position.y < groundHeightEstimate) {
        part.mesh.position.y = groundHeightEstimate;
        part.velocity.y = Math.abs(part.velocity.y) * 0.15;
        part.velocity.x *= 0.6;
        part.velocity.z *= 0.6;
        part.angularVelocity.multiplyScalar(0.5);
      }

      part.velocity.multiplyScalar(1 - 0.4 * dt);
      part.angularVelocity.multiplyScalar(1 - 1.8 * dt);

      if (part.age > part.maxAge - 1.2) {
        const fade = Math.max(0, 1 - (part.age - (part.maxAge - 1.2)) / 1.2);
        for (const material of part.materials) {
          material.transparent = true;
          material.opacity = fade * (material.userData.originalOpacity ?? 1);
        }
      }

      if (part.age >= part.maxAge) {
        this.#scene.remove(part.mesh);
        part.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.geometry?.dispose();
          }
        });
        this.#detached.splice(i, 1);
      }
    }
  }

  getPartHealth(name: string): number {
    return this.#parts.get(name)?.config.health ?? 1;
  }

  isPartAttached(name: string): boolean {
    const record = this.#parts.get(name);
    return record ? record.config.health > 0 : true;
  }

  get totalHealth(): number {
    if (this.#parts.size === 0) return 1;
    let sum = 0;
    for (const record of this.#parts.values()) {
      sum += Math.max(0, record.config.health);
    }
    return sum / this.#parts.size;
  }

  reset(): void {
    for (const detached of this.#detached) {
      this.#scene.remove(detached.mesh);
      detached.mesh.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.geometry?.dispose();
        }
      });
    }
    this.#detached.length = 0;

    for (const record of this.#parts.values()) {
      const obj = record.config.group;
      this.#scene.remove(obj);

      obj.position.copy(record.initialPosition);
      obj.quaternion.copy(record.initialQuaternion);

      obj.traverse((child) => {
        if (child instanceof THREE.Mesh && child.material instanceof THREE.Material) {
          const original = child.material.userData.originalOpacity;
          if (original != null) {
            child.material.opacity = original;
            child.material.transparent = original < 1;
          }
        }
      });

      record.config.parent.add(obj);
      record.config.health = 1;
    }
  }
}
