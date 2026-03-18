import * as THREE from 'three';
import type { WeatherCondition } from '../config/GameTuning';
import { SeededRandom } from '../core/SeededRandom';
import { SEA_LEVEL, Terrain, type BiomeType } from './Terrain';

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
  readonly #trampledTint = new THREE.Color(0x907840); // dusty trampled earth
  readonly #tempColor = new THREE.Color();
  readonly #hiddenMatrix = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001);
  /** Spatial grid: each cell holds patch indices for fast neighborhood lookup. */
  readonly #gridCells: number[][];
  readonly #gridSize = 8;
  readonly #cellSize: number;
  readonly #halfWorld: number;
  /** Cells that were active last frame — used to hide patches when leaving range. */
  #activeCells = new Set<number>();
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

    // Build spatial grid for fast neighborhood iteration
    this.#halfWorld = terrain.size * 0.5;
    this.#cellSize = terrain.size / this.#gridSize;
    this.#gridCells = Array.from({ length: this.#gridSize * this.#gridSize }, () => []);
    for (let i = 0; i < this.#patches.length; i++) {
      const p = this.#patches[i]!;
      const cx = THREE.MathUtils.clamp(
        Math.floor((p.position.x + this.#halfWorld) / this.#cellSize), 0, this.#gridSize - 1,
      );
      const cz = THREE.MathUtils.clamp(
        Math.floor((p.position.z + this.#halfWorld) / this.#cellSize), 0, this.#gridSize - 1,
      );
      this.#gridCells[cz * this.#gridSize + cx]!.push(i);
    }

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
      // Cheap axis-aligned check before squared distance
      const dx = patch.position.x - worldX;
      if (dx * dx > rSq) continue;
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

    // Determine active grid cells (3x3 around camera)
    const playerCellX = THREE.MathUtils.clamp(
      Math.floor((camX + this.#halfWorld) / this.#cellSize), 0, this.#gridSize - 1,
    );
    const playerCellZ = THREE.MathUtils.clamp(
      Math.floor((camZ + this.#halfWorld) / this.#cellSize), 0, this.#gridSize - 1,
    );
    const newActiveCells = new Set<number>();
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = playerCellX + dx;
        const cz = playerCellZ + dz;
        if (cx >= 0 && cx < this.#gridSize && cz >= 0 && cz < this.#gridSize) {
          newActiveCells.add(cz * this.#gridSize + cx);
        }
      }
    }

    // Hide patches in cells that are no longer active
    for (const cellIdx of this.#activeCells) {
      if (!newActiveCells.has(cellIdx)) {
        const indices = this.#gridCells[cellIdx];
        if (!indices) continue;
        for (const index of indices) {
          if (!this.#patchHidden[index]) {
            this.#meshA.setMatrixAt(index, this.#hiddenMatrix);
            this.#meshB.setMatrixAt(index, this.#hiddenMatrix);
            this.#patchHidden[index] = true;
            anyVisible = true;
          }
        }
      }
    }
    this.#activeCells = newActiveCells;

    // Only iterate patches in active cells
    for (const cellIdx of newActiveCells) {
      const indices = this.#gridCells[cellIdx];
      if (!indices) continue;
      for (const index of indices) {

      const patch = this.#patches[index];
      if (!patch) continue;

      // Use squared distance to avoid sqrt for culling
      const dx = camX - patch.position.x;
      const dz = camZ - patch.position.z;
      const distSq = dx * dx + dz * dz;

      // 190 = 18 + 172 (max visible distance), squared = 36100
      if (distSq > 36100) {
        if (!this.#patchHidden[index]) {
          this.#meshA.setMatrixAt(index, this.#hiddenMatrix);
          this.#meshB.setMatrixAt(index, this.#hiddenMatrix);
          this.#patchHidden[index] = true;
          anyVisible = true;
        }
        continue;
      }

      const distance = Math.sqrt(distSq);
      const visibility = THREE.MathUtils.clamp(
        1 - (distance - 18) / 172,
        0,
        1,
      );

      if (visibility <= 0.01) {
        if (!this.#patchHidden[index]) {
          this.#meshA.setMatrixAt(index, this.#hiddenMatrix);
          this.#meshB.setMatrixAt(index, this.#hiddenMatrix);
          this.#patchHidden[index] = true;
          anyVisible = true;
        }
        continue;
      }

      this.#patchHidden[index] = false;
      anyVisible = true;

      visibleCount += 1;

      // Trample recovery — slowly spring back (faster when rainy — water helps)
      if (patch.trample > 0) {
        const recoveryRate = weatherCondition === 'rainy' ? 0.025 : 0.012;
        patch.trample = Math.max(0, patch.trample - recoveryRate * dt);
      }
      const trample = patch.trample;

      const phase = patch.phase;
      // Layered wind — slow rolling waves + medium gusts + fast shimmer
      const gust =
        0.58
        + Math.sin(time * 0.42 + phase * 0.4) * 0.24   // slow rolling wave
        + Math.sin(time * 0.88 + phase * 0.8) * 0.18    // medium gust
        + Math.sin(time * 1.74 + phase * 1.4) * 0.10;   // fast shimmer
      // Trampled grass sways less
      const swayDamp = 1 - trample * 0.85;
      const sway =
        Math.sin(time * (0.8 + windDensity * 0.7) + phase)
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
    } // for index of indices
    } // for cellIdx of newActiveCells

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

    for (let attempt = 0; attempt < 7000 && patches.length < 480; attempt += 1) {
      const x = random.range(-halfSize, halfSize);
      const z = random.range(-halfSize, halfSize);
      if (!this.#terrain.isWithinBounds(x, z)) continue;
      if (this.#terrain.getHeightAt(x, z) < SEA_LEVEL + 1) continue;
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
        const pdx = existing.position.x - x;
        const pdz = existing.position.z - z;
        if (pdx * pdx + pdz * pdz < 5.0) {
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
      // Biome-aware color palette
      const { biome, influence: biomeStr } = this.#terrain.getBiomeAt(x, z);
      const colorRoll = random.next();
      let tintBase: THREE.Color;

      if (biome === 'meadow' && biomeStr > 0.2) {
        // Meadow: golden steppe, dried amber, warm straw
        tintBase = colorRoll < 0.2
          ? new THREE.Color(0xd0b058)  // pale golden
          : colorRoll < 0.5
            ? new THREE.Color(0xc0a048)  // warm straw
            : new THREE.Color(0xa89040);  // amber
      } else if (biome === 'desert' && biomeStr > 0.2) {
        // Desert: sun-bleached, dry earth tones
        tintBase = colorRoll < 0.4
          ? new THREE.Color(0xb89838)  // dry straw
          : colorRoll < 0.7
            ? new THREE.Color(0xa08030)  // faded ochre
            : new THREE.Color(0x888048);  // dusty olive
      } else if (biome === 'hollow' && biomeStr > 0.2) {
        // Hollow: dark sage, olive, muted earth
        tintBase = colorRoll < 0.2
          ? new THREE.Color(0x606838)  // dark olive
          : colorRoll < 0.45
            ? new THREE.Color(0x708040)  // sage
            : new THREE.Color(0x586830);  // dark sage
      } else {
        // Default palette — golden-brown steppe
        tintBase = colorRoll < 0.08 && surface === 'dirt'
          ? new THREE.Color(0xb09048)
          : colorRoll < 0.18
            ? new THREE.Color(0x909060)
            : colorRoll < 0.28
              ? new THREE.Color(0x808048)
              : surface === 'grass'
                ? new THREE.Color(0xb8a050)
                : new THREE.Color(0xa09048);
      }

      const tint = tintBase
        .lerp(new THREE.Color(0xd0b860), random.range(0.08, 0.35))
        .lerp(new THREE.Color(0x887040), random.range(0, 0.18));

      // Biome affects height — meadow is chest-height Ghibli fields
      const heightMin = biome === 'meadow' ? 1.8 : biome === 'desert' ? 0.36 : biome === 'hollow' ? 0.9 : 0.7;
      const heightMax = biome === 'meadow' ? 3.2 : biome === 'desert' ? 0.72 : biome === 'hollow' ? 1.6 : 1.4;
      // Meadow sways in long lazy waves, hollow barely moves
      const swayMin = biome === 'meadow' ? 0.12 : biome === 'hollow' ? 0.03 : 0.07;
      const swayMax = biome === 'meadow' ? 0.28 : biome === 'hollow' ? 0.10 : 0.18;
      // Meadow blades are wider and more lush
      const widthMin = biome === 'meadow' ? 0.52 : 0.34;
      const widthMax = biome === 'meadow' ? 1.1 : biome === 'hollow' ? 0.72 : 0.68;

      // Golden tip tint for meadow — blades lighten at the top (baked into tint)
      if (biome === 'meadow' && biomeStr > 0.3) {
        tint.lerp(new THREE.Color(0xe0c850), random.range(0.05, 0.18));
      }

      patches.push({
        position,
        yaw: random.range(0, Math.PI * 2),
        width: random.range(widthMin, widthMax),
        height: random.range(heightMin, heightMax),
        phase: random.range(0, Math.PI * 2),
        swayAmplitude: random.range(swayMin, swayMax),
        lean: random.range(-0.03, 0.04),
        tint,
        trample: 0,
        trampleYaw: 0,
      });
    }

    return patches;
  }

  #createMaterial(): THREE.MeshStandardMaterial {
    return new THREE.MeshStandardMaterial({
      color: 0xb09848,
      map: this.#texture,
      alphaMap: this.#texture,
      alphaTest: 0.26,
      transparent: true,
      vertexColors: true,
      side: THREE.DoubleSide,
      roughness: 0.78,
      metalness: 0,
      emissive: 0x584820,
      emissiveIntensity: 0.42,
      flatShading: true,
      depthWrite: false,
    });
  }

  #createBladeGeometry(): THREE.PlaneGeometry {
    const geometry = new THREE.PlaneGeometry(1, 1, 1, 8);
    geometry.translate(0, 0.5, 0);

    const positions = geometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      // Graceful taper — wide lush base, thin wispy tip
      const taper = THREE.MathUtils.lerp(0.92, 0.04, Math.pow(y, 1.5));
      // Strong S-curve — blade leans forward, arcs, then tips droop at top
      const lean = y * y * 0.08;  // progressive forward lean
      const arc = Math.sin(y * Math.PI) * 0.07;
      const droop = Math.pow(Math.max(y - 0.7, 0) / 0.3, 2) * -0.04; // tip droops
      positions.setX(index, x * taper);
      positions.setZ(index, lean + arc + droop);
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
    blade.addColorStop(0, 'rgba(255, 240, 200, 0)');         // transparent tip
    blade.addColorStop(0.04, 'rgba(255, 230, 180, 0.65)');   // warm glow at very tip
    blade.addColorStop(0.10, 'rgba(255, 240, 210, 0.85)');   // luminous upper
    blade.addColorStop(0.22, 'rgba(255, 250, 240, 0.96)');   // full opacity
    blade.addColorStop(0.65, 'rgba(250, 240, 225, 0.94)');   // sustain
    blade.addColorStop(0.88, 'rgba(230, 220, 195, 0.72)');   // fade toward base
    blade.addColorStop(1, 'rgba(210, 200, 175, 0)');
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
