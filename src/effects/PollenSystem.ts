import * as THREE from 'three';

/**
 * PollenSystem — ambient floating particles (pollen by day, fireflies at dusk/night).
 * Creates a dreamy, Ghibli-like atmosphere with drifting luminous specks.
 */

const CAPACITY = 80;
const SPAWN_RADIUS = 40;
const SPAWN_HEIGHT_MIN = 0.5;
const SPAWN_HEIGHT_MAX = 8;

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  maxLife: number;
  phase: number;
  size: number;
}

export class PollenSystem {
  readonly #points: THREE.Points;
  readonly #geometry: THREE.BufferGeometry;
  readonly #material: THREE.PointsMaterial;
  readonly #particles: Particle[] = [];
  readonly #positions: Float32Array;
  readonly #sizes: Float32Array;
  #time = 0;
  #spawnTimer = 0;

  constructor(scene: THREE.Scene) {
    this.#positions = new Float32Array(CAPACITY * 3);
    this.#sizes = new Float32Array(CAPACITY);

    this.#geometry = new THREE.BufferGeometry();
    this.#geometry.setAttribute('position', new THREE.BufferAttribute(this.#positions, 3));
    this.#geometry.setAttribute('size', new THREE.BufferAttribute(this.#sizes, 1));

    this.#material = new THREE.PointsMaterial({
      color: 0xfff8d0,
      size: 0.3,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      sizeAttenuation: true,
    });

    this.#points = new THREE.Points(this.#geometry, this.#material);
    this.#points.frustumCulled = false;
    scene.add(this.#points);
  }

  get activeCount(): number {
    return this.#particles.length;
  }

  update(dt: number, cameraPosition: THREE.Vector3, sunIntensity: number): void {
    this.#time += dt;

    // Nighttime = fireflies (warmer, brighter), daytime = pollen (white, subtle)
    const darkness = 1 - Math.min(sunIntensity / 2.0, 1);
    if (darkness > 0.5) {
      // Firefly mode — warm yellow-green
      this.#material.color.setHex(0xc8e848);
      this.#material.opacity = 0.7 + darkness * 0.3;
      this.#material.size = 0.4;
    } else {
      // Pollen mode — soft white-gold
      this.#material.color.setHex(0xfff8d0);
      this.#material.opacity = 0.4 + (1 - darkness) * 0.15;
      this.#material.size = 0.25;
    }

    // Spawn particles near camera
    this.#spawnTimer += dt;
    const spawnInterval = darkness > 0.5 ? 0.12 : 0.08;
    while (this.#spawnTimer >= spawnInterval && this.#particles.length < CAPACITY) {
      this.#spawnTimer -= spawnInterval;
      this.#spawn(cameraPosition, darkness);
    }

    // Update existing particles
    let writeIndex = 0;
    for (let i = 0; i < this.#particles.length; i++) {
      const p = this.#particles[i]!;
      p.life += dt;
      if (p.life >= p.maxLife) continue;

      // Gentle drift — sine-based floating
      const t = p.life / p.maxLife;
      const drift = Math.sin(this.#time * 0.8 + p.phase) * 0.3;
      const lift = Math.sin(this.#time * 0.5 + p.phase * 1.3) * 0.15;
      p.position.x += (p.velocity.x + drift) * dt;
      p.position.y += (p.velocity.y + lift) * dt;
      p.position.z += (p.velocity.z + drift * 0.7) * dt;

      // Fade in/out
      const fade = t < 0.15 ? t / 0.15 : t > 0.75 ? (1 - t) / 0.25 : 1;

      // Firefly blink at night
      const blink = darkness > 0.5
        ? 0.3 + 0.7 * Math.max(0, Math.sin(this.#time * 3.5 + p.phase * 5))
        : 1;

      this.#positions[writeIndex * 3] = p.position.x;
      this.#positions[writeIndex * 3 + 1] = p.position.y;
      this.#positions[writeIndex * 3 + 2] = p.position.z;
      this.#sizes[writeIndex] = p.size * fade * blink;

      this.#particles[writeIndex] = p;
      writeIndex++;
    }
    this.#particles.length = writeIndex;

    // Zero out unused slots
    for (let i = writeIndex; i < CAPACITY; i++) {
      this.#positions[i * 3] = 0;
      this.#positions[i * 3 + 1] = -1000;
      this.#positions[i * 3 + 2] = 0;
      this.#sizes[i] = 0;
    }

    (this.#geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (this.#geometry.attributes.size as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.#geometry.dispose();
    this.#material.dispose();
    this.#points.removeFromParent();
  }

  #spawn(cameraPos: THREE.Vector3, darkness: number): void {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * SPAWN_RADIUS;
    const height = SPAWN_HEIGHT_MIN + Math.random() * (SPAWN_HEIGHT_MAX - SPAWN_HEIGHT_MIN);

    this.#particles.push({
      position: new THREE.Vector3(
        cameraPos.x + Math.cos(angle) * dist,
        cameraPos.y + height - 2,
        cameraPos.z + Math.sin(angle) * dist,
      ),
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 0.4,
        (Math.random() - 0.3) * 0.15,
        (Math.random() - 0.5) * 0.4,
      ),
      life: 0,
      maxLife: 4 + Math.random() * 6,
      phase: Math.random() * Math.PI * 2,
      size: darkness > 0.5
        ? 0.15 + Math.random() * 0.25  // fireflies — varied size
        : 0.08 + Math.random() * 0.12, // pollen — small and uniform
    });
  }
}
