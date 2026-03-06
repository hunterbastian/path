import * as THREE from 'three';
import type { GameTuning } from '../config/GameTuning';
import { WindSystem } from '../effects/WindSystem';
import { ObjectiveBeacon } from './ObjectiveBeacon';
import { Terrain } from './Terrain';
import { Water } from './Water';

export interface WorldStreamSnapshot {
  routeActivity: number;
  windDensity: number;
  waterActivity: number;
  nearestOutpostDistance: number;
  objectiveIntensity: number;
}

export class WorldStreamer {
  readonly #tuning: GameTuning;
  readonly #terrain: Terrain;
  readonly #water: Water;
  readonly #windSystem: WindSystem;
  readonly #routeOutposts: ObjectiveBeacon[];
  readonly #routeOutpostPositions: THREE.Vector3[];
  readonly #objectiveBeacon: ObjectiveBeacon;
  readonly #objectivePosition: THREE.Vector3;
  #snapshot: WorldStreamSnapshot = {
    routeActivity: 1,
    windDensity: 1,
    waterActivity: 1,
    nearestOutpostDistance: 0,
    objectiveIntensity: 1,
  };

  constructor(
    tuning: GameTuning,
    terrain: Terrain,
    water: Water,
    windSystem: WindSystem,
    routeOutposts: ObjectiveBeacon[],
    routeOutpostPositions: THREE.Vector3[],
    objectiveBeacon: ObjectiveBeacon,
    objectivePosition: THREE.Vector3,
  ) {
    this.#tuning = tuning;
    this.#terrain = terrain;
    this.#water = water;
    this.#windSystem = windSystem;
    this.#routeOutposts = routeOutposts;
    this.#routeOutpostPositions = routeOutpostPositions;
    this.#objectiveBeacon = objectiveBeacon;
    this.#objectivePosition = objectivePosition;
  }

  get snapshot(): WorldStreamSnapshot {
    return this.#snapshot;
  }

  update(cameraPosition: THREE.Vector3): WorldStreamSnapshot {
    const routeDistance = Math.abs(
      cameraPosition.x - this.#terrain.getPathCenterX(cameraPosition.z),
    );
    const routeActivity = this.#falloff(
      routeDistance,
      this.#tuning.streaming.routeNearDistance,
      this.#tuning.streaming.routeFarDistance,
    );

    let nearestOutpostDistance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < this.#routeOutposts.length; index += 1) {
      const beacon = this.#routeOutposts[index];
      const position = this.#routeOutpostPositions[index];
      if (!beacon || !position) continue;

      const distance = cameraPosition.distanceTo(position);
      nearestOutpostDistance = Math.min(nearestOutpostDistance, distance);
      const intensity = Math.max(
        this.#tuning.streaming.minOutpostIntensity,
        this.#falloff(
          distance,
          this.#tuning.streaming.outpostNearDistance,
          this.#tuning.streaming.outpostFarDistance,
        ),
      );
      beacon.setStreamingActivity(intensity);
    }

    const objectiveDistance = cameraPosition.distanceTo(this.#objectivePosition);
    const objectiveIntensity = Math.max(
      0.46,
      this.#falloff(
        objectiveDistance,
        this.#tuning.streaming.outpostNearDistance,
        this.#tuning.streaming.outpostFarDistance * 1.25,
      ),
    );
    this.#objectiveBeacon.setStreamingActivity(objectiveIntensity);

    const nearestWaterDistance = this.#getNearestWaterDistance(cameraPosition);
    const waterActivity = THREE.MathUtils.lerp(
      this.#tuning.streaming.minWaterActivity,
      1,
      this.#falloff(
        nearestWaterDistance,
        this.#tuning.streaming.waterNearDistance,
        this.#tuning.streaming.waterFarDistance,
      ),
    );
    this.#water.setActivity(waterActivity);

    const windDensity = THREE.MathUtils.lerp(
      this.#tuning.streaming.minWindDensity,
      1,
      routeActivity,
    );
    this.#windSystem.setDensityScale(windDensity);

    this.#snapshot = {
      routeActivity: Number(routeActivity.toFixed(2)),
      windDensity: Number(windDensity.toFixed(2)),
      waterActivity: Number(waterActivity.toFixed(2)),
      nearestOutpostDistance: Number(
        Number.isFinite(nearestOutpostDistance)
          ? nearestOutpostDistance.toFixed(1)
          : '9999',
      ),
      objectiveIntensity: Number(objectiveIntensity.toFixed(2)),
    };

    return this.#snapshot;
  }

  #getNearestWaterDistance(cameraPosition: THREE.Vector3): number {
    let nearest = Number.POSITIVE_INFINITY;
    for (const pool of this.#water.pools) {
      nearest = Math.min(
        nearest,
        Math.hypot(
          cameraPosition.x - pool.center.x,
          cameraPosition.z - pool.center.y,
        ) - pool.radius,
      );
    }
    return nearest;
  }

  #falloff(distance: number, nearDistance: number, farDistance: number): number {
    if (distance <= nearDistance) return 1;
    if (distance >= farDistance) return 0;
    return 1 - (distance - nearDistance) / (farDistance - nearDistance);
  }
}
