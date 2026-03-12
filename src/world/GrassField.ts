import * as THREE from 'three';
import type { WeatherCondition } from '../config/GameTuning';
import { SeededRandom } from '../core/SeededRandom';
import { Terrain } from './Terrain';

interface GrassPatch {
  position: THREE.Vector3;
  yaw: number;
  width: number;
  height: number;
  phase: number;
  swayAmplitude: number;
  lean: number;
  tint: THREE.Color;
  /** 0 = upright, 1 = fully flattened */
  trample: number;
  /** Direction the grass was pushed (radians) */
  trampleYaw: number;
}

export class GrassField {
  readonly #terrain: Terrain;
  readonly #texture: THREE.CanvasTexture;
  readonly #geometry: THREE.PlaneGeometry;
  readonly #materialA: THREE.MeshStandardMaterial;
  readonly #materialB: THREE.MeshStandardMaterial;
  readonly #meshA: THREE.InstancedMesh;
  readonly #meshB: THREE.InstancedMesh;
  readonly #patches: GrassPatch[];
  readonly #patchHidden: boolean[];
  readonly #dummy = new THREE.Object3D();
  readonly #windDirection = new THREE.Vector3(-1, 0, 0.35).normalize();
  readonly #trampledTint = new THREE.Color(0x8a7e48); // yellowed/dried
  readonly #tempColor = new THREE.Color();
  #time = 0;
  #colorsDirty = false;
  #visibleCount = 0;
  #averageSwayDegrees = 0;
  #windStrength = 0;

