/**
 * GhostPlayerSystem — Renders remote players as ghost vehicles using a single
 * InstancedMesh draw call. Adapted from RaiderSystem's instanced rendering
 * pattern (lines 473-633 of RaiderSystem.ts).
 *
 * Architecture:
 * - Loads a GLB model once, extracts geometry + material
 * - Creates an InstancedMesh with capacity for maxPlayers
 * - Each frame, reads interpolated positions from NetworkManager
 * - Composes orientation matrix from heading + terrain ground normal
 * - Updates instance matrices in a single batch
 *
 * Result: 16 ghost vehicles rendered in 1 draw call.
 */

import * as THREE from 'three';
import { Vehicle } from '../vehicle/Vehicle';
import type { Terrain } from './Terrain';
import type { RemotePlayerState } from '../network/NetworkManager';

const GHOST_SCALE = 0.92; // Slightly smaller than player vehicle
const UNIT_SCALE = new THREE.Vector3(1, 1, 1);

export class GhostPlayerSystem {
  readonly #terrain: Terrain;
  readonly #scene: THREE.Scene;
  readonly #maxPlayers: number;
  #instancedMesh: THREE.InstancedMesh | null = null;
  #activeCount = 0;

  // Name label sprites keyed by player identity
  readonly #nameSprites = new Map<string, THREE.Sprite>();
  readonly #nameSpriteTexts = new Map<string, string>(); // track current text for change detection

  // Pre-allocated objects for per-frame matrix composition (zero allocations)
  readonly #instanceMatrix = new THREE.Matrix4();
  readonly #hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);
  readonly #position = new THREE.Vector3();
  readonly #quaternion = new THREE.Quaternion();
  readonly #groundNormal = new THREE.Vector3(0, 1, 0);
  readonly #forward = new THREE.Vector3();
  readonly #right = new THREE.Vector3();
  readonly #correctedForward = new THREE.Vector3();
  readonly #basisMatrix = new THREE.Matrix4();

  constructor(scene: THREE.Scene, terrain: Terrain, maxPlayers = 20) {
    this.#scene = scene;
    this.#terrain = terrain;
    this.#maxPlayers = maxPlayers;
  }

  /**
   * Load the ghost vehicle GLB model and create the InstancedMesh.
   * Follows the exact pattern from RaiderSystem.loadModel() (lines 578-633).
   */
  async loadModel(url: string): Promise<void> {
    const modelScene = await Vehicle.loadModel(url);

    // Find the first mesh in the GLB
    let sourceMesh: THREE.Mesh | null = null;
    modelScene.traverse((child) => {
      if (!sourceMesh && child instanceof THREE.Mesh) {
        sourceMesh = child;
      }
    });
    if (!sourceMesh) return;

    const mesh = sourceMesh as THREE.Mesh;
    const geometry = mesh.geometry.clone(); // Clone so we can bake transforms
    const material = (mesh.material as THREE.Material).clone();

    // Make ghost material semi-transparent for that "ghost" feel
    if (material instanceof THREE.MeshStandardMaterial) {
      material.transparent = true;
      material.opacity = 0.7;
      material.depthWrite = false;
    }

    // Compute auto-scale to match vehicle size (~4.8 units), apply ghost scale
    const bbox = new THREE.Box3().setFromBufferAttribute(
      geometry.getAttribute('position') as THREE.BufferAttribute,
    );
    const modelSize = bbox.getSize(new THREE.Vector3());
    const modelCenter = bbox.getCenter(new THREE.Vector3());
    const longestAxis = Math.max(modelSize.x, modelSize.y, modelSize.z);
    const autoScale = (4.8 / longestAxis) * GHOST_SCALE;

    // Bake centering + scaling into geometry (same as RaiderSystem lines 605-615)
    geometry.applyMatrix4(
      new THREE.Matrix4().compose(
        new THREE.Vector3(
          -modelCenter.x * autoScale,
          -bbox.min.y * autoScale - 0.3 * GHOST_SCALE,
          -modelCenter.z * autoScale,
        ),
        new THREE.Quaternion(),
        new THREE.Vector3(autoScale, autoScale, autoScale),
      ),
    );

    const instanced = new THREE.InstancedMesh(
      geometry,
      material,
      this.#maxPlayers,
    );
    instanced.castShadow = false;
    instanced.receiveShadow = false;
    instanced.frustumCulled = false;

    // Initialize all instances as hidden
    for (let i = 0; i < this.#maxPlayers; i++) {
      instanced.setMatrixAt(i, this.#hiddenMatrix);
    }
    instanced.instanceMatrix.needsUpdate = true;

    this.#instancedMesh = instanced;
    this.#scene.add(instanced);
  }

  /** Create a canvas texture with the player's name in amber text. */
  #createNameTexture(name: string): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, 256, 64);
    ctx.font = '700 28px "Geist Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(212, 167, 74, 0.85)';
    ctx.fillText(name || 'Anonymous', 128, 32);
    return new THREE.CanvasTexture(canvas);
  }

