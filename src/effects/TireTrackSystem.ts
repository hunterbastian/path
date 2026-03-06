import * as THREE from 'three';
import type { DriveSurface } from '../vehicle/DrivingState';
import { VehicleController } from '../vehicle/VehicleController';
import { Terrain } from '../world/Terrain';

interface TrackSurfaceConfig {
  color: number;
  width: number;
  baseOpacity: number;
  minSpeed: number;
  emitInterval: number;
  minDistance: number;
}

interface TrackSegment {
  mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  material: THREE.MeshStandardMaterial;
  age: number;
  lifetime: number;
  baseOpacity: number;
}

const TRACK_LIFETIME_SECONDS = 10;
const TRACK_LIFT = 0.04;
const MAX_TRACK_SEGMENTS = 320;
const RESET_DISTANCE = 8;

const TRACK_SURFACE_CONFIG: Partial<Record<DriveSurface, TrackSurfaceConfig>> = {
  snow: {
    color: 0x687078,
    width: 0.34,
    baseOpacity: 0.36,
    minSpeed: 1.2,
    emitInterval: 0.16,
    minDistance: 0.72,
  },
  sand: {
    color: 0xa18557,
    width: 0.42,
    baseOpacity: 0.28,
    minSpeed: 1,
    emitInterval: 0.16,
    minDistance: 0.66,
  },
  dirt: {
    color: 0x5e4a35,
    width: 0.31,
    baseOpacity: 0.2,
    minSpeed: 1.4,
    emitInterval: 0.18,
    minDistance: 0.78,
  },
  grass: {
    color: 0x465140,
    width: 0.3,
    baseOpacity: 0.15,
    minSpeed: 1.8,
    emitInterval: 0.18,
    minDistance: 0.82,
  },
};

