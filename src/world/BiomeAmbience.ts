import * as THREE from 'three';
import { sampleBiome, type BiomeName } from './BiomeConfig';
import type { Terrain } from './Terrain';

// ─── Wildlife Config ───────────────────────────────────────

const MAX_WILDLIFE = 12;
const WILDLIFE_CULL_DISTANCE = 120;
const WILDLIFE_ORBIT_DRIFT_SPEED = 0.003;

interface WildlifeProfile {
  count: number;
  orbitRadiusMin: number;
  orbitRadiusMax: number;
  speedMin: number;
  speedMax: number;
  altitudeMin: number;
  altitudeMax: number;
  size: number;
}

const WILDLIFE_PROFILES: Partial<Record<BiomeName, WildlifeProfile>> = {
  'alpine-meadows': {
    count: 3,
    orbitRadiusMin: 15,
    orbitRadiusMax: 35,
    speedMin: 0.6,
    speedMax: 1.2,
    altitudeMin: 30,
    altitudeMax: 55,
    size: 0.35,
  },
  canyon: {
    count: 2,
    orbitRadiusMin: 40,
    orbitRadiusMax: 70,
    speedMin: 0.12,
    speedMax: 0.22,
    altitudeMin: 45,
    altitudeMax: 80,
    size: 0.5,
  },
  'jagged-peaks': {
    count: 1,
    orbitRadiusMin: 50,
    orbitRadiusMax: 80,
    speedMin: 0.1,
    speedMax: 0.18,
    altitudeMin: 55,
    altitudeMax: 80,
    size: 0.55,
  },
  coast: {
    count: 3,
    orbitRadiusMin: 20,
    orbitRadiusMax: 45,
    speedMin: 0.3,
    speedMax: 0.6,
    altitudeMin: 25,
    altitudeMax: 50,
    size: 0.4,
  },
};

interface WildlifeInstance {
  active: boolean;
  centerX: number;
  centerZ: number;
  orbitRadius: number;
  speed: number;
  altitude: number;
  angle: number;
  bobPhase: number;
  opacity: number;
  targetOpacity: number;
}

// ─── Ambient Particle Config ───────────────────────────────

const MAX_PARTICLES = 40;
const PARTICLE_BOX_RADIUS = 25;
const PARTICLE_BOX_HEIGHT = 12;

interface ParticleProfile {
  color: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  driftAmplitude: number;
  driftFrequency: number;
  size: number;
  opacity: number;
}

const PARTICLE_PROFILES: Partial<Record<BiomeName, ParticleProfile>> = {
  'alpine-meadows': {
    color: 0xd4b860,
    velocityX: 0,
    velocityY: 0.3,
    velocityZ: 0,
    driftAmplitude: 0.8,
    driftFrequency: 0.4,
    size: 0.12,
    opacity: 0.45,
  },
  canyon: {
    color: 0x8e5a3a,
    velocityX: 1.2,
    velocityY: 0,
    velocityZ: 0.4,
    driftAmplitude: 0.3,
    driftFrequency: 0.6,
    size: 0.15,
    opacity: 0.35,
  },
  'jagged-peaks': {
    color: 0xe8e8f0,
    velocityX: 0.2,
    velocityY: -0.25,
    velocityZ: 0.15,
    driftAmplitude: 0.5,
    driftFrequency: 0.3,
    size: 0.1,
    opacity: 0.5,
  },
  coast: {
    color: 0xf0f0f8,
    velocityX: 1.8,
    velocityY: 0.15,
    velocityZ: 0.6,
    driftAmplitude: 0.2,
    driftFrequency: 0.8,
    size: 0.08,
    opacity: 0.4,
  },
};

interface AmbientParticle {
  active: boolean;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  phase: number;
  life: number;
  maxLife: number;
}

// ─── Helpers ───────────────────────────────────────────────

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

/**
 * BiomeAmbience — per-biome ambient wildlife sprites and atmospheric particles.
 *
 * Wildlife: tiny dark silhouettes on circular orbits high in the sky.
 * Particles: camera-relative drifting specks (pollen, dust, snow, spray).
 *
 * Both systems cross-fade on biome transitions to avoid popping.
 */
export class BiomeAmbience {
  readonly #scene: THREE.Scene;
  readonly #terrain: Terrain;

