import * as THREE from 'three';
import { Terrain } from '../world/Terrain';
import { Water } from '../world/Water';

export type ScenarioFixtureId =
  | 'spawn'
  | 'sand'
  | 'outpost'
  | 'objective'
  | 'slope'
  | 'drift'
  | 'drop'
  | 'water';

export interface ScenarioFixture {
  id: ScenarioFixtureId;
  label: string;
  position: THREE.Vector3;
  heading: number;
}

export class ScenarioFixtures {
  readonly #terrain: Terrain;
  readonly #water: Water;
  readonly #spawnPosition: THREE.Vector3;
  readonly #objectivePosition: THREE.Vector3;
  readonly #outpostPositions: THREE.Vector3[];
  readonly #clearance: number;

  constructor(
    terrain: Terrain,
    water: Water,
    spawnPosition: THREE.Vector3,
    objectivePosition: THREE.Vector3,
    outpostPositions: THREE.Vector3[],
  ) {
    this.#terrain = terrain;
    this.#water = water;
    this.#spawnPosition = spawnPosition.clone();
    this.#objectivePosition = objectivePosition.clone();
    this.#outpostPositions = outpostPositions.map((position) => position.clone());
    this.#clearance =
      spawnPosition.y - terrain.getHeightAt(spawnPosition.x, spawnPosition.z);
  }

  list(): Array<{ id: ScenarioFixtureId; label: string }> {
    return [
      { id: 'spawn', label: 'Spawn' },
      { id: 'sand', label: 'Soft Sand' },
      { id: 'outpost', label: 'Near Outpost' },
      { id: 'water', label: 'Water Crossing' },
      { id: 'slope', label: 'Slope Roll' },
      { id: 'drift', label: 'Drift Test' },
      { id: 'drop', label: 'Crest Drop' },
      { id: 'objective', label: 'Final Relay' },
    ];
  }

  get(id: ScenarioFixtureId): ScenarioFixture {
    switch (id) {
      case 'spawn':
        return this.#buildSpawnFixture();
      case 'sand':
        return this.#buildSandFixture();
      case 'outpost':
        return this.#buildOutpostFixture();
      case 'objective':
        return this.#buildObjectiveFixture();
      case 'slope':
        return this.#buildSlopeFixture();
      case 'drift':
        return this.#buildDriftFixture();
      case 'drop':
        return this.#buildDropFixture();
      case 'water':
        return this.#buildWaterFixture();
    }
  }

  #buildSpawnFixture(): ScenarioFixture {
    const target = this.#outpostPositions[0] ?? this.#objectivePosition;
    return {
      id: 'spawn',
      label: 'Spawn',
      position: this.#spawnPosition.clone(),
      heading: Math.atan2(target.x - this.#spawnPosition.x, target.z - this.#spawnPosition.z),
    };
  }

