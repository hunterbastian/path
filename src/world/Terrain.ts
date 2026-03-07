import * as THREE from 'three';
import { createNoise2D } from 'simplex-noise';
import { SeededRandom } from '../core/SeededRandom';
import { VEHICLE_CLEARANCE } from '../vehicle/vehicleShared';

export type SurfaceType = 'sand' | 'dirt' | 'grass' | 'rock' | 'snow';

export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly size = 920;
  readonly segments = 220;
  readonly landmarkCenter = new THREE.Vector2(44, 360);
  readonly cityCenter: THREE.Vector2;
  readonly objectiveCenter: THREE.Vector2;
  readonly outpostCenters: THREE.Vector2[];
  readonly serviceRoadPaths: THREE.Vector2[][];
  readonly #noise: ReturnType<typeof createNoise2D>;

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

  getPathCenterX(z: number): number {
    const nz = z / this.size;
    return Math.sin(nz * Math.PI * 2.3) * 28 + Math.sin(nz * Math.PI * 0.9) * 14;
  }

  getPathInfluence(x: number, z: number): number {
    const distance = Math.abs(x - this.getPathCenterX(z));
    return THREE.MathUtils.clamp(1 - distance / 28, 0, 1);
  }

  getRoadInfluence(x: number, z: number): number {
    let influence = this.getPathInfluence(x, z);
    for (const road of this.serviceRoadPaths ?? []) {
      influence = Math.max(influence, this.#getPolylineInfluence(x, z, road, 18));
    }
    return influence;
  }

  getServiceRoadPaths(): Array<Array<{ x: number; z: number }>> {
    return this.serviceRoadPaths.map((road) =>
      road.map((point) => ({ x: point.x, z: point.y })),
    );
  }

  getHeightAt(x: number, z: number): number {
    const pathCenter = this.getPathCenterX(z);
    const valleyDistance = Math.abs(x - pathCenter);
    const valleyWall = Math.pow(
      THREE.MathUtils.clamp(valleyDistance / 165, 0, 1),
      1.18,
    ) * 44;

    const broad = this.#sampleNoise(x, z, 1.7, 12, -5) * 13;
    const medium = this.#sampleNoise(x, z, 4.6, -18, 7) * 8;
    const detail = this.#sampleNoise(x, z, 10.4, 4.3, -14.8) * 2.8;
    const basin = THREE.MathUtils.clamp(Math.abs(z) / (this.size * 0.52), 0, 1) * 6;

    let height = 8 + valleyWall + basin + broad + medium + detail;
    const roadInfluence = this.getRoadInfluence(x, z);
    const roadHeight = 3.5 + broad * 0.45 + medium * 0.2 - roadInfluence * 0.8;
    height = THREE.MathUtils.lerp(height, roadHeight, roadInfluence * 0.8);

    const distFromSpawn = Math.hypot(x, z);
    if (distFromSpawn < 62) {
      const blend = Math.pow(1 - distFromSpawn / 62, 1.75);
      height = THREE.MathUtils.lerp(height, 0, blend);
    }

    height += this.#routeCrestContribution(x, z);
    height += this.#landmarkContribution(x, z);
    return Math.max(height, 0);
  }

  getNormalAt(x: number, z: number): THREE.Vector3 {
    const sample = 2.5;
    const left = this.getHeightAt(x - sample, z);
    const right = this.getHeightAt(x + sample, z);
    const back = this.getHeightAt(x, z - sample);
    const front = this.getHeightAt(x, z + sample);

    return new THREE.Vector3(left - right, sample * 2, back - front).normalize();
  }

  getSurfaceAt(x: number, z: number): SurfaceType {
    const height = this.getHeightAt(x, z);
    const slope = 1 - this.getNormalAt(x, z).y;
    const moisture = this.#getMoisture(x, z, slope);
    const roadInfluence = this.getRoadInfluence(x, z);
    const snowCoverage = this.#getMainAreaSnowCoverage(x, z, height, slope);
    const sandBasinInfluence = this.#getSandBasinInfluence(x, z);

    if (height > 122) return 'snow';
    if (snowCoverage > 0.72 && slope < 0.4 && sandBasinInfluence < 0.46) return 'snow';
    if (height > 88 || slope > 0.5) return 'rock';
    if (roadInfluence > 0.48 && sandBasinInfluence < 0.42) return 'dirt';
    if (sandBasinInfluence > 0.36 && slope < 0.3 && height < 34) return 'sand';
    if (height < 14 && moisture < 0.46) return 'sand';
    if (sandBasinInfluence > 0.18 && slope < 0.24 && moisture < 0.64) return 'sand';
    if (moisture > 0.58 && slope < 0.24) return 'grass';
    if (moisture > 0.5 && slope < 0.18) return 'grass';
    if (height < 20 && moisture < 0.38) return 'sand';
    return 'dirt';
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
    return [
      this.#createServiceRoad(52, outpostA, 0.42),
      this.#createServiceRoad(144, outpostB, -0.34),
      this.#createServiceRoad(this.cityCenter.y - 62, this.cityCenter, 0.56),
      this.#createConnectorRoad(this.cityCenter, this.objectiveCenter, -0.28),
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
    const slopeBlend = 1 - THREE.MathUtils.clamp(slope / 0.44, 0, 1);
    const breakup = this.#sampleNoise01(x, z, 4.1, -5.4, 6.8);

    return THREE.MathUtils.clamp(
      centralBlend * 0.56 +
        valleyBlend * 0.22 +
        altitudeBlend * 0.12 +
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
    const color = new THREE.Color();

    const sand = new THREE.Color(0xe2c27a);
    const sandLight = new THREE.Color(0xf4dda6);
    const dirt = new THREE.Color(0x9b5c40);
    const dirtDark = new THREE.Color(0x6b392c);
    const grass = new THREE.Color(0x6fa36b);
    const grassLight = new THREE.Color(0x9fca84);
    const rock = new THREE.Color(0x857c88);
    const ash = new THREE.Color(0x57505f);
    const snow = new THREE.Color(0xe5e8f2);
    const skyTint = new THREE.Color(0xaed4f5);
    const sunsetTint = new THREE.Color(0xffc490);

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

      if (surface === 'sand') {
        color.copy(sand).lerp(sandLight, detail * 0.6);
      } else if (surface === 'grass') {
        color.copy(grass).lerp(grassLight, detail * 0.42 + moisture * 0.18);
      } else if (surface === 'rock') {
        color.copy(rock).lerp(ash, slope * 0.32 + detail * 0.14);
      } else if (surface === 'snow') {
        color.copy(snow)
          .lerp(skyTint, (1 - detail) * 0.12 + slope * 0.06)
          .lerp(sunsetTint, roadInfluence * 0.04 + detail * 0.03);
      } else {
        color.copy(dirt).lerp(dirtDark, (1 - detail) * 0.24);
        color.lerp(sand, THREE.MathUtils.clamp((0.3 - moisture) * 0.2, 0, 0.12));
        color.lerp(grass, THREE.MathUtils.clamp((moisture - 0.48) * 0.24, 0, 0.13));
      }

      if (roadInfluence > 0.08 && surface !== 'rock') {
        color
          .lerp(dirtDark, roadInfluence * 0.34)
          .lerp(sand, roadInfluence * 0.06);
      }

      if (snowCoverage > 0.02 && surface !== 'rock') {
        const snowDust = surface === 'snow'
          ? 1
          : snowCoverage * THREE.MathUtils.lerp(0.78, 0.16, roadInfluence);
        color.lerp(snow, THREE.MathUtils.clamp(snowDust, 0, 0.94));
      }

      color.offsetHSL(
        0,
        surface === 'snow' ? 0.015 : 0.03,
        (detail - 0.5) * 0.055 - height * 0.00045 + (surface === 'snow' ? 0.004 : 0.015),
      );
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }

    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    return new THREE.Mesh(
      geometry,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.94,
        metalness: 0,
        flatShading: true,
      }),
    );
  }
}
