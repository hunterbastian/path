import * as THREE from 'three';
import type { WeatherCondition } from '../config/GameTuning';

interface SkyMood {
  fogColor: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  sunColor: number;
  sunIntensity: number;
  fillColor: number;
  fillIntensity: number;
  rimColor: number;
  rimIntensity: number;
  backgroundBlurriness: number;
  gradientStops: Array<{ offset: number; color: string }>;
  sunGlowInner: string;
  sunGlowMid: string;
  sunGlowOuter: string;
  hazeStart: string;
  hazeEnd: string;
  cloudDeckStart: string;
  cloudDeckMid: string;
  cloudDeckEnd: string;
}

const SKY_MOODS: Record<WeatherCondition, SkyMood> = {
  cloudy: {
    fogColor: 0xbec4c3,
    hemisphereSky: 0xd7dde0,
    hemisphereGround: 0x59625d,
    hemisphereIntensity: 0.98,
    sunColor: 0xe9d4bc,
    sunIntensity: 1.28,
    fillColor: 0xaebbc3,
    fillIntensity: 1.02,
    rimColor: 0xc0b29f,
    rimIntensity: 0.38,
    backgroundBlurriness: 0.1,
    gradientStops: [
      { offset: 0, color: '#94a7b0' },
      { offset: 0.22, color: '#c5cdcf' },
      { offset: 0.48, color: '#b99986' },
      { offset: 0.76, color: '#716d72' },
      { offset: 1, color: '#545d66' },
    ],
    sunGlowInner: 'rgba(255, 242, 214, 0.58)',
    sunGlowMid: 'rgba(255, 198, 134, 0.24)',
    sunGlowOuter: 'rgba(255, 171, 132, 0.08)',
    hazeStart: 'rgba(255, 191, 140, 0)',
    hazeEnd: 'rgba(138, 92, 94, 0.34)',
    cloudDeckStart: 'rgba(232, 236, 239, 0.34)',
    cloudDeckMid: 'rgba(189, 197, 205, 0.26)',
    cloudDeckEnd: 'rgba(189, 197, 205, 0)',
  },
  rainy: {
    fogColor: 0xb5bfbe,
    hemisphereSky: 0xd4dce0,
    hemisphereGround: 0x5e6e68,
    hemisphereIntensity: 0.96,
    sunColor: 0xddd0c0,
    sunIntensity: 1.05,
    fillColor: 0xa4b8c2,
    fillIntensity: 0.94,
    rimColor: 0xb0a898,
    rimIntensity: 0.34,
    backgroundBlurriness: 0.12,
    gradientStops: [
      { offset: 0, color: '#8a9da8' },
      { offset: 0.24, color: '#bcc4c8' },
      { offset: 0.48, color: '#a58a82' },
      { offset: 0.78, color: '#6a6d76' },
      { offset: 1, color: '#505862' },
    ],
    sunGlowInner: 'rgba(255, 240, 216, 0.42)',
    sunGlowMid: 'rgba(235, 196, 152, 0.20)',
    sunGlowOuter: 'rgba(180, 148, 132, 0.06)',
    hazeStart: 'rgba(200, 182, 168, 0)',
    hazeEnd: 'rgba(118, 100, 110, 0.26)',
    cloudDeckStart: 'rgba(220, 226, 230, 0.32)',
    cloudDeckMid: 'rgba(178, 186, 196, 0.24)',
    cloudDeckEnd: 'rgba(178, 186, 196, 0)',
  },
  sunny: {
    fogColor: 0xcfd3cb,
    hemisphereSky: 0xf0e9d6,
    hemisphereGround: 0x647162,
    hemisphereIntensity: 1.08,
    sunColor: 0xffddb0,
    sunIntensity: 2.24,
    fillColor: 0xb7cad0,
    fillIntensity: 1.08,
    rimColor: 0xe2c1a0,
    rimIntensity: 0.52,
    backgroundBlurriness: 0.06,
    gradientStops: [
      { offset: 0, color: '#a1c0d1' },
      { offset: 0.18, color: '#e7ddd1' },
      { offset: 0.42, color: '#dfb28d' },
      { offset: 0.72, color: '#8e7e7a' },
      { offset: 1, color: '#66737f' },
    ],
    sunGlowInner: 'rgba(255, 246, 222, 0.9)',
    sunGlowMid: 'rgba(255, 210, 134, 0.42)',
    sunGlowOuter: 'rgba(255, 171, 112, 0.16)',
    hazeStart: 'rgba(255, 200, 126, 0)',
    hazeEnd: 'rgba(162, 100, 86, 0.24)',
    cloudDeckStart: 'rgba(255, 246, 236, 0.24)',
    cloudDeckMid: 'rgba(230, 221, 209, 0.16)',
    cloudDeckEnd: 'rgba(230, 221, 209, 0)',
  },
};

