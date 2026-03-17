import * as THREE from 'three';

/**
 * BirdSystem — tiny dark silhouettes circling lazily high in the sky.
 * 3-5 birds at a time, slow orbits, Ghibli "living world" feel.
 */

const MAX_BIRDS = 5;

interface Bird {
  /** Center of the orbit circle (world space). */
  orbitCenter: THREE.Vector3;
  /** Orbit radius. */
  orbitRadius: number;
  /** Current angle around the orbit. */
  angle: number;
  /** Orbit speed (radians/sec). */
  speed: number;
  /** Height above orbit center. */
  height: number;
  /** Vertical bob phase. */
  bobPhase: number;
  /** Wing flap phase. */
  flapPhase: number;
  /** Size of this bird. */
  size: number;
}

export class BirdSystem {
  readonly #group = new THREE.Group();
  readonly #birds: Bird[] = [];
  readonly #meshes: THREE.Mesh[] = [];
  readonly #material: THREE.MeshBasicMaterial;
  readonly #wingGeo: THREE.BufferGeometry;
  #time = 0;

  constructor(scene: THREE.Scene) {
    // Dark silhouette material — no lighting needed
    this.#material = new THREE.MeshBasicMaterial({
      color: 0x1a1e24,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.7,
      depthWrite: false,
    });

    // Bird shape — simple V/chevron from two triangles (wings)
    this.#wingGeo = this.#createBirdGeometry();

    for (let i = 0; i < MAX_BIRDS; i++) {
      const mesh = new THREE.Mesh(this.#wingGeo, this.#material);
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      this.#group.add(mesh);
      this.#meshes.push(mesh);

      this.#birds.push({
        orbitCenter: new THREE.Vector3(0, 0, 0),
        orbitRadius: 30 + Math.random() * 40,
        angle: Math.random() * Math.PI * 2,
        speed: 0.15 + Math.random() * 0.12,
        height: 28 + Math.random() * 18,
        bobPhase: Math.random() * Math.PI * 2,
        flapPhase: Math.random() * Math.PI * 2,
        size: 0.4 + Math.random() * 0.3,
      });
    }

    scene.add(this.#group);
  }

  update(dt: number, cameraPosition: THREE.Vector3): void {
    this.#time += dt;

    for (let i = 0; i < this.#birds.length; i++) {
      const bird = this.#birds[i]!;
      const mesh = this.#meshes[i]!;

      // Slowly drift orbit center toward camera (birds follow the player loosely)
      bird.orbitCenter.lerp(cameraPosition, 0.003);

      // Advance orbit
      bird.angle += bird.speed * dt;

      // Position on circular orbit
      const x = bird.orbitCenter.x + Math.cos(bird.angle) * bird.orbitRadius;
      const z = bird.orbitCenter.z + Math.sin(bird.angle) * bird.orbitRadius;
      // Gentle vertical bob
      const bob = Math.sin(this.#time * 0.6 + bird.bobPhase) * 1.5;
      const y = bird.orbitCenter.y + bird.height + bob;

      mesh.position.set(x, y, z);

      // Face the direction of travel (tangent to orbit)
      const tangentX = -Math.sin(bird.angle);
      const tangentZ = Math.cos(bird.angle);
      mesh.rotation.y = Math.atan2(tangentX, tangentZ);

      // Wing flap — tilt the mesh on X axis (subtle, lazy)
      const flap = Math.sin(this.#time * 3.2 + bird.flapPhase) * 0.25;
      mesh.rotation.x = flap;

      // Occasional banking on turns
      mesh.rotation.z = Math.sin(bird.angle * 2 + bird.bobPhase) * 0.15;

      mesh.scale.setScalar(bird.size);
    }
  }

  dispose(): void {
    this.#wingGeo.dispose();
    this.#material.dispose();
    this.#group.removeFromParent();
  }

  /** Simple V-shape bird silhouette — two flat triangles forming wings. */
  #createBirdGeometry(): THREE.BufferGeometry {
    const geo = new THREE.BufferGeometry();

    // V-shape: center body, two wings angled down slightly
    //    L wing tip --- body --- R wing tip
    const vertices = new Float32Array([
      // Left wing
      -1.8, 0.0, 0.0,   // left tip
      -0.3, 0.15, 0.3,  // body left
       0.0, 0.0, -0.1,  // body center

      // Right wing
       1.8, 0.0, 0.0,   // right tip
       0.3, 0.15, 0.3,  // body right
       0.0, 0.0, -0.1,  // body center
    ]);

    geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geo.computeVertexNormals();
    return geo;
  }
}
