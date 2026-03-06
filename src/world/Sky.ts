import * as THREE from 'three';

export class Sky {
  constructor(scene: THREE.Scene) {
    const hemisphere = new THREE.HemisphereLight(0xf6dcc6, 0x6e625e, 0.98);
    scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xffe2ab, 2.75);
    sun.position.set(180, 140, 70);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -160;
    sun.shadow.camera.right = 160;
    sun.shadow.camera.top = 160;
    sun.shadow.camera.bottom = -160;
    sun.shadow.camera.near = 10;
    sun.shadow.camera.far = 420;
    sun.shadow.bias = -0.0008;
    scene.add(sun);

    const fill = new THREE.DirectionalLight(0x8dc2dd, 0.74);
    fill.position.set(-110, 55, -90);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffa88a, 0.42);
    rim.position.set(-60, 30, 140);
    scene.add(rim);

    const atmosphere = this.#createEnvironmentTexture();
    scene.environment = atmosphere;
    scene.background = atmosphere;
    scene.fog = new THREE.FogExp2(0xc6b4b8, 0.003);
  }

  #createEnvironmentTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create atmospheric texture.');
    }

    const skyGradient = context.createLinearGradient(0, 0, 0, canvas.height);
    skyGradient.addColorStop(0, '#99caef');
    skyGradient.addColorStop(0.28, '#f3d8bd');
    skyGradient.addColorStop(0.58, '#c99b8b');
    skyGradient.addColorStop(1, '#4c5066');
    context.fillStyle = skyGradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const sunGlow = context.createRadialGradient(760, 120, 14, 760, 120, 190);
    sunGlow.addColorStop(0, 'rgba(255, 247, 214, 0.98)');
    sunGlow.addColorStop(0.26, 'rgba(255, 199, 118, 0.58)');
    sunGlow.addColorStop(0.68, 'rgba(255, 138, 103, 0.18)');
    sunGlow.addColorStop(1, 'rgba(255, 199, 118, 0)');
    context.fillStyle = sunGlow;
    context.fillRect(510, 10, 420, 300);

    const warmHaze = context.createLinearGradient(0, 180, 0, 360);
    warmHaze.addColorStop(0, 'rgba(255, 187, 125, 0)');
    warmHaze.addColorStop(1, 'rgba(163, 96, 92, 0.44)');
    context.fillStyle = warmHaze;
    context.fillRect(0, 180, canvas.width, 190);

    const coolVeil = context.createLinearGradient(0, 120, 0, 310);
    coolVeil.addColorStop(0, 'rgba(120, 194, 221, 0.16)');
    coolVeil.addColorStop(1, 'rgba(63, 74, 117, 0)');
    context.fillStyle = coolVeil;
    context.fillRect(0, 120, canvas.width, 220);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
