import * as THREE from 'three';
import { applyProceduralParallax } from '../render/applyProceduralParallax';

function createBeam(
  start: THREE.Vector3,
  end: THREE.Vector3,
  radius: number,
  material: THREE.Material,
): THREE.Mesh {
  const delta = end.clone().sub(start);
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, delta.length(), 8),
    material,
  );
  mesh.position.copy(start).lerp(end, 0.5);
  mesh.quaternion.setFromUnitVectors(
    new THREE.Vector3(0, 1, 0),
    delta.normalize(),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

export class MountainHub {
  readonly group = new THREE.Group();
  readonly #windowMaterial: THREE.MeshStandardMaterial;
  readonly #roofLightMaterial: THREE.MeshStandardMaterial;
  readonly #lights: Array<{
    light: THREE.PointLight;
    base: number;
    pulse: number;
    phase: number;
  }> = [];
  #time = 0;

  constructor(
    scene: THREE.Scene,
    position: THREE.Vector3,
    facingTarget: THREE.Vector3,
  ) {
    this.group.position.copy(position);
    this.group.lookAt(facingTarget.x, position.y + 2, facingTarget.z);

    const concrete = new THREE.MeshStandardMaterial({
      color: 0x7a756d,
      roughness: 0.97,
      metalness: 0.03,
    });
    const heavyConcrete = new THREE.MeshStandardMaterial({
      color: 0x63605a,
      roughness: 0.98,
      metalness: 0.02,
    });
    const steel = new THREE.MeshStandardMaterial({
      color: 0x495055,
      roughness: 0.62,
      metalness: 0.58,
    });
    const darkSteel = new THREE.MeshStandardMaterial({
      color: 0x262d31,
      roughness: 0.48,
      metalness: 0.38,
    });
    const glass = new THREE.MeshStandardMaterial({
      color: 0x8fa0a6,
      roughness: 0.16,
      metalness: 0.12,
    });
    this.#windowMaterial = new THREE.MeshStandardMaterial({
      color: 0xffe7c4,
      emissive: new THREE.Color(0xf4bf78),
      emissiveIntensity: 1.25,
      roughness: 0.26,
      metalness: 0.04,
    });
    this.#roofLightMaterial = new THREE.MeshStandardMaterial({
      color: 0xffe8bc,
      emissive: new THREE.Color(0xffb36d),
      emissiveIntensity: 1.8,
      roughness: 0.2,
      metalness: 0.04,
    });
    applyProceduralParallax(concrete, {
      kind: 'concrete',
      strength: 0.085,
      scale: 0.34,
      secondaryScale: 3.0,
    });
    applyProceduralParallax(heavyConcrete, {
      kind: 'concrete',
      strength: 0.11,
      scale: 0.4,
      secondaryScale: 3.3,
    });
    applyProceduralParallax(steel, {
      kind: 'steel',
      strength: 0.05,
      scale: 0.38,
      secondaryScale: 2.1,
    });
    applyProceduralParallax(darkSteel, {
      kind: 'steel',
      strength: 0.06,
      scale: 0.44,
      secondaryScale: 2.4,
    });

    const box = (
      width: number,
      height: number,
      depth: number,
      material: THREE.Material,
      x: number,
      y: number,
      z: number,
      rotation?: THREE.Euler,
      receiveShadow = true,
    ): THREE.Mesh => {
      const mesh = new THREE.Mesh(
        new THREE.BoxGeometry(width, height, depth),
        material,
      );
      mesh.position.set(x, y, z);
      if (rotation) {
        mesh.rotation.copy(rotation);
      }
      mesh.castShadow = true;
      mesh.receiveShadow = receiveShadow;
      this.group.add(mesh);
      return mesh;
    };

    const addLight = (
      x: number,
      y: number,
      z: number,
      color: THREE.ColorRepresentation,
      distance: number,
      base: number,
      pulse: number,
    ) => {
      const light = new THREE.PointLight(color, base, distance, 2);
      light.position.set(x, y, z);
      this.group.add(light);
      this.#lights.push({
        light,
        base,
        pulse,
        phase: x * 0.08 + z * 0.04,
      });
    };

    box(42, 1.6, 30, heavyConcrete, 0, 0.8, 0);
    box(37.5, 0.36, 25.5, steel, 0, 1.78, 0);
    box(34, 0.38, 7, heavyConcrete, 0, 0.34, 15.2);
    box(34, 0.38, 7, heavyConcrete, 0, 0.34, -15.2);
    box(4.6, 0.42, 21, heavyConcrete, -18.7, 0.35, 0);
    box(4.6, 0.42, 21, heavyConcrete, 18.7, 0.35, 0);

    const hangarShell = new THREE.Mesh(
      new THREE.CylinderGeometry(11.8, 11.8, 24.6, 22, 1, false, 0, Math.PI),
      concrete,
    );
    hangarShell.rotation.x = Math.PI * 0.5;
    hangarShell.position.set(0, 9.3, 0);
    hangarShell.castShadow = true;
    hangarShell.receiveShadow = true;
    this.group.add(hangarShell);

    box(2.4, 14.4, 24.2, concrete, -12.4, 8.8, 0);
    box(2.4, 14.4, 24.2, concrete, 12.4, 8.8, 0);
    box(22.8, 13.6, 1.2, concrete, 0, 8.4, -12.1);
    box(21.4, 10.8, 0.6, darkSteel, 0, 7.2, 12.08);
    box(8.8, 10.8, 0.48, darkSteel, -6.5, 7.2, 12.14);
    box(8.8, 10.8, 0.48, darkSteel, 6.5, 7.2, 12.14);
    box(0.4, 10.8, 0.72, steel, 0, 7.2, 12.2);

    box(26, 0.34, 1.4, steel, 0, 13.2, 12.1);
    box(0.4, 3.2, 24.2, steel, -12.18, 14.6, 0);
    box(0.4, 3.2, 24.2, steel, 12.18, 14.6, 0);

    for (const x of [-8.4, -5.6, -2.8, 2.8, 5.6, 8.4]) {
      box(0.42, 3.1, 0.16, this.#windowMaterial, x, 5.9, -12.46, undefined, false);
    }

    const apron = box(18, 0.24, 12, darkSteel, 0, 0.12, 20.6);
    const apronMaterial = new THREE.MeshStandardMaterial({
      color: 0x2d3133,
      roughness: 0.9,
      metalness: 0.06,
    });
    apron.material = apronMaterial;
    applyProceduralParallax(apronMaterial, {
      kind: 'steel',
      strength: 0.045,
      scale: 0.34,
      secondaryScale: 2.1,
    });
    box(10.8, 0.16, 0.2, this.#windowMaterial, 0, 0.22, 24.6, undefined, false);

    box(10.6, 7.2, 8.8, concrete, -18.6, 4.4, -4.6);
    box(8.6, 0.34, 9.2, steel, -18.6, 8.18, -4.6);
    box(8.8, 3.6, 5.6, concrete, -17.9, 10.2, -4.2);
    box(4.8, 4.8, 4.8, glass, -21.8, 12.4, -1.8);
    box(2.1, 1.1, 0.1, this.#windowMaterial, -21.7, 11.3, 0.7, undefined, false);
    box(2.1, 1.1, 0.1, this.#windowMaterial, -21.7, 12.9, 0.7, undefined, false);
    box(2.1, 1.1, 0.1, this.#windowMaterial, -21.7, 14.5, 0.7, undefined, false);

    box(7.2, 4.8, 6.2, concrete, 19.2, 3.4, -7.2);
    box(8.4, 0.3, 7.2, heavyConcrete, 19.2, 6.0, -7.2);
    box(5.4, 2.8, 4.2, darkSteel, 19.2, 3.2, -2.0);
    box(4.8, 0.2, 0.12, this.#windowMaterial, 19.2, 3.8, 0.08, undefined, false);

    const mastBase = new THREE.Vector3(15.4, 7.4, -10.6);
    const mastTop = new THREE.Vector3(15.4, 17.2, -10.6);
    this.group.add(createBeam(mastBase, mastTop, 0.22, steel));
    this.group.add(createBeam(new THREE.Vector3(14.5, 9.2, -9.8), mastTop, 0.08, steel));
    this.group.add(createBeam(new THREE.Vector3(16.3, 9.2, -11.4), mastTop, 0.08, steel));
    box(1.6, 1.6, 1.6, this.#roofLightMaterial, 15.4, 18.2, -10.6, undefined, false);

    const floodPosts = [
      new THREE.Vector3(-9.8, 3.3, 20.4),
      new THREE.Vector3(9.8, 3.3, 20.4),
      new THREE.Vector3(-14.1, 3.8, 10.2),
      new THREE.Vector3(14.1, 3.8, 10.2),
    ];
    for (const post of floodPosts) {
      box(0.22, 3.4, 0.22, steel, post.x, post.y, post.z);
      box(0.9, 0.32, 0.52, darkSteel, post.x, post.y + 1.82, post.z + 0.24);
      box(0.48, 0.14, 0.12, this.#windowMaterial, post.x, post.y + 1.74, post.z + 0.48, undefined, false);
      addLight(post.x, post.y + 1.52, post.z + 0.94, 0xffd8a0, 26, 0.94, 0.28);
    }

    const courtyardBlocks: Array<[number, number, number]> = [
      [-10.4, 1.2, 8.2],
      [-6.8, 1.2, 8.2],
      [6.8, 1.2, 8.2],
      [10.4, 1.2, 8.2],
    ];
    for (const [x, y, z] of courtyardBlocks) {
      box(2.2, 1.0, 1.8, heavyConcrete, x, y, z);
      box(0.9, 0.14, 0.16, this.#windowMaterial, x, y + 0.42, z + 0.9, undefined, false);
    }

    box(14.8, 0.2, 0.28, this.#windowMaterial, 0, 0.24, 18.1, undefined, false);
    box(0.28, 0.2, 9.2, this.#windowMaterial, -7.2, 0.24, 20.6, undefined, false);
    box(0.28, 0.2, 9.2, this.#windowMaterial, 7.2, 0.24, 20.6, undefined, false);

    addLight(15.4, 18, -10.6, 0xffcb8d, 42, 1.4, 0.4);
    addLight(-21.8, 14.2, -1.4, 0xffd8a8, 28, 0.8, 0.22);

    scene.add(this.group);
  }

  update(dt: number): void {
    this.#time += dt;
    const pulse = 0.56 + Math.sin(this.#time * 1.8) * 0.44;
    const shimmer = 0.5 + 0.5 * Math.sin(this.#time * 0.78 + 1.1);
    this.#windowMaterial.emissiveIntensity = 1.04 + pulse * 0.22 + shimmer * 0.08;
    this.#roofLightMaterial.emissiveIntensity = 1.48 + pulse * 0.35 + shimmer * 0.14;

    for (const entry of this.#lights) {
      const localPulse = 0.5 + 0.5 * Math.sin(this.#time * 1.5 + entry.phase);
      entry.light.intensity = entry.base + localPulse * entry.pulse;
    }
  }
}
