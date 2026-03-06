import * as THREE from 'three';

export class ObjectiveBeacon {
  readonly group = new THREE.Group();
  readonly #beamMaterial: THREE.MeshBasicMaterial;
  readonly #ringMaterial: THREE.MeshBasicMaterial;
  readonly #coreMaterial: THREE.MeshStandardMaterial;
  readonly #pulseRing: THREE.Mesh;
  readonly #light: THREE.PointLight;
  #time = 0;

  constructor(scene: THREE.Scene, position: THREE.Vector3) {
    this.group.position.copy(position);

    const baseMaterial = new THREE.MeshStandardMaterial({
      color: 0x3c2c22,
      roughness: 0.92,
      metalness: 0.08,
    });

    const base = new THREE.Mesh(new THREE.CylinderGeometry(7.8, 9.8, 1.4, 8), baseMaterial);
    base.position.y = 0.7;
    base.receiveShadow = true;
    base.castShadow = true;
    this.group.add(base);

    for (let index = 0; index < 3; index += 1) {
      const angle = (index / 3) * Math.PI * 2;
      const leg = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 5.8, 0.5),
        baseMaterial,
      );
      leg.position.set(Math.cos(angle) * 2.6, 3.3, Math.sin(angle) * 2.6);
      leg.castShadow = true;
      this.group.add(leg);
    }

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.36, 0.44, 8.2, 10),
      new THREE.MeshStandardMaterial({
        color: 0x4d3a2a,
        roughness: 0.7,
        metalness: 0.18,
      }),
    );
    mast.position.y = 5.3;
    mast.castShadow = true;
    this.group.add(mast);

    this.#coreMaterial = new THREE.MeshStandardMaterial({
      color: 0xffd899,
      emissive: 0xff9f4a,
      emissiveIntensity: 2.2,
      roughness: 0.28,
      metalness: 0.04,
    });
    const core = new THREE.Mesh(new THREE.SphereGeometry(1.1, 18, 18), this.#coreMaterial);
    core.position.y = 9.7;
    this.group.add(core);

    this.#beamMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb85d,
      transparent: true,
      opacity: 0.26,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(1.3, 4.8, 28, 18, 1, true),
      this.#beamMaterial,
    );
    beam.position.y = 19.5;
    this.group.add(beam);

    this.#ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd08a,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const groundRing = new THREE.Mesh(
      new THREE.TorusGeometry(11.5, 0.28, 10, 72),
      this.#ringMaterial,
    );
    groundRing.rotation.x = Math.PI / 2;
    groundRing.position.y = 0.48;
    this.group.add(groundRing);

    this.#pulseRing = new THREE.Mesh(
      new THREE.TorusGeometry(7.5, 0.16, 10, 64),
      this.#ringMaterial.clone(),
    );
    this.#pulseRing.rotation.x = Math.PI / 2;
    this.#pulseRing.position.y = 0.72;
    this.group.add(this.#pulseRing);

    this.#light = new THREE.PointLight(0xffb665, 16, 150, 2);
    this.#light.position.y = 9.8;
    this.group.add(this.#light);

    scene.add(this.group);
  }

  update(dt: number, completed: boolean): void {
    this.#time += dt;
    const pulse = 0.5 + 0.5 * Math.sin(this.#time * 2.4);
    const completionBoost = completed ? 0.45 : 0;
    this.#beamMaterial.opacity = 0.22 + pulse * 0.12 + completionBoost * 0.1;
    this.#ringMaterial.opacity = 0.48 + pulse * 0.28 + completionBoost * 0.08;
    this.#coreMaterial.emissiveIntensity = 2.1 + pulse * 1.6 + completionBoost * 1.2;
    this.#light.intensity = 14 + pulse * 10 + completionBoost * 12;

    const scale = 0.88 + pulse * 0.34 + completionBoost * 0.12;
    this.#pulseRing.scale.setScalar(scale);
    this.#pulseRing.position.y = 0.62 + pulse * 0.2;
    this.#pulseRing.rotation.z += dt * 0.35;
  }
}
