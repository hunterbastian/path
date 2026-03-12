import * as THREE from 'three';
import { expLerp } from '../core/math';
import { SeededRandom } from '../core/SeededRandom';
import {
  createDefaultDrivingState,
  type DrivingState,
} from '../vehicle/DrivingState';
import { Vehicle } from '../vehicle/Vehicle';
import { VEHICLE_CLEARANCE } from '../vehicle/vehicleShared';
import { Terrain } from './Terrain';

/** Utility-based needs that compete for the raider's attention. */
interface RaiderNeeds {
  /** 0–1, builds over time. High = raider seeks water. */
  thirst: number;
  /** 0–1, builds over time. High = raider wanders off-road to explore. */
  curiosity: number;
  /** Cooldown before thirst/curiosity start building again after being satisfied. */
  satisfactionTimer: number;
  /** The world position the raider is currently seeking (water or exploration). */
  seekTarget: THREE.Vector3 | null;
  /** What the current seek target is for. */
  seekReason: 'water' | 'explore' | null;
}

type RaiderBehavior = 'patrol' | 'chase' | 'stunned' | 'seek_water' | 'explore';

interface RaiderAgent {
  id: string;
  vehicle: Vehicle;
  position: THREE.Vector3;
  heading: number;
  speed: number;
  state: DrivingState;
  collisionRadius: number;
  behavior: RaiderBehavior;
  /** Road waypoints this raider patrols along. */
  roadWaypoints: THREE.Vector3[];
  /** Current waypoint index. */
  waypointIndex: number;
  /** Direction of travel along waypoints (+1 or -1 for back-and-forth). */
  waypointDirection: number;
  /** Aggro range — how close the player must be to trigger chase. */
  aggroRadius: number;
  stunTimer: number;
  verticalVelocity: number;
  airborne: boolean;
  /** Utility-based needs system. */
  needs: RaiderNeeds;
}

export interface RaiderPlayerInteraction {
  collision: boolean;
  correction: THREE.Vector3;
  impulse: THREE.Vector3;
}

const PLAYER_COLLISION_RADIUS = 1.65;
const RAIDER_SCALE = 0.52;
const RAIDER_PATROL_SPEED = 5;
const RAIDER_CHASE_SPEED = 14;
const RAIDER_SEEK_SPEED = 7;
const RAIDER_EXPLORE_SPEED = 4;
const RAIDER_TURN_RATE = 3.2;
const GRAVITY = 24;

// Needs system tuning
const THIRST_RATE = 0.012;       // per second — full thirst in ~83s
const CURIOSITY_RATE = 0.008;    // per second — full curiosity in ~125s
const THIRST_THRESHOLD = 0.65;   // triggers water-seeking
const CURIOSITY_THRESHOLD = 0.7; // triggers exploration
const SEEK_ARRIVE_DIST = 12;     // close enough to "satisfy" the need
const SATISFACTION_COOLDOWN = 15; // seconds before needs start building again

// Inter-agent avoidance
const RAIDER_SEPARATION_DIST = 8;   // start steering away at this distance
const RAIDER_SEPARATION_FORCE = 2.4; // heading correction strength

const RAIDER_COLORS = [
  { body: 0x3a2222, roof: 0x2a1a1a, trim: 0x8a3030, marker: 0xff4422, boost: 0xaa2211 },
  { body: 0x2e2020, roof: 0x221818, trim: 0x6e2828, marker: 0xe83318, boost: 0x882214 },
  { body: 0x332828, roof: 0x281e1e, trim: 0x7a3535, marker: 0xcc3322, boost: 0x993318 },
];

export class RaiderSystem {
  readonly #terrain: Terrain;
  readonly #agents: RaiderAgent[] = [];
  readonly #random: SeededRandom;
  /** Pre-computed low-terrain positions raiders seek when thirsty. */
  readonly #waterSources: THREE.Vector3[] = [];
  readonly #playerToAgent = new THREE.Vector3();
  readonly #interactionCorrection = new THREE.Vector3();
  readonly #interactionImpulse = new THREE.Vector3();
  readonly #forward = new THREE.Vector3();
  readonly #right = new THREE.Vector3();
  readonly #correctedForward = new THREE.Vector3();
  readonly #groundNormal = new THREE.Vector3(0, 1, 0);
  readonly #basisMatrix = new THREE.Matrix4();
  readonly #poseQuaternion = new THREE.Quaternion();
  readonly #impactDirection = new THREE.Vector3();
  readonly #impactVelocity = new THREE.Vector3();