export class Sky {
  readonly #scene: THREE.Scene;
  readonly #hemisphere: THREE.HemisphereLight;
  readonly #sun: THREE.DirectionalLight;
  readonly #fill: THREE.DirectionalLight;
  readonly #rim: THREE.DirectionalLight;
  readonly #fog: THREE.Fog;
  readonly #mistLayers: Array<{
    sprite: THREE.Sprite;
    baseOpacity: number;
    basePosition: THREE.Vector3;
    baseScale: THREE.Vector2;
    driftRadius: number;
    driftSpeed: number;
    phase: number;
    lift: number;
  }> = [];
  #environmentTexture: THREE.CanvasTexture | null = null;
  #weatherMood: WeatherCondition = 'cloudy';
  #time = 0;

  constructor(scene: THREE.Scene) {
    this.#scene = scene;
    this.#hemisphere = new THREE.HemisphereLight(0xd7dde0, 0x59625d, 0.94);
    scene.add(this.#hemisphere);

    this.#sun = new THREE.DirectionalLight(0xffd6aa, 1.95);
    this.#sun.position.set(180, 140, 70);
    this.#sun.castShadow = true;
    this.#sun.shadow.mapSize.set(1024, 1024);
    this.#sun.shadow.camera.left = -160;
    this.#sun.shadow.camera.right = 160;
    this.#sun.shadow.camera.top = 160;
    this.#sun.shadow.camera.bottom = -160;
    this.#sun.shadow.camera.near = 10;
    this.#sun.shadow.camera.far = 420;
    this.#sun.shadow.bias = -0.0008;
    scene.add(this.#sun);

    this.#fill = new THREE.DirectionalLight(0x9bb1bf, 0.96);
    this.#fill.position.set(-110, 55, -90);
    scene.add(this.#fill);

    this.#rim = new THREE.DirectionalLight(0xb6a894, 0.46);
    this.#rim.position.set(-60, 30, 140);
    scene.add(this.#rim);

    this.#fog = new THREE.Fog(0xb9c0bf, 46, 430);
    scene.fog = this.#fog;
    this.#addMistBands(scene);
    this.setWeatherMood('cloudy');
  }

  setAtmosphere(fogNear: number, fogFar: number, mistStrength: number): void {
    this.#fog.near = fogNear;
    this.#fog.far = fogFar;
    for (const layer of this.#mistLayers) {
      const material = layer.sprite.material as THREE.SpriteMaterial;
      material.opacity = layer.baseOpacity * mistStrength;
    }
  }

  setWeatherMood(condition: WeatherCondition): void {
    if (this.#weatherMood === condition && this.#environmentTexture) {
      return;
    }

    this.#weatherMood = condition;
    const mood = SKY_MOODS[condition];
    this.#fog.color.setHex(mood.fogColor);
    this.#hemisphere.color.setHex(mood.hemisphereSky);
    this.#hemisphere.groundColor.setHex(mood.hemisphereGround);
    this.#hemisphere.intensity = mood.hemisphereIntensity;
    this.#sun.color.setHex(mood.sunColor);
    this.#sun.intensity = mood.sunIntensity;
    this.#fill.color.setHex(mood.fillColor);
    this.#fill.intensity = mood.fillIntensity;
    this.#rim.color.setHex(mood.rimColor);
    this.#rim.intensity = mood.rimIntensity;

    const atmosphere = this.#createEnvironmentTexture(mood);
    this.#scene.environment = atmosphere;
    this.#scene.background = atmosphere;
    this.#scene.backgroundBlurriness = mood.backgroundBlurriness;
    this.#environmentTexture?.dispose();
    this.#environmentTexture = atmosphere;
  }

  update(dt: number, routeActivity: number, rainDensity: number): void {
    this.#time += dt;

    const weatherDriftScale =
      this.#weatherMood === 'rainy' ? 1.16 : this.#weatherMood === 'sunny' ? 0.72 : 0.92;
    const weatherOpacityScale =
      this.#weatherMood === 'rainy' ? 1.08 : this.#weatherMood === 'sunny' ? 0.74 : 0.9;
    const routeMix = THREE.MathUtils.lerp(0.78, 1.06, THREE.MathUtils.clamp(routeActivity, 0, 1));
    const rainLift = THREE.MathUtils.lerp(0, 0.26, THREE.MathUtils.clamp(rainDensity, 0, 1));

    for (const layer of this.#mistLayers) {
      const driftTime = this.#time * layer.driftSpeed + layer.phase;
      const sway = Math.sin(driftTime) * layer.driftRadius * weatherDriftScale;
      const depthDrift =
        Math.cos(driftTime * 0.72 + layer.phase * 0.4)
        * layer.driftRadius
        * 0.42
        * weatherDriftScale;
      const verticalWave =
        Math.sin(driftTime * 0.46 + layer.phase) * layer.lift
        + rainLift * layer.lift * 0.45;

      layer.sprite.position.set(
        layer.basePosition.x + sway,
        layer.basePosition.y + verticalWave,
        layer.basePosition.z + depthDrift,
      );

      const opacityPulse = 0.9 + Math.sin(driftTime * 0.62 + layer.phase * 0.5) * 0.08;
      const scalePulse = 1 + Math.sin(driftTime * 0.38 + layer.phase) * 0.025;
      layer.sprite.scale.set(
        layer.baseScale.x * scalePulse,
        layer.baseScale.y * scalePulse,
        1,
      );

      const material = layer.sprite.material as THREE.SpriteMaterial;
      material.opacity =
        layer.baseOpacity * weatherOpacityScale * routeMix * opacityPulse;
    }
  }

  #createEnvironmentTexture(mood: SkyMood): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    if (!context) {
      throw new Error('Unable to create atmospheric texture.');
    }

    const skyGradient = context.createLinearGradient(0, 0, 0, canvas.height);
    for (const stop of mood.gradientStops) {
      skyGradient.addColorStop(stop.offset, stop.color);
    }
    context.fillStyle = skyGradient;
    context.fillRect(0, 0, canvas.width, canvas.height);

    const sunGlow = context.createRadialGradient(760, 128, 14, 760, 128, 220);
    sunGlow.addColorStop(0, mood.sunGlowInner);
    sunGlow.addColorStop(0.24, mood.sunGlowMid);
    sunGlow.addColorStop(0.72, mood.sunGlowOuter);
    sunGlow.addColorStop(1, 'rgba(255, 197, 126, 0)');
    context.fillStyle = sunGlow;
    context.fillRect(510, 10, 420, 300);

    const warmHaze = context.createLinearGradient(0, 180, 0, 360);
    warmHaze.addColorStop(0, mood.hazeStart);
    warmHaze.addColorStop(1, mood.hazeEnd);
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
    cloudDeck.addColorStop(0, mood.cloudDeckStart);
    cloudDeck.addColorStop(0.4, mood.cloudDeckMid);
    cloudDeck.addColorStop(1, mood.cloudDeckEnd);
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
      {
        position: new THREE.Vector3(0, 22, 90),
        scale: new THREE.Vector2(380, 116),
        color: 0xdde2da,
        opacity: 0.24,
        driftRadius: 7,
        driftSpeed: 0.16,
        phase: 0.2,
        lift: 1.4,
      },
      {
        position: new THREE.Vector3(-48, 27, 168),
        scale: new THREE.Vector2(430, 128),
        color: 0xd4dbd4,
        opacity: 0.22,
        driftRadius: 9,
        driftSpeed: 0.13,
        phase: 1.1,
        lift: 1.8,
      },
      {
        position: new THREE.Vector3(42, 34, 246),
        scale: new THREE.Vector2(490, 144),
        color: 0xcfd8d4,
        opacity: 0.19,
        driftRadius: 11,
        driftSpeed: 0.11,
        phase: 2.3,
        lift: 2.1,
      },
      {
        position: new THREE.Vector3(0, 48, 334),
        scale: new THREE.Vector2(580, 168),
        color: 0xc8d1cf,
        opacity: 0.17,
        driftRadius: 14,
        driftSpeed: 0.09,
        phase: 3.2,
        lift: 2.8,
      },
      {
        position: new THREE.Vector3(84, 22, 148),
        scale: new THREE.Vector2(280, 96),
        color: 0xe5e6dc,
        opacity: 0.13,
        driftRadius: 6,
        driftSpeed: 0.18,
        phase: 4.0,
        lift: 1.2,
      },
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
      this.#mistLayers.push({
        sprite,
        baseOpacity: layer.opacity,
        basePosition: layer.position.clone(),
        baseScale: layer.scale.clone(),
        driftRadius: layer.driftRadius,
        driftSpeed: layer.driftSpeed,
        phase: layer.phase,
        lift: layer.lift,
      });
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
