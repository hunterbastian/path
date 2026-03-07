import * as THREE from 'three';
import type { TireTrackSource } from '../effects/TireTrackSystem';
import type { WeatherSnapshot } from '../gameplay/WeatherState';
import {
  createDefaultDrivingState,
  type DrivingState,
} from '../vehicle/DrivingState';
import { Vehicle } from '../vehicle/Vehicle';
import { VEHICLE_CLEARANCE, VEHICLE_WHEEL_OFFSETS } from '../vehicle/vehicleShared';
import { Terrain } from './Terrain';

interface AmbientTrafficRoute {
  id: string;
  scale: number;
  cruiseSpeed: number;
  color: {
    body: THREE.ColorRepresentation;
    roof: THREE.ColorRepresentation;
    trim: THREE.ColorRepresentation;
    marker: THREE.ColorRepresentation;
    boost: THREE.ColorRepresentation;
  };
  waypoints: THREE.Vector3[];
}

interface AmbientTrafficAgent {
  id: string;
  scale: number;
  cruiseSpeed: number;
  vehicle: Vehicle;
  position: THREE.Vector3;
  heading: number;
  speed: number;
  waypointIndex: number;
  wheelPhase: number;
  state: DrivingState;
  waypoints: THREE.Vector3[];
  wheelWorldPositions: THREE.Vector3[];
  collisionRadius: number;
  behavior: 'cruising' | 'yielding' | 'contact';
}

export interface AmbientTrafficDebugSnapshot {
  id: string;
  speedKmh: number;
  distanceMeters: number;
  behavior: 'cruising' | 'yielding' | 'contact';
  position: {
    x: number;
    y: number;
    z: number;
  };
}

export interface AmbientTrafficPlayerInteraction {
  nearestDistanceMeters: number;
  nearMiss: boolean;
  blocking: boolean;
  collision: boolean;
  sourceId: string | null;
  correction: THREE.Vector3;
  impulse: THREE.Vector3;
}

const PLAYER_COLLISION_RADIUS = 1.65;