  #interaction: RaiderPlayerInteraction = {
    collision: false,
    correction: new THREE.Vector3(),
    impulse: new THREE.Vector3(),
  };

  constructor(
    scene: THREE.Scene,
    terrain: Terrain,
    outpostPositions: THREE.Vector3[],
  ) {
    this.#terrain = terrain;
    this.#random = new SeededRandom(0x52414944); // "RAID"
    this.#waterSources = this.#findWaterSources();
    const roadWaypoints = terrain.getLoopRoadWaypoints();
    this.#buildRoadPatrols(scene, roadWaypoints, outpostPositions);
  }

  /** Returns the interaction state. Callers should NOT mutate the returned vectors. */
  get playerInteraction(): RaiderPlayerInteraction {
    return this.#interaction;
  }

  get count(): number {
    return this.#agents.length;
  }

  /** All raider world positions + behavior (for map drawing). */
  getPositions(): Array<{ x: number; z: number; behavior: RaiderBehavior }> {
    return this.#agents.map((agent) => ({
      x: agent.position.x,
      z: agent.position.z,
      behavior: agent.behavior,
    }));
  }

  /** Distance from a position to the nearest raider. Returns Infinity if none. */
  getNearestDistance(position: THREE.Vector3): number {
    let nearest = Infinity;
    for (const agent of this.#agents) {
      const dist = Math.hypot(
        position.x - agent.position.x,
        position.z - agent.position.z,
      );
      if (dist < nearest) nearest = dist;
    }
    return nearest;
  }

  update(
    dt: number,
    playerPosition: THREE.Vector3,
    playerVelocity: THREE.Vector3,
  ): void {
    this.#interactionCorrection.set(0, 0, 0);
    this.#interactionImpulse.set(0, 0, 0);
    let hasCollision = false;

    for (const agent of this.#agents) {
      this.#updateAgent(agent, dt, playerPosition, playerVelocity);

      // Collision detection with player
      this.#playerToAgent
        .copy(agent.position)
        .sub(playerPosition)
        .setY(0);
      const dist = this.#playerToAgent.length();
      const combinedRadius = PLAYER_COLLISION_RADIUS + agent.collisionRadius;

      if (dist < combinedRadius && dist > 0.001) {
        hasCollision = true;
        const overlap = combinedRadius - dist;
        const normal = this.#playerToAgent.normalize();

        // Push player away
        this.#interactionCorrection.addScaledVector(normal, -(overlap + 0.03));

        // Impulse: raider is aggressive, hits harder
        const impactSpeed = agent.speed + Math.sqrt(
          playerVelocity.x * playerVelocity.x + playerVelocity.z * playerVelocity.z,
        ) * 0.5;
        this.#interactionImpulse.addScaledVector(normal, -(0.5 + impactSpeed * 0.22));

        // Damage the raider on collision
        this.#impactDirection.copy(normal).negate();
        this.#impactVelocity.set(
          Math.sin(agent.heading) * agent.speed,
          0,
          Math.cos(agent.heading) * agent.speed,
        );
        agent.vehicle.damage.applyImpact(
          impactSpeed,
          this.#impactDirection,
          agent.position,
          this.#poseQuaternion,
          this.#impactVelocity,
        );

        // Stun the raider briefly
        agent.behavior = 'stunned';
        agent.stunTimer = 1.5 + Math.random() * 0.8;
        agent.speed *= 0.3;
      }
    }

    this.#interaction.collision = hasCollision;
    this.#interaction.correction.copy(this.#interactionCorrection);
    this.#interaction.impulse.copy(this.#interactionImpulse);
  }

  #updateAgent(
    agent: RaiderAgent,
    dt: number,
    playerPosition: THREE.Vector3,
    _playerVelocity: THREE.Vector3,
  ): void {
    // Stun recovery
    if (agent.behavior === 'stunned') {
      agent.stunTimer -= dt;
      agent.speed = expLerp(agent.speed, 0, 3, dt);
      if (agent.stunTimer <= 0) {
        agent.behavior = 'patrol';
        agent.needs.satisfactionTimer = 5; // brief cooldown after stun
      }
      this.#applyMovement(agent, dt);
      this.#applyPose(agent, dt);
      return;
    }

    // ── Tick needs ──
    const needs = agent.needs;
    if (needs.satisfactionTimer > 0) {
      needs.satisfactionTimer -= dt;
    } else {
      needs.thirst = Math.min(1, needs.thirst + THIRST_RATE * dt);
      needs.curiosity = Math.min(1, needs.curiosity + CURIOSITY_RATE * dt);
    }

    // ── Decide behavior via utility scoring ──
    const toPlayerX = playerPosition.x - agent.position.x;
    const toPlayerZ = playerPosition.z - agent.position.z;
    const playerDist = Math.hypot(toPlayerX, toPlayerZ);
    const health = agent.vehicle.damage.totalHealth;
    const tooWeak = health < 0.3;

    // Aggression always wins if player is close and raider isn't too weak
    if (!tooWeak && playerDist < agent.aggroRadius) {
      agent.behavior = 'chase';
      // Chase interrupts seek — clear target
      needs.seekTarget = null;
      needs.seekReason = null;
    } else if (needs.thirst >= THIRST_THRESHOLD && needs.thirst >= needs.curiosity) {
      // Thirsty — go find water
      if (agent.behavior !== 'seek_water' || !needs.seekTarget) {
        needs.seekTarget = this.#findNearestWaterSource(agent.position);
        needs.seekReason = 'water';
      }
      agent.behavior = 'seek_water';
    } else if (needs.curiosity >= CURIOSITY_THRESHOLD) {
      // Curious — go explore a random off-road point
      if (agent.behavior !== 'explore' || !needs.seekTarget) {
        needs.seekTarget = this.#pickExploreTarget(agent);
        needs.seekReason = 'explore';
      }
      agent.behavior = 'explore';
    } else {
      agent.behavior = 'patrol';
      needs.seekTarget = null;
      needs.seekReason = null;
    }

    // ── Execute behavior ──
    switch (agent.behavior) {
      case 'chase':
        this.#executeChase(agent, dt, toPlayerX, toPlayerZ, playerDist, tooWeak);
        break;
      case 'seek_water':
      case 'explore':
        this.#executeSeek(agent, dt, tooWeak);
        break;
      default:
        this.#executePatrol(agent, dt, tooWeak);
        break;
    }

    // ── Inter-agent separation (avoid overlapping other raiders) ──
    this.#applySeparation(agent, dt);

    this.#applyMovement(agent, dt);
    this.#applyPose(agent, dt);
  }

  #executeChase(
    agent: RaiderAgent,
    dt: number,
    toPlayerX: number,
    toPlayerZ: number,
    playerDist: number,
    tooWeak: boolean,
  ): void {
    const targetHeading = Math.atan2(toPlayerX, toPlayerZ);
    const headingDelta = Math.atan2(
      Math.sin(targetHeading - agent.heading),
      Math.cos(targetHeading - agent.heading),
    );

    const closenessTurnBoost = THREE.MathUtils.lerp(
      1, 1.6, THREE.MathUtils.clamp(1 - playerDist / 20, 0, 1),
    );
    agent.heading += THREE.MathUtils.clamp(
      headingDelta,
      -RAIDER_TURN_RATE * closenessTurnBoost * dt,
      RAIDER_TURN_RATE * closenessTurnBoost * dt,
    );

    const alignment = Math.max(Math.cos(headingDelta), 0);
    const chaseSpeed = RAIDER_CHASE_SPEED * (0.6 + alignment * 0.4) * (tooWeak ? 0.3 : 1);
    agent.speed = expLerp(agent.speed, chaseSpeed, 3.5, dt);
  }

  #executeSeek(agent: RaiderAgent, dt: number, tooWeak: boolean): void {
    const target = agent.needs.seekTarget;
    if (!target) {
      // Fallback to patrol if no target
      this.#executePatrol(agent, dt, tooWeak);
      return;
    }

    const toX = target.x - agent.position.x;
    const toZ = target.z - agent.position.z;
    const dist = Math.hypot(toX, toZ);

    // Arrived at target — satisfy the need
    if (dist < SEEK_ARRIVE_DIST) {
      if (agent.needs.seekReason === 'water') {
        agent.needs.thirst = 0;
      } else {
        agent.needs.curiosity = 0;
      }
      agent.needs.satisfactionTimer = SATISFACTION_COOLDOWN;
      agent.needs.seekTarget = null;
      agent.needs.seekReason = null;
      agent.behavior = 'patrol';
      return;
    }

    // Steer toward target
    const targetHeading = Math.atan2(toX, toZ);
    const headingDelta = Math.atan2(
      Math.sin(targetHeading - agent.heading),
      Math.cos(targetHeading - agent.heading),
    );
    const turnRate = agent.behavior === 'seek_water' ? 2.2 : 1.6;
    agent.heading += THREE.MathUtils.clamp(headingDelta, -turnRate * dt, turnRate * dt);

    const seekSpeed = agent.behavior === 'seek_water' ? RAIDER_SEEK_SPEED : RAIDER_EXPLORE_SPEED;
    const speedMult = tooWeak ? 0.3 : 1;
    agent.speed = expLerp(agent.speed, seekSpeed * speedMult, 2.5, dt);
  }

  #executePatrol(agent: RaiderAgent, dt: number, tooWeak: boolean): void {
    const wp = agent.roadWaypoints[agent.waypointIndex];
    if (wp) {
      const toWpX = wp.x - agent.position.x;
      const toWpZ = wp.z - agent.position.z;
      const wpDist = Math.hypot(toWpX, toWpZ);

      if (wpDist < 6) {
        const nextIndex = agent.waypointIndex + agent.waypointDirection;
        if (nextIndex < 0 || nextIndex >= agent.roadWaypoints.length) {
          agent.waypointDirection *= -1;
        }
        agent.waypointIndex = THREE.MathUtils.clamp(
          agent.waypointIndex + agent.waypointDirection,
          0,
          agent.roadWaypoints.length - 1,
        );
      }

      const targetHeading = Math.atan2(toWpX, toWpZ);
      const headingDelta = Math.atan2(
        Math.sin(targetHeading - agent.heading),
        Math.cos(targetHeading - agent.heading),
      );
      agent.heading += THREE.MathUtils.clamp(headingDelta, -1.8 * dt, 1.8 * dt);
    }

    const patrolSpeed = tooWeak ? RAIDER_PATROL_SPEED * 0.3 : RAIDER_PATROL_SPEED;
    agent.speed = expLerp(agent.speed, patrolSpeed, 2, dt);
  }

  /** Steer away from nearby raiders to prevent overlap. */
  #applySeparation(agent: RaiderAgent, dt: number): void {
    let steerX = 0;
    let steerZ = 0;

    for (const other of this.#agents) {
      if (other === agent) continue;
      const dx = agent.position.x - other.position.x;
      const dz = agent.position.z - other.position.z;
      const distSq = dx * dx + dz * dz;
      const sepSq = RAIDER_SEPARATION_DIST * RAIDER_SEPARATION_DIST;

      if (distSq < sepSq && distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        const weight = 1 - dist / RAIDER_SEPARATION_DIST; // stronger when closer
        steerX += (dx / dist) * weight;
        steerZ += (dz / dist) * weight;
      }
    }

    const steerLen = Math.hypot(steerX, steerZ);
    if (steerLen > 0.01) {
      // Convert separation vector to heading adjustment
      const awayHeading = Math.atan2(steerX, steerZ);
      const delta = Math.atan2(
        Math.sin(awayHeading - agent.heading),
        Math.cos(awayHeading - agent.heading),
      );
      agent.heading += THREE.MathUtils.clamp(
        delta * steerLen,
        -RAIDER_SEPARATION_FORCE * dt,
        RAIDER_SEPARATION_FORCE * dt,
      );
    }
  }

  #applyMovement(agent: RaiderAgent, dt: number): void {
    agent.position.x += Math.sin(agent.heading) * agent.speed * dt;
    agent.position.z += Math.cos(agent.heading) * agent.speed * dt;

    // Ground following
    const groundY = this.#terrain.getHeightAt(agent.position.x, agent.position.z)
      + VEHICLE_CLEARANCE * RAIDER_SCALE;

    if (agent.airborne) {
      agent.verticalVelocity -= GRAVITY * dt;
      agent.position.y += agent.verticalVelocity * dt;
      if (agent.position.y <= groundY) {
        agent.position.y = groundY;
        agent.verticalVelocity = 0;
        agent.airborne = false;
      }
    } else {
      agent.position.y = groundY;
    }

    // Update DrivingState
    agent.state.speed = agent.speed;
    agent.state.forwardSpeed = agent.speed;
    agent.state.isGrounded = !agent.airborne;
    agent.state.steering = 0;
    agent.state.isBraking = agent.behavior === 'stunned';
    agent.state.isAccelerating = agent.behavior === 'chase' || agent.behavior === 'seek_water';
    agent.state.isBoosting = agent.behavior === 'chase' && agent.speed > 10;
    agent.state.surface = this.#terrain.getSurfaceAt(agent.position.x, agent.position.z);
  }

  #applyPose(agent: RaiderAgent, dt: number): void {
    const normal = this.#terrain.getNormalAt(agent.position.x, agent.position.z);
    this.#groundNormal.lerp(normal, 1 - Math.exp(-8 * dt)).normalize();

    this.#forward
      .set(Math.sin(agent.heading), 0, Math.cos(agent.heading))
      .projectOnPlane(this.#groundNormal);
    if (this.#forward.lengthSq() < 0.0001) {
      this.#forward.set(Math.sin(agent.heading), 0, Math.cos(agent.heading));
    }
    this.#forward.normalize();
    this.#right.crossVectors(this.#groundNormal, this.#forward).normalize();
    this.#correctedForward.crossVectors(this.#right, this.#groundNormal).normalize();
    this.#basisMatrix.makeBasis(this.#right, this.#groundNormal, this.#correctedForward);
    this.#poseQuaternion.setFromRotationMatrix(this.#basisMatrix);

    agent.vehicle.setPose(agent.position, this.#poseQuaternion);
    agent.vehicle.updateVisuals(dt, agent.state);
    agent.vehicle.damage.update(dt, agent.position.y - 0.8);
  }

  /** Find low-elevation, high-moisture spots across the map as water sources. */
  #findWaterSources(): THREE.Vector3[] {
    const sources: THREE.Vector3[] = [];
    const half = this.#terrain.size * 0.45;
    const step = 60;

    for (let z = -half; z < half; z += step) {
      for (let x = -half; x < half; x += step) {
        const h = this.#terrain.getHeightAt(x, z);
        // Low elevation spots with sand or grass = water-adjacent
        if (h < 20) {
          const surface = this.#terrain.getSurfaceAt(x, z);
          if (surface === 'sand' || surface === 'grass') {
            sources.push(new THREE.Vector3(x, h + VEHICLE_CLEARANCE * RAIDER_SCALE, z));
          }
        }
      }
    }

    // Always have at least a few — add basin center area
    if (sources.length < 3) {
      for (let i = 0; i < 4; i++) {
        const x = -40 + i * 30;
        const z = 10 + i * 20;
        const h = this.#terrain.getHeightAt(x, z);
        sources.push(new THREE.Vector3(x, h + VEHICLE_CLEARANCE * RAIDER_SCALE, z));
      }
    }

    return sources;
  }

  /** Find the nearest water source to a position. */
  #findNearestWaterSource(pos: THREE.Vector3): THREE.Vector3 {
    let best = this.#waterSources[0]!;
    let bestDist = Infinity;
    for (const src of this.#waterSources) {
      const d = Math.hypot(pos.x - src.x, pos.z - src.z);
      if (d < bestDist) {
        bestDist = d;
        best = src;
      }
    }
    return best;
  }

  /** Pick a random off-road exploration point near the raider's patrol area. */
  #pickExploreTarget(agent: RaiderAgent): THREE.Vector3 {
    // Pick a point 40–120 units away from current position in a random direction
    const angle = this.#random.next() * Math.PI * 2;
    const dist = 40 + this.#random.next() * 80;
    const x = agent.position.x + Math.cos(angle) * dist;
    const z = agent.position.z + Math.sin(angle) * dist;

    // Clamp to map bounds
    const half = this.#terrain.size * 0.42;
    const cx = THREE.MathUtils.clamp(x, -half, half);
    const cz = THREE.MathUtils.clamp(z, -half * 0.2, half);
    const h = this.#terrain.getHeightAt(cx, cz);

    // Don't explore into very high terrain (mountains)
    if (h > 80) {
      // Fall back to a point along their road segment
      const wp = agent.roadWaypoints[
        Math.floor(this.#random.next() * agent.roadWaypoints.length)
      ];
      if (wp) {
        const offX = wp.x + (this.#random.next() - 0.5) * 50;
        const offZ = wp.z + (this.#random.next() - 0.5) * 50;
        const offH = this.#terrain.getHeightAt(offX, offZ);
        return new THREE.Vector3(offX, offH + VEHICLE_CLEARANCE * RAIDER_SCALE, offZ);
      }
    }

    return new THREE.Vector3(cx, h + VEHICLE_CLEARANCE * RAIDER_SCALE, cz);
  }

  #buildRoadPatrols(
    scene: THREE.Scene,
    roadWaypoints: THREE.Vector3[],
    outpostPositions: THREE.Vector3[],
  ): void {
    if (roadWaypoints.length < 4) return;

    // Spawn 4 raiders spread across the road network
    // Each patrols a segment of the loop road
    const segmentCount = Math.min(4, outpostPositions.length + 1);
    const wpPerSegment = Math.floor(roadWaypoints.length / segmentCount);

    for (let i = 0; i < segmentCount; i++) {
      const colors = RAIDER_COLORS[i % RAIDER_COLORS.length]!;

      // This raider's patrol segment (subset of full loop)
      const segStart = i * wpPerSegment;
      const segEnd = Math.min(segStart + wpPerSegment + 2, roadWaypoints.length);
      const segment = roadWaypoints.slice(segStart, segEnd);
      if (segment.length < 2) continue;

      // Spawn at the start of their segment
      const spawnWp = segment[Math.floor(segment.length * 0.3)]!;
      const spawnX = spawnWp.x + (i % 2 === 0 ? 3 : -3);
      const spawnZ = spawnWp.z;
      const spawnY = this.#terrain.getHeightAt(spawnX, spawnZ) + VEHICLE_CLEARANCE * RAIDER_SCALE;

      const vehicle = new Vehicle(scene, {
        scale: RAIDER_SCALE,
        bodyColor: colors.body,
        roofColor: colors.roof,
        trimColor: colors.trim,
        markerColor: colors.marker,
        boostColor: colors.boost,
      });

      const nextWp = segment[1] ?? segment[0]!;
      const heading = Math.atan2(
        nextWp.x - spawnWp.x,
        nextWp.z - spawnWp.z,
      );

      const agent: RaiderAgent = {
        id: `raider-${i}`,
        vehicle,
        position: new THREE.Vector3(spawnX, spawnY, spawnZ),
        heading,
        speed: RAIDER_PATROL_SPEED,
        state: createDefaultDrivingState(),
        collisionRadius: 0.88 + RAIDER_SCALE * 0.86,
        behavior: 'patrol',
        roadWaypoints: segment,
        waypointIndex: Math.floor(segment.length * 0.3),
        waypointDirection: 1,
        aggroRadius: 45,
        stunTimer: 0,
        verticalVelocity: 0,
        airborne: false,
        needs: {
          // Stagger initial needs so raiders don't all seek water at once
          thirst: this.#random.next() * 0.4,
          curiosity: this.#random.next() * 0.3,
          satisfactionTimer: 8 + this.#random.next() * 12,
          seekTarget: null,
          seekReason: null,
        },
      };

      this.#applyPose(agent, 1 / 60);
      this.#agents.push(agent);
    }
  }
}
