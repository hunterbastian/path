import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Terrain } from './Terrain';
import { applyProceduralParallax } from '../render/applyProceduralParallax';
import { sampleBiome, type BiomeName } from './BiomeConfig';

/** Half-width of the main route. */
const MAIN_ROAD_HALF_WIDTH = 5.5;
/** Half-width of service/connector roads. */
const SERVICE_ROAD_HALF_WIDTH = 3.2;
/** Height offset above terrain to avoid z-fighting. */
const ROAD_Y_OFFSET = 0.06;
/** Spacing between sample points along a road segment. */
const SAMPLE_SPACING = 3.5;

/** Per-biome road width multiplier (applied to half-width). */
const BIOME_WIDTH_SCALE: Record<BiomeName, number> = {
  'alpine-meadows': 1.0,
  'canyon': 0.7,
  'salt-flats': 1.4,
  'jagged-peaks': 0.65,
  'coast': 1.0,
};

/** Per-biome road surface color. */
const BIOME_ROAD_COLOR: Record<BiomeName, THREE.Color> = {
  'alpine-meadows': new THREE.Color(0x8a6a48), // warm brown dirt (default)
  'canyon': new THREE.Color(0x8a5a3a),          // red-brown clay
  'salt-flats': new THREE.Color(0xd0c8b8),     // near-white salt
  'jagged-peaks': new THREE.Color(0x707070),    // grey gravel
  'coast': new THREE.Color(0xb0a080),           // sandy tan
};

/**
 * Generates dirt road strip meshes that follow the terrain's road paths.
 * Each road is a terrain-hugging ribbon extruded along the polyline.
 */
export class DirtRoads {
  readonly #mesh: THREE.Mesh;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    const geometries: THREE.BufferGeometry[] = [];

    // Main path — dense samples along the sine-curve centerline
    const mainPath = this.#sampleMainPath(terrain);
    const mainGeo = this.#extrudeStrip(mainPath, MAIN_ROAD_HALF_WIDTH, terrain);
    if (mainGeo) geometries.push(mainGeo);

    // Service roads — from terrain's polyline data
    const serviceRoads = terrain.getServiceRoadPaths();
    for (const road of serviceRoads) {
      const resampled = this.#resamplePolyline(road);
      const geo = this.#extrudeStrip(resampled, SERVICE_ROAD_HALF_WIDTH, terrain);
      if (geo) geometries.push(geo);
    }

