import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { SeededRandom } from '../core/SeededRandom';
import { applyProceduralParallax } from '../render/applyProceduralParallax';
import { VEHICLE_CLEARANCE } from '../vehicle/vehicleShared';
import {
  sampleBiome,
  type BiomeDefinition,
  type BiomeSample,
} from './BiomeConfig';

export const SEA_LEVEL = 3;
/** Average distance from center where coastline sits. */
export const ISLAND_EDGE = 355;

export type SurfaceType = 'sand' | 'dirt' | 'grass' | 'rock' | 'snow';
export type BiomeType = 'default' | 'meadow' | 'desert' | 'hollow';


export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly size = 920;
  readonly segments = 100;
  readonly landmarkCenter = new THREE.Vector2(44, 360);
  readonly cityCenter: THREE.Vector2;
  readonly objectiveCenter: THREE.Vector2;
  readonly outpostCenters: THREE.Vector2[];
  readonly serviceRoadPaths: THREE.Vector2[][];
  readonly #noise: ReturnType<typeof createNoise2D>;
  readonly #heightCache = new Map<number, number>();
  readonly #surfaceCache = new Map<number, SurfaceType>();
  readonly #roadInfluenceCache = new Map<number, number>();
  readonly #normalResult = new THREE.Vector3();

  /** Snap to 0.5-unit grid and hash into a single integer key. */
  #cacheKey(x: number, z: number): number {
    const gx = Math.round(x * 2) | 0;
    const gz = Math.round(z * 2) | 0;
    return gx * 131071 + gz;
  }

  constructor(scene: THREE.Scene) {
    const random = new SeededRandom(0x50415448);
    this.#noise = createNoise2D(() => random.next());
    this.cityCenter = this.#findCityCenter();
    this.objectiveCenter = this.#findObjectiveCenter();
    this.outpostCenters = this.#findOutpostCenters();
    this.serviceRoadPaths = this.#buildServiceRoadPaths();
    this.mesh = this.#createMesh();
    this.mesh.receiveShadow = true;
    scene.add(this.mesh);
  }

  getSpawnPosition(): THREE.Vector3 {
    return new THREE.Vector3(0, this.getHeightAt(0, 0) + VEHICLE_CLEARANCE, 0);
  }

  getLandmarkPosition(): THREE.Vector3 {
    const x = this.landmarkCenter.x;
    const z = this.landmarkCenter.y;
    return new THREE.Vector3(x, this.getHeightAt(x, z), z);
  }

  getCityCenterPosition(): THREE.Vector3 {
    const x = this.cityCenter.x;
    const z = this.cityCenter.y;
    return new THREE.Vector3(x, this.getHeightAt(x, z), z);
  }

  getRouteCrestPosition(): THREE.Vector3 {
    const z = 72;
    const x = this.getPathCenterX(z);
    return new THREE.Vector3(x, this.getHeightAt(x, z), z);
  }

  getObjectivePosition(): THREE.Vector3 {
    const x = this.objectiveCenter.x;
    const z = this.objectiveCenter.y;
    return new THREE.Vector3(x, this.getHeightAt(x, z), z);
  }

  getOutpostPositions(): THREE.Vector3[] {
    return this.outpostCenters.map((center) =>
      new THREE.Vector3(center.x, this.getHeightAt(center.x, center.y), center.y),
    );
  }

  getSandStartPosition(): THREE.Vector3 {
    const basin = this.#getSandBasinCenter();
    let best = basin.clone();
    let bestScore = Number.POSITIVE_INFINITY;

    for (let z = basin.y - 88; z <= basin.y + 88; z += 6) {
      for (let x = basin.x - 124; x <= basin.x + 124; x += 6) {
        if (!this.isWithinBounds(x, z)) continue;

        const surface = this.getSurfaceAt(x, z);
        const slope = 1 - this.getNormalAt(x, z).y;
        const basinInfluence = this.#getSandBasinInfluence(x, z);
        if (surface !== 'sand' && basinInfluence < 0.22) continue;
        if (slope > 0.28) continue;

        const height = this.getHeightAt(x, z);
        const pathInfluence = this.getPathInfluence(x, z);
        const score =
          Math.hypot(x - basin.x, (z - basin.y) * 1.1) +
          Math.abs(height - 12) * 0.7 +
          slope * 160 -
          basinInfluence * 42 -
          pathInfluence * 5 +
          (surface === 'sand' ? 0 : 18);

        if (score < bestScore) {
          bestScore = score;
          best.set(x, z);
        }
      }
    }

    return new THREE.Vector3(best.x, this.getHeightAt(best.x, best.y) + VEHICLE_CLEARANCE, best.y);
  }

  isWithinBounds(x: number, z: number): boolean {
    const half = this.size * 0.49;
    return Math.abs(x) <= half && Math.abs(z) <= half;
  }

  /** True if position is above sea level and within the island landmass. */
  isOnLand(x: number, z: number): boolean {
    if (!this.isWithinBounds(x, z)) return false;
    return this.getHeightAt(x, z) >= SEA_LEVEL;
  }

  getPathCenterX(z: number): number {
    const nz = z / this.size;
    return Math.sin(nz * Math.PI * 2.3) * 28 + Math.sin(nz * Math.PI * 0.9) * 14;
  }

  getPathInfluence(x: number, z: number): number {
    const distance = Math.abs(x - this.getPathCenterX(z));
    return THREE.MathUtils.clamp(1 - distance / 28, 0, 1);
  }

  getRoadInfluence(x: number, z: number): number {
    const key = this.#cacheKey(x, z);
    const cached = this.#roadInfluenceCache.get(key);
    if (cached !== undefined) return cached;

    let influence = this.getPathInfluence(x, z);
    for (const road of this.serviceRoadPaths ?? []) {
      influence = Math.max(influence, this.#getPolylineInfluence(x, z, road, 18));
    }
    this.#roadInfluenceCache.set(key, influence);
    return influence;
  }

  getServiceRoadPaths(): Array<Array<{ x: number; z: number }>> {
    return this.serviceRoadPaths.map((road) =>
      road.map((point) => ({ x: point.x, z: point.y })),
    );
  }

  /**
   * Call once per frame to advance the cache generation.
   * Heights are stable within a frame — the cache persists across frames
   * and only evicts entries older than 2 frames to handle movement.
   */
  flushHeightCache(): void {
    // Evict each cache independently — don't nuke all three when one grows
    const cacheLimit = 6000;
    if (this.#heightCache.size > cacheLimit) this.#heightCache.clear();
    if (this.#surfaceCache.size > cacheLimit) this.#surfaceCache.clear();
    // Road influence is static geometry — never changes, so allow it to grow larger
    if (this.#roadInfluenceCache.size > 12000) this.#roadInfluenceCache.clear();
  }

  getHeightAt(x: number, z: number): number {
    const key = this.#cacheKey(x, z);
    const cached = this.#heightCache.get(key);
    if (cached !== undefined) return cached;

    const height = this.#computeHeightAt(x, z);
    this.#heightCache.set(key, height);
    return height;
  }

  /** Generate raw biome-driven terrain height for a single BiomeDefinition. */
  #biomeHeight(x: number, z: number, biome: BiomeDefinition): number {
    // Scale noise params relative to size so frequency is world-space
    const freqScale = this.size * biome.noise.frequency;
    const detailScale = this.size * biome.noise.detailFrequency;

    const broad = this.#sampleNoise(x, z, freqScale, 12, -5) * biome.noise.amplitude;
    const medium = this.#sampleNoise(x, z, freqScale * 2.7, -18, 7) * (biome.noise.amplitude * 0.45);
    const detail = this.#sampleNoise(x, z, detailScale * this.size * 0.011, 4.3, -14.8) * biome.noise.detailAmplitude;

    let height = biome.noise.baseElevation + broad + medium + detail;

    // Alpine Meadows slopes outward — higher in center, lower at edges
    if (biome.noise.elevationFalloff > 0) {
      const distFromCenter = Math.sqrt(x * x + z * z);
      height -= biome.noise.elevationFalloff * distFromCenter;
    }

    return height;
  }

  #computeHeightAt(x: number, z: number): number {
    const biomeSample = sampleBiome(x, z);
    let height: number;

    if (biomeSample.secondary && biomeSample.blend > 0) {
      // Transition zone — lerp between both biome heights
      const h1 = this.#biomeHeight(x, z, biomeSample.primary);
      const h2 = this.#biomeHeight(x, z, biomeSample.secondary);
      height = THREE.MathUtils.lerp(h1, h2, biomeSample.blend);
    } else {
      height = this.#biomeHeight(x, z, biomeSample.primary);
    }

    // Route flattening — roads cut through all biomes
    const broad = this.#sampleNoise(x, z, biomeSample.primary.noise.frequency * this.size, 12, -5)
      * biomeSample.primary.noise.amplitude;
    const medium = this.#sampleNoise(x, z, biomeSample.primary.noise.frequency * this.size * 2.7, -18, 7)
      * (biomeSample.primary.noise.amplitude * 0.45);
    const roadInfluence = this.getRoadInfluence(x, z);
    const roadHeight = 3.5 + broad * 0.45 + medium * 0.2 - roadInfluence * 0.8;
    height = THREE.MathUtils.lerp(height, roadHeight, roadInfluence * 0.8);

    // Spawn area flattening — smooth plateau near origin
    const distFromSpawn = Math.hypot(x, z);
    if (distFromSpawn < 62) {
      const blend = Math.pow(1 - distFromSpawn / 62, 1.75);
      height = THREE.MathUtils.lerp(height, SEA_LEVEL + 3, blend);
    }

    height += this.#routeCrestContribution(x, z);
    height += this.#landmarkContribution(x, z);
    height += this.#mountainRangeContribution(x, z);

    // Island falloff — terrain drops below sea level toward edges
    const distFromCenter = Math.sqrt(x * x + z * z);
    const coastNoise = this.#sampleNoise(x, z, 0.6, 42, -17) * 30;
    const edgeRadius = ISLAND_EDGE + coastNoise;
    const dropStart = edgeRadius - 25;
    const dropEnd = edgeRadius + 50;

    if (distFromCenter > dropStart) {
      const t = THREE.MathUtils.clamp(
        (distFromCenter - dropStart) / (dropEnd - dropStart), 0, 1,
      );
      const falloff = t * t * (3 - 2 * t); // smoothstep
      const seaFloor = -6 + this.#sampleNoise(x, z, 2.2, -8, 14) * 2;
      height = THREE.MathUtils.lerp(height, seaFloor, falloff);
    }

    return height;
  }

  getNormalAt(x: number, z: number): THREE.Vector3 {
    const sample = 2.5;
    const left = this.getHeightAt(x - sample, z);
    const right = this.getHeightAt(x + sample, z);
    const back = this.getHeightAt(x, z - sample);
    const front = this.getHeightAt(x, z + sample);

    return this.#normalResult.set(left - right, sample * 2, back - front).normalize();
  }

  getSurfaceAt(x: number, z: number): SurfaceType {
    const key = this.#cacheKey(x, z);
    const cached = this.#surfaceCache.get(key);
    if (cached !== undefined) return cached;

    const surface = this.#computeSurfaceAt(x, z);
    this.#surfaceCache.set(key, surface);
    return surface;
  }

  #computeSurfaceAt(x: number, z: number): SurfaceType {
    const height = this.getHeightAt(x, z);
    const slope = 1 - this.getNormalAt(x, z).y;
    const moisture = this.#getMoisture(x, z, slope);
    const roadInfluence = this.getRoadInfluence(x, z);
    const snowCoverage = this.#getMainAreaSnowCoverage(x, z, height, slope);
    const sandBasinInfluence = this.#getSandBasinInfluence(x, z);
    const biomeSample = sampleBiome(x, z);
    const biome = biomeSample.primary;

    // Coastal beach — sand near sea level at island edges
    if (height < SEA_LEVEL + 4 && height >= SEA_LEVEL - 1 && slope < 0.32) {
      const distFromCenter = Math.sqrt(x * x + z * z);
      if (distFromCenter > ISLAND_EDGE - 80) return 'sand';
    }

    // Universal high-altitude rules
    if (height > 95) return 'snow';
    if (snowCoverage > 0.72 && slope < 0.4 && sandBasinInfluence < 0.46) return 'snow';
    // Jagged Peaks snow at lower altitude
    if (biome.name === 'jagged-peaks' && height > 60 && slope < 0.35) return 'snow';
    if (height > 88 || slope > 0.5) return 'rock';
    if (roadInfluence > 0.48 && sandBasinInfluence < 0.42) return 'dirt';

    // Biome-aware surface classification
    // Steep slopes use secondary surface, flat areas use primary
    if (slope > 0.35) return biome.secondarySurface === 'snow' ? 'rock' : biome.secondarySurface;
    if (slope > 0.22) return biome.secondarySurface;

    // Biome-specific primary surface with moisture/height modifiers
    const primary = biome.primarySurface;

    if (primary === 'grass') {
      // Grass biomes (alpine-meadows, coast) — drier areas become dirt
      if (moisture > 0.32 && slope < 0.28) return 'grass';
      if (slope < 0.2) return 'grass';
      return 'dirt';
    }

    if (primary === 'rock') {
      // Rock biomes (canyon, jagged-peaks) — flatter areas get secondary
      if (slope < 0.15 && moisture > 0.4) return biome.secondarySurface;
      return 'rock';
    }

    if (primary === 'sand') {
      // Sand biomes (salt-flats, coast secondary) — almost entirely sand
      if (slope > 0.3) return 'rock';
      return 'sand';
    }

    // Fallback — use sand basin influence for legacy compatibility
    if (sandBasinInfluence > 0.36 && slope < 0.3 && height < 34) return 'sand';
    if (moisture > 0.58 && slope < 0.24) return 'grass';
    if (moisture > 0.5 && slope < 0.18) return 'grass';
    return primary;
  }

  #sampleNoise(
    x: number,
    z: number,
    scale: number,
    offsetX = 0,
    offsetZ = 0,
  ): number {
    const nx = x / this.size + 0.5;
    const nz = z / this.size + 0.5;
    return this.#noise(nx * scale + offsetX, nz * scale + offsetZ);
  }

  #sampleNoise01(
    x: number,
    z: number,
    scale: number,
    offsetX = 0,
    offsetZ = 0,
  ): number {
    return this.#sampleNoise(x, z, scale, offsetX, offsetZ) * 0.5 + 0.5;
  }

  #landmarkContribution(x: number, z: number): number {
    const dx = x - this.landmarkCenter.x;
    const dz = z - this.landmarkCenter.y;

    const massif =
      Math.exp(-((dx * dx) / (138 * 138) + (dz * dz) / (120 * 120))) * 42;
    const shoulder =
      Math.exp(-(((dx + 34) ** 2) / (72 * 72) + ((dz + 14) ** 2) / (68 * 68))) *
      24;
    const spire =
      Math.exp(-((dx * dx) / (36 * 36) + (dz * dz) / (52 * 52))) * 90;

    return massif + shoulder + spire;
  }

  /** Distant mountain range — dramatic peaks along the map edges. */
  #mountainRangeContribution(x: number, z: number): number {
    let contribution = 0;

    // Western ridge — long jagged wall with multiple spires
    const westDist = x + 260;
    const westBase = Math.exp(-(westDist * westDist) / (100 * 100)) * 95;
    const westJag = Math.sin(z * 0.024 + 1.4) * 28 + Math.sin(z * 0.058 - 0.8) * 14;
    const westSpire1 = Math.exp(-(((x + 300) ** 2) / (28 * 28) + ((z - 120) ** 2) / (34 * 34))) * 65;
    const westSpire2 = Math.exp(-(((x + 310) ** 2) / (24 * 24) + ((z - 260) ** 2) / (30 * 30))) * 55;
    const westCliff = Math.exp(-(westDist * westDist) / (35 * 35)) * 50;
    contribution += westBase + Math.max(0, westJag * Math.exp(-(westDist * westDist) / (70 * 70)))
      + westCliff + westSpire1 + westSpire2;

    // Northern massif — towering snow range, highest point in the world
    const northDist = z - 360;
    const northBase = Math.exp(-(northDist * northDist) / (80 * 80)) * 110;
    const northPeak1 = Math.exp(-(((x + 40) ** 2) / (38 * 38) + ((z - 390) ** 2) / (32 * 32))) * 75;
    const northPeak2 = Math.exp(-(((x - 90) ** 2) / (32 * 32) + ((z - 410) ** 2) / (36 * 36))) * 85;
    const northPeak3 = Math.exp(-(((x + 120) ** 2) / (44 * 44) + ((z - 380) ** 2) / (40 * 40))) * 60;
    const northSaddle = -Math.exp(-(((x - 20) ** 2) / (26 * 26) + ((z - 395) ** 2) / (22 * 22))) * 25;
    contribution += northBase + northPeak1 + northPeak2 + northPeak3 + northSaddle;

    // Eastern cliff face — towering vertical wall with stepped shelves
    const eastDist = x - 300;
    const eastCliff = Math.exp(-(eastDist * eastDist) / (38 * 38)) * 80;
    const eastShelf = eastDist > 20 ? Math.exp(-(((eastDist - 30) ** 2) / (55 * 55))) * 35 : 0;
    const eastSpire = Math.exp(-(((x - 340) ** 2) / (22 * 22) + ((z - 200) ** 2) / (28 * 28))) * 50;
    contribution += eastCliff + eastShelf + eastSpire;

    // Isolated southern peak — dramatic horn shape visible from spawn
    const southDx = x + 140;
    const southDz = z + 300;
    const southPeak = Math.exp(-((southDx * southDx) / (48 * 48) + (southDz * southDz) / (42 * 42))) * 120;
    const southShoulder = Math.exp(-(((southDx - 50) ** 2) / (58 * 58) + ((southDz + 30) ** 2) / (50 * 50))) * 40;
    const southRidge = Math.exp(-(((southDx + 30) ** 2) / (35 * 35) + ((southDz - 20) ** 2) / (65 * 65))) * 35;
    contribution += southPeak + southShoulder + southRidge;

    // Southeast secondary range — connects east cliff to south peak
    const seDx = x - 200;
    const seDz = z + 220;
    const seRange = Math.exp(-((seDx * seDx) / (90 * 90) + (seDz * seDz) / (70 * 70))) * 55;
    const seSpire = Math.exp(-(((seDx + 20) ** 2) / (26 * 26) + ((seDz - 15) ** 2) / (24 * 24))) * 40;
    contribution += seRange + seSpire;

    return contribution;
  }

  #routeCrestContribution(x: number, z: number): number {
    const crestZ = 72;
    const lateral = x - this.getPathCenterX(z);
    const laneMask = Math.exp(-(lateral * lateral) / (17 * 17));
    const ramp =
      Math.exp(-((z - (crestZ - 6)) ** 2) / (12 * 12)) * 3.4;
    const lip =
      Math.exp(-((z - crestZ) ** 2) / (5.6 * 5.6)) * 2.9;
    const landingCut =
      Math.exp(-((z - (crestZ + 14)) ** 2) / (13 * 13)) * -3.8;
    return laneMask * (ramp + lip + landingCut);
  }

  #findCityCenter(): THREE.Vector2 {
    const targetX = this.landmarkCenter.x + 76;
    const targetZ = this.landmarkCenter.y - 56;
    let best = new THREE.Vector2(targetX, targetZ);
    let bestScore = Number.POSITIVE_INFINITY;

    for (let dz = -34; dz <= 24; dz += 4) {
      for (let dx = -32; dx <= 32; dx += 4) {
        const x = targetX + dx;
        const z = targetZ + dz;
        if (!this.isWithinBounds(x, z)) continue;

        const height = this.getHeightAt(x, z);
        const slope = 1 - this.getNormalAt(x, z).y;
        const distanceToLandmark = Math.hypot(
          x - this.landmarkCenter.x,
          z - this.landmarkCenter.y,
        );
        const pathInfluence = this.getPathInfluence(x, z);
        const score =
          Math.abs(height - 42) * 0.48
          + slope * 180
          + Math.hypot(dx, dz) * 0.42
          + Math.abs(distanceToLandmark - 92) * 0.16
          + pathInfluence * 12;

        if (slope > 0.24 || distanceToLandmark < 58 || distanceToLandmark > 132) {
          continue;
        }

        if (score < bestScore) {
          bestScore = score;
          best.set(x, z);
        }
      }
    }

    return best;
  }

  #findObjectiveCenter(): THREE.Vector2 {
    const targetZ = this.landmarkCenter.y - 88;
    const pathX = this.getPathCenterX(targetZ);
    const targetX = THREE.MathUtils.lerp(pathX, this.landmarkCenter.x - 16, 0.42);
    let best = new THREE.Vector2(targetX, targetZ);
    let bestScore = Number.POSITIVE_INFINITY;

    for (let dz = -26; dz <= 22; dz += 4) {
      for (let dx = -28; dx <= 28; dx += 4) {
        const x = targetX + dx;
        const z = targetZ + dz;
        if (!this.isWithinBounds(x, z)) continue;

        const height = this.getHeightAt(x, z);
        const slope = 1 - this.getNormalAt(x, z).y;
        const pathInfluence = this.getPathInfluence(x, z);
        const distanceBias = Math.hypot(dx, dz * 0.84);
        const score =
          slope * 110 +
          Math.abs(height - 28) * 0.35 +
          distanceBias * 0.42 -
          pathInfluence * 12;

        if (score < bestScore) {
          bestScore = score;
          best.set(x, z);
        }
      }
    }

    return best;
  }

  #findOutpostCenters(): THREE.Vector2[] {
    return [
      this.#findRouteOutpostCenter(84, 20),
      this.#findRouteOutpostCenter(176, 48),
      this.objectiveCenter.clone(),
    ];
  }

  #buildServiceRoadPaths(): THREE.Vector2[][] {
    const outpostA = this.outpostCenters[0] ?? new THREE.Vector2(this.getPathCenterX(84) + 20, 84);
    const outpostB = this.outpostCenters[1] ?? new THREE.Vector2(this.getPathCenterX(176) + 48, 176);

    // Western return route — closes the loop so the road wraps around the map
    const westA = new THREE.Vector2(-110, this.objectiveCenter.y + 20);
    const westB = new THREE.Vector2(-155, (this.objectiveCenter.y + outpostB.y) * 0.5);
    const westC = new THREE.Vector2(-140, (outpostB.y + outpostA.y) * 0.5 - 10);
    const westD = new THREE.Vector2(-90, outpostA.y * 0.4);
    const spawnReturn = new THREE.Vector2(this.getPathCenterX(-20), -20);

    return [
      this.#createServiceRoad(52, outpostA, 0.42),
      this.#createServiceRoad(144, outpostB, -0.34),
      this.#createServiceRoad(this.cityCenter.y - 62, this.cityCenter, 0.56),
      this.#createConnectorRoad(this.cityCenter, this.objectiveCenter, -0.28),
      // Loop road — western return route
      [this.objectiveCenter.clone(), westA, westB],
      [westB, westC, westD],
      [westD, spawnReturn, new THREE.Vector2(this.getPathCenterX(0), 0)],
      // Spur trails to nature landmarks
      this.#createServiceRoad(220, new THREE.Vector2(-88, 220), -0.3),   // The Sentinel
      this.#createServiceRoad(85, new THREE.Vector2(120, 85), 0.28),     // Sulfur Pool
      this.#createServiceRoad(155, new THREE.Vector2(-45, 155), -0.2),   // Rockslide Crossing
      this.#createServiceRoad(310, new THREE.Vector2(180, 310), 0.36),   // Black Hollow
    ];
  }

  #findRouteOutpostCenter(targetZ: number, lateralOffset: number): THREE.Vector2 {
    let best = new THREE.Vector2(this.getPathCenterX(targetZ) + lateralOffset, targetZ);
    let bestScore = Number.POSITIVE_INFINITY;

    for (let dz = -24; dz <= 24; dz += 4) {
      for (let dx = -28; dx <= 28; dx += 4) {
        const z = targetZ + dz;
        const pathX = this.getPathCenterX(z);
        const x = pathX + lateralOffset + dx;
        if (!this.isWithinBounds(x, z)) continue;

        const height = this.getHeightAt(x, z);
        const slope = 1 - this.getNormalAt(x, z).y;
        const surface = this.getSurfaceAt(x, z);
        const pathDistance = Math.abs(x - pathX);
        const sandBias = this.#getSandBasinInfluence(x, z);
        const score =
          slope * 135 +
          Math.abs(pathDistance - 24) * 0.9 +
          Math.abs(height - 22) * 0.34 +
          Math.hypot(dx, dz * 0.8) * 0.58 +
          sandBias * 18 +
          (surface === 'rock' ? 26 : 0);

        if (score < bestScore) {
          bestScore = score;
          best.set(x, z);
        }
      }
    }

    return best;
  }

  // ── Biome system ──

  /** Returns the dominant biome and its influence at a world position.
   *  Maps new BiomeName values to legacy BiomeType for backward compatibility. */
  getBiomeAt(x: number, z: number): { biome: BiomeType; influence: number } {
    const sample = sampleBiome(x, z);
    const influence = 1 - sample.blend;
    const name = sample.primary.name;

    // Map new biome names to legacy BiomeType for downstream consumers
    if (name === 'alpine-meadows') return { biome: 'meadow', influence };
    if (name === 'canyon' || name === 'salt-flats') return { biome: 'desert', influence };
    if (name === 'jagged-peaks') return { biome: 'hollow', influence };
    if (name === 'coast') return { biome: 'default', influence };
    return { biome: 'default', influence: 0 };
  }

  /** Returns the full biome sample (primary, secondary, blend) at a position. */
  getBiomeSampleAt(x: number, z: number): BiomeSample {
    return sampleBiome(x, z);
  }

  #getSandBasinCenter(): THREE.Vector2 {
    const z = 176;
    const x = this.getPathCenterX(z) + 54;
    return new THREE.Vector2(x, z);
  }

  #getMoisture(x: number, z: number, slope: number): number {
    const rainfall = this.#sampleNoise01(x, z, 2.2, 8.3, -3.8);
    const valleyBias =
      1 - THREE.MathUtils.clamp(Math.abs(x - this.getPathCenterX(z)) / 150, 0, 1);
    return THREE.MathUtils.clamp(
      rainfall * 0.56 + valleyBias * 0.28 - slope * 0.34,
      0,
      1,
    );
  }

  #getMainAreaSnowCoverage(
    x: number,
    z: number,
    height: number,
    slope: number,
  ): number {
    const distanceFromSpawn = Math.hypot(x, z);
    const centralBlend = 1 - THREE.MathUtils.clamp((distanceFromSpawn - 18) / 250, 0, 1);
    const valleyBlend =
      1 - THREE.MathUtils.clamp(Math.abs(x - this.getPathCenterX(z)) / 145, 0, 1);
    const altitudeBlend = 1 - THREE.MathUtils.clamp((height - 56) / 82, 0, 1);
    // High mountain snow — pure altitude-driven, independent of proximity to spawn/valley
    const highAltitudeSnow = THREE.MathUtils.clamp((height - 80) / 60, 0, 1);
    const slopeBlend = 1 - THREE.MathUtils.clamp(slope / 0.44, 0, 1);
    const breakup = this.#sampleNoise01(x, z, 4.1, -5.4, 6.8);

    return THREE.MathUtils.clamp(
      centralBlend * 0.56 +
        valleyBlend * 0.22 +
        altitudeBlend * 0.12 +
        highAltitudeSnow * 0.62 +
        slopeBlend * 0.08 +
        breakup * 0.14 -
        0.18,
      0,
      1,
    );
  }

  #getSandBasinInfluence(x: number, z: number): number {
    const basin = this.#getSandBasinCenter();
    const dx = x - basin.x;
    const dz = z - basin.y;
    const primary =
      Math.exp(-((dx * dx) / (86 * 86) + (dz * dz) / (58 * 58)));
    const shoulder =
      Math.exp(-(((dx + 24) ** 2) / (42 * 42) + ((dz - 10) ** 2) / (30 * 30))) *
      0.42;

    return THREE.MathUtils.clamp(primary + shoulder, 0, 1);
  }

  #createServiceRoad(
    anchorZ: number,
    target: THREE.Vector2,
    bendBias: number,
  ): THREE.Vector2[] {
    const start = new THREE.Vector2(this.getPathCenterX(anchorZ), anchorZ);
    const toTarget = target.clone().sub(start);
    const length = Math.max(toTarget.length(), 1);
    const direction = toTarget.clone().multiplyScalar(1 / length);
    const perpendicular = new THREE.Vector2(-direction.y, direction.x);
    const midpointA = start.clone()
      .lerp(target, 0.34)
      .addScaledVector(perpendicular, length * 0.18 * bendBias);
    const midpointB = start.clone()
      .lerp(target, 0.72)
      .addScaledVector(perpendicular, length * -0.11 * bendBias);
    return [start, midpointA, midpointB, target.clone()];
  }

  #createConnectorRoad(
    start: THREE.Vector2,
    end: THREE.Vector2,
    bendBias: number,
  ): THREE.Vector2[] {
    const toEnd = end.clone().sub(start);
    const length = Math.max(toEnd.length(), 1);
    const direction = toEnd.clone().multiplyScalar(1 / length);
    const perpendicular = new THREE.Vector2(-direction.y, direction.x);
    const midpoint = start.clone()
      .lerp(end, 0.5)
      .addScaledVector(perpendicular, length * 0.14 * bendBias);
    return [start.clone(), midpoint, end.clone()];
  }

  #getPolylineInfluence(
    x: number,
    z: number,
    path: THREE.Vector2[],
    width: number,
  ): number {
    let best = 0;
    for (let index = 1; index < path.length; index += 1) {
      const start = path[index - 1];
      const end = path[index];
      if (!start || !end) continue;
      const distance = this.#distanceToSegment2D(x, z, start, end);
      best = Math.max(best, THREE.MathUtils.clamp(1 - distance / width, 0, 1));
    }
    return best;
  }

  #distanceToSegment2D(
    x: number,
    z: number,
    start: THREE.Vector2,
    end: THREE.Vector2,
  ): number {
    const segment = end.clone().sub(start);
    const lengthSquared = segment.lengthSq();
    if (lengthSquared <= 0.0001) {
      return Math.hypot(x - start.x, z - start.y);
    }
    const t = THREE.MathUtils.clamp(
      ((x - start.x) * segment.x + (z - start.y) * segment.y) / lengthSquared,
      0,
      1,
    );
    const closestX = start.x + segment.x * t;
    const closestZ = start.y + segment.y * t;
    return Math.hypot(x - closestX, z - closestZ);
  }

  /** Compute vertex color from a biome's palette based on surface/height/slope. */
  #vertexColorFromBiome(
    out: THREE.Color,
    biome: BiomeDefinition,
    surface: SurfaceType,
    height: number,
    slope: number,
    detail: number,
    moisture: number,
    roadInfluence: number,
    x: number,
    z: number,
  ): void {
    const palette = biome.palette;

    if (surface === 'snow') {
      out.set(0xf0f4fc);
      const skyTint = new THREE.Color(0xa8b8c0);
      const sunsetTint = new THREE.Color(0xf0a060);
      out.lerp(skyTint, (1 - detail) * 0.12 + slope * 0.06);
      out.lerp(sunsetTint, roadInfluence * 0.04 + detail * 0.03);
      if (height > 110) {
        const glacialBlend = THREE.MathUtils.clamp((height - 110) / 60, 0, 0.18);
        out.offsetHSL(0, -glacialBlend * 0.5, glacialBlend);
      }
      return;
    }

    if (surface === 'rock') {
      const rockBase = new THREE.Color(palette.slope);
      const rockDark = new THREE.Color(palette.slope).offsetHSL(0, -0.05, -0.12);
      const rockLight = new THREE.Color(palette.peak);
      const heightBlend = THREE.MathUtils.clamp((height - 40) / 120, 0, 1);
      out.copy(rockDark).lerp(rockBase, heightBlend * 0.72 + detail * 0.28);
      out.lerp(rockLight, Math.max(0, heightBlend - 0.4) * 0.5);
      out.lerp(rockDark, slope * 0.48);
      if (height > 100) {
        const alpineBlend = THREE.MathUtils.clamp((height - 100) / 80, 0, 0.35);
        out.lerp(rockLight, alpineBlend);
      }
      return;
    }

    if (surface === 'sand') {
      const sandBase = new THREE.Color(palette.accent);
      const sandLight = new THREE.Color(palette.accent).offsetHSL(0, -0.02, 0.06);
      out.copy(sandBase).lerp(sandLight, detail * 0.6);
      return;
    }

    if (surface === 'grass') {
      const grassBase = new THREE.Color(palette.ground);
      const grassLight = new THREE.Color(palette.ground).offsetHSL(0.01, 0.04, 0.08);
      out.copy(grassBase).lerp(grassLight, detail * 0.48 + moisture * 0.22);
      return;
    }

    // Dirt / default
    const dirtBase = new THREE.Color(palette.slope);
    const dirtDark = new THREE.Color(palette.slope).offsetHSL(0, -0.02, -0.08);
    const grassTint = new THREE.Color(palette.ground);
    const sandTint = new THREE.Color(palette.accent);
    out.copy(dirtBase).lerp(dirtDark, (1 - detail) * 0.2);
    out.lerp(sandTint, THREE.MathUtils.clamp((0.3 - moisture) * 0.14, 0, 0.08));
    out.lerp(grassTint, THREE.MathUtils.clamp((moisture - 0.3) * 0.32, 0, 0.22));
  }

  #createMesh(): THREE.Mesh {
    const geometry = new THREE.PlaneGeometry(
      this.size,
      this.size,
      this.segments,
      this.segments,
    );
    geometry.rotateX(-Math.PI / 2);

    const positions = geometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      positions.setY(index, this.getHeightAt(x, z));
    }

    geometry.computeVertexNormals();
    const normals = geometry.attributes.normal as THREE.BufferAttribute;
    const colors = new Float32Array(positions.count * 3);
    const roadMasks = new Float32Array(positions.count);
    const snowMasks = new Float32Array(positions.count);
    const color = new THREE.Color();
    const secondaryColor = new THREE.Color();

    // Shared palette colors — used across all biomes for special surfaces
    const beachSand = new THREE.Color(0xe8d498);
    const beachWet = new THREE.Color(0xc0a068);
    const dirtDark = new THREE.Color(0x785838);
    const snowColor = new THREE.Color(0xf0f4fc);
    const skyTint = new THREE.Color(0xa8b8c0);
    const sunsetTint = new THREE.Color(0xf0a060);
    const seaFloorTint = new THREE.Color(0x1a3838);

    // Reusable scratch colors for biome palette lookups
    const groundCol = new THREE.Color();
    const slopeCol = new THREE.Color();
    const peakCol = new THREE.Color();
    const accentCol = new THREE.Color();

    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const z = positions.getZ(index);
      const height = positions.getY(index);
      const slope = THREE.MathUtils.clamp(1 - normals.getY(index), 0, 1);
      const detail = this.#sampleNoise01(x, z, 12.5, 2.6, -8.9);
      const moisture = this.#getMoisture(x, z, slope);
      const snowCoverage = this.#getMainAreaSnowCoverage(x, z, height, slope);
      const roadInfluence = this.getRoadInfluence(x, z);
      const surface = this.getSurfaceAt(x, z);
      const biomeSample = sampleBiome(x, z);
      const parallaxRoadMask = THREE.MathUtils.clamp(
        surface === 'rock' ? 0 : roadInfluence,
        0,
        1,
      );
      const parallaxSnowMask = THREE.MathUtils.clamp(
        surface === 'snow'
          ? 1
          : snowCoverage * THREE.MathUtils.lerp(0.92, 0.26, roadInfluence),
        0,
        1,
      );

      // Compute biome-palette-driven color for a given biome
      this.#vertexColorFromBiome(
        color, biomeSample.primary, surface, height, slope, detail, moisture,
        roadInfluence, x, z,
      );

      // Blend with secondary biome in transition zones
      if (biomeSample.secondary && biomeSample.blend > 0) {
        this.#vertexColorFromBiome(
          secondaryColor, biomeSample.secondary, surface, height, slope, detail,
          moisture, roadInfluence, x, z,
        );
        color.lerp(secondaryColor, biomeSample.blend);
      }

      // Coastal beach override — wet sand near waterline
      if (surface === 'sand') {
        const vertexDist = Math.hypot(x, z);
        const isCoastal = vertexDist > ISLAND_EDGE - 80 && height < SEA_LEVEL + 4;
        if (isCoastal) {
          const wetBlend = THREE.MathUtils.clamp(
            1 - (height - SEA_LEVEL) / 3, 0, 0.7,
          );
          color.copy(beachSand).lerp(beachWet, wetBlend);
          color.lerp(new THREE.Color(biomeSample.primary.palette.accent), detail * 0.3);
        }
      }

      if (roadInfluence > 0.08 && surface !== 'rock') {
        color.lerp(dirtDark, roadInfluence * 0.22);
      }

      if (snowCoverage > 0.02 && surface !== 'rock') {
        const snowDust = surface === 'snow'
          ? 1
          : snowCoverage * THREE.MathUtils.lerp(0.78, 0.16, roadInfluence);
        color.lerp(snowColor, THREE.MathUtils.clamp(snowDust, 0, 0.94));
      }

      // Underwater terrain darkening — sea floor tint
      if (height < SEA_LEVEL) {
        const submerge = THREE.MathUtils.clamp((SEA_LEVEL - height) / 8, 0, 0.8);
        color.lerp(seaFloorTint, submerge);
      }

      color.offsetHSL(
        0,
        surface === 'snow' ? 0.015 : 0.03,
        (detail - 0.5) * 0.055 - height * 0.00045 + (surface === 'snow' ? 0.004 : 0.015),
      );

      // Atmospheric perspective — distant/high terrain blue-shifts and desaturates
      const distFromCenter = Math.hypot(x, z);
      const atmosphereBlend = THREE.MathUtils.clamp(
        (distFromCenter - 220) / 360 + (height - 80) / 220,
        0,
        0.32,
      );
      if (atmosphereBlend > 0.01) {
        color.lerp(skyTint, atmosphereBlend * 0.42);
        const hsl = { h: 0, s: 0, l: 0 };
        color.getHSL(hsl);
        hsl.s *= 1 - atmosphereBlend * 0.32;
        color.setHSL(hsl.h, hsl.s, hsl.l);
      }
      roadMasks[index] = parallaxRoadMask;
      snowMasks[index] = parallaxSnowMask;
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('roadMask', new THREE.BufferAttribute(roadMasks, 1));
    geometry.setAttribute('snowMask', new THREE.BufferAttribute(snowMasks, 1));

    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0,
      flatShading: true,
    });
    applyProceduralParallax(material, {
      kind: 'terrain',
      useTerrainMasks: true,
      strength: 0.16,
      scale: 0.11,
      secondaryScale: 2.8,
    });

    return new THREE.Mesh(geometry, material);
  }
}