  constructor(scene: THREE.Scene, terrain: Terrain) {
    this.#terrain = terrain;
    this.#texture = this.#createBladeTexture();
    this.#geometry = this.#createBladeGeometry();
    this.#patches = this.#buildPatches();
    this.#patchHidden = new Array(this.#patches.length).fill(false);

    this.#materialA = this.#createMaterial();
    this.#materialB = this.#createMaterial();
    this.#meshA = new THREE.InstancedMesh(
      this.#geometry,
      this.#materialA,
      this.#patches.length,
    );
    this.#meshB = new THREE.InstancedMesh(
      this.#geometry,
      this.#materialB,
      this.#patches.length,
    );
    this.#meshA.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#meshB.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.#meshA.frustumCulled = false;
    this.#meshB.frustumCulled = false;
    this.#meshA.castShadow = false;
    this.#meshA.receiveShadow = false;
    this.#meshB.castShadow = false;
    this.#meshB.receiveShadow = false;

    for (let index = 0; index < this.#patches.length; index += 1) {
      const patch = this.#patches[index];
      if (!patch) continue;
      this.#meshA.setColorAt(index, patch.tint);
      this.#meshB.setColorAt(index, patch.tint.clone().offsetHSL(0, -0.02, -0.03));
    }

    scene.add(this.#meshA);
    scene.add(this.#meshB);
  }

  /**
   * Trample grass near a world position. Called each frame while the vehicle
   * is grounded on grass/dirt surfaces.
   */
  trample(worldX: number, worldZ: number, radius: number, strength: number, directionYaw: number): void {
    const rSq = radius * radius;
    for (const patch of this.#patches) {
      const dx = patch.position.x - worldX;
      const dz = patch.position.z - worldZ;
      const distSq = dx * dx + dz * dz;
      if (distSq > rSq) continue;

      const proximity = 1 - Math.sqrt(distSq) / radius;
      const amount = proximity * strength;
      patch.trample = Math.min(1, patch.trample + amount);
      // Blend toward the vehicle's travel direction
      patch.trampleYaw = THREE.MathUtils.lerp(patch.trampleYaw, directionYaw, amount * 0.6);
    }
  }

  dispose(): void {
    this.#meshA.removeFromParent();
    this.#meshB.removeFromParent();
    this.#geometry.dispose();
    this.#materialA.dispose();
    this.#materialB.dispose();
    this.#texture.dispose();
  }

  update(
    dt: number,
    cameraPosition: THREE.Vector3,
    windDensity: number,
    rainDensity: number,
    weatherCondition: WeatherCondition,
  ): void {
    this.#time += dt;

    const weatherWindScale =
      weatherCondition === 'rainy' ? 1.18 : weatherCondition === 'sunny' ? 0.86 : 1;
    const windStrength = THREE.MathUtils.clamp(
      (0.34 + windDensity * 0.82 + rainDensity * 0.18) * weatherWindScale,
      0.2,
      1.6,
    );
    const heightScale = weatherCondition === 'rainy' ? 0.95 : 1;

    const camX = cameraPosition.x;
    const camZ = cameraPosition.z;
    const time = this.#time;
    const windDirZ = this.#windDirection.z;
    const windDirX = this.#windDirection.x;
    let visibleCount = 0;
    let swaySum = 0;
    let anyVisible = false;

    for (let index = 0; index < this.#patches.length; index += 1) {
      const patch = this.#patches[index];
      if (!patch) continue;

      // Use squared distance to avoid sqrt for culling
      const dx = camX - patch.position.x;
      const dz = camZ - patch.position.z;
      const distSq = dx * dx + dz * dz;

      // 232 = 18 + 214 (max visible distance), squared = 53824
      if (distSq > 53824) {
        // Only zero out if it was previously visible (avoid redundant uploads)
        if (!this.#patchHidden[index]) {
          this.#dummy.position.copy(patch.position);
          this.#dummy.scale.setScalar(0.0001);
          this.#dummy.updateMatrix();
          this.#meshA.setMatrixAt(index, this.#dummy.matrix);
          this.#meshB.setMatrixAt(index, this.#dummy.matrix);
          this.#patchHidden[index] = true;
          anyVisible = true; // need to flag update
        }
        continue;
      }

      this.#patchHidden[index] = false;
      anyVisible = true;

      const distance = Math.sqrt(distSq);
      const visibility = THREE.MathUtils.clamp(
        1 - (distance - 18) / 214,
        0,
        1,
      );

      if (visibility <= 0.01) {
        this.#dummy.position.copy(patch.position);
        this.#dummy.scale.setScalar(0.0001);
        this.#dummy.updateMatrix();
        this.#meshA.setMatrixAt(index, this.#dummy.matrix);
        this.#meshB.setMatrixAt(index, this.#dummy.matrix);
        continue;
      }

      visibleCount += 1;

      // Trample recovery — slowly spring back (faster when rainy — water helps)
      if (patch.trample > 0) {
        const recoveryRate = weatherCondition === 'rainy' ? 0.025 : 0.012;
        patch.trample = Math.max(0, patch.trample - recoveryRate * dt);
      }
      const trample = patch.trample;

      const phase = patch.phase;
      const gust =
        0.64
        + Math.sin(time * 0.72 + phase * 0.6) * 0.28
        + Math.sin(time * 1.48 + phase * 1.2) * 0.22;
      // Trampled grass sways less
      const swayDamp = 1 - trample * 0.85;
      const sway =
        Math.sin(time * (1.1 + windDensity * 0.9) + phase)
        * patch.swayAmplitude
        * windStrength
        * gust
        * visibility
        * swayDamp;
      swaySum += Math.abs(sway);

      // Trample pushes grass sideways and reduces height
      const trampleLean = trample * 0.65; // how far it's pushed over
      const trampleTiltX = Math.sin(patch.trampleYaw) * trampleLean;
      const trampleTiltZ = -Math.cos(patch.trampleYaw) * trampleLean;

      const lean = patch.lean + sway;
      const tiltX = windDirZ * lean + trampleTiltX;
      const tiltZ = -windDirX * lean + trampleTiltZ;
      const baseScale = visibility * THREE.MathUtils.lerp(0.82, 1, visibility);
      // Trampled grass is shorter
      const trampleHeightScale = 1 - trample * 0.45;

      this.#dummy.position.copy(patch.position);
      this.#dummy.rotation.set(tiltX, patch.yaw, tiltZ, 'YXZ');
      this.#dummy.scale.set(
        patch.width * baseScale * (1 + trample * 0.15), // slightly wider when flattened
        patch.height * heightScale * baseScale * trampleHeightScale,
        1,
      );
      this.#dummy.updateMatrix();
      this.#meshA.setMatrixAt(index, this.#dummy.matrix);

      this.#dummy.rotation.set(tiltX, patch.yaw + Math.PI * 0.5, tiltZ, 'YXZ');
      this.#dummy.updateMatrix();
      this.#meshB.setMatrixAt(index, this.#dummy.matrix);

      // Tint trampled grass toward dried yellow-brown
      if (trample > 0.02) {
        this.#tempColor.copy(patch.tint).lerp(this.#trampledTint, trample * 0.55);
        this.#meshA.setColorAt(index, this.#tempColor);
        this.#tempColor.offsetHSL(0, -0.02, -0.03);
        this.#meshB.setColorAt(index, this.#tempColor);
        this.#colorsDirty = true;
      }
    }

    // Only upload instance matrices when something changed
    if (anyVisible || visibleCount > 0) {
      this.#meshA.instanceMatrix.needsUpdate = true;
      this.#meshB.instanceMatrix.needsUpdate = true;
    }
    if (this.#colorsDirty) {
      if (this.#meshA.instanceColor) this.#meshA.instanceColor.needsUpdate = true;
      if (this.#meshB.instanceColor) this.#meshB.instanceColor.needsUpdate = true;
      this.#colorsDirty = false;
    }
    this.#visibleCount = visibleCount;
    this.#averageSwayDegrees =
      visibleCount > 0
        ? THREE.MathUtils.radToDeg(swaySum / visibleCount)
        : 0;
    this.#windStrength = windStrength;
  }

  getDebugState(): {
    count: number;
    visibleCount: number;
    averageSwayDegrees: number;
    windStrength: number;
  } {
    return {
      count: this.#patches.length,
      visibleCount: this.#visibleCount,
      averageSwayDegrees: Number(this.#averageSwayDegrees.toFixed(2)),
      windStrength: Number(this.#windStrength.toFixed(2)),
    };
  }

  #buildPatches(): GrassPatch[] {
    const random = new SeededRandom(0x47524153);
    const patches: GrassPatch[] = [];
    const halfSize = this.#terrain.size * 0.47;
    const cityCenter = this.#terrain.getCityCenterPosition();
    const outposts = this.#terrain.getOutpostPositions();

    for (let attempt = 0; attempt < 3600 && patches.length < 320; attempt += 1) {
      const x = random.range(-halfSize, halfSize);
      const z = random.range(-halfSize, halfSize);
      if (!this.#terrain.isWithinBounds(x, z)) continue;
      const surface = this.#terrain.getSurfaceAt(x, z);
      const roadInfluence = this.#terrain.getRoadInfluence(x, z);
      const supportsGrass = surface === 'grass' || surface === 'dirt';
      if (!supportsGrass) continue;
      if (roadInfluence > 0.38) continue;

      const slope = 1 - this.#terrain.getNormalAt(x, z).y;
      if (slope > 0.22) continue;

      const pathProximity = THREE.MathUtils.clamp(
        1 - Math.abs(x - this.#terrain.getPathCenterX(z)) / 190,
        0,
        1,
      );
      const cityProximity = THREE.MathUtils.clamp(
        1 - Math.hypot(x - cityCenter.x, z - cityCenter.z) / 210,
        0,
        1,
      );
      let outpostProximity = 0;
      for (const outpost of outposts) {
        outpostProximity = Math.max(
          outpostProximity,
          THREE.MathUtils.clamp(
            1 - Math.hypot(x - outpost.x, z - outpost.z) / 150,
            0,
            1,
          ),
        );
      }
      const roadShoulder = THREE.MathUtils.clamp(
        1 - Math.abs(roadInfluence - 0.14) / 0.14,
        0,
        1,
      );
      const surfaceAllowance = surface === 'grass' ? 1 : 0.52 + roadShoulder * 0.34;
      const anchor = Math.max(
        pathProximity * 0.92,
        cityProximity * 1.12,
        outpostProximity,
        roadShoulder * 0.94,
      ) * surfaceAllowance;
      if (anchor < 0.12) continue;
      if (random.next() > anchor * 0.88 + 0.18) continue;

      let tooClose = false;
      for (let index = patches.length - 1; index >= Math.max(0, patches.length - 42); index -= 1) {
        const existing = patches[index];
        if (!existing) continue;
        if (existing.position.distanceToSquared(new THREE.Vector3(x, existing.position.y, z)) < 7.5) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const position = new THREE.Vector3(
        x,
        this.#terrain.getHeightAt(x, z) + 0.03,
        z,
      );
      const tintBase = surface === 'grass' ? new THREE.Color(0x6c9b58) : new THREE.Color(0x7d8f52);
      const tint = tintBase
        .lerp(new THREE.Color(0xa6c378), random.range(0.14, 0.64))
        .lerp(new THREE.Color(0x4f7441), random.range(0, 0.28));

      patches.push({
        position,
        yaw: random.range(0, Math.PI * 2),
        width: random.range(0.34, 0.72),
        height: random.range(0.72, 1.42),
        phase: random.range(0, Math.PI * 2),
        swayAmplitude: random.range(0.08, 0.19),
        lean: random.range(-0.02, 0.03),
        tint,
        trample: 0,
        trampleYaw: 0,
      });
    }

    return patches;
  }

  #createMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0x8ab26a,
      map: this.#texture,
      alphaMap: this.#texture,
      alphaTest: 0.36,
      transparent: true,
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.94,
      metalness: 0,
      emissive: 0x355128,
      emissiveIntensity: 0.24,
      flatShading: true,
      depthWrite: false,
    });
  }

  #createBladeGeometry(): THREE.PlaneGeometry {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 4);
    geometry.translate(0, 0.5, 0);

    const positions = geometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const taper = THREE.MathUtils.lerp(0.82, 0.12, Math.pow(y, 1.22));
      const curve = Math.sin(y * Math.PI) * 0.03;
      positions.setX(index, x * taper);
      positions.setZ(index, curve);
    }

    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    return geometry;
  }

  #createBladeTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create grass texture.');
    }

    context.clearRect(0, 0, canvas.width, canvas.height);

    const blade = context.createLinearGradient(48, 0, 48, 256);
    blade.addColorStop(0, 'rgba(255, 255, 255, 0)');
    blade.addColorStop(0.14, 'rgba(255, 255, 255, 0.96)');
    blade.addColorStop(0.72, 'rgba(255, 255, 255, 0.92)');
    blade.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = blade;

    context.beginPath();
    context.moveTo(48, 8);
    context.quadraticCurveTo(72, 36, 62, 108);
    context.quadraticCurveTo(58, 198, 54, 250);
    context.lineTo(42, 250);
    context.quadraticCurveTo(38, 204, 30, 112);
    context.quadraticCurveTo(24, 40, 48, 8);
    context.closePath();
    context.fill();

    const sideBlade = context.createLinearGradient(22, 32, 22, 248);
    sideBlade.addColorStop(0, 'rgba(255, 255, 255, 0)');
    sideBlade.addColorStop(0.16, 'rgba(255, 255, 255, 0.64)');
    sideBlade.addColorStop(0.78, 'rgba(255, 255, 255, 0.56)');
    sideBlade.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = sideBlade;
    context.beginPath();
    context.moveTo(24, 36);
    context.quadraticCurveTo(14, 88, 18, 154);
    context.quadraticCurveTo(20, 212, 26, 248);
    context.lineTo(18, 248);
    context.quadraticCurveTo(10, 214, 8, 150);
    context.quadraticCurveTo(8, 82, 24, 36);
    context.closePath();
    context.fill();

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }
}