    const merged = mergeGeometries(geometries, false);
    for (const g of geometries) g.dispose();

    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff, // neutral — vertex colors carry the tint
      roughness: 0.96,
      metalness: 0,
      flatShading: true,
      vertexColors: true,
    });
    applyProceduralParallax(material, {
      kind: 'terrain',
      strength: 0.10,
      scale: 0.18,
      secondaryScale: 3.0,
    });

    this.#mesh = new THREE.Mesh(merged ?? new THREE.BufferGeometry(), material);
    this.#mesh.receiveShadow = true;
    this.#mesh.castShadow = false;
    scene.add(this.#mesh);
  }

  dispose(): void {
    this.#mesh.geometry.dispose();
    (this.#mesh.material as THREE.Material).dispose();
    this.#mesh.removeFromParent();
  }

  /**
   * Sample the main path centerline at regular intervals.
   * Returns world-space {x, z} points.
   */
  #sampleMainPath(terrain: Terrain): Array<{ x: number; z: number }> {
    const half = terrain.size * 0.46;
    const points: Array<{ x: number; z: number }> = [];
    for (let z = -half; z <= half; z += SAMPLE_SPACING) {
      points.push({ x: terrain.getPathCenterX(z), z });
    }
    return points;
  }

  /**
   * Resample a polyline at regular intervals for smooth extrusion.
   */
  #resamplePolyline(
    path: Array<{ x: number; z: number }>,
  ): Array<{ x: number; z: number }> {
    if (path.length < 2) return path;

    const result: Array<{ x: number; z: number }> = [];
    let carry = 0;

    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1]!;
      const b = path[i]!;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const segLen = Math.hypot(dx, dz);
      if (segLen < 0.01) continue;

      const nx = dx / segLen;
      const nz = dz / segLen;
      let t = carry;

      while (t < segLen) {
        result.push({ x: a.x + nx * t, z: a.z + nz * t });
        t += SAMPLE_SPACING;
      }
      carry = t - segLen;
    }

    // Always include last point
    const last = path[path.length - 1];
    if (last) result.push({ x: last.x, z: last.z });
    return result;
  }

  /**
   * Extrude a terrain-hugging strip along a path of {x, z} points.
   * Returns a BufferGeometry with positions, normals, UVs, and vertex colors.
   * Width and color vary per-vertex based on the biome at each sample point.
   */
  #extrudeStrip(
    path: Array<{ x: number; z: number }>,
    halfWidth: number,
    terrain: Terrain,
  ): THREE.BufferGeometry | null {
    if (path.length < 2) return null;

    const vertCount = path.length * 2;
    const positions = new Float32Array(vertCount * 3);
    const normals = new Float32Array(vertCount * 3);
    const uvs = new Float32Array(vertCount * 2);
    const colors = new Float32Array(vertCount * 3);
    let accLen = 0;

    // Reusable color objects to avoid per-vertex allocation
    const primaryColor = new THREE.Color();
    const secondaryColor = new THREE.Color();
    const blendedColor = new THREE.Color();

    for (let i = 0; i < path.length; i++) {
      const p = path[i]!;

      // --- Biome sampling for width & color ---
      const biome = sampleBiome(p.x, p.z);
      const primaryName = biome.primary.name;
      const widthScale = biome.secondary
        ? BIOME_WIDTH_SCALE[primaryName] * (1 - biome.blend)
          + BIOME_WIDTH_SCALE[biome.secondary.name] * biome.blend
        : BIOME_WIDTH_SCALE[primaryName];
      const localHalfWidth = halfWidth * widthScale;

      // Blend road color between primary and secondary biomes
      primaryColor.copy(BIOME_ROAD_COLOR[primaryName]);
      if (biome.secondary) {
        secondaryColor.copy(BIOME_ROAD_COLOR[biome.secondary.name]);
        blendedColor.copy(primaryColor).lerp(secondaryColor, biome.blend);
      } else {
        blendedColor.copy(primaryColor);
      }

      // Tangent direction
      const prev = path[Math.max(0, i - 1)]!;
      const next = path[Math.min(path.length - 1, i + 1)]!;
      const tx = next.x - prev.x;
      const tz = next.z - prev.z;
      const tLen = Math.hypot(tx, tz) || 1;

      // Perpendicular (right-hand)
      const px = -tz / tLen;
      const pz = tx / tLen;

      // Left and right edge positions (biome-scaled width)
      const lx = p.x + px * localHalfWidth;
      const lz = p.z + pz * localHalfWidth;
      const rx = p.x - px * localHalfWidth;
      const rz = p.z - pz * localHalfWidth;

      // Sample terrain height at each edge
      const ly = terrain.getHeightAt(lx, lz) + ROAD_Y_OFFSET;
      const ry = terrain.getHeightAt(rx, rz) + ROAD_Y_OFFSET;

      const vi = i * 6; // 2 verts * 3 components
      positions[vi] = lx;
      positions[vi + 1] = ly;
      positions[vi + 2] = lz;
      positions[vi + 3] = rx;
      positions[vi + 4] = ry;
      positions[vi + 5] = rz;

      // Vertex colors — same color for left and right edge at this segment
      colors[vi] = blendedColor.r;
      colors[vi + 1] = blendedColor.g;
      colors[vi + 2] = blendedColor.b;
      colors[vi + 3] = blendedColor.r;
      colors[vi + 4] = blendedColor.g;
      colors[vi + 5] = blendedColor.b;

      // Approximate normal from terrain
      const normal = terrain.getNormalAt(p.x, p.z);
      normals[vi] = normal.x;
      normals[vi + 1] = normal.y;
      normals[vi + 2] = normal.z;
      normals[vi + 3] = normal.x;
      normals[vi + 4] = normal.y;
      normals[vi + 5] = normal.z;

      // UVs — U across road (0→1), V along road length
      if (i > 0) {
        accLen += Math.hypot(p.x - prev.x, p.z - prev.z);
      }
      const v = accLen / (halfWidth * 2);
      const ui = i * 4;
      uvs[ui] = 0;
      uvs[ui + 1] = v;
      uvs[ui + 2] = 1;
      uvs[ui + 3] = v;
    }

    // Build triangle indices (triangle strip → indexed triangles)
    const triCount = (path.length - 1) * 2;
    const indices = new Uint32Array(triCount * 3);
    for (let i = 0; i < path.length - 1; i++) {
      const base = i * 2;
      const ti = i * 6;
      // First triangle
      indices[ti] = base;
      indices[ti + 1] = base + 1;
      indices[ti + 2] = base + 2;
      // Second triangle
      indices[ti + 3] = base + 1;
      indices[ti + 4] = base + 3;
      indices[ti + 5] = base + 2;
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    return geometry;
  }
}
