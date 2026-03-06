import * as THREE from 'three';

export class Sky {
  readonly #fog: THREE.Fog;
  readonly #mistLayers: Array<{ sprite: THREE.Sprite; baseOpacity: number }> = [];

  constructor(scene: THREE.Scene) {
    const hemisphere = new THREE.HemisphereLight(0xd7dde0, 0x59625d, 0.94);
    scene.add(hemisphere);

    const sun = new THREE.DirectionalLight(0xffd6aa, 1.95);
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

    const fill = new THREE.DirectionalLight(0x9bb1bf, 0.96);
    fill.position.set(-110, 55, -90);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xb6a894, 0.46);
    rim.position.set(-60, 30, 140);
    scene.add(rim);

    const atmosphere = this.#createEnvironmentTexture();
    scene.environment = atmosphere;
    scene.background = atmosphere;
    scene.backgroundBlurriness = 0.08;
    this.#fog = new THREE.Fog(0xb9c0bf, 46, 430);
    scene.fog = this.#fog;
    this.#addMistBands(scene);
  }

  setAtmosphere(fogNear: number, fogFar: number, mistStrength: number): void {
    this.#fog.near = fogNear;
    this.#fog.far = fogFar;
    for (const layer of this.#mistLayers) {
      const material = layer.sprite.material as THREE.SpriteMaterial;
      material.opacity = layer.baseOpacity * mistStrength;
    }
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
    skyGradient.addColorStop(0, '#8fa5af');
    skyGradient.addColorStop(0.18, '#bfc5c6');
    skyGradient.addColorStop(0.44, '#b68f78');
    skyGradient.addColorStop(0.72, '#6e696d');
    skyGradient.addColorStop(1, '#4d555d');
    context.fillStyle = skyGradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const sunGlow = context.createRadialGradient(760, 128, 14, 760, 128, 220);
    sunGlow.addColorStop(0, 'rgba(255, 241, 212, 0.82)');
    sunGlow.addColorStop(0.24, 'rgba(255, 197, 126, 0.32)');
    sunGlow.addColorStop(0.72, 'rgba(255, 153, 115, 0.12)');
    sunGlow.addColorStop(1, 'rgba(255, 197, 126, 0)');
    context.fillStyle = sunGlow;
    context.fillRect(510, 10, 420, 300);

    const warmHaze = context.createLinearGradient(0, 180, 0, 360);
    warmHaze.addColorStop(0, 'rgba(255, 187, 125, 0)');
    warmHaze.addColorStop(1, 'rgba(138, 88, 88, 0.36)');
    context.fillStyle = warmHaze;
    context.fillRect(0, 180, canvas.width, 190);

    const coolVeil = context.createLinearGradient(0, 80, 0, 310);
    coolVeil.addColorStop(0, 'rgba(176, 199, 207, 0.24)');
    coolVeil.addColorStop(1, 'rgba(63, 74, 117, 0)');
    context.fillStyle = coolVeil;
    context.fillRect(0, 80, canvas.width, 260);

    const alpineMist = context.createLinearGradient(0, 210, 0, 430);
    alpineMist.addColorStop(0, 'rgba(224, 231, 225, 0)');
    alpineMist.addColorStop(0.4, 'rgba(197, 203, 192, 0.24)');
    alpineMist.addColorStop(1, 'rgba(128, 135, 136, 0.34)');
    context.fillStyle = alpineMist;
    context.fillRect(0, 210, canvas.width, 230);

    const cloudDeck = context.createLinearGradient(0, 46, 0, 190);
    cloudDeck.addColorStop(0, 'rgba(227, 232, 234, 0.28)');
    cloudDeck.addColorStop(0.4, 'rgba(185, 191, 198, 0.22)');
    cloudDeck.addColorStop(1, 'rgba(185, 191, 198, 0)');
    context.fillStyle = cloudDeck;
    context.fillRect(0, 28, canvas.width, 180);

    const ridgeShadow = context.createLinearGradient(0, 300, 0, 512);
    ridgeShadow.addColorStop(0, 'rgba(99, 87, 84, 0)');
    ridgeShadow.addColorStop(1, 'rgba(68, 73, 84, 0.45)');
    context.fillStyle = ridgeShadow;
    context.fillRect(0, 300, canvas.width, 212);

    const texture = new THREE.CanvasTexture(canvas);
    texture.mapping = THREE.EquirectangularReflectionMapping;
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }

  #addMistBands(scene: THREE.Scene): void {
    const mistTexture = this.#createMistTexture();
    const layers = [
      { position: new THREE.Vector3(0, 22, 90), scale: new THREE.Vector2(380, 116), color: 0xdde2da, opacity: 0.24 },
      { position: new THREE.Vector3(-48, 27, 168), scale: new THREE.Vector2(430, 128), color: 0xd4dbd4, opacity: 0.22 },
      { position: new THREE.Vector3(42, 34, 246), scale: new THREE.Vector2(490, 144), color: 0xcfd8d4, opacity: 0.19 },
      { position: new THREE.Vector3(0, 48, 334), scale: new THREE.Vector2(580, 168), color: 0xc8d1cf, opacity: 0.17 },
      { position: new THREE.Vector3(84, 22, 148), scale: new THREE.Vector2(280, 96), color: 0xe5e6dc, opacity: 0.13 },
    ];

    for (const layer of layers) {
      const material = new THREE.SpriteMaterial({
        map: mistTexture,
        color: layer.color,
        transparent: true,
        opacity: layer.opacity,
        depthWrite: false,
        depthTest: true,
      });
      const sprite = new THREE.Sprite(material);
      sprite.position.copy(layer.position);
      sprite.scale.set(layer.scale.x, layer.scale.y, 1);
      this.#mistLayers.push({ sprite, baseOpacity: layer.opacity });
      scene.add(sprite);
    }
  }

  #createMistTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create mist texture.');
    }

    const gradient = context.createRadialGradient(128, 64, 12, 128, 64, 120);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.75)');
    gradient.addColorStop(0.38, 'rgba(245, 247, 243, 0.34)');
    gradient.addColorStop(0.72, 'rgba(219, 225, 218, 0.12)');
    gradient.addColorStop(1, 'rgba(219, 225, 218, 0)');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const veil = context.createLinearGradient(0, 24, 0, 104);
    veil.addColorStop(0, 'rgba(255, 255, 255, 0)');
    veil.addColorStop(0.45, 'rgba(255, 255, 255, 0.18)');
    veil.addColorStop(1, 'rgba(255, 255, 255, 0)');
    context.fillStyle = veil;
    context.fillRect(0, 18, canvas.width, 86);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }
}
