import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SeededRandom } from '../core/SeededRandom';
import { Terrain } from './Terrain';

interface PoolSeed {
  z: number;
  side: -1 | 1;
  offset: number;
  maxReach: number;
  priority?: boolean;
}

export interface WaterPool {
  center: THREE.Vector2;
  radius: number;
  surfaceHeight: number;
  outline: THREE.Vector2[];
}

const WATER_VERTEX_SHADER = /* glsl */ `
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    vUv = uv;
    vec3 transformed = position;
    transformed.y += sin((position.x + uTime * 6.0) * 0.08) * 0.06;
    transformed.y += cos((position.z - uTime * 4.0) * 0.12) * 0.04;

    vec4 worldPos = modelMatrix * vec4(transformed, 1.0);
    vec4 mvPosition = modelViewMatrix * vec4(transformed, 1.0);
    vWorldPos = worldPos.xyz;
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const WATER_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uDeepColor;
  uniform vec3 uShallowColor;
  uniform vec3 uCameraPos;
  uniform float uTime;

  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    float ripple = sin((vWorldPos.x + vWorldPos.z) * 0.22 + uTime * 2.2);
    float band = floor((ripple * 0.5 + 0.5) * 4.0) / 4.0;
    vec3 color = mix(uDeepColor, uShallowColor, band);

    vec3 viewDir = normalize(uCameraPos - vWorldPos);
    float fresnel = pow(1.0 - max(dot(viewDir, vec3(0.0, 1.0, 0.0)), 0.0), 2.4);
    color = mix(color, vec3(0.88, 0.93, 0.94), fresnel * 0.38);

    float edge = 1.0 - smoothstep(0.74, 1.0, length(vUv - 0.5) * 1.9);
    gl_FragColor = vec4(color, edge * 0.72);
  }
`;

export class Water {
  readonly pools: WaterPool[];
  readonly #material: THREE.ShaderMaterial;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.pools = this.#createPools(terrain);
    this.#material = this.#createMaterial();

