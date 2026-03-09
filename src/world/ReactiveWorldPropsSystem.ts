import * as THREE from 'three';
import { expDecay } from '../core/math';
import { VEHICLE_CLEARANCE } from '../vehicle/vehicleShared';
import type { Terrain } from './Terrain';

type ReactivePropType = 'barrier' | 'crate' | 'pole' | 'sign' | 'floodlight';

interface ReactiveProp {
  id: string;
  type: ReactivePropType;
  root: THREE.Group;
  pivot: THREE.Group;
  anchorPosition: THREE.Vector3;
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  yaw: number;
  baseHeight: number;
  collisionRadius: number;
  collisionHeight: number;
  shoveable: boolean;
  leanAxis: THREE.Vector3;
  leanAngle: number;
  leanVelocity: number;
  snapTarget: number;
  toppled: boolean;
  hitCooldown: number;
}

export interface ReactivePropInteraction {
  nearestDistanceMeters: number;
  collision: boolean;
  sourceId: string | null;
  correction: THREE.Vector3;
  impulse: THREE.Vector3;
}

export interface ReactivePropDebugState {
  activeCount: number;
  toppledCount: number;
}

const PLAYER_COLLISION_RADIUS = 1.45;
const _yAxis = new THREE.Vector3(0, 1, 0);
const _offset = new THREE.Vector3();