  #buildSandFixture(): ScenarioFixture {
    const start = this.#terrain.getSandStartPosition();
    return {
      id: 'sand',
      label: 'Soft Sand',
      position: start,
      heading: this.#headingToward(start, this.#objectivePosition),
    };
  }

  #buildOutpostFixture(): ScenarioFixture {
    const outpost = this.#outpostPositions[0] ?? this.#objectivePosition;
    const offset = new THREE.Vector3(-10, 0, -14);
    const start = this.#snapToGround(outpost.clone().add(offset));
    return {
      id: 'outpost',
      label: 'Near Outpost',
      position: start,
      heading: this.#headingToward(start, outpost),
    };
  }

  #buildObjectiveFixture(): ScenarioFixture {
    const start = this.#snapToGround(
      this.#objectivePosition.clone().add(new THREE.Vector3(-5, 0, -9)),
    );
    return {
      id: 'objective',
      label: 'Final Relay',
      position: start,
      heading: this.#headingToward(start, this.#objectivePosition),
    };
  }

  #buildDriftFixture(): ScenarioFixture {
    const targetZ = 132;
    const pathX = this.#terrain.getPathCenterX(targetZ);
    const start = this.#snapToGround(new THREE.Vector3(pathX - 16, 0, targetZ - 18));
    const nextPathPoint = new THREE.Vector3(
      this.#terrain.getPathCenterX(targetZ + 48),
      0,
      targetZ + 48,
    );
    return {
      id: 'drift',
      label: 'Drift Test',
      position: start,
      heading: this.#headingToward(start, nextPathPoint),
    };
  }

  #buildSlopeFixture(): ScenarioFixture {
    let bestPoint: THREE.Vector3 | null = null;
    let bestHeading = 0;
    let bestScore = -Infinity;
    const downhill = new THREE.Vector3();
    const crossSlope = new THREE.Vector3();

    for (let z = 52; z <= 196; z += 6) {
      const centerX = this.#terrain.getPathCenterX(z);
      for (let offset = -30; offset <= 30; offset += 4) {
        const x = centerX + offset;
        if (!this.#terrain.isWithinBounds(x, z)) continue;

        const waterHeight = this.#water.getWaterHeightAt(x, z);
        const groundHeight = this.#terrain.getHeightAt(x, z);
        if (waterHeight !== null && waterHeight > groundHeight + 0.1) continue;

        const surface = this.#terrain.getSurfaceAt(x, z);
        if (surface === 'sand') continue;

        const normal = this.#terrain.getNormalAt(x, z);
        const slopeDegrees = THREE.MathUtils.radToDeg(
          Math.acos(THREE.MathUtils.clamp(normal.y, -1, 1)),
        );
        if (slopeDegrees < 14 || slopeDegrees > 34) continue;

        downhill.set(-normal.x, 0, -normal.z);
        if (downhill.lengthSq() < 0.0001) continue;
        downhill.normalize();
        crossSlope.set(-downhill.z, 0, downhill.x).normalize();

        const score = slopeDegrees + Math.abs(offset) * 0.12;
        if (score <= bestScore) continue;

        bestScore = score;
        bestPoint = this.#snapToGround(new THREE.Vector3(x, 0, z));
        bestHeading = this.#headingToward(
          bestPoint,
          bestPoint.clone().addScaledVector(downhill, 12),
        );
      }
    }

    if (!bestPoint) {
      return this.#buildOutpostFixture();
    }

    return {
      id: 'slope',
      label: 'Slope Roll',
      position: bestPoint,
      heading: bestHeading,
    };
  }

  #buildWaterFixture(): ScenarioFixture {
    const pool = this.#water.pools[0];
    if (!pool) {
      return this.#buildSpawnFixture();
    }

    const start = this.#snapToGround(
      new THREE.Vector3(pool.center.x, 0, pool.center.y - Math.max(pool.radius + 10, 18)),
    );
    const target = new THREE.Vector3(pool.center.x, 0, pool.center.y + pool.radius + 6);
    return {
      id: 'water',
      label: 'Water Crossing',
      position: start,
      heading: this.#headingToward(start, target),
    };
  }

  #buildDropFixture(): ScenarioFixture {
    const crest = this.#terrain.getRouteCrestPosition();
    const startZ = crest.z - 16;
    const start = this.#snapToGround(
      new THREE.Vector3(this.#terrain.getPathCenterX(startZ), 0, startZ),
    );
    const target = new THREE.Vector3(
      this.#terrain.getPathCenterX(crest.z + 48),
      0,
      crest.z + 48,
    );
    return {
      id: 'drop',
      label: 'Crest Drop',
      position: start,
      heading: this.#headingToward(start, target),
    };
  }

  #snapToGround(position: THREE.Vector3): THREE.Vector3 {
    position.y = this.#terrain.getHeightAt(position.x, position.z) + this.#clearance;
    return position;
  }

  #headingToward(from: THREE.Vector3, to: THREE.Vector3): number {
    return Math.atan2(to.x - from.x, to.z - from.z);
  }
}