export class TireTrackSystem {
  readonly #terrain: Terrain;
  readonly #group = new THREE.Group();
  readonly #segments: TrackSegment[] = [];
  readonly #anchors = Array.from({ length: 4 }, () => new THREE.Vector3());
  readonly #hasAnchor = [false, false, false, false];
  readonly #emitTimers = [0, 0, 0, 0];
  readonly #basis = new THREE.Matrix4();
  readonly #midpoint = new THREE.Vector3();
  readonly #tangent = new THREE.Vector3();
  readonly #side = new THREE.Vector3();
  readonly #normal = new THREE.Vector3();
  #segmentCursor = 0;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.#terrain = terrain;
    this.#group.renderOrder = 1;
    scene.add(this.#group);

    for (let index = 0; index < MAX_TRACK_SEGMENTS; index += 1) {
      const material = new THREE.MeshStandardMaterial({
        color: 0x6e726d,
        roughness: 1,
        metalness: 0,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        material,
      );
      mesh.visible = false;
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      this.#group.add(mesh);
      this.#segments.push({
        mesh,
        material,
        age: TRACK_LIFETIME_SECONDS,
        lifetime: TRACK_LIFETIME_SECONDS,
        baseOpacity: 0,
      });
    }
  }

  dispose(): void {
    for (const segment of this.#segments) {
      segment.mesh.geometry.dispose();
      segment.material.dispose();
    }
    this.#group.removeFromParent();
  }

  clear(): void {
    for (const segment of this.#segments) {
      segment.age = segment.lifetime;
      segment.material.opacity = 0;
      segment.mesh.visible = false;
    }
    this.#segmentCursor = 0;
    this.#resetAnchors();
  }

  update(dt: number, vehicle: VehicleController): void {
    for (const segment of this.#segments) {
      if (!segment.mesh.visible) continue;
      segment.age += dt;
      if (segment.age >= segment.lifetime) {
        segment.mesh.visible = false;
        segment.material.opacity = 0;
        continue;
      }

      const life = 1 - segment.age / segment.lifetime;
      segment.material.opacity = segment.baseOpacity * Math.pow(life, 1.1);
    }

    const state = vehicle.state;
    const config = TRACK_SURFACE_CONFIG[state.surface];
    if (!state.isGrounded || !config || state.surface === 'water' || state.surface === 'rock') {
      this.#resetAnchors();
      return;
    }

    for (let wheelIndex = 0; wheelIndex < 4; wheelIndex += 1) {
      if (!state.wheelContact[wheelIndex]) {
        this.#hasAnchor[wheelIndex] = false;
        this.#emitTimers[wheelIndex] = 0;
        continue;
      }

      const wheel = vehicle.wheelWorldPositions[wheelIndex];
      if (!wheel) continue;

      const nextTimer = (this.#emitTimers[wheelIndex] ?? 0) + dt;
      this.#emitTimers[wheelIndex] = nextTimer;
      const groundPoint = this.#projectWheelToGround(wheel);
      const anchor = this.#anchors[wheelIndex];
      if (!anchor) continue;

      if (!this.#hasAnchor[wheelIndex]) {
        anchor.copy(groundPoint);
        this.#hasAnchor[wheelIndex] = true;
        this.#emitTimers[wheelIndex] = 0;
        continue;
      }

      const distance = anchor.distanceTo(groundPoint);
      if (distance > RESET_DISTANCE) {
        anchor.copy(groundPoint);
        this.#emitTimers[wheelIndex] = 0;
        continue;
      }

      if (state.speed < config.minSpeed) continue;

      const shouldEmit =
        distance >= config.minDistance &&
        (nextTimer >= config.emitInterval ||
          distance >= config.minDistance * 1.8);

      if (!shouldEmit) continue;

      const opacityBoost = state.isDrifting
        ? 1.18
        : state.surface === 'sand'
          ? 1.12 + state.surfaceBuildup * 0.2
          : 1;
      this.#spawnSegment(anchor, groundPoint, config, opacityBoost);
      anchor.copy(groundPoint);
      this.#emitTimers[wheelIndex] = 0;
    }
  }

  getActiveCount(): number {
    let active = 0;
    for (const segment of this.#segments) {
      if (segment.mesh.visible) {
        active += 1;
      }
    }
    return active;
  }

  #spawnSegment(
    start: THREE.Vector3,
    end: THREE.Vector3,
    config: TrackSurfaceConfig,
    opacityBoost: number,
  ): void {
    const segment = this.#segments[this.#segmentCursor];
    if (!segment) return;
    this.#segmentCursor = (this.#segmentCursor + 1) % this.#segments.length;

    this.#midpoint.copy(start).add(end).multiplyScalar(0.5);
    const groundY = this.#terrain.getHeightAt(this.#midpoint.x, this.#midpoint.z);
    this.#midpoint.y = groundY + TRACK_LIFT;

    this.#tangent.copy(end).sub(start);
    const length = this.#tangent.length();
    if (length < 0.01) {
      segment.mesh.visible = false;
      return;
    }
    this.#tangent.multiplyScalar(1 / length);
    this.#normal.copy(this.#terrain.getNormalAt(this.#midpoint.x, this.#midpoint.z));
    this.#side.crossVectors(this.#normal, this.#tangent).normalize();
    if (this.#side.lengthSq() < 0.0001) {
      this.#side.set(1, 0, 0);
    }

    this.#basis.makeBasis(this.#side, this.#normal, this.#tangent);
    segment.mesh.position.copy(this.#midpoint);
    segment.mesh.setRotationFromMatrix(this.#basis);
    segment.mesh.scale.set(config.width, 1, length);
    segment.material.color.setHex(config.color);
    segment.baseOpacity = config.baseOpacity * opacityBoost;
    segment.material.opacity = segment.baseOpacity;
    segment.age = 0;
    segment.lifetime = TRACK_LIFETIME_SECONDS;
    segment.mesh.visible = true;
  }

  #projectWheelToGround(wheel: THREE.Vector3): THREE.Vector3 {
    const y = this.#terrain.getHeightAt(wheel.x, wheel.z) + TRACK_LIFT;
    return new THREE.Vector3(wheel.x, y, wheel.z);
  }

  #resetAnchors(): void {
    for (let index = 0; index < this.#anchors.length; index += 1) {
      this.#hasAnchor[index] = false;
      this.#emitTimers[index] = 0;
    }
  }
}
