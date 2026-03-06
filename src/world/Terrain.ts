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
  readonly objectiveCenter: THREE.Vector2;
  readonly #noise: ReturnType<typeof createNoise2D>;

  constructor(scene: THREE.Scene) {
    const random = new SeededRandom(0x50415448);
    this.#noise = createNoise2D(() => random.next());
    this.objectiveCenter = this.#findObjectiveCenter();
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

  getObjectivePosition(): THREE.Vector3 {
    const x = this.objectiveCenter.x;
    const z = this.objectiveCenter.y;
    return new THREE.Vector3(x, this.getHeightAt(x, z), z);
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
    const pathInfluence = this.getPathInfluence(x, z);
    const pathHeight = 3.5 + broad * 0.45 + medium * 0.2;
    height = THREE.MathUtils.lerp(height, pathHeight, pathInfluence * 0.8);

    const distFromSpawn = Math.hypot(x, z);
    if (distFromSpawn < 62) {
      const blend = Math.pow(1 - distFromSpawn / 62, 1.75);
      height = THREE.MathUtils.lerp(height, 0, blend);
    }

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
    const pathInfluence = this.getPathInfluence(x, z);
    const snowCoverage = this.#getMainAreaSnowCoverage(x, z, height, slope);

    if (height > 122) return 'snow';
    if (snowCoverage > 0.72 && slope < 0.4) return 'snow';
    if (height > 88 || slope > 0.5) return 'rock';
    if (pathInfluence > 0.52) return 'dirt';
    if (height < 14 && moisture < 0.46) return 'sand';
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
      const pathInfluence = this.getPathInfluence(x, z);
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
          .lerp(sunsetTint, pathInfluence * 0.04 + detail * 0.03);
      } else {
        color.copy(dirt).lerp(dirtDark, (1 - detail) * 0.24);
        color.lerp(sand, THREE.MathUtils.clamp((0.3 - moisture) * 0.2, 0, 0.12));
        color.lerp(grass, THREE.MathUtils.clamp((moisture - 0.48) * 0.24, 0, 0.13));
      }

      if (snowCoverage > 0.02 && surface !== 'rock') {
        const snowDust = surface === 'snow'
          ? 1
          : snowCoverage * THREE.MathUtils.lerp(0.78, 0.42, pathInfluence);
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