  /** Create a name label sprite for a ghost player. */
  #createNameSprite(identity: string, name: string): THREE.Sprite {
    const texture = this.#createNameTexture(name);
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2, 0.5, 1);
    this.#scene.add(sprite);
    this.#nameSprites.set(identity, sprite);
    this.#nameSpriteTexts.set(identity, name);
    return sprite;
  }

  /** Dispose and remove a single name label sprite. */
  #disposeNameSprite(identity: string): void {
    const sprite = this.#nameSprites.get(identity);
    if (sprite) {
      sprite.removeFromParent();
      (sprite.material as THREE.SpriteMaterial).map?.dispose();
      (sprite.material as THREE.SpriteMaterial).dispose();
      this.#nameSprites.delete(identity);
      this.#nameSpriteTexts.delete(identity);
    }
  }

  /**
   * Update ghost positions from network state. Called every frame.
   * Reads interpolated positions from the remote player iterator and
   * composes oriented matrices matching terrain slope.
   */
  update(remotePlayers: IterableIterator<RemotePlayerState>): void {
    if (!this.#instancedMesh) return;

    // Track which identities are active this frame
    const activeIdentities = new Set<string>();

    let index = 0;
    for (const remote of remotePlayers) {
      if (index >= this.#maxPlayers) break;

      // Interpolate position between prev and current
      const t = remote.interpT;
      this.#position.set(
        remote.prevPosX + (remote.posX - remote.prevPosX) * t,
        remote.prevPosY + (remote.posY - remote.prevPosY) * t,
        remote.prevPosZ + (remote.posZ - remote.prevPosZ) * t,
      );

      // Interpolate heading using short-arc (avoid spinning 350° instead of 10°)
      const headingDelta = Math.atan2(
        Math.sin(remote.heading - remote.prevHeading),
        Math.cos(remote.heading - remote.prevHeading),
      );
      const heading = remote.prevHeading + headingDelta * t;

      // Compose orientation from heading + ground normal
      // (Same math as RaiderSystem #applyPose, lines 473-497)
      const normal = this.#terrain.getNormalAt(this.#position.x, this.#position.z);
      this.#groundNormal.copy(normal);

      this.#forward
        .set(Math.sin(heading), 0, Math.cos(heading))
        .projectOnPlane(this.#groundNormal);
      if (this.#forward.lengthSq() < 0.0001) {
        this.#forward.set(Math.sin(heading), 0, Math.cos(heading));
      }
      this.#forward.normalize();
      this.#right.crossVectors(this.#groundNormal, this.#forward).normalize();
      this.#correctedForward.crossVectors(this.#right, this.#groundNormal).normalize();
      this.#basisMatrix.makeBasis(this.#right, this.#groundNormal, this.#correctedForward);
      this.#quaternion.setFromRotationMatrix(this.#basisMatrix);

      this.#instanceMatrix.compose(this.#position, this.#quaternion, UNIT_SCALE);
      this.#instancedMesh.setMatrixAt(index, this.#instanceMatrix);

      // -- Name label sprite --
      activeIdentities.add(remote.identity);
      let sprite = this.#nameSprites.get(remote.identity);
      const currentText = this.#nameSpriteTexts.get(remote.identity);

      if (!sprite) {
        // New ghost — create sprite
        sprite = this.#createNameSprite(remote.identity, remote.name);
      } else if (currentText !== remote.name) {
        // Name changed — recreate texture
        this.#disposeNameSprite(remote.identity);
        sprite = this.#createNameSprite(remote.identity, remote.name);
      }

      sprite.position.set(this.#position.x, this.#position.y + 3.5, this.#position.z);
      sprite.visible = true;

      index++;
    }

    // Hide unused instances
    for (let i = index; i < this.#activeCount; i++) {
      this.#instancedMesh.setMatrixAt(i, this.#hiddenMatrix);
    }

    // Remove sprites for ghosts that are no longer active
    for (const identity of this.#nameSprites.keys()) {
      if (!activeIdentities.has(identity)) {
        this.#disposeNameSprite(identity);
      }
    }

    this.#activeCount = index;
    this.#instancedMesh.instanceMatrix.needsUpdate = true;
  }

  get activeCount(): number {
    return this.#activeCount;
  }

  dispose(): void {
    // Dispose all name label sprites
    for (const identity of [...this.#nameSprites.keys()]) {
      this.#disposeNameSprite(identity);
    }

    if (this.#instancedMesh) {
      this.#instancedMesh.removeFromParent();
      this.#instancedMesh.geometry.dispose();
      if (this.#instancedMesh.material instanceof THREE.Material) {
        this.#instancedMesh.material.dispose();
      }
      this.#instancedMesh = null;
    }
  }
}