export class ReactiveWorldPropsSystem {
  readonly #terrain: Terrain;
  readonly #props: ReactiveProp[] = [];
  readonly #interactionCorrection = new THREE.Vector3();
  readonly #interactionImpulse = new THREE.Vector3();
  #playerInteraction: ReactivePropInteraction = {
    nearestDistanceMeters: 999,
    collision: false,
    sourceId: null,
    correction: new THREE.Vector3(),
    impulse: new THREE.Vector3(),
  };

  constructor(
    scene: THREE.Scene,
    terrain: Terrain,
    outpostPositions: THREE.Vector3[],
    cityCenterPosition: THREE.Vector3,
    objectivePosition: THREE.Vector3,
  ) {
    this.#terrain = terrain;

    const pathFacing = (z: number) =>
      new THREE.Vector3(terrain.getPathCenterX(z), terrain.getHeightAt(0, z), z);

    const outpostA = outpostPositions[0];
    const outpostB = outpostPositions[1];
    if (outpostA) {
      this.#addOutpostCluster(scene, 'outpost-a', outpostA, pathFacing(outpostA.z));
    }
    if (outpostB) {
      this.#addOutpostCluster(scene, 'outpost-b', outpostB, pathFacing(outpostB.z));
    }
    this.#addHubCluster(scene, cityCenterPosition, objectivePosition);

    terrain.serviceRoadPaths.forEach((road, index) => {
      if (road.length < 2) return;
      const marker = this.#sampleRoadPoint(road, 0.54);
      const shoulder = 4.4 + index * 0.2;
      this.#addRoadsideProp(
        scene,
        `road-sign-${index}`,
        'sign',
        marker.point,
        marker.tangent,
        shoulder,
      );
      this.#addRoadsideProp(
        scene,
        `road-pole-${index}`,
        'pole',
        marker.point,
        marker.tangent,
        -shoulder,
      );
      if (index < 3) {
        this.#addRoadsideProp(
          scene,
          `road-crate-${index}`,
          'crate',
          marker.point,
          marker.tangent,
          shoulder * 0.48,
        );
      }
    });
  }

  update(
    dt: number,
    playerPosition: THREE.Vector3,
    playerVelocity: THREE.Vector3,
  ): void {
    const playerPlanarSpeed = Math.hypot(playerVelocity.x, playerVelocity.z);
    let nearestDistanceMeters = Number.POSITIVE_INFINITY;
    let collision = false;
    let sourceId: string | null = null;
    this.#interactionCorrection.set(0, 0, 0);
    this.#interactionImpulse.set(0, 0, 0);

    for (const prop of this.#props) {
      prop.hitCooldown = Math.max(0, prop.hitCooldown - dt);

      if (prop.shoveable) {
        prop.position.addScaledVector(prop.velocity, dt);
        prop.position.y =
          this.#terrain.getHeightAt(prop.position.x, prop.position.z) + prop.baseHeight;
        prop.velocity.multiplyScalar(expDecay(1, 3.8, dt));
      } else {
        prop.position.y =
          this.#terrain.getHeightAt(prop.position.x, prop.position.z) + prop.baseHeight;
      }

      const targetLean = prop.toppled ? prop.snapTarget : 0;
      const spring = prop.toppled ? 5.4 : 16;
      const damping = prop.toppled ? 6.2 : 8.8;
      prop.leanVelocity += (targetLean - prop.leanAngle) * spring * dt;
      prop.leanVelocity = expDecay(prop.leanVelocity, damping, dt);
      prop.leanAngle += prop.leanVelocity * dt;
      if (!prop.toppled && Math.abs(prop.leanAngle) < 0.002 && Math.abs(prop.leanVelocity) < 0.01) {
        prop.leanAngle = 0;
      }

      prop.root.position.copy(prop.position);
      prop.root.rotation.set(0, prop.yaw, 0);
      if (prop.leanAxis.lengthSq() > 0.0001 && Math.abs(prop.leanAngle) > 0.0001) {
        prop.pivot.quaternion.setFromAxisAngle(prop.leanAxis, prop.leanAngle);
      } else {
        prop.pivot.quaternion.identity();
      }

      _offset.copy(playerPosition).sub(prop.position);
      _offset.y = 0;
      let distance = _offset.length();
      const clearance = distance - (PLAYER_COLLISION_RADIUS + prop.collisionRadius);
      nearestDistanceMeters = Math.min(nearestDistanceMeters, clearance);
      if (clearance >= 0 || prop.hitCooldown > 0 || playerPlanarSpeed < 1.6) {
        continue;
      }
      if (Math.abs(playerPosition.y - prop.position.y) > prop.collisionHeight + 2) {
        continue;
      }

      collision = true;
      sourceId ??= prop.id;
      if (distance < 0.001) {
        _offset.set(1, 0, 0);
        distance = 1;
      } else {
        _offset.multiplyScalar(1 / distance);
      }
      const overlap = -clearance;
      this.#interactionCorrection.addScaledVector(
        _offset,
        prop.shoveable ? overlap * 0.42 + 0.04 : overlap * 0.58 + 0.06,
      );
      this.#interactionImpulse.addScaledVector(
        _offset,
        prop.shoveable
          ? 0.18 + playerPlanarSpeed * 0.12
          : 0.26 + playerPlanarSpeed * 0.14,
      );

      if (prop.type === 'barrier' || prop.type === 'crate') {
        prop.velocity.addScaledVector(
          _offset,
          prop.type === 'crate'
            ? 1.2 + playerPlanarSpeed * 0.2
            : 0.7 + playerPlanarSpeed * 0.12,
        );
        prop.leanAxis.set(_offset.z, 0, -_offset.x).applyAxisAngle(
          _yAxis,
          -prop.yaw,
        ).normalize();
        prop.leanVelocity += 0.6 + playerPlanarSpeed * 0.14;
        if (prop.type === 'crate' && playerPlanarSpeed > 8) {
          prop.toppled = true;
          prop.snapTarget = Math.min(0.62, 0.24 + playerPlanarSpeed * 0.03);
        }
      } else {
        prop.leanAxis.set(_offset.z, 0, -_offset.x).applyAxisAngle(
          _yAxis,
          -prop.yaw,
        ).normalize();
        prop.leanVelocity += 1.2 + playerPlanarSpeed * 0.24;
        if (
          (prop.type === 'sign' && playerPlanarSpeed > 7)
          || (prop.type === 'floodlight' && playerPlanarSpeed > 8.6)
          || (prop.type === 'pole' && playerPlanarSpeed > 9.2)
        ) {
          prop.toppled = true;
          prop.snapTarget =
            prop.type === 'floodlight'
              ? 1.08
              : prop.type === 'sign'
                ? 0.92
                : 0.78;
        }
      }

      prop.hitCooldown = 0.34;
    }

    this.#playerInteraction = {
      nearestDistanceMeters: Number(
        (Number.isFinite(nearestDistanceMeters) ? nearestDistanceMeters : 999).toFixed(2),
      ),
      collision,
      sourceId,
      correction: this.#interactionCorrection.clone(),
      impulse: this.#interactionImpulse.clone(),
    };
  }

  get playerInteraction(): ReactivePropInteraction {
    return {
      nearestDistanceMeters: this.#playerInteraction.nearestDistanceMeters,
      collision: this.#playerInteraction.collision,
      sourceId: this.#playerInteraction.sourceId,
      correction: this.#playerInteraction.correction.clone(),
      impulse: this.#playerInteraction.impulse.clone(),
    };
  }

  getDebugState(): ReactivePropDebugState {
    return {
      activeCount: this.#props.length,
      toppledCount: this.#props.filter((prop) =>
        prop.toppled
        || Math.abs(prop.leanAngle) > 0.38
        || prop.velocity.lengthSq() > 0.08,
      ).length,
    };
  }

  getEncounterStart(): { position: THREE.Vector3; heading: number } | null {
    const prop = this.#props.find((entry) =>
      entry.type === 'sign' || entry.type === 'barrier',
    );
    if (!prop) return null;

    const forward = new THREE.Vector3(Math.sin(prop.yaw), 0, Math.cos(prop.yaw));
    const right = new THREE.Vector3(forward.z, 0, -forward.x);
    const start = prop.position
      .clone()
      .addScaledVector(forward, -8.2)
      .addScaledVector(right, 0.5);
    start.y = this.#terrain.getHeightAt(start.x, start.z) + VEHICLE_CLEARANCE;
    return {
      position: start,
      heading: Math.atan2(prop.position.x - start.x, prop.position.z - start.z),
    };
  }

  reset(): void {
    this.#playerInteraction = {
      nearestDistanceMeters: 999,
      collision: false,
      sourceId: null,
      correction: new THREE.Vector3(),
      impulse: new THREE.Vector3(),
    };
    for (const prop of this.#props) {
      prop.position.copy(prop.anchorPosition);
      prop.velocity.set(0, 0, 0);
      prop.leanAxis.set(1, 0, 0);
      prop.leanAngle = 0;
      prop.leanVelocity = 0;
      prop.snapTarget = 0;
      prop.toppled = false;
      prop.hitCooldown = 0;
      prop.root.position.copy(prop.position);
      prop.root.rotation.set(0, prop.yaw, 0);
      prop.pivot.quaternion.identity();
    }
  }

  #addOutpostCluster(
    scene: THREE.Scene,
    idPrefix: string,
    center: THREE.Vector3,
    facingTarget: THREE.Vector3,
  ): void {
    const forward = facingTarget.clone().sub(center).setY(0).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
    this.#spawnLocal(scene, `${idPrefix}-barrier-left`, 'barrier', center, forward, right, -5.4, 7.4);
    this.#spawnLocal(scene, `${idPrefix}-barrier-right`, 'barrier', center, forward, right, 5.4, 7.4);
    this.#spawnLocal(scene, `${idPrefix}-crate`, 'crate', center, forward, right, -6.6, 3.8);
    this.#spawnLocal(scene, `${idPrefix}-sign`, 'sign', center, forward, right, 8.2, 9.4);
    this.#spawnLocal(scene, `${idPrefix}-flood`, 'floodlight', center, forward, right, 6.8, -5.4);
  }

  #addHubCluster(
    scene: THREE.Scene,
    center: THREE.Vector3,
    facingTarget: THREE.Vector3,
  ): void {
    const forward = facingTarget.clone().sub(center).setY(0).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
    this.#spawnLocal(scene, 'hub-barrier-left', 'barrier', center, forward, right, -7.6, 14.8);
    this.#spawnLocal(scene, 'hub-barrier-right', 'barrier', center, forward, right, 7.6, 14.8);
    this.#spawnLocal(scene, 'hub-barrier-inner', 'barrier', center, forward, right, 0, 17.8);
    this.#spawnLocal(scene, 'hub-crate-left', 'crate', center, forward, right, -10.2, 4.8);
    this.#spawnLocal(scene, 'hub-crate-right', 'crate', center, forward, right, 10.4, 5.8);
    this.#spawnLocal(scene, 'hub-sign', 'sign', center, forward, right, -13.4, 12.6);
    this.#spawnLocal(scene, 'hub-pole', 'pole', center, forward, right, 13.8, 12.2);
    this.#spawnLocal(scene, 'hub-flood-left', 'floodlight', center, forward, right, -15.2, 2.8);
    this.#spawnLocal(scene, 'hub-flood-right', 'floodlight', center, forward, right, 15.2, 2.8);
  }

  #addRoadsideProp(
    scene: THREE.Scene,
    id: string,
    type: ReactivePropType,
    point: THREE.Vector3,
    tangent: THREE.Vector3,
    sideOffset: number,
  ): void {
    const forward = tangent.clone().setY(0).normalize();
    const right = new THREE.Vector3(forward.z, 0, -forward.x).normalize();
    const position = point.clone().addScaledVector(right, sideOffset);
    position.y = this.#terrain.getHeightAt(position.x, position.z);
    const facing = position.clone().add(forward);
    this.#spawnProp(scene, id, type, position, facing);
  }

  #spawnLocal(
    scene: THREE.Scene,
    id: string,
    type: ReactivePropType,
    center: THREE.Vector3,
    forward: THREE.Vector3,
    right: THREE.Vector3,
    localX: number,
    localZ: number,
  ): void {
    const position = center.clone()
      .addScaledVector(right, localX)
      .addScaledVector(forward, localZ);
    position.y = this.#terrain.getHeightAt(position.x, position.z);
    const facing = position.clone().add(forward);
    this.#spawnProp(scene, id, type, position, facing);
  }

  #spawnProp(
    scene: THREE.Scene,
    id: string,
    type: ReactivePropType,
    groundPosition: THREE.Vector3,
    facingTarget: THREE.Vector3,
  ): void {
    const yaw = Math.atan2(
      facingTarget.x - groundPosition.x,
      facingTarget.z - groundPosition.z,
    );

    const root = new THREE.Group();
    const pivot = new THREE.Group();
    root.add(pivot);
    const materials = this.#createMaterials();

    let baseHeight = 0.18;
    let collisionRadius = 1.1;
    let collisionHeight = 1.6;
    let shoveable = false;

    if (type === 'barrier') {
      baseHeight = 0.7;
      collisionRadius = 1.2;
      collisionHeight = 1.4;
      shoveable = true;
      const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.0, 0.9), materials.concrete);
      body.position.set(0, 0.5, 0);
      body.castShadow = true;
      body.receiveShadow = true;
      pivot.add(body);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.16, 0.08), materials.marker);
      stripe.position.set(0, 0.56, 0.47);
      pivot.add(stripe);
    } else if (type === 'crate') {
      baseHeight = 0.48;
      collisionRadius = 0.78;
      collisionHeight = 1;
      shoveable = true;
      const lower = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.78, 1.1), materials.crate);
      lower.position.set(0, 0.39, 0);
      lower.castShadow = true;
      lower.receiveShadow = true;
      pivot.add(lower);
      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.56, 0.82), materials.crateLight);
      upper.position.set(0.08, 1.06, -0.02);
      upper.castShadow = true;
      upper.receiveShadow = true;
      pivot.add(upper);
    } else if (type === 'pole') {
      baseHeight = 0.08;
      collisionRadius = 0.44;
      collisionHeight = 3.3;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.4, 6), materials.steel);
      mast.position.set(0, 1.7, 0);
      mast.castShadow = true;
      pivot.add(mast);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.44), materials.darkSteel);
      cap.position.set(0, 3.36, 0);
      pivot.add(cap);
    } else if (type === 'sign') {
      baseHeight = 0.08;
      collisionRadius = 0.62;
      collisionHeight = 2.8;
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.1, 2.7, 6), materials.steel);
      post.position.set(0, 1.35, 0);
      post.castShadow = true;
      pivot.add(post);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.98, 0.12), materials.sign);
      panel.position.set(0, 2.16, 0.18);
      panel.castShadow = true;
      panel.receiveShadow = true;
      pivot.add(panel);
      const glyph = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.14, 0.04), materials.marker);
      glyph.position.set(0, 2.18, 0.28);
      pivot.add(glyph);
    } else {
      baseHeight = 0.08;
      collisionRadius = 0.7;
      collisionHeight = 3.8;
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 3.8, 6), materials.steel);
      mast.position.set(0, 1.9, 0);
      mast.castShadow = true;
      pivot.add(mast);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.42, 0.56), materials.darkSteel);
      head.position.set(0, 3.62, 0.18);
      head.rotation.x = -0.22;
      head.castShadow = true;
      pivot.add(head);
      const glow = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.14, 0.08), materials.window);
      glow.position.set(0, 3.54, 0.46);
      glow.rotation.x = -0.22;
      pivot.add(glow);
      const light = new THREE.PointLight(0xffd7a2, 0.58, 14, 2);
      light.position.set(0, 3.36, 0.9);
      pivot.add(light);
    }

    const position = new THREE.Vector3(
      groundPosition.x,
      this.#terrain.getHeightAt(groundPosition.x, groundPosition.z) + baseHeight,
      groundPosition.z,
    );
    root.position.copy(position);
    root.rotation.y = yaw;
    scene.add(root);

    this.#props.push({
      id,
      type,
      root,
      pivot,
      anchorPosition: position.clone(),
      position,
      velocity: new THREE.Vector3(),
      yaw,
      baseHeight,
      collisionRadius,
      collisionHeight,
      shoveable,
      leanAxis: new THREE.Vector3(1, 0, 0),
      leanAngle: 0,
      leanVelocity: 0,
      snapTarget: 0,
      toppled: false,
      hitCooldown: 0,
    });
  }

  #sampleRoadPoint(
    road: THREE.Vector2[],
    t: number,
  ): { point: THREE.Vector3; tangent: THREE.Vector3 } {
    let totalLength = 0;
    const lengths: number[] = [];
    for (let index = 1; index < road.length; index += 1) {
      const start = road[index - 1];
      const end = road[index];
      if (!start || !end) {
        lengths.push(0);
        continue;
      }
      const segment = end.distanceTo(start);
      lengths.push(segment);
      totalLength += segment;
    }
    const targetLength = totalLength * THREE.MathUtils.clamp(t, 0, 1);
    let traversed = 0;
    for (let index = 1; index < road.length; index += 1) {
      const start = road[index - 1];
      const end = road[index];
      if (!start || !end) continue;
      const segmentLength = lengths[index - 1] ?? 0;
      if (traversed + segmentLength < targetLength) {
        traversed += segmentLength;
        continue;
      }
      const localT = segmentLength > 0
        ? (targetLength - traversed) / segmentLength
        : 0;
      const x = THREE.MathUtils.lerp(start.x, end.x, localT);
      const z = THREE.MathUtils.lerp(start.y, end.y, localT);
      return {
        point: new THREE.Vector3(x, this.#terrain.getHeightAt(x, z), z),
        tangent: new THREE.Vector3(end.x - start.x, 0, end.y - start.y).normalize(),
      };
    }

    const fallback = road[road.length - 1] ?? new THREE.Vector2();
    return {
      point: new THREE.Vector3(fallback.x, this.#terrain.getHeightAt(fallback.x, fallback.y), fallback.y),
      tangent: new THREE.Vector3(0, 0, 1),
    };
  }

  #createMaterials(): {
    concrete: THREE.MeshStandardMaterial;
    steel: THREE.MeshStandardMaterial;
    darkSteel: THREE.MeshStandardMaterial;
    marker: THREE.MeshStandardMaterial;
    crate: THREE.MeshStandardMaterial;
    crateLight: THREE.MeshStandardMaterial;
    sign: THREE.MeshStandardMaterial;
    window: THREE.MeshStandardMaterial;
  } {
    return {
      concrete: new THREE.MeshStandardMaterial({
        color: 0x7b746c,
        roughness: 0.98,
        metalness: 0.03,
      }),
      steel: new THREE.MeshStandardMaterial({
        color: 0x51575b,
        roughness: 0.68,
        metalness: 0.56,
      }),
      darkSteel: new THREE.MeshStandardMaterial({
        color: 0x242b30,
        roughness: 0.52,
        metalness: 0.42,
      }),
      marker: new THREE.MeshStandardMaterial({
        color: 0xf0c27e,
        emissive: new THREE.Color(0x7b4d20),
        emissiveIntensity: 0.35,
        roughness: 0.32,
        metalness: 0.04,
      }),
      crate: new THREE.MeshStandardMaterial({
        color: 0x705742,
        roughness: 0.92,
        metalness: 0.04,
      }),
      crateLight: new THREE.MeshStandardMaterial({
        color: 0x917458,
        roughness: 0.88,
        metalness: 0.04,
      }),
      sign: new THREE.MeshStandardMaterial({
        color: 0xddd3bf,
        roughness: 0.86,
        metalness: 0.02,
      }),
      window: new THREE.MeshStandardMaterial({
        color: 0xffe8bb,
        emissive: new THREE.Color(0xffc777),
        emissiveIntensity: 1.1,
        roughness: 0.24,
        metalness: 0.04,
      }),
    };
  }
}
