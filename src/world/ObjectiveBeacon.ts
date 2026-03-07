import * as THREE from 'three';

interface ObjectiveBeaconOptions {
  objective?: boolean;
  accentColor?: THREE.ColorRepresentation;
}

interface AuxiliaryLight {
  light: THREE.PointLight;
  baseIntensity: number;
  pulseIntensity: number;
  completionBoost: number;
  phase: number;
}

function createLink(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const delta = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, delta.length(), 6),
    material,
  );
  mesh.position.copy(start).lerp(end, 0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  mesh.castShadow = true;
  return mesh;
}

export class ObjectiveBeacon {
  readonly group = new THREE.Group();
  readonly #isObjective: boolean;
  readonly #beamMaterial: THREE.MeshBasicMaterial | null;
  readonly #ringMaterial: THREE.MeshBasicMaterial | null;
  readonly #windowMaterial: THREE.MeshStandardMaterial;
  readonly #lanternMaterial: THREE.MeshStandardMaterial;
  readonly #pulseRing: THREE.Mesh | null;
  readonly #light: THREE.PointLight;
  readonly #auxLights: AuxiliaryLight[] = [];
  #streamingActivity = 1;
  #time = 0;
  #completionTime = 0;

  constructor(
    scene: THREE.Scene,
    position: THREE.Vector3,
    options: ObjectiveBeaconOptions = {},
  ) {
    this.#isObjective = options.objective ?? false;
    this.group.position.copy(position);
    this.group.rotation.y = (position.x * 0.012 + position.z * 0.004) % (Math.PI * 2);
    this.group.scale.setScalar(this.#isObjective ? 1.08 : 0.82);

    const accent = new THREE.Color(
      options.accentColor ?? (this.#isObjective ? 0xffbd78 : 0xf0d39a),
    );
    const concreteMaterial = new THREE.MeshStandardMaterial({
      color: 0x76716b,
      roughness: 0.98,
      metalness: 0.03,
    });
    const heavyConcreteMaterial = new THREE.MeshStandardMaterial({
      color: 0x5f5a54,
      roughness: 0.96,
      metalness: 0.02,
    });
    const steelMaterial = new THREE.MeshStandardMaterial({
      color: 0x444a4d,
      roughness: 0.7,
      metalness: 0.66,
    });
    const weatheredSteelMaterial = new THREE.MeshStandardMaterial({
      color: 0x2a2f33,
      roughness: 0.58,
      metalness: 0.48,
    });
    const darkPanelMaterial = new THREE.MeshStandardMaterial({
      color: 0x171b1e,
      roughness: 0.5,
      metalness: 0.36,
    });
    this.#windowMaterial = new THREE.MeshStandardMaterial({
      color: 0xffefcf,
      emissive: accent.clone().multiplyScalar(0.72),
      emissiveIntensity: this.#isObjective ? 1.55 : 1.08,
      roughness: 0.32,
      metalness: 0.08,
    });
    this.#lanternMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff1c8,
      emissive: accent,
      emissiveIntensity: this.#isObjective ? 2.6 : 1.7,
      roughness: 0.2,
      metalness: 0.06,
    });

    const box = (
      width: number,
      height: number,
      depth: number,
      material: THREE.Material,
      positionVector: THREE.Vector3,
      rotation?: THREE.Euler,
      receiveShadow = true,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material,
      );
      mesh.position.copy(positionVector);
      if (rotation) {
        mesh.rotation.copy(rotation);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = receiveShadow;
      this.group.add(mesh);
      return mesh;
    };

    const addAuxLight = (
      positionVector: THREE.Vector3,
      color: THREE.ColorRepresentation,
      distance: number,
      baseIntensity: number,
      pulseIntensity: number,
      completionBoost: number,
    ): void => {
      const light = new THREE.PointLight(color, baseIntensity, distance, 2);
      light.position.copy(positionVector);
      this.group.add(light);
      this.#auxLights.push({
        light,
        baseIntensity,
        pulseIntensity,
        completionBoost,
        phase: positionVector.x * 0.41 + positionVector.z * 0.17,
      });
    };

    box(10.2, 1.6, 10.2, heavyConcreteMaterial, new THREE.Vector3(0, 0.8, 0));
    box(8.9, 0.32, 8.9, steelMaterial, new THREE.Vector3(0, 1.78, 0));

    box(6.4, 3.3, 5.8, concreteMaterial, new THREE.Vector3(-0.3, 3.62, -0.1));

    const supportOffsets = [
      new THREE.Vector3(-3.45, 2.6, 2.95),
      new THREE.Vector3(2.95, 2.6, 2.95),
      new THREE.Vector3(-3.45, 2.6, -3.0),
      new THREE.Vector3(2.95, 2.6, -3.0),
    ];
    for (const supportOffset of supportOffsets) {
      box(1.1, 3.6, 1.1, heavyConcreteMaterial, supportOffset);
    }

    box(
      this.#isObjective ? 4.5 : 4.1,
      this.#isObjective ? 5.4 : 4.2,
      4.0,
      concreteMaterial,
      new THREE.Vector3(0.58, this.#isObjective ? 6.9 : 5.98, -0.46),
    );
    box(
      this.#isObjective ? 7.1 : 6.3,
      0.38,
      this.#isObjective ? 5.4 : 4.9,
      heavyConcreteMaterial,
      new THREE.Vector3(1.16, this.#isObjective ? 9.82 : 8.06, -0.34),
    );
    box(
      2.4,
      0.32,
      this.#isObjective ? 4.2 : 3.8,
      weatheredSteelMaterial,
      new THREE.Vector3(3.86, this.#isObjective ? 7.2 : 6.12, -0.2),
    );
    box(2.2, 1.7, 2.1, heavyConcreteMaterial, new THREE.Vector3(-2.62, 5.2, -1.82));
    box(
      0.2,
      this.#isObjective ? 4.9 : 3.7,
      2.5,
      steelMaterial,
      new THREE.Vector3(2.74, this.#isObjective ? 6.84 : 5.92, -2.36),
    );

    const wallSpecs = [
      { size: [8.0, 1.55, 0.72], position: new THREE.Vector3(-0.64, 1.36, -4.52) },
      { size: [0.72, 1.6, 7.9], position: new THREE.Vector3(-4.48, 1.38, -0.18) },
      { size: [0.72, 1.32, 4.35], position: new THREE.Vector3(4.48, 1.1, -2.15) },
    ] as const;
    for (const wall of wallSpecs) {
      box(
        wall.size[0],
        wall.size[1],
        wall.size[2],
        heavyConcreteMaterial,
        wall.position,
      );
    }

    for (let index = 0; index < 4; index += 1) {
      box(
        1.86 - index * 0.12,
        0.24,
        1.12,
        heavyConcreteMaterial,
        new THREE.Vector3(2.72, 0.16 + index * 0.24, 4.9 - index * 0.92),
      );
    }
    box(1.9, 0.3, 1.44, heavyConcreteMaterial, new THREE.Vector3(2.54, 1.18, 1.96));

    const barrierOffsets = [-2.9, -1.7, -0.5];
    for (const x of barrierOffsets) {
      box(1.02, 0.72, 0.62, heavyConcreteMaterial, new THREE.Vector3(x, 1.1, 4.56));
      box(0.42, 0.14, 0.64, weatheredSteelMaterial, new THREE.Vector3(x, 1.44, 4.56));
    }

    box(0.94, 2.88, 0.66, heavyConcreteMaterial, new THREE.Vector3(-3.08, 2.22, 4.04));
    box(0.62, 1.4, 0.1, darkPanelMaterial, new THREE.Vector3(-3.08, 2.34, 4.42), undefined, false);
    box(0.44, 0.12, 0.12, this.#windowMaterial, new THREE.Vector3(-3.08, 2.74, 4.5), undefined, false);

    const frontSlitPositions = this.#isObjective ? [-1.0, -0.1, 0.8, 1.7] : [-0.88, 0.08, 1.04];
    for (const x of frontSlitPositions) {
      box(
        0.48,
        this.#isObjective ? 1.12 : 0.88,
        0.08,
        this.#windowMaterial,
        new THREE.Vector3(x, this.#isObjective ? 6.92 : 5.92, 1.58),
        undefined,
        false,
      );
    }

    box(
      0.08,
      this.#isObjective ? 0.9 : 0.74,
      1.72,
      this.#windowMaterial,
      new THREE.Vector3(-2.36, this.#isObjective ? 6.55 : 5.56, -0.42),
      undefined,
      false,
    );
    box(0.94, 1.86, 0.08, darkPanelMaterial, new THREE.Vector3(2.36, 5.18, 1.58), undefined, false);
    box(1.34, 2.16, 0.16, weatheredSteelMaterial, new THREE.Vector3(2.36, 5.18, 1.5), undefined, false);
    box(1.38, 0.4, 0.14, weatheredSteelMaterial, new THREE.Vector3(0.62, this.#isObjective ? 9.1 : 7.42, 1.98));

    const floodlightPosts = [
      new THREE.Vector3(-4.12, 3.0, 3.54),
      new THREE.Vector3(4.06, 3.0, 3.14),
    ];
    for (const post of floodlightPosts) {
      box(0.22, 2.9, 0.22, weatheredSteelMaterial, post);
      const head = box(
        0.72,
        0.42,
        0.52,
        darkPanelMaterial,
        new THREE.Vector3(post.x, post.y + 1.64, post.z + 0.16),
      );
      head.rotation.x = -0.18;
      box(
        0.44,
        0.14,
        0.12,
        this.#windowMaterial,
        new THREE.Vector3(post.x, post.y + 1.56, post.z + 0.44),
        new THREE.Euler(-0.18, 0, 0),
        false,
      );
      addAuxLight(
        new THREE.Vector3(post.x, post.y + 1.36, post.z + 0.78),
        accent.clone().lerp(new THREE.Color(0xfff0c8), 0.22),
        this.#isObjective ? 34 : 24,
        this.#isObjective ? 1.55 : 1.05,
        0.42,
        this.#isObjective ? 1.3 : 0.4,
      );
    }

    box(0.96, 1.36, 0.88, weatheredSteelMaterial, new THREE.Vector3(-3.44, 2.48, -3.66));
    box(1.08, 1.12, 0.84, weatheredSteelMaterial, new THREE.Vector3(-1.94, 2.36, -4.0));
    box(0.92, 0.22, 0.12, this.#windowMaterial, new THREE.Vector3(-1.94, 2.76, -3.54), undefined, false);

    const beaconBaseY = this.#isObjective ? 12.4 : 9.96;
    const mastHeight = this.#isObjective ? 5.6 : 4.1;
    box(0.42, mastHeight, 0.34, weatheredSteelMaterial, new THREE.Vector3(1.48, beaconBaseY + mastHeight * 0.5, -1.12));
    box(
      this.#isObjective ? 1.66 : 1.38,
      this.#isObjective ? 1.28 : 1.06,
      this.#isObjective ? 1.66 : 1.38,
      darkPanelMaterial,
      new THREE.Vector3(1.48, beaconBaseY + mastHeight + 0.3, -1.12),
    );
    box(
      this.#isObjective ? 0.88 : 0.72,
      this.#isObjective ? 0.88 : 0.68,
      this.#isObjective ? 0.88 : 0.72,
      this.#lanternMaterial,
      new THREE.Vector3(1.48, beaconBaseY + mastHeight + 0.3, -1.12),
      undefined,
      false,
    );
    box(
      0.12,
      this.#isObjective ? 1.8 : 1.4,
      1.06,
      steelMaterial,
      new THREE.Vector3(0.74, beaconBaseY + mastHeight + 0.3, -1.12),
    );
    box(
      0.12,
      this.#isObjective ? 1.8 : 1.4,
      1.06,
      steelMaterial,
      new THREE.Vector3(2.22, beaconBaseY + mastHeight + 0.3, -1.12),
    );
    box(
      this.#isObjective ? 2.26 : 1.94,
      0.18,
      this.#isObjective ? 2.26 : 1.94,
      steelMaterial,
      new THREE.Vector3(1.48, beaconBaseY + mastHeight + (this.#isObjective ? 0.96 : 0.82), -1.12),
    );

    const conduitRuns = [
      [
        new THREE.Vector3(-3.44, 3.26, -3.28),
        new THREE.Vector3(-0.88, 5.96, -2.08),
      ],
      [
        new THREE.Vector3(-1.94, 2.94, -3.64),
        new THREE.Vector3(1.14, beaconBaseY + 2.1, -1.22),
      ],
      [
        new THREE.Vector3(-2.12, 5.92, -1.66),
        new THREE.Vector3(1.38, beaconBaseY + 0.96, -1.18),
      ],
    ] as const;
    for (const [start, end] of conduitRuns) {
      this.group.add(createLink(start, end, 0.08, weatheredSteelMaterial));
    }

    box(0.36, 1.64, 0.36, weatheredSteelMaterial, new THREE.Vector3(3.72, 2.16, -4.04));
    box(0.9, 0.3, 1.02, darkPanelMaterial, new THREE.Vector3(3.72, 3.04, -3.72));
    box(0.52, 0.1, 0.12, this.#windowMaterial, new THREE.Vector3(3.72, 3.02, -3.14), undefined, false);
    addAuxLight(
      new THREE.Vector3(3.72, 2.92, -3.06),
      accent.clone().lerp(new THREE.Color(0xfff0c8), 0.16),
      this.#isObjective ? 30 : 20,
      this.#isObjective ? 1.1 : 0.68,
      0.36,
      this.#isObjective ? 1.0 : 0.26,
    );

    const signalY = beaconBaseY + mastHeight + 0.3;
    const signalX = 1.48;
    const signalZ = -1.12;

    this.#light = new THREE.PointLight(
      accent.getHex(),
      this.#isObjective ? 14 : 7.5,
      this.#isObjective ? 110 : 72,
      2,
    );
    this.#light.position.set(signalX, signalY, signalZ);
    this.group.add(this.#light);

    if (this.#isObjective) {
      this.#beamMaterial = new THREE.MeshBasicMaterial({
        color: accent,
        transparent: true,
        opacity: 0.18,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        side: THREE.DoubleSide,
      });
      const beam = new THREE.Mesh(
        new THREE.CylinderGeometry(1.4, 4.2, 24, 16, 1, true),
        this.#beamMaterial,
      );
      beam.position.set(signalX, 24.2, signalZ);
      this.group.add(beam);

      this.#ringMaterial = new THREE.MeshBasicMaterial({
        color: accent.clone().lerp(new THREE.Color(0xfff0c8), 0.22),
        transparent: true,
        opacity: 0.68,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const groundRing = new THREE.Mesh(
        new THREE.TorusGeometry(12.2, 0.24, 10, 72),
        this.#ringMaterial,
      );
      groundRing.rotation.x = Math.PI / 2;
      groundRing.position.y = 0.46;
      this.group.add(groundRing);

      this.#pulseRing = new THREE.Mesh(
        new THREE.TorusGeometry(8.6, 0.14, 10, 64),
        this.#ringMaterial.clone(),
      );
      this.#pulseRing.rotation.x = Math.PI / 2;
      this.#pulseRing.position.y = 0.72;
      this.group.add(this.#pulseRing);
    } else {
      this.#beamMaterial = null;
      this.#ringMaterial = null;
      this.#pulseRing = null;
    }

    scene.add(this.group);
  }

  update(dt: number, completed: boolean): void {
    this.#time += dt;
    this.#completionTime = completed ? this.#completionTime + dt : 0;

    const activity = THREE.MathUtils.clamp(this.#streamingActivity, 0, 1.2);
    this.group.visible = activity > 0.03;

    const pulse = 0.5 + 0.5 * Math.sin(this.#time * (this.#isObjective ? 1.8 : 1.1));
    const shimmer = 0.5 + 0.5 * Math.sin(this.#time * 2.7 + this.group.position.x * 0.04);
    const hum = 0.5 + 0.5 * Math.sin(this.#time * 0.62 + this.group.position.z * 0.016);
    const completionRamp = completed ? Math.min(this.#completionTime / 1.25, 1) : 0;
    const completionBurst =
      completed
        ? completionRamp * (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.#completionTime * 9.2)))
        : 0;

    this.#windowMaterial.emissiveIntensity =
      ((this.#isObjective ? 1.42 : 0.98) + pulse * 0.55 + hum * 0.12 + completionBurst * 0.7)
      * activity;
    this.#lanternMaterial.emissiveIntensity =
      ((this.#isObjective ? 2.3 : 1.58) + pulse * 0.95 + shimmer * 0.24 + completionBurst * 1.25)
      * activity;
    this.#light.intensity =
      ((this.#isObjective ? 12 : 6.8)
        + pulse * (this.#isObjective ? 8.6 : 3.2)
        + shimmer * (this.#isObjective ? 1.8 : 0.72)
        + completionBurst * 15)
      * activity;

    for (const auxLight of this.#auxLights) {
      const localPulse =
        0.5 + 0.5 * Math.sin(this.#time * 1.6 + auxLight.phase);
      auxLight.light.intensity =
        (auxLight.baseIntensity
          + localPulse * auxLight.pulseIntensity
          + completionBurst * auxLight.completionBoost)
        * activity;
    }

    if (this.#beamMaterial && this.#ringMaterial && this.#pulseRing) {
      this.#beamMaterial.opacity =
        (0.16 + pulse * 0.09 + completionBurst * 0.22) * activity;
      this.#ringMaterial.opacity =
        (0.44 + pulse * 0.22 + completionBurst * 0.16) * activity;
      const scale = 0.9 + pulse * 0.26 + completionBurst * 0.34;
      this.#pulseRing.scale.setScalar(scale);
      this.#pulseRing.position.y = 0.62 + pulse * 0.18 + completionBurst * 0.42;
      this.#pulseRing.rotation.z += dt * (0.28 + completionBurst * 1.2);
    }
  }

  setStreamingActivity(activity: number): void {
    this.#streamingActivity = activity;
  }
}
