import * as THREE from 'three';
import { expLerp } from '../core/math';
import { DrivingState } from './DrivingState';
import { VehicleDamage } from './VehicleDamage';
import { VEHICLE_WHEEL_OFFSETS } from './vehicleShared';

export interface VehicleOptions {
  scale?: number;
  bodyColor?: THREE.ColorRepresentation;
  roofColor?: THREE.ColorRepresentation;
  trimColor?: THREE.ColorRepresentation;
  markerColor?: THREE.ColorRepresentation;
  boostColor?: THREE.ColorRepresentation;
  headlightColor?: THREE.ColorRepresentation;
}

export class Vehicle {
  readonly mesh = new THREE.Group();
  readonly damage: VehicleDamage;
  readonly #bodyVisual = new THREE.Group();
  readonly #wheelMounts: THREE.Group[] = [];
  readonly #wheelMeshes: THREE.Mesh[] = [];
  readonly #boostStripMaterial: THREE.MeshStandardMaterial;
  readonly #sandBermMaterial: THREE.MeshStandardMaterial;
  readonly #sandBerms: THREE.Mesh[] = [];
  readonly #headlightMaterials: THREE.MeshStandardMaterial[] = [];
  readonly #headlights: Array<{
    light: THREE.SpotLight;
    baseIntensity: number;
    baseDistance: number;
  }> = [];
  readonly #brakeLightMaterials: THREE.MeshStandardMaterial[] = [];
  readonly #reverseLightMaterials: THREE.MeshStandardMaterial[] = [];
  readonly #speedLineMaterials: THREE.MeshBasicMaterial[] = [];
  readonly #speedLines: THREE.Mesh[] = [];
  readonly #bodyMaterial: THREE.MeshStandardMaterial;
  readonly #bodyBaseRoughness: number;
  readonly #bodyBaseMetalness: number;
  readonly #bodyBaseColor: THREE.Color;
  readonly #bodyDirtyColor = new THREE.Color(0x3a3530);
  #bodyRoll = 0;
  #bodyPitch = 0;
  #bodySink = 0;
  #bodyHeave = 0;
  #bodyHeaveVelocity = 0;
  #smoothedSpeedLineOpacity = 0;

  constructor(scene: THREE.Scene, options: VehicleOptions = {}, damage?: VehicleDamage) {
    this.damage = damage ?? new VehicleDamage(scene);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: options.bodyColor ?? 0x586859,
      roughness: 0.82,
      metalness: 0.18,
    });
    this.#bodyMaterial = bodyMaterial;
    this.#bodyBaseRoughness = bodyMaterial.roughness;
    this.#bodyBaseMetalness = bodyMaterial.metalness;
    this.#bodyBaseColor = bodyMaterial.color.clone();
    const roofMaterial = new THREE.MeshStandardMaterial({
      color: options.roofColor ?? 0xd0c7b3,
      roughness: 0.88,
      metalness: 0.06,
    });
    const metalMaterial = new THREE.MeshStandardMaterial({
      color: 0x484843,
      roughness: 0.62,
      metalness: 0.82,
    });
    const trimMaterial = new THREE.MeshStandardMaterial({
      color: options.trimColor ?? 0x88745a,
      roughness: 0.82,
      metalness: 0.16,
    });
    const plasticMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d2d28,
      roughness: 0.94,
      metalness: 0.04,
    });
    const glassMaterial = new THREE.MeshPhysicalMaterial({
      color: 0x9aabaf,
      roughness: 0.22,
      metalness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      opacity: 0.48,
      transparent: true,
    });
    const markerMaterial = new THREE.MeshStandardMaterial({
      color: options.markerColor ?? 0xc59552,
      emissive: options.markerColor ?? 0xffb15e,
      emissiveIntensity: 0.42,
      roughness: 0.34,
      metalness: 0.28,
    });
    const headlightColor = options.headlightColor ?? 0xf8f2df;
    const lightScale = options.scale ?? 1;
    this.#boostStripMaterial = new THREE.MeshStandardMaterial({
      color: options.boostColor ?? 0x954c33,
      emissive: options.boostColor ?? 0xff8f48,
      emissiveIntensity: 0.62,
      roughness: 0.42,
      metalness: 0.28,
    });
    this.#sandBermMaterial = new THREE.MeshStandardMaterial({
      color: 0xd6c18a,
      roughness: 0.96,
      metalness: 0.02,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });

    this.mesh.add(this.#bodyVisual);

    this.#bodyVisual.add(this.#box(bodyMaterial, [2.24, 0.76, 4.76], [0, 0.03, -0.04]));
    this.#bodyVisual.add(this.#box(metalMaterial, [1.92, 0.16, 4.58], [0, -0.33, 0.02]));
    this.#bodyVisual.add(this.#box(bodyMaterial, [1.88, 0.62, 2.82], [0, 0.68, -0.12]));
    this.#bodyVisual.add(this.#box(roofMaterial, [1.72, 0.16, 2.24], [0, 1.08, -0.12]));
    this.#bodyVisual.add(this.#box(bodyMaterial, [1.82, 0.24, 1.34], [0, 0.5, 1.46], [-0.09, 0, 0]));
    this.#bodyVisual.add(this.#box(plasticMaterial, [2.02, 0.18, 0.52], [0, -0.08, 2.13]));
    this.#bodyVisual.add(this.#box(plasticMaterial, [1.92, 0.18, 0.44], [0, -0.08, -2.18]));
    this.#bodyVisual.add(this.#box(trimMaterial, [1.18, 0.14, 0.26], [0, 0.34, 2.29]));
    this.#bodyVisual.add(this.#box(glassMaterial, [1.46, 0.48, 0.06], [0, 0.86, 0.72], [-0.54, 0, 0]));
    this.#bodyVisual.add(this.#box(glassMaterial, [1.32, 0.38, 0.06], [0, 0.84, -1.52], [0.28, 0, 0]));
    this.#bodyVisual.add(this.#box(glassMaterial, [0.06, 0.36, 1.58], [-0.9, 0.82, -0.12], [0, 0, -0.08]));
    this.#bodyVisual.add(this.#box(glassMaterial, [0.06, 0.36, 1.58], [0.9, 0.82, -0.12], [0, 0, 0.08]));
    this.#bodyVisual.add(this.#box(plasticMaterial, [0.3, 0.4, 0.84], [-0.98, 0.08, 1.16]));
    this.#bodyVisual.add(this.#box(plasticMaterial, [0.3, 0.4, 0.84], [0.98, 0.08, 1.16]));
    this.#bodyVisual.add(this.#box(plasticMaterial, [0.3, 0.4, 0.84], [-0.98, 0.08, -1.3]));
    this.#bodyVisual.add(this.#box(plasticMaterial, [0.3, 0.4, 0.84], [0.98, 0.08, -1.3]));
    this.#bodyVisual.add(this.#box(this.#boostStripMaterial, [0.92, 0.12, 0.12], [0, 0.34, -2.34]));
    this.#bodyVisual.add(this.#box(markerMaterial, [0.2, 0.1, 0.08], [-0.64, 0.35, 2.34]));
    this.#bodyVisual.add(this.#box(markerMaterial, [0.2, 0.1, 0.08], [0.64, 0.35, 2.34]));
    this.#addHeadlight([-0.56, 0.1, 2.33], headlightColor, lightScale);
    this.#addHeadlight([0.56, 0.1, 2.33], headlightColor, lightScale);

    // --- Brake lights (red, rear corners) ---
    this.#addTailLight([-0.78, 0.22, -2.36], 0xff2200, this.#brakeLightMaterials);
    this.#addTailLight([0.78, 0.22, -2.36], 0xff2200, this.#brakeLightMaterials);

    // --- Reverse lights (white, near brake lights) ---
    this.#addTailLight([-0.48, 0.22, -2.36], 0xeeeeff, this.#reverseLightMaterials);
    this.#addTailLight([0.48, 0.22, -2.36], 0xeeeeff, this.#reverseLightMaterials);

    // --- Speed lines (thin stretched meshes around the vehicle) ---
    this.#createSpeedLines();

    const brushGuard = new THREE.Group();
    brushGuard.position.set(0, 0.04, 2.4);
    brushGuard.add(this.#box(metalMaterial, [1.76, 0.08, 0.1], [0, -0.02, 0]));
    brushGuard.add(this.#box(metalMaterial, [1.48, 0.08, 0.1], [0, 0.18, -0.04]));
    brushGuard.add(this.#box(metalMaterial, [0.08, 0.38, 0.08], [-0.62, 0.14, -0.02]));
    brushGuard.add(this.#box(metalMaterial, [0.08, 0.38, 0.08], [0.62, 0.14, -0.02]));
    brushGuard.add(this.#box(metalMaterial, [0.08, 0.3, 0.08], [0, 0.11, -0.01]));
    this.#bodyVisual.add(brushGuard);

    const rack = new THREE.Group();
    rack.position.set(0, 1.18, -0.12);
    rack.add(this.#box(metalMaterial, [1.72, 0.06, 2.08], [0, 0, 0]));
    rack.add(this.#box(metalMaterial, [0.08, 0.26, 2.02], [-0.8, -0.1, 0]));
    rack.add(this.#box(metalMaterial, [0.08, 0.26, 2.02], [0.8, -0.1, 0]));
    rack.add(this.#box(trimMaterial, [0.68, 0.24, 0.72], [-0.28, 0.16, -0.34]));
    rack.add(this.#box(trimMaterial, [0.4, 0.18, 0.52], [0.42, 0.13, 0.26]));
    rack.add(this.#cylinder(trimMaterial, 0.11, 0.62, [0.52, 0.12, -0.44], [0, 0, Math.PI / 2]));
    this.#bodyVisual.add(rack);

    const sliderLeftGroup = new THREE.Group();
    sliderLeftGroup.add(this.#box(metalMaterial, [0.14, 0.14, 2.84], [-1.08, -0.12, -0.08]));
    this.#bodyVisual.add(sliderLeftGroup);

    const sliderRightGroup = new THREE.Group();
    sliderRightGroup.add(this.#box(metalMaterial, [0.14, 0.14, 2.84], [1.08, -0.12, -0.08]));
    this.#bodyVisual.add(sliderRightGroup);

    const spareGroup = new THREE.Group();
    spareGroup.position.set(0, 0.7, -2.38);
    const spareWheel = this.#wheel(metalMaterial);
    spareWheel.scale.setScalar(0.82);
    spareWheel.rotation.y = Math.PI / 2;
    spareGroup.add(spareWheel);
    this.#bodyVisual.add(spareGroup);

    const antennaGroup = new THREE.Group();
    antennaGroup.add(this.#cylinder(metalMaterial, 0.02, 0.94, [-0.72, 1.42, -1.18], [0.06, 0, 0]));
    this.#bodyVisual.add(antennaGroup);

    this.damage.registerPart({
      name: 'brushGuard',
      group: brushGuard,
      parent: this.#bodyVisual,
      health: 1,
      fragility: 0.18,
      detachThreshold: 4,
      directionalBias: new THREE.Vector3(0, 0, 1),
      directionalWeight: 0.7,
    });
    this.damage.registerPart({
      name: 'roofRack',
      group: rack,
      parent: this.#bodyVisual,
      health: 1,
      fragility: 0.12,
      detachThreshold: 6,
      directionalBias: new THREE.Vector3(0, -1, 0),
      directionalWeight: 0.5,
    });
    this.damage.registerPart({
      name: 'spareTire',
      group: spareGroup,
      parent: this.#bodyVisual,
      health: 1,
      fragility: 0.15,
      detachThreshold: 5,
      directionalBias: new THREE.Vector3(0, 0, -1),
      directionalWeight: 0.6,
    });
    this.damage.registerPart({
      name: 'antenna',
      group: antennaGroup,
      parent: this.#bodyVisual,
      health: 1,
      fragility: 0.35,
      detachThreshold: 2.5,
      directionalBias: new THREE.Vector3(0, 0, 0),
      directionalWeight: 0,
    });
    this.damage.registerPart({
      name: 'sliderLeft',
      group: sliderLeftGroup,
      parent: this.#bodyVisual,
      health: 1,
      fragility: 0.14,
      detachThreshold: 5,
      directionalBias: new THREE.Vector3(-1, 0, 0),
      directionalWeight: 0.65,
    });
    this.damage.registerPart({
      name: 'sliderRight',
      group: sliderRightGroup,
      parent: this.#bodyVisual,
      health: 1,
      fragility: 0.14,
      detachThreshold: 5,
      directionalBias: new THREE.Vector3(1, 0, 0),
      directionalWeight: 0.65,
    });

    const bermGeometry = new THREE.SphereGeometry(0.52, 14, 10);
    const bermConfigs = [
      {
        position: new THREE.Vector3(-0.92, -0.54, 1.26),
        scale: new THREE.Vector3(1.2, 0.4, 1),
      },
      {
        position: new THREE.Vector3(0.92, -0.54, 1.26),
        scale: new THREE.Vector3(1.2, 0.4, 1),
      },
      {
        position: new THREE.Vector3(-0.92, -0.54, -1.2),
        scale: new THREE.Vector3(1.14, 0.36, 0.96),
      },
      {
        position: new THREE.Vector3(0.92, -0.54, -1.2),
        scale: new THREE.Vector3(1.14, 0.36, 0.96),
      },
      {
        position: new THREE.Vector3(0, -0.62, 0.12),
        scale: new THREE.Vector3(1.55, 0.32, 1.9),
      },
    ];

    for (const config of bermConfigs) {
      const berm = new THREE.Mesh(bermGeometry, this.#sandBermMaterial);
      berm.position.copy(config.position);
      berm.scale.copy(config.scale).multiplyScalar(0.2);
      berm.visible = false;
      berm.castShadow = false;
      berm.receiveShadow = true;
      berm.userData.basePosition = config.position.clone();
      berm.userData.baseScale = config.scale.clone();
      this.#sandBerms.push(berm);
      this.mesh.add(berm);
    }

    const wheelNames = ['wheelFL', 'wheelFR', 'wheelRL', 'wheelRR'] as const;
    for (let i = 0; i < VEHICLE_WHEEL_OFFSETS.length; i++) {
      const offset = VEHICLE_WHEEL_OFFSETS[i]!;
      const mount = new THREE.Group();
      mount.position.copy(offset);
      const tire = this.#wheel(metalMaterial);
      mount.add(tire);
      this.#wheelMounts.push(mount);
      this.#wheelMeshes.push(tire);
      this.mesh.add(mount);

      this.damage.registerPart({
        name: wheelNames[i]!,
        group: mount,
        parent: this.mesh,
        health: 1,
        fragility: 0.08,
        detachThreshold: 8,
        directionalBias: new THREE.Vector3(
          offset.x > 0 ? 1 : -1,
          -0.5,
          offset.z > 0 ? 0.3 : -0.3,
        ).normalize(),
        directionalWeight: 0.4,
      });
    }

    if (options.scale && options.scale !== 1) {
      this.mesh.scale.setScalar(options.scale);
    }

    scene.add(this.mesh);
  }

  setPose(position: THREE.Vector3, quaternion: THREE.Quaternion): void {
    this.mesh.position.copy(position);
    this.mesh.quaternion.copy(quaternion);
  }

  get missingWheelTilt(): { roll: number; pitch: number } {
    const fl = this.damage.isPartAttached('wheelFL') ? 0 : 1;
    const fr = this.damage.isPartAttached('wheelFR') ? 0 : 1;
    const rl = this.damage.isPartAttached('wheelRL') ? 0 : 1;
    const rr = this.damage.isPartAttached('wheelRR') ? 0 : 1;
    const roll = (fr + rr - fl - rl) * 0.12;
    const pitch = (fl + fr - rl - rr) * 0.08;
    return { roll, pitch };
  }

  updateVisuals(dt: number, state: DrivingState): void {
    const spin = (state.forwardSpeed / 0.48) * dt;
    for (const wheel of this.#wheelMeshes) {
      wheel.rotation.x += spin;
    }

    const frontLeft = this.#wheelMounts[0];
    const frontRight = this.#wheelMounts[1];
    if (frontLeft) frontLeft.rotation.y = state.steering * 0.48;
    if (frontRight) frontRight.rotation.y = state.steering * 0.48;

    const targetRoll = THREE.MathUtils.clamp(
      -state.lateralSpeed * 0.032
        - state.steering * state.speed * 0.003,
      -0.18, 0.18,
    );
    const brakeDive = state.isBraking ? -0.09 - Math.min(state.speed * 0.002, 0.04) : 0;
    const accelSquat = state.isAccelerating ? 0.05 + Math.min(state.speed * 0.001, 0.02) : 0;
    const targetPitch =
      (brakeDive + accelSquat)
      + THREE.MathUtils.clamp(-state.verticalSpeed * 0.018, -0.04, 0.06);
    const targetSink = state.surface === 'sand' ? state.sinkDepth * 0.72 : 0;
    const averageCompression =
      state.wheelCompression.reduce((sum, compression) => sum + Math.max(compression, 0), 0)
      / state.wheelCompression.length;
    const heaveTarget = THREE.MathUtils.clamp(
      averageCompression * 0.16
        + (state.isGrounded ? Math.max(-state.verticalSpeed, 0) * 0.007 : 0),
      0,
      0.2,
    );
    if (state.wasAirborne) {
      this.#bodyHeaveVelocity += THREE.MathUtils.clamp(
        0.18 + Math.max(-state.verticalSpeed, 0) * 0.035,
        0.18,
        0.38,
      );
    }
    const heaveAcceleration =
      (heaveTarget - this.#bodyHeave) * 18
      - this.#bodyHeaveVelocity * 6.8;
    this.#bodyHeaveVelocity += heaveAcceleration * dt;
    this.#bodyHeave += this.#bodyHeaveVelocity * dt;
    this.#bodyHeave = THREE.MathUtils.clamp(this.#bodyHeave, -0.05, 0.22);
    if (
      Math.abs(this.#bodyHeave) < 0.0006
      && Math.abs(this.#bodyHeaveVelocity) < 0.0006
      && heaveTarget < 0.002
    ) {
      this.#bodyHeave = 0;
      this.#bodyHeaveVelocity = 0;
    }
    this.#bodyRoll = expLerp(this.#bodyRoll, targetRoll, 5.5, dt);
    this.#bodyPitch = expLerp(this.#bodyPitch, targetPitch, 5.5, dt);
    this.#bodySink = expLerp(this.#bodySink, targetSink, 7, dt);
    const wheelTilt = this.missingWheelTilt;
    this.#bodyVisual.position.y = -(this.#bodySink + this.#bodyHeave);
    this.#bodyVisual.rotation.z = this.#bodyRoll + wheelTilt.roll;
    this.#bodyVisual.rotation.x = this.#bodyPitch + wheelTilt.pitch;

    this.#boostStripMaterial.emissiveIntensity = state.isBoosting ? 1.8 : 0.7;

    // --- Feature 5: Headlight intensity by speed ---
    const speedIntensityScale = 1 + state.speed * 0.01;
    for (const material of this.#headlightMaterials) {
      material.emissiveIntensity = (state.isGrounded ? 1.85 : 1.55) * speedIntensityScale;
    }
    for (const headlight of this.#headlights) {
      headlight.light.intensity =
        headlight.baseIntensity * (state.isGrounded ? 1 : 0.9) * speedIntensityScale;
      headlight.light.distance = headlight.baseDistance * (1 + state.speed * 0.005);
    }

    // --- Feature 1: Brake lights ---
    const brakeGlow = state.isBraking ? 2.4 : 0.15;
    for (const mat of this.#brakeLightMaterials) {
      mat.emissiveIntensity = brakeGlow;
    }

    // --- Feature 2: Reverse lights ---
    const reverseGlow = state.throttle < 0 ? 1.8 : 0.1;
    for (const mat of this.#reverseLightMaterials) {
      mat.emissiveIntensity = reverseGlow;
    }

    // --- Feature 3: Speed lines ---
    const speedLineFraction = THREE.MathUtils.clamp((state.speed - 20) / 30, 0, 1);
    const targetOpacity = speedLineFraction * 0.35;
    this.#smoothedSpeedLineOpacity = expLerp(this.#smoothedSpeedLineOpacity, targetOpacity, 6, dt);
    const lineVisible = this.#smoothedSpeedLineOpacity > 0.005;
    for (let i = 0; i < this.#speedLines.length; i++) {
      const line = this.#speedLines[i]!;
      const mat = this.#speedLineMaterials[i]!;
      line.visible = lineVisible;
      if (lineVisible) {
        mat.opacity = this.#smoothedSpeedLineOpacity;
        // Stretch lines along Z based on speed
        line.scale.z = 1 + speedLineFraction * 2.5;
      }
    }

    // --- Feature 6: Damage visual feedback ---
    const health = this.damage.totalHealth;
    const damageFraction = THREE.MathUtils.clamp(1 - health, 0, 1);
    this.#bodyMaterial.roughness = this.#bodyBaseRoughness + damageFraction * 0.16;
    this.#bodyMaterial.metalness = this.#bodyBaseMetalness * (1 - damageFraction * 0.6);
    // Darken the body color toward a dirty brownish tone as damage increases
    this.#bodyMaterial.color.copy(this.#bodyBaseColor).lerp(
      this.#bodyDirtyColor,
      damageFraction * 0.4,
    );

    this.#sandBermMaterial.opacity =
      state.surface === 'sand'
        ? THREE.MathUtils.clamp(0.08 + state.surfaceBuildup * 0.26 + state.sinkDepth * 0.6, 0, 0.42)
        : 0;

    for (let index = 0; index < this.#wheelMounts.length; index += 1) {
      const mount = this.#wheelMounts[index];
      const offset = VEHICLE_WHEEL_OFFSETS[index];
      if (!mount || !offset) continue;
      const compression = state.wheelCompression[index] ?? 0;
      mount.position.set(
        offset.x,
        offset.y + compression * 0.16,
        offset.z,
      );
    }

    const sandVisible = state.surface === 'sand' && (state.sinkDepth > 0.015 || state.surfaceBuildup > 0.05);
    const sinkBlend = THREE.MathUtils.clamp(state.sinkDepth / 0.24, 0, 1);
    const pileBlend = THREE.MathUtils.clamp(state.surfaceBuildup, 0, 1);
    for (let index = 0; index < this.#sandBerms.length; index += 1) {
      const berm = this.#sandBerms[index];
      if (!berm) continue;
      berm.visible = sandVisible;
      if (!sandVisible) continue;

      const basePosition = berm.userData.basePosition as THREE.Vector3;
      const baseScale = berm.userData.baseScale as THREE.Vector3;
      const spread = 0.42 + pileBlend * 0.82 + sinkBlend * 0.34;
      const height = 0.22 + sinkBlend * 1.18 + pileBlend * 0.56;
      berm.position.set(
        basePosition.x,
        basePosition.y - sinkBlend * (index === 4 ? 0.12 : 0.08),
        basePosition.z,
      );
      berm.scale.set(
        baseScale.x * spread,
        baseScale.y * height,
        baseScale.z * spread,
      );
    }
  }

  #addTailLight(
    position: [number, number, number],
    color: THREE.ColorRepresentation,
    materialList: THREE.MeshStandardMaterial[],
  ): void {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.15,
      roughness: 0.24,
      metalness: 0.08,
    });
    const housing = this.#box(material, [0.18, 0.1, 0.06], position);
    materialList.push(material);
    this.#bodyVisual.add(housing);
  }

  #createSpeedLines(): void {
    // Create several thin stretched boxes along the sides and top of the vehicle
    const lineGeo = new THREE.BoxGeometry(0.02, 0.02, 1.6);
    const lineConfigs: [number, number, number][] = [
      [-1.2, 0.5, -0.5],
      [-1.2, 0.2, -0.8],
      [-1.2, 0.8, -0.3],
      [1.2, 0.5, -0.5],
      [1.2, 0.2, -0.8],
      [1.2, 0.8, -0.3],
      [-0.6, 1.2, -0.4],
      [0.6, 1.2, -0.4],
    ];
    for (const pos of lineConfigs) {
      const material = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const line = new THREE.Mesh(lineGeo, material);
      line.position.set(pos[0], pos[1], pos[2]);
      line.visible = false;
      line.castShadow = false;
      line.receiveShadow = false;
      this.#speedLineMaterials.push(material);
      this.#speedLines.push(line);
      this.#bodyVisual.add(line);
    }
  }

  #wheel(
    hubMaterial: THREE.MeshStandardMaterial,
  ): THREE.Mesh<THREE.CylinderGeometry, THREE.MeshStandardMaterial> {
    const tire = new THREE.Mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.36, 18),
      new THREE.MeshStandardMaterial({
        color: 0x171513,
        roughness: 0.96,
        metalness: 0.04,
      }),
    );
    tire.rotation.z = Math.PI / 2;
    tire.castShadow = true;
    tire.receiveShadow = true;

    const hub = new THREE.Mesh(
      new THREE.CylinderGeometry(0.2, 0.2, 0.4, 12),
      hubMaterial,
    );
    hub.rotation.z = Math.PI / 2;
    tire.add(hub);

    return tire;
  }

  #addHeadlight(
    position: [number, number, number],
    color: THREE.ColorRepresentation,
    scale: number,
  ): void {
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.85,
      roughness: 0.18,
      metalness: 0.04,
    });
    const housing = this.#box(material, [0.22, 0.11, 0.08], position);
    this.#headlightMaterials.push(material);
    this.#bodyVisual.add(housing);

    const baseDistance = 34 * scale;
    const light = new THREE.SpotLight(
      color,
      6.4 * scale,
      baseDistance,
      Math.PI / 8.5,
      0.5,
      1.4,
    );
    light.position.set(position[0], position[1] - 0.01, position[2] - 0.05);
    light.castShadow = false;
    light.decay = 1.35;
    const target = new THREE.Object3D();
    target.position.set(position[0] * 0.35, position[1] - 0.24, 22 * scale);
    this.mesh.add(light);
    this.mesh.add(target);
    light.target = target;
    this.#headlights.push({
      light,
      baseIntensity: 6.4 * scale,
      baseDistance,
    });
  }

  #box(
    material: THREE.Material,
    size: [number, number, number],
    position: [number, number, number],
    rotation: [number, number, number] = [0, 0, 0],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  #cylinder(
    material: THREE.Material,
    radius: number,
    height: number,
    position: [number, number, number],
    rotation: [number, number, number],
  ): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, height, 12),
      material,
    );
    mesh.position.set(...position);
    mesh.rotation.set(...rotation);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }
}