  // ── Wildlife ──
  readonly #wildlifeMesh: THREE.InstancedMesh;
  readonly #wildlifeInstances: WildlifeInstance[] = [];
  readonly #wildlifeGeo: THREE.BufferGeometry;
  readonly #wildlifeMat: THREE.MeshBasicMaterial;

  // ── Particles ──
  readonly #particlePoints: THREE.Points;
  readonly #particleGeo: THREE.BufferGeometry;
  readonly #particleMat: THREE.PointsMaterial;
  readonly #particlePositions: Float32Array;
  readonly #particleSizes: Float32Array;
  readonly #particles: AmbientParticle[] = [];

  #currentBiome: BiomeName | null = null;
  #time = 0;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.#scene = scene;
    this.#terrain = terrain;

    // ── Wildlife mesh ──
    // Simple dark chevron geometry (reusing the pattern from BirdSystem)
    this.#wildlifeGeo = this.#createSilhouetteGeometry();
    this.#wildlifeMat = new THREE.MeshBasicMaterial({
      color: 0x1a1e24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.65,
      depthWrite: false,
    });
    this.#wildlifeMesh = new THREE.InstancedMesh(
      this.#wildlifeGeo,
      this.#wildlifeMat,
      MAX_WILDLIFE,
    );
    this.#wildlifeMesh.frustumCulled = false;
    this.#wildlifeMesh.castShadow = false;
    this.#wildlifeMesh.receiveShadow = false;
    // Start with all instances hidden
    for (let i = 0; i < MAX_WILDLIFE; i++) {
      _dummy.position.set(0, -1000, 0);
      _dummy.scale.setScalar(0);
      _dummy.updateMatrix();
      this.#wildlifeMesh.setMatrixAt(i, _dummy.matrix);
      this.#wildlifeInstances.push({
        active: false,
        centerX: 0,
        centerZ: 0,
        orbitRadius: 30,
        speed: 0.2,
        altitude: 40,
        angle: 0,
        bobPhase: 0,
        opacity: 0,
        targetOpacity: 0,
      });
    }
    this.#wildlifeMesh.instanceMatrix.needsUpdate = true;
    scene.add(this.#wildlifeMesh);

    // ── Ambient particles ──
    this.#particlePositions = new Float32Array(MAX_PARTICLES * 3);
    this.#particleSizes = new Float32Array(MAX_PARTICLES);

    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.#particlePositions[i * 3 + 1] = -1000;
      this.#particleSizes[i] = 0;
      this.#particles.push({
        active: false,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 0,
        phase: Math.random() * Math.PI * 2,
        life: 0,
        maxLife: 4 + Math.random() * 4,
      });
    }

    this.#particleGeo = new THREE.BufferGeometry();
    this.#particleGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.#particlePositions, 3),
    );
    this.#particleGeo.setAttribute(
      'size',
      new THREE.BufferAttribute(this.#particleSizes, 1),
    );

    this.#particleMat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.12,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      blending: THREE.NormalBlending,
      sizeAttenuation: true,
    });

    this.#particlePoints = new THREE.Points(this.#particleGeo, this.#particleMat);
    this.#particlePoints.frustumCulled = false;
    scene.add(this.#particlePoints);
  }

  update(
    dt: number,
    playerX: number,
    playerZ: number,
    cameraPosition: THREE.Vector3,
  ): void {
    this.#time += dt;

    // Determine current biome
    const sample = sampleBiome(playerX, playerZ);
    const biome = sample.primary.name;

    // On biome change, transition wildlife
    if (biome !== this.#currentBiome) {
      this.#transitionToBiome(biome, playerX, playerZ);
      this.#currentBiome = biome;
    }

    this.#updateWildlife(dt, cameraPosition);
    this.#updateParticles(dt, cameraPosition);
  }

  dispose(): void {
    this.#wildlifeGeo.dispose();
    this.#wildlifeMat.dispose();
    this.#wildlifeMesh.removeFromParent();
    this.#particleGeo.dispose();
    this.#particleMat.dispose();
    this.#particlePoints.removeFromParent();
  }

  // ─── Wildlife ────────────────────────────────────────────

  #transitionToBiome(biome: BiomeName, playerX: number, playerZ: number): void {
    const profile = WILDLIFE_PROFILES[biome];

    // Fade out all current wildlife
    for (const inst of this.#wildlifeInstances) {
      if (inst.active) {
        inst.targetOpacity = 0;
      }
    }

    // Spawn new wildlife for the incoming biome
    if (profile) {
      let spawned = 0;
      for (const inst of this.#wildlifeInstances) {
        if (spawned >= profile.count) break;
        if (inst.active && inst.targetOpacity > 0) continue;

        inst.active = true;
        inst.centerX = playerX + (Math.random() - 0.5) * 40;
        inst.centerZ = playerZ + (Math.random() - 0.5) * 40;
        inst.orbitRadius =
          profile.orbitRadiusMin +
          Math.random() * (profile.orbitRadiusMax - profile.orbitRadiusMin);
        inst.speed =
          profile.speedMin +
          Math.random() * (profile.speedMax - profile.speedMin);
        inst.altitude =
          profile.altitudeMin +
          Math.random() * (profile.altitudeMax - profile.altitudeMin);
        inst.angle = Math.random() * Math.PI * 2;
        inst.bobPhase = Math.random() * Math.PI * 2;
        inst.opacity = 0;
        inst.targetOpacity = 1;
        spawned++;
      }
    }

    // Update particle material for new biome
    const particleProfile = PARTICLE_PROFILES[biome];
    if (particleProfile) {
      _color.setHex(particleProfile.color);
      this.#particleMat.color.copy(_color);
      this.#particleMat.opacity = particleProfile.opacity;
      this.#particleMat.size = particleProfile.size;
    }
    // Salt flats: deactivate all particles
    if (!particleProfile) {
      for (const p of this.#particles) {
        p.active = false;
      }
    }
  }

  #updateWildlife(dt: number, cameraPosition: THREE.Vector3): void {
    let needsUpdate = false;

    for (let i = 0; i < MAX_WILDLIFE; i++) {
      const inst = this.#wildlifeInstances[i]!;

      if (!inst.active) continue;

      // Fade opacity toward target
      const fadeSpeed = 1.5;
      if (inst.opacity < inst.targetOpacity) {
        inst.opacity = Math.min(inst.opacity + fadeSpeed * dt, inst.targetOpacity);
      } else if (inst.opacity > inst.targetOpacity) {
        inst.opacity = Math.max(inst.opacity - fadeSpeed * dt, inst.targetOpacity);
        if (inst.opacity <= 0.01) {
          inst.active = false;
          _dummy.position.set(0, -1000, 0);
          _dummy.scale.setScalar(0);
          _dummy.updateMatrix();
          this.#wildlifeMesh.setMatrixAt(i, _dummy.matrix);
          needsUpdate = true;
          continue;
        }
      }

      // Slowly drift orbit center toward camera (follow player loosely)
      inst.centerX += (cameraPosition.x - inst.centerX) * WILDLIFE_ORBIT_DRIFT_SPEED;
      inst.centerZ += (cameraPosition.z - inst.centerZ) * WILDLIFE_ORBIT_DRIFT_SPEED;

      // Advance orbit
      inst.angle += inst.speed * dt;

      const x = inst.centerX + Math.cos(inst.angle) * inst.orbitRadius;
      const z = inst.centerZ + Math.sin(inst.angle) * inst.orbitRadius;
      const bob = Math.sin(this.#time * 0.6 + inst.bobPhase) * 1.5;
      const y = cameraPosition.y + inst.altitude + bob;

      // Cull by distance
      const dx = x - cameraPosition.x;
      const dz = z - cameraPosition.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > WILDLIFE_CULL_DISTANCE * WILDLIFE_CULL_DISTANCE) {
        _dummy.position.set(0, -1000, 0);
        _dummy.scale.setScalar(0);
        _dummy.updateMatrix();
        this.#wildlifeMesh.setMatrixAt(i, _dummy.matrix);
        needsUpdate = true;
        continue;
      }

      // Face direction of travel (tangent to orbit)
      const tangentX = -Math.sin(inst.angle);
      const tangentZ = Math.cos(inst.angle);

      _dummy.position.set(x, y, z);
      _dummy.rotation.set(
        Math.sin(this.#time * 3.2 + inst.bobPhase) * 0.25, // wing flap
        Math.atan2(tangentX, tangentZ), // heading
        Math.sin(inst.angle * 2 + inst.bobPhase) * 0.15, // banking
      );

      // Profile-based size with opacity fade
      const profile = WILDLIFE_PROFILES[this.#currentBiome ?? 'alpine-meadows'];
      const baseSize = profile?.size ?? 0.4;
      _dummy.scale.setScalar(baseSize * inst.opacity);
      _dummy.updateMatrix();
      this.#wildlifeMesh.setMatrixAt(i, _dummy.matrix);
      needsUpdate = true;
    }

    if (needsUpdate) {
      this.#wildlifeMesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ─── Particles ───────────────────────────────────────────

  #updateParticles(dt: number, cameraPosition: THREE.Vector3): void {
    const profile = PARTICLE_PROFILES[this.#currentBiome ?? 'alpine-meadows'];
    if (!profile) {
      // No particles for this biome (e.g. salt-flats) — park them
      let anyActive = false;
      for (let i = 0; i < MAX_PARTICLES; i++) {
        const p = this.#particles[i]!;
        if (p.active) {
          p.active = false;
          anyActive = true;
        }
        this.#particlePositions[i * 3 + 1] = -1000;
        this.#particleSizes[i] = 0;
      }
      if (anyActive) {
        (this.#particleGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
        (this.#particleGeo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
      }
      return;
    }

    let anyChanged = false;

    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.#particles[i]!;

      if (!p.active) {
        // Spawn at random position in a box around the camera
        p.active = true;
        p.offsetX = (Math.random() - 0.5) * PARTICLE_BOX_RADIUS * 2;
        p.offsetY = Math.random() * PARTICLE_BOX_HEIGHT;
        p.offsetZ = (Math.random() - 0.5) * PARTICLE_BOX_RADIUS * 2;
        p.phase = Math.random() * Math.PI * 2;
        p.life = 0;
        p.maxLife = 3 + Math.random() * 5;
      }

      p.life += dt;

      // Recycle particle when life expires
      if (p.life >= p.maxLife) {
        p.active = false;
        this.#particlePositions[i * 3 + 1] = -1000;
        this.#particleSizes[i] = 0;
        anyChanged = true;
        continue;
      }

      // Move offset by velocity + drift
      const drift = Math.sin(this.#time * profile.driftFrequency + p.phase) * profile.driftAmplitude;
      p.offsetX += (profile.velocityX + drift) * dt;
      p.offsetY += profile.velocityY * dt;
      p.offsetZ += (profile.velocityZ + drift * 0.7) * dt;

      // Wrap particles that leave the box
      if (p.offsetX > PARTICLE_BOX_RADIUS) p.offsetX -= PARTICLE_BOX_RADIUS * 2;
      if (p.offsetX < -PARTICLE_BOX_RADIUS) p.offsetX += PARTICLE_BOX_RADIUS * 2;
      if (p.offsetZ > PARTICLE_BOX_RADIUS) p.offsetZ -= PARTICLE_BOX_RADIUS * 2;
      if (p.offsetZ < -PARTICLE_BOX_RADIUS) p.offsetZ += PARTICLE_BOX_RADIUS * 2;
      if (p.offsetY > PARTICLE_BOX_HEIGHT) p.offsetY -= PARTICLE_BOX_HEIGHT;
      if (p.offsetY < 0) p.offsetY += PARTICLE_BOX_HEIGHT;

      // World position = camera + offset
      const wx = cameraPosition.x + p.offsetX;
      const wy = cameraPosition.y + p.offsetY - 2;
      const wz = cameraPosition.z + p.offsetZ;

      // Fade in/out at life boundaries
      const t = p.life / p.maxLife;
      const fade = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;

      this.#particlePositions[i * 3] = wx;
      this.#particlePositions[i * 3 + 1] = wy;
      this.#particlePositions[i * 3 + 2] = wz;
      this.#particleSizes[i] = profile.size * fade;

      anyChanged = true;
    }

    if (anyChanged) {
      (this.#particleGeo.attributes.position as THREE.BufferAttribute).needsUpdate = true;
      (this.#particleGeo.attributes.size as THREE.BufferAttribute).needsUpdate = true;
    }
  }

  // ─── Geometry ────────────────────────────────────────────

  /** Simple V-shape bird silhouette — two flat triangles forming wings. */
  #createSilhouetteGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();
    const vertices = new Float32Array([
      // Left wing
      -1.8, 0.0, 0.0,
      -0.3, 0.15, 0.3,
       0.0, 0.0, -0.1,
      // Right wing
       1.8, 0.0, 0.0,
       0.3, 0.15, 0.3,
       0.0, 0.0, -0.1,
    ]);
    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    return geo;
  }
}