    const mesh = this.#buildMesh();
    if (mesh) {
      scene.add(mesh);
    }
  }

  update(dt: number, cameraPosition: THREE.Vector3): void {
    const uniforms = this.#material.uniforms as {
      uTime: { value: number };
      uCameraPos: { value: THREE.Vector3 };
    };
    uniforms.uTime.value += dt;
    uniforms.uCameraPos.value.copy(cameraPosition);
  }

  getWaterHeightAt(x: number, z: number): number | null {
    for (const pool of this.pools) {
      const localX = x - pool.center.x;
      const localZ = z - pool.center.y;

      if (localX * localX + localZ * localZ > pool.radius * pool.radius) {
        continue;
      }

      if (this.#isPointInsideOutline(localX, localZ, pool.outline)) {
        return pool.surfaceHeight;
      }
    }
    return null;
  }

  #createPools(terrain: Terrain): WaterPool[] {
    const random = new SeededRandom(0x57545231);
    const pools: WaterPool[] = [];
    const landmark = terrain.getLandmarkPosition();

    const seeds: PoolSeed[] = [
      { z: 138, side: 1, offset: 56, maxReach: 58, priority: true },
      { z: 92, side: 1, offset: 52, maxReach: 50 },
    ];

    const anchors = [-260, -190, -110, -24, 178, 258];
    for (const anchor of anchors) {
      seeds.push({
        z: anchor + random.range(-18, 18),
        side: random.next() > 0.5 ? 1 : -1,
        offset: random.range(38, 82),
        maxReach: random.range(34, 48),
      });
    }

    for (const seed of seeds) {
      const candidate = new THREE.Vector2(
        terrain.getPathCenterX(seed.z) + seed.side * seed.offset,
        seed.z,
      );
      const center = this.#snapToBasin(terrain, candidate, seed.maxReach);
      const distanceFromSpawn = Math.hypot(center.x, center.y);
      const distanceFromLandmark = Math.hypot(
        center.x - landmark.x,
        center.y - landmark.z,
      );
      const normal = terrain.getNormalAt(center.x, center.y);
      const slope = 1 - normal.y;
      const floorHeight = terrain.getHeightAt(center.x, center.y);

      if (!terrain.isWithinBounds(center.x, center.y)) continue;
      if (distanceFromSpawn < 92) continue;
      if (distanceFromLandmark < 118) continue;
      if (floorHeight > 44 || slope > 0.34) continue;

      const surfaceHeight = this.#estimateSurfaceHeight(
        terrain,
        center,
        seed.priority ? 1.14 : 1,
      );
      const outline = this.#buildOutline(
        terrain,
        center,
        surfaceHeight,
        seed.maxReach,
      );
      if (!outline) continue;

      const radius = outline.reduce((maxRadius, point) => {
        return Math.max(maxRadius, point.length());
      }, 0);

      const overlap = pools.some((pool) => {
        return pool.center.distanceTo(center) < pool.radius + radius + 16;
      });
      if (overlap) continue;

      pools.push({
        center,
        radius,
        surfaceHeight,
        outline,
      });
    }

    return pools;
  }

  #snapToBasin(
    terrain: Terrain,
    origin: THREE.Vector2,
    maxReach: number,
  ): THREE.Vector2 {
    const current = origin.clone();
    const directions = [
      new THREE.Vector2(1, 0),
      new THREE.Vector2(-1, 0),
      new THREE.Vector2(0, 1),
      new THREE.Vector2(0, -1),
      new THREE.Vector2(0.7, 0.7),
      new THREE.Vector2(-0.7, 0.7),
      new THREE.Vector2(0.7, -0.7),
      new THREE.Vector2(-0.7, -0.7),
    ];

    for (let step = 0; step < 12; step += 1) {
      let bestX = current.x;
      let bestZ = current.y;
      let bestHeight = terrain.getHeightAt(current.x, current.y);
      const radius = THREE.MathUtils.lerp(maxReach * 0.16, 3.6, step / 11);

      for (const direction of directions) {
        const sampleX = current.x + direction.x * radius;
        const sampleZ = current.y + direction.y * radius;
        if (!terrain.isWithinBounds(sampleX, sampleZ)) continue;
        if (origin.distanceTo(new THREE.Vector2(sampleX, sampleZ)) > maxReach) continue;

        const sampleHeight = terrain.getHeightAt(sampleX, sampleZ);
        if (sampleHeight < bestHeight - 0.08) {
          bestHeight = sampleHeight;
          bestX = sampleX;
          bestZ = sampleZ;
        }
      }

      if (bestX === current.x && bestZ === current.y) {
        break;
      }

      current.set(bestX, bestZ);
    }

    return current;
  }

  #estimateSurfaceHeight(
    terrain: Terrain,
    center: THREE.Vector2,
    fillBias: number,
  ): number {
    const floorHeight = terrain.getHeightAt(center.x, center.y);
    const rimSamples: number[] = [];

    for (let index = 0; index < 20; index += 1) {
      const angle = (index / 20) * Math.PI * 2;
      const dirX = Math.cos(angle);
      const dirZ = Math.sin(angle);

      for (const distance of [9, 15, 22]) {
        const sampleX = center.x + dirX * distance;
        const sampleZ = center.y + dirZ * distance;
        if (!terrain.isWithinBounds(sampleX, sampleZ)) continue;
        rimSamples.push(terrain.getHeightAt(sampleX, sampleZ));
      }
    }

    rimSamples.sort((left, right) => left - right);
    const percentileIndex = Math.max(0, Math.floor(rimSamples.length * 0.28));
    const rimHeight = rimSamples[percentileIndex] ?? floorHeight + 1.3;
    return floorHeight + THREE.MathUtils.clamp((rimHeight - floorHeight) * 0.78 * fillBias, 0.85, 3.6);
  }

  #buildOutline(
    terrain: Terrain,
    center: THREE.Vector2,
    surfaceHeight: number,
    maxReach: number,
  ): THREE.Vector2[] | null {
    const cellSize = 2.4;
    const gridRadius = Math.max(4, Math.ceil(maxReach / cellSize));
    const wettable = new Set<string>();

    for (let gridZ = -gridRadius; gridZ <= gridRadius; gridZ += 1) {
      for (let gridX = -gridRadius; gridX <= gridRadius; gridX += 1) {
        const localX = gridX * cellSize;
        const localZ = gridZ * cellSize;
        const distance = Math.hypot(localX, localZ);
        if (distance > maxReach + cellSize) continue;

        const sampleX = center.x + localX;
        const sampleZ = center.y + localZ;
        if (!terrain.isWithinBounds(sampleX, sampleZ)) continue;

        const height = terrain.getHeightAt(sampleX, sampleZ);
        const slope = 1 - terrain.getNormalAt(sampleX, sampleZ).y;
        const edgeAllowance = THREE.MathUtils.lerp(
          0.68,
          0.16,
          THREE.MathUtils.clamp(distance / maxReach, 0, 1),
        );

        if (height <= surfaceHeight + edgeAllowance && slope < 0.58) {
          wettable.add(this.#getGridKey(gridX, gridZ));
        }
      }
    }

    const filled = this.#floodConnectedCells(wettable);
    if (filled.size < 26) {
      return null;
    }

    const outline = this.#traceFilledOutline(filled, cellSize);
    if (outline.length < 8) {
      return null;
    }

    const smoothed = this.#smoothOutline(outline);
    const area = Math.abs(this.#computePolygonArea(smoothed));
    const maxRadius = smoothed.reduce((max, point) => Math.max(max, point.length()), 0);
    if (area < 180 || maxRadius < 8) {
      return null;
    }

    return smoothed;
  }

  #floodConnectedCells(wettable: Set<string>): Set<string> {
    const origin = this.#getGridKey(0, 0);
    if (!wettable.has(origin)) {
      return new Set();
    }

    const filled = new Set<string>([origin]);
    const queue = [origin];
    const neighbors = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ] as const;

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;

      const [gridX, gridZ] = this.#parseGridKey(current);
      for (const [deltaX, deltaZ] of neighbors) {
        const next = this.#getGridKey(gridX + deltaX, gridZ + deltaZ);
        if (!wettable.has(next) || filled.has(next)) continue;
        filled.add(next);
        queue.push(next);
      }
    }

    return filled;
  }

  #traceFilledOutline(filled: Set<string>, cellSize: number): THREE.Vector2[] {
    type Edge = {
      id: string;
      start: THREE.Vector2;
      end: THREE.Vector2;
    };

    const edgeMap = new Map<string, Edge>();

    for (const cell of filled) {
      const [gridX, gridZ] = this.#parseGridKey(cell);
      const minX = (gridX - 0.5) * cellSize;
      const maxX = (gridX + 0.5) * cellSize;
      const minZ = (gridZ - 0.5) * cellSize;
      const maxZ = (gridZ + 0.5) * cellSize;

      const edges: Array<[THREE.Vector2, THREE.Vector2]> = [
        [new THREE.Vector2(minX, minZ), new THREE.Vector2(maxX, minZ)],
        [new THREE.Vector2(maxX, minZ), new THREE.Vector2(maxX, maxZ)],
        [new THREE.Vector2(maxX, maxZ), new THREE.Vector2(minX, maxZ)],
        [new THREE.Vector2(minX, maxZ), new THREE.Vector2(minX, minZ)],
      ];

      for (const [start, end] of edges) {
        const edgeKey = this.#getEdgeKey(start, end);
        if (edgeMap.has(edgeKey)) {
          edgeMap.delete(edgeKey);
          continue;
        }

        edgeMap.set(edgeKey, {
          id: `${start.x},${start.y}->${end.x},${end.y}`,
          start,
          end,
        });
      }
    }

    const outgoing = new Map<string, Edge[]>();
    for (const edge of edgeMap.values()) {
      const key = this.#getPointKey(edge.start);
      const list = outgoing.get(key) ?? [];
      list.push(edge);
      outgoing.set(key, list);
    }

    const loops: THREE.Vector2[][] = [];
    const used = new Set<string>();

    for (const edge of edgeMap.values()) {
      if (used.has(edge.id)) continue;

      const loop: THREE.Vector2[] = [];
      let current: Edge | undefined = edge;

      while (current && !used.has(current.id)) {
        used.add(current.id);
        loop.push(current.start.clone());
        const nextEdges: Edge[] = outgoing.get(this.#getPointKey(current.end)) ?? [];
        current = nextEdges.find((candidate: Edge) => !used.has(candidate.id));
      }

      if (loop.length >= 4) {
        loops.push(loop);
      }
    }

    if (loops.length === 0) {
      return [];
    }

    return loops.reduce((largest, candidate) => {
      return Math.abs(this.#computePolygonArea(candidate)) >
        Math.abs(this.#computePolygonArea(largest))
        ? candidate
        : largest;
    });
  }

  #smoothOutline(outline: THREE.Vector2[]): THREE.Vector2[] {
    const simplified = outline.filter((point, index, source) => {
      const previous = source[(index - 1 + source.length) % source.length];
      const next = source[(index + 1) % source.length];
      if (!previous || !next) return true;

      const dirA = point.clone().sub(previous).normalize();
      const dirB = next.clone().sub(point).normalize();
      return Math.abs(dirA.dot(dirB)) < 0.995;
    });

    return simplified.map((point, index, source) => {
      const previous = source[(index - 1 + source.length) % source.length] ?? point;
      const next = source[(index + 1) % source.length] ?? point;
      const smoothed = previous
        .clone()
        .multiplyScalar(0.12)
        .add(point.clone().multiplyScalar(0.76))
        .add(next.clone().multiplyScalar(0.12));
      return smoothed.multiplyScalar(1.025);
    });
  }

  #getGridKey(gridX: number, gridZ: number): string {
    return `${gridX},${gridZ}`;
  }

  #parseGridKey(key: string): [number, number] {
    const [x, z] = key.split(',').map((value) => Number(value));
    return [x ?? 0, z ?? 0];
  }

  #getPointKey(point: THREE.Vector2): string {
    return `${point.x},${point.y}`;
  }

  #getEdgeKey(start: THREE.Vector2, end: THREE.Vector2): string {
    const a = this.#getPointKey(start);
    const b = this.#getPointKey(end);
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  #computePolygonArea(points: THREE.Vector2[]): number {
    let area = 0;

    for (let index = 0; index < points.length; index += 1) {
      const current = points[index];
      const next = points[(index + 1) % points.length];
      if (!current || !next) continue;
      area += current.x * next.y - next.x * current.y;
    }

    return area * 0.5;
  }

  #isPointInsideOutline(x: number, z: number, outline: THREE.Vector2[]): boolean {
    let inside = false;

    for (
      let currentIndex = 0, previousIndex = outline.length - 1;
      currentIndex < outline.length;
      previousIndex = currentIndex, currentIndex += 1
    ) {
      const current = outline[currentIndex];
      const previous = outline[previousIndex];
      if (!current || !previous) continue;

      const intersects =
        current.y > z !== previous.y > z &&
        x <
          ((previous.x - current.x) * (z - current.y)) /
            ((previous.y - current.y) || 0.00001) +
            current.x;

      if (intersects) {
        inside = !inside;
      }
    }

    return inside;
  }

  #buildMesh(): THREE.Mesh | null {
    if (this.pools.length === 0) return null;

    const geometries: THREE.BufferGeometry[] = [];
    for (const pool of this.pools) {
      const [first, ...rest] = pool.outline;
      if (!first) continue;

      const shape = new THREE.Shape();
      shape.moveTo(first.x, first.y);
      for (const point of rest) {
        shape.lineTo(point.x, point.y);
      }
      shape.closePath();

      const geometry = new THREE.ShapeGeometry(shape, 20);
      geometry.rotateX(Math.PI / 2);
      geometry.translate(pool.center.x, pool.surfaceHeight, pool.center.y);
      geometries.push(geometry);
    }

    const mergedGeometry = mergeGeometries(geometries, false);
    if (!mergedGeometry) return null;

    const mesh = new THREE.Mesh(mergedGeometry, this.#material);
    mesh.renderOrder = 2;
    return mesh;
  }

  #createMaterial(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
      vertexShader: WATER_VERTEX_SHADER,
      fragmentShader: WATER_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uDeepColor: { value: new THREE.Color(0x2f7186) },
        uShallowColor: { value: new THREE.Color(0x8fe5df) },
        uCameraPos: { value: new THREE.Vector3() },
      },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
  }
}
