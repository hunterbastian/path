import * as THREE from 'three';

interface ParticleFieldOptions {
  capacity: number;
  color: THREE.ColorRepresentation;
  opacity: number;
  gravity: number;
  drag: number;
  fade: (lifeFraction: number) => number;
}

export interface ParticleSpawn {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
  size: number;
  growth: number;
  life: number;
}

interface ParticleRecord {
  alive: boolean;
  age: number;
  life: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  growth: number;
}

const PARK_Y = -1000;

export class SpriteParticleField {
  readonly #gravity: number;
  readonly #drag: number;
  readonly #fade: (lifeFraction: number) => number;
  readonly #particles: ParticleRecord[];
  readonly #positions: Float32Array;
  readonly #sizes: Float32Array;
  readonly #geometry: THREE.BufferGeometry;
  readonly #points: THREE.Points;
  #head = 0;
  #activeCount = 0;

  constructor(scene: THREE.Scene, options: ParticleFieldOptions) {
    this.#gravity = options.gravity;
    this.#drag = options.drag;
    this.#fade = options.fade;
    this.#positions = new Float32Array(options.capacity * 3);
    this.#sizes = new Float32Array(options.capacity);
    this.#particles = Array.from({ length: options.capacity }, () => ({
      alive: false,
      age: 0,
      life: 1,
      vx: 0,
      vy: 0,
      vz: 0,
      size: 0,
      growth: 0,
    }));

    for (let index = 0; index < options.capacity; index += 1) {
      this.#positions[index * 3 + 1] = PARK_Y;
      this.#sizes[index] = 0;
    }

    this.#geometry = new THREE.BufferGeometry();
    this.#geometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.#positions, 3),
    );
    this.#geometry.setAttribute(
      'aSize',
      new THREE.BufferAttribute(this.#sizes, 1),
    );

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(options.color) },
        uOpacity: { value: options.opacity },
      },
      vertexShader: /* glsl */ `
        attribute float aSize;

        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = clamp(aSize * (300.0 / max(-mvPosition.z, 0.1)), 1.0, 96.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform vec3 uColor;
        uniform float uOpacity;

        void main() {
          vec2 centered = gl_PointCoord - 0.5;
          float distanceSquared = dot(centered, centered);
          if (distanceSquared > 0.25) {
            discard;
          }

          float alpha = smoothstep(0.25, 0.0, distanceSquared) * uOpacity;
          gl_FragColor = vec4(uColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });

    this.#points = new THREE.Points(this.#geometry, material);
    this.#points.frustumCulled = false;
    scene.add(this.#points);
  }

  get activeCount(): number {
    return this.#activeCount;
  }

  emit(spawn: ParticleSpawn): void {
    const index = this.#head;
    this.#head = (this.#head + 1) % this.#particles.length;

    const particle = this.#particles[index];
    if (!particle) return;
    particle.alive = true;
    particle.age = 0;
    particle.life = spawn.life;
    particle.vx = spawn.velocity.x;
    particle.vy = spawn.velocity.y;
    particle.vz = spawn.velocity.z;
    particle.size = spawn.size;
    particle.growth = spawn.growth;

    const positionIndex = index * 3;
    this.#positions[positionIndex] = spawn.position.x;
    this.#positions[positionIndex + 1] = spawn.position.y;
    this.#positions[positionIndex + 2] = spawn.position.z;
    this.#sizes[index] = spawn.size;
  }

  update(dt: number): void {
    this.#activeCount = 0;

    for (let index = 0; index < this.#particles.length; index += 1) {
      const particle = this.#particles[index];
      if (!particle) continue;
      if (!particle.alive) continue;

      particle.age += dt;
      const lifeFraction = particle.age / particle.life;

      if (lifeFraction >= 1) {
        particle.alive = false;
        this.#positions[index * 3 + 1] = PARK_Y;
        this.#sizes[index] = 0;
        continue;
      }

      this.#activeCount += 1;

      particle.vy += this.#gravity * dt;
      particle.vx *= this.#drag;
      particle.vy *= this.#drag;
      particle.vz *= this.#drag;
      particle.size += particle.growth * dt;

      const positionIndex = index * 3;
      this.#positions[positionIndex] =
        (this.#positions[positionIndex] ?? 0) + particle.vx * dt;
      this.#positions[positionIndex + 1] =
        (this.#positions[positionIndex + 1] ?? 0) + particle.vy * dt;
      this.#positions[positionIndex + 2] =
        (this.#positions[positionIndex + 2] ?? 0) + particle.vz * dt;
      this.#sizes[index] = particle.size * Math.max(this.#fade(lifeFraction), 0);
    }

    (
      this.#geometry.attributes.position as THREE.BufferAttribute
    ).needsUpdate = true;
    (this.#geometry.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  dispose(): void {
    this.#geometry.dispose();
    const { material } = this.#points;
    if (Array.isArray(material)) {
      for (const entry of material) {
        entry.dispose();
      }
      return;
    }
    material.dispose();
  }
}