export class AmbientTrafficSystem {
  readonly #terrain: Terrain;
  readonly #agents: AmbientTrafficAgent[];
  readonly #basisMatrix = new THREE.Matrix4();
  readonly #groundNormal = new THREE.Vector3(0, 1, 0);
  readonly #right = new THREE.Vector3(1, 0, 0);
  readonly #forward = new THREE.Vector3(0, 0, 1);
  readonly #correctedForward = new THREE.Vector3(0, 0, 1);
  readonly #playerToAgent = new THREE.Vector3();
  readonly #playerInteractionCorrection = new THREE.Vector3();
  readonly #playerInteractionImpulse = new THREE.Vector3();
  #playerInteraction: AmbientTrafficPlayerInteraction = {
    nearestDistanceMeters: 999,
    nearMiss: false,
    blocking: false,
    collision: false,
    sourceId: null,
    correction: new THREE.Vector3(),
    impulse: new THREE.Vector3(),
  };

  constructor(
    scene: THREE.Scene,
    terrain: Terrain,
    outpostPositions: THREE.Vector3[],
  ) {
    this.#terrain = terrain;
    this.#agents = this.#buildRoutes(outpostPositions).map((route) =>
      this.#createAgent(scene, route),
    );
  }

  update(
    dt: number,
    playerPosition: THREE.Vector3,
    playerVelocity: THREE.Vector3,
    weather: Pick<
      WeatherSnapshot,
      'trafficSpeedMultiplier' | 'trafficCautionMultiplier' | 'visibilityScale'
    >,
  ): void {
    for (const agent of this.#agents) {
      this.#updateAgent(agent, dt, playerPosition, weather);
    }
    this.#playerInteraction = this.#buildPlayerInteraction(playerPosition, playerVelocity);
  }

  getSnapshot(playerPosition: THREE.Vector3): AmbientTrafficDebugSnapshot[] {
    return this.#agents.map((agent) => ({
      id: agent.id,
      speedKmh: Math.round(agent.speed * 3.6),
      distanceMeters: Number(
        Math.hypot(
          playerPosition.x - agent.position.x,
          playerPosition.z - agent.position.z,
        ).toFixed(1),
      ),
      behavior: agent.behavior,
      position: {
        x: Number(agent.position.x.toFixed(2)),
        y: Number(agent.position.y.toFixed(2)),
        z: Number(agent.position.z.toFixed(2)),
      },
    }));
  }

  get playerInteraction(): AmbientTrafficPlayerInteraction {
    return {
      nearestDistanceMeters: this.#playerInteraction.nearestDistanceMeters,
      nearMiss: this.#playerInteraction.nearMiss,
      blocking: this.#playerInteraction.blocking,
      collision: this.#playerInteraction.collision,
      sourceId: this.#playerInteraction.sourceId,
      correction: this.#playerInteraction.correction.clone(),
      impulse: this.#playerInteraction.impulse.clone(),
    };
  }

  getTrackSources(): TireTrackSource[] {
    return this.#agents.map((agent) => ({
      id: agent.id,
      state: agent.state,
      wheelWorldPositions: agent.wheelWorldPositions,
    }));
  }

  get count(): number {
    return this.#agents.length;
  }

  getEncounterStart(): { position: THREE.Vector3; heading: number } | null {
    const agent = this.#agents[0];
    if (!agent) return null;

    const encounterOffset = new THREE.Vector3(
      Math.sin(agent.heading) * 5.8,
      0,
      Math.cos(agent.heading) * 5.8,
    );
    const position = agent.position.clone().add(encounterOffset);
    position.y = this.#terrain.getHeightAt(position.x, position.z) + VEHICLE_CLEARANCE;
    return {
      position,
      heading: agent.heading + Math.PI,
    };
  }

  #createAgent(
    scene: THREE.Scene,
    route: AmbientTrafficRoute,
  ): AmbientTrafficAgent {
    const position = route.waypoints[0]?.clone() ?? new THREE.Vector3();
    const next = route.waypoints[1] ?? route.waypoints[0] ?? new THREE.Vector3(0, 0, 1);
    const heading = this.#headingToward(position, next);
    const vehicle = new Vehicle(scene, {
      scale: route.scale,
      bodyColor: route.color.body,
      roofColor: route.color.roof,
      trimColor: route.color.trim,
      markerColor: route.color.marker,
      boostColor: route.color.boost,
    });
    const state = createDefaultDrivingState();
    const agent: AmbientTrafficAgent = {
      id: route.id,
      scale: route.scale,
      cruiseSpeed: route.cruiseSpeed,
      vehicle,
      position,
      heading,
      speed: route.cruiseSpeed * 0.7,
      waypointIndex: 1 % route.waypoints.length,
      wheelPhase:
        [...route.id].reduce((sum, char, index) => sum + char.charCodeAt(0) * (index + 1), 0)
        * 0.0024,
      state,
      waypoints: route.waypoints,
      wheelWorldPositions: Array.from({ length: 4 }, () => new THREE.Vector3()),
      collisionRadius: 0.88 + route.scale * 0.86,
      behavior: 'cruising',
    };
    this.#applyPose(agent, 1 / 60);
    return agent;
  }

  #updateAgent(
    agent: AmbientTrafficAgent,
    dt: number,
    playerPosition: THREE.Vector3,
    weather: Pick<
      WeatherSnapshot,
      'trafficSpeedMultiplier' | 'trafficCautionMultiplier' | 'visibilityScale'
    >,
  ): void {
    let target = agent.waypoints[agent.waypointIndex];
    if (!target) return;

    const toTarget = target.clone().sub(agent.position);
    let planarDistance = Math.hypot(toTarget.x, toTarget.z);
    if (planarDistance < 5) {
      agent.waypointIndex = (agent.waypointIndex + 1) % agent.waypoints.length;
      target = agent.waypoints[agent.waypointIndex];
      if (!target) return;
      toTarget.copy(target).sub(agent.position);
      planarDistance = Math.hypot(toTarget.x, toTarget.z);
    }

    const targetHeading = Math.atan2(toTarget.x, toTarget.z);
    const headingDelta = this.#angleDelta(targetHeading, agent.heading);
    const cornering = THREE.MathUtils.clamp(Math.abs(headingDelta) / 0.9, 0, 1);
    const playerDistance = Math.hypot(
      playerPosition.x - agent.position.x,
      playerPosition.z - agent.position.z,
    );
    const cautionDistance =
      THREE.MathUtils.lerp(10.5, 16.5, 1 - weather.visibilityScale)
      * weather.trafficCautionMultiplier;
    this.#right.set(this.#forward.z, 0, -this.#forward.x).normalize();
    this.#playerToAgent
      .copy(playerPosition)
      .sub(agent.position)
      .setY(0);
    const playerSide = Math.sign(this.#playerToAgent.dot(this.#right)) || 1;
    const avoidanceProgress = THREE.MathUtils.clamp(
      1 - playerDistance / Math.max(cautionDistance, 0.01),
      0,
      1,
    );
    const avoidanceHeading = -playerSide * avoidanceProgress * 0.72;
    const playerSlowdown = THREE.MathUtils.clamp(
      (playerDistance - cautionDistance * 0.32) / (cautionDistance * 0.92),
      0.18,
      1,
    );

    const desiredHeading = targetHeading + avoidanceHeading;
    const turnRate = THREE.MathUtils.lerp(0.9, 2.2, cornering);
    agent.heading += THREE.MathUtils.clamp(
      this.#angleDelta(desiredHeading, agent.heading),
      -turnRate * dt,
      turnRate * dt,
    );

    const targetSpeed =
      agent.cruiseSpeed
      * weather.trafficSpeedMultiplier
      * THREE.MathUtils.lerp(1, 0.52, cornering)
      * playerSlowdown;
    agent.speed += (targetSpeed - agent.speed) * (1 - Math.exp(-2.8 * dt));

    agent.position.x += Math.sin(agent.heading) * agent.speed * dt;
    agent.position.z += Math.cos(agent.heading) * agent.speed * dt;
    agent.position.y =
      this.#terrain.getHeightAt(agent.position.x, agent.position.z)
      + VEHICLE_CLEARANCE * agent.scale;

    const surface = this.#terrain.getSurfaceAt(agent.position.x, agent.position.z);
    const bob = Math.sin(agent.wheelPhase += dt * (4 + agent.speed * 0.35)) * 0.04;
    const wheelLean = cornering * 0.08;
    agent.state.speed = agent.speed;
    agent.state.forwardSpeed = agent.speed;
    agent.state.lateralSpeed = Math.sin(headingDelta) * agent.speed * 0.18;
    agent.state.verticalSpeed = 0;
    agent.state.airborneTime = 0;
    agent.state.steering = THREE.MathUtils.clamp(headingDelta * 1.4, -1, 1);
    agent.state.throttle = agent.speed > targetSpeed ? 0 : 0.6;
    agent.state.isGrounded = true;
    agent.state.isBraking = targetSpeed + 0.35 < agent.speed;
    agent.state.isBoosting = false;
    agent.state.isAccelerating = targetSpeed > agent.speed + 0.1;
    agent.state.isDrifting = cornering > 0.6 && agent.speed > 6.4;
    agent.state.wasAirborne = false;
    agent.state.surface = surface;
    agent.state.boostLevel = 0.55;
    agent.state.sinkDepth = 0;
    agent.state.surfaceBuildup = 0;
    agent.state.wheelCompression = [
      THREE.MathUtils.clamp(0.1 + bob - wheelLean * 0.5, 0, 0.22),
      THREE.MathUtils.clamp(0.1 - bob + wheelLean * 0.5, 0, 0.22),
      THREE.MathUtils.clamp(0.08 - bob * 0.7 - wheelLean * 0.35, 0, 0.18),
      THREE.MathUtils.clamp(0.08 + bob * 0.7 + wheelLean * 0.35, 0, 0.18),
    ];
    agent.state.wheelContact = [true, true, true, true];
    agent.behavior =
      playerDistance < agent.collisionRadius + PLAYER_COLLISION_RADIUS
        ? 'contact'
        : avoidanceProgress > 0.22 || playerSlowdown < 0.94
          ? 'yielding'
          : 'cruising';

    this.#applyPose(agent, dt);
  }

  #buildPlayerInteraction(
    playerPosition: THREE.Vector3,
    playerVelocity: THREE.Vector3,
  ): AmbientTrafficPlayerInteraction {
    let nearestDistanceMeters = Number.POSITIVE_INFINITY;
    let nearMiss = false;
    let blocking = false;
    let collision = false;
    let sourceId: string | null = null;
    this.#playerInteractionCorrection.set(0, 0, 0);
    this.#playerInteractionImpulse.set(0, 0, 0);

    for (const agent of this.#agents) {
      this.#playerToAgent
        .copy(playerPosition)
        .sub(agent.position)
        .setY(0);
      let distance = this.#playerToAgent.length();
      const totalRadius = PLAYER_COLLISION_RADIUS + agent.collisionRadius;
      const clearance = distance - totalRadius;
      nearestDistanceMeters = Math.min(nearestDistanceMeters, clearance);
      if (clearance < 2.4) {
        nearMiss = true;
      }
      if (clearance < 1.1) {
        blocking = true;
      }
      if (clearance >= 0) {
        continue;
      }

      collision = true;
      sourceId ??= agent.id;
      if (distance < 0.001) {
        this.#playerToAgent.set(
          Math.sin(agent.heading + Math.PI * 0.5),
          0,
          Math.cos(agent.heading + Math.PI * 0.5),
        );
        distance = 1;
      } else {
        this.#playerToAgent.multiplyScalar(1 / distance);
      }
      const overlap = -clearance;
      const impactSpeed = Math.max(
        agent.speed,
        Math.hypot(playerVelocity.x, playerVelocity.z),
      );
      this.#playerInteractionCorrection.addScaledVector(
        this.#playerToAgent,
        overlap + 0.03,
      );
      this.#playerInteractionImpulse.addScaledVector(
        this.#playerToAgent,
        0.32 + impactSpeed * 0.18,
      );
      agent.speed *= 0.42;
      agent.state.speed = agent.speed;
      agent.state.forwardSpeed = agent.speed;
      agent.state.isBraking = true;
      agent.behavior = 'contact';
    }

    return {
      nearestDistanceMeters: Number(
        (Number.isFinite(nearestDistanceMeters) ? nearestDistanceMeters : 999).toFixed(2),
      ),
      nearMiss,
      blocking,
      collision,
      sourceId,
      correction: this.#playerInteractionCorrection.clone(),
      impulse: this.#playerInteractionImpulse.clone(),
    };
  }

  #applyPose(agent: AmbientTrafficAgent, dt: number): void {
    this.#groundNormal.copy(
      this.#terrain.getNormalAt(agent.position.x, agent.position.z),
    );
    this.#forward
      .set(Math.sin(agent.heading), 0, Math.cos(agent.heading))
      .projectOnPlane(this.#groundNormal);
    if (this.#forward.lengthSq() < 0.0001) {
      this.#forward.set(Math.sin(agent.heading), 0, Math.cos(agent.heading));
    }
    this.#forward.normalize();
    this.#right.crossVectors(this.#groundNormal, this.#forward).normalize();
    this.#correctedForward
      .crossVectors(this.#right, this.#groundNormal)
      .normalize();
    this.#basisMatrix.makeBasis(
      this.#right,
      this.#groundNormal,
      this.#correctedForward,
    );
    const quaternion = new THREE.Quaternion().setFromRotationMatrix(
      this.#basisMatrix,
    );
    agent.vehicle.setPose(agent.position, quaternion);
    agent.vehicle.updateVisuals(dt, agent.state);

    for (let index = 0; index < VEHICLE_WHEEL_OFFSETS.length; index += 1) {
      const offset = VEHICLE_WHEEL_OFFSETS[index];
      const wheel = agent.wheelWorldPositions[index];
      if (!offset || !wheel) continue;

      wheel
        .copy(agent.position)
        .addScaledVector(this.#right, offset.x * agent.scale)
        .addScaledVector(this.#correctedForward, offset.z * agent.scale)
        .addScaledVector(this.#groundNormal, offset.y * agent.scale);
    }
  }

  #buildRoutes(outpostPositions: THREE.Vector3[]): AmbientTrafficRoute[] {
    const outpostA = outpostPositions[0] ?? this.#pathPoint(72, 10);
    const outpostB = outpostPositions[1] ?? this.#pathPoint(176, 12);
    const summit = outpostPositions[outpostPositions.length - 1]
      ?? this.#pathPoint(246, 10);

    return [
      {
        id: 'service-1',
        scale: 0.62,
        cruiseSpeed: 7.4,
        color: {
          body: 0x616f53,
          roof: 0xc8c2b5,
          trim: 0x6e624e,
          marker: 0xe7b474,
          boost: 0xa55b42,
        },
        waypoints: [
          this.#pathPoint(10, -14),
          this.#pathPoint(48, -6),
          this.#pathPoint(74, -14),
          this.#offsetFrom(outpostA, -18, -10),
          this.#offsetFrom(outpostA, -6, 16),
          this.#pathPoint(32, -20),
        ],
      },
      {
        id: 'service-2',
        scale: 0.58,
        cruiseSpeed: 8.2,
        color: {
          body: 0x7a654e,
          roof: 0xddd2bf,
          trim: 0x56473b,
          marker: 0xf0c27e,
          boost: 0xc06b4c,
        },
        waypoints: [
          this.#offsetFrom(outpostA, 10, 18),
          this.#pathPoint(104, 12),
          this.#pathPoint(142, 18),
          this.#offsetFrom(outpostB, -18, 10),
          this.#offsetFrom(outpostB, 8, 18),
          this.#pathPoint(122, 2),
        ],
      },
      {
        id: 'service-3',
        scale: 0.56,
        cruiseSpeed: 7.8,
        color: {
          body: 0x4f6770,
          roof: 0xd2d2c8,
          trim: 0x5e6255,
          marker: 0xe8cf93,
          boost: 0x6f8d9a,
        },
        waypoints: [
          this.#offsetFrom(outpostB, 14, 14),
          this.#pathPoint(202, 10),
          this.#offsetFrom(summit, -18, 12),
          this.#offsetFrom(summit, 14, -10),
          this.#pathPoint(214, -8),
          this.#offsetFrom(outpostB, -10, -14),
        ],
      },
    ];
  }

  #pathPoint(z: number, lateralOffset: number): THREE.Vector3 {
    const x = this.#terrain.getPathCenterX(z) + lateralOffset;
    return this.#snapPoint(x, z);
  }

  #offsetFrom(
    center: THREE.Vector3,
    offsetX: number,
    offsetZ: number,
  ): THREE.Vector3 {
    return this.#snapPoint(center.x + offsetX, center.z + offsetZ);
  }

  #snapPoint(x: number, z: number): THREE.Vector3 {
    return new THREE.Vector3(
      x,
      this.#terrain.getHeightAt(x, z) + VEHICLE_CLEARANCE * 0.6,
      z,
    );
  }

  #headingToward(from: THREE.Vector3, to: THREE.Vector3): number {
    return Math.atan2(to.x - from.x, to.z - from.z);
  }

  #angleDelta(target: number, current: number): number {
    return Math.atan2(
      Math.sin(target - current),
      Math.cos(target - current),
    );
  }
}
