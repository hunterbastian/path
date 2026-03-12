import * as THREE from 'three';
import { DustEmitter } from '../effects/DustEmitter';
import { DustSystem, type DustConfig } from '../effects/DustSystem';
import { SparkSystem } from '../effects/SparkSystem';
import { RainSystem } from '../effects/RainSystem';
import { SplashEmitter } from '../effects/SplashEmitter';
import { SplashSystem } from '../effects/SplashSystem';
import { TireTrackSystem } from '../effects/TireTrackSystem';
import { WindSystem } from '../effects/WindSystem';
import { SeededRandom } from '../core/SeededRandom';
import type { Terrain } from '../world/Terrain';
import type { VehicleController } from '../vehicle/VehicleController';
import type { Water } from '../world/Water';
import type { AmbientTrafficSystem } from '../world/AmbientTrafficSystem';
import type { WeatherSnapshot } from '../gameplay/WeatherState';
import type { AmbientTrafficPlayerInteraction } from '../world/AmbientTrafficSystem';

const SLOPE_SKITTER_DEBRIS: DustConfig = {
  size: 0.18,
  growth: 0.1,
  life: 0.84,
  spread: 0.18,
  lift: 0.08,
  jitter: 0.16,
};

const TRAFFIC_IMPACT_DEBRIS: DustConfig = {
  size: 0.3,
  growth: 0.18,
  life: 0.72,
  spread: 0.34,
  lift: 0.18,
  jitter: 0.42,
};

const ENGINE_SMOKE_CONFIG: DustConfig = {
  size: 0.22,
  growth: 0.38,
  life: 1.6,
  spread: 0.12,
  lift: 1.4,
  jitter: 0.28,
};

const ENGINE_FIRE_CONFIG: DustConfig = {
  size: 0.14,
  growth: 0.12,
  life: 0.45,
  spread: 0.08,
  lift: 2.8,
  jitter: 0.6,
};

export class EffectsCoordinator {
  readonly rainSystem: RainSystem;
  readonly #dustSystem: DustSystem;
  readonly #snowSpraySystem: DustSystem;
  readonly #debrisSystem: DustSystem;
  readonly #sparkSystem: SparkSystem;
  readonly #dustEmitter: DustEmitter;
  readonly #splashSystem: SplashSystem;
  readonly #mudSplashSystem: SplashSystem;
  readonly #splashEmitter: SplashEmitter;
  readonly #tireTrackSystem: TireTrackSystem;
  readonly #smokeSystem: DustSystem;
  readonly #fireSystem: DustSystem;
  readonly #fireLight: THREE.PointLight;
  readonly #windSystem: WindSystem;
  readonly #terrain: Terrain;

  // Smoke + fire state
  #smokeTimer = 0;
  #fireTimer = 0;
  #fireLightIntensity = 0;
  readonly #smokeOrigin = new THREE.Vector3();
  readonly #smokeVelocity = new THREE.Vector3();
  readonly #fireOrigin = new THREE.Vector3();

  // Collision spark state
  readonly #collisionSparkOrigin = new THREE.Vector3();
  readonly #collisionSparkVelocity = new THREE.Vector3();

  // Debris state
  readonly #debrisRandom = new SeededRandom(0x44454252);
  readonly #debrisProbe = new THREE.Vector3();
  readonly #debrisOrigin = new THREE.Vector3();
  readonly #debrisDownhill = new THREE.Vector3();
  readonly #debrisLateral = new THREE.Vector3();
  readonly #debrisVelocity = new THREE.Vector3();
  readonly #worldUp = new THREE.Vector3(0, 1, 0);
  #slopeDebrisTimer = 0;
  #ambientSkitterStrength = 0;
  #recentTrafficImpactDebris = 0;
  #lastTrafficCollisionSourceId: string | null = null;

  constructor(scene: THREE.Scene, terrain: Terrain, water: Water) {
    this.#terrain = terrain;

    this.rainSystem = new RainSystem(scene, terrain);
    this.#dustSystem = new DustSystem(scene);
    this.#snowSpraySystem = new DustSystem(scene, {
      capacity: 280,
      color: 0xf0f4fb,
      opacity: 0.46,
      gravity: -3.4,
      drag: 0.92,
    });
    this.#debrisSystem = new DustSystem(scene, {
      capacity: 180,
      color: 0x8a755e,
      opacity: 0.28,
      gravity: -9.6,
      drag: 0.88,
      fade: (lifeFraction) => Math.pow(1 - lifeFraction, 1.3),
    });
    this.#sparkSystem = new SparkSystem(scene);
    this.#dustEmitter = new DustEmitter(this.#dustSystem, {
      terrain,
      snowSystem: this.#snowSpraySystem,
      debrisSystem: this.#debrisSystem,
      sparkSystem: this.#sparkSystem,
    });
    this.#splashSystem = new SplashSystem(scene);
    this.#mudSplashSystem = new SplashSystem(scene, {
      capacity: 180,
      color: 0x66523f,
      opacity: 0.5,
      gravity: -8.8,
      drag: 0.9,
    });
    this.#splashEmitter = new SplashEmitter(this.#splashSystem, {
      terrain,
      mudSystem: this.#mudSplashSystem,
    });
    this.#smokeSystem = new DustSystem(scene, {
      capacity: 120,
      color: 0x2a2420,
      opacity: 0.32,
      gravity: -1.6,
      drag: 0.96,
      fade: (f) => Math.pow(1 - f, 2.2),
    });
    this.#fireSystem = new DustSystem(scene, {
      capacity: 80,
      color: 0xff8822,
      opacity: 0.7,
      gravity: -3.2,
      drag: 0.93,
      fade: (f) => f < 0.3 ? 1 : Math.pow(1 - (f - 0.3) / 0.7, 1.5),
      blending: THREE.AdditiveBlending,
    });
    this.#fireLight = new THREE.PointLight(0xff6611, 0, 8, 2);
    this.#fireLight.castShadow = false;
    scene.add(this.#fireLight);
    this.#tireTrackSystem = new TireTrackSystem(scene, terrain);
    this.#windSystem = new WindSystem(scene);
  }

  get windSystem(): WindSystem {
    return this.#windSystem;
  }

  get tireTrackSystem(): TireTrackSystem {
    return this.#tireTrackSystem;
  }

  get ambientSkitterStrength(): number {
    return this.#ambientSkitterStrength;
  }

  get recentTrafficImpactDebris(): number {
    return this.#recentTrafficImpactDebris;
  }

  /** Debug particle counts */
  getDebugCounts(): {
    dust: number;
    snowSpray: number;
    debris: number;
    splash: number;
    mudSplash: number;
  } {
    return {
      dust: this.#dustSystem.activeCount,
      snowSpray: this.#snowSpraySystem.activeCount,
      debris: this.#debrisSystem.activeCount,
      splash: this.#splashSystem.activeCount,
      mudSplash: this.#mudSplashSystem.activeCount,
    };
  }

  /** Per-frame update for all particle systems, tire tracks, and ambient debris. */
  update(
    dt: number,
    controller: VehicleController,
    water: Water,
    weather: WeatherSnapshot,
    cameraPosition: THREE.Vector3,
    trafficInteraction: AmbientTrafficPlayerInteraction,
    ambientTraffic: AmbientTrafficSystem,
    isGodMode: boolean,
  ): void {
    this.#updateAmbientDebris(
      dt,
      weather,
      trafficInteraction,
      isGodMode ? cameraPosition : controller.position,
    );

    this.#dustEmitter.update(dt, controller);
    this.#dustSystem.update(dt);
    this.#snowSpraySystem.update(dt);
    this.#debrisSystem.update(dt);
    this.#sparkSystem.update(dt);
    this.#smokeSystem.update(dt);
    this.#fireSystem.update(dt);
    this.#splashEmitter.update(dt, controller, water);
    this.#splashSystem.update(dt);
    this.#mudSplashSystem.update(dt);
    this.#tireTrackSystem.setWetness(weather.rainDensity);
    this.#tireTrackSystem.update(dt);
    this.#tireTrackSystem.updateSource({
      id: 'player',
      state: controller.state,
      wheelWorldPositions: controller.wheelWorldPositions,
    }, dt);
    for (const trackSource of ambientTraffic.getTrackSources()) {
      this.#tireTrackSystem.updateSource(trackSource, dt);
    }

    this.#windSystem.update(dt, cameraPosition);
    this.rainSystem.update(dt, cameraPosition);
  }

  /** Reduced update for god mode — no emitters, just particles + tracks. */
  updateGodMode(
    dt: number,
    weather: WeatherSnapshot,
    cameraPosition: THREE.Vector3,
    trafficInteraction: AmbientTrafficPlayerInteraction,
    ambientTraffic: AmbientTrafficSystem,
  ): void {
    this.#updateAmbientDebris(dt, weather, trafficInteraction, cameraPosition);

    this.#dustSystem.update(dt);
    this.#snowSpraySystem.update(dt);
    this.#debrisSystem.update(dt);
    this.#sparkSystem.update(dt);
    this.#smokeSystem.update(dt);
    this.#fireSystem.update(dt);
    this.#splashSystem.update(dt);
    this.#mudSplashSystem.update(dt);
    this.#tireTrackSystem.setWetness(weather.rainDensity);
    this.#tireTrackSystem.update(dt);
    for (const trackSource of ambientTraffic.getTrackSources()) {
      this.#tireTrackSystem.updateSource(trackSource, dt);
    }

    this.#windSystem.update(dt, cameraPosition);
    this.rainSystem.update(dt, cameraPosition);
  }

  /** Emit landing burst from dust emitter. */
  emitLandingBurst(controller: VehicleController, magnitude: number): void {
    this.#dustEmitter.emitLandingBurst(controller, magnitude);
  }

  /**
   * Emit dark engine smoke behind the vehicle when damaged.
   * Call each frame — internally throttled based on damage severity.
   */
  emitEngineSmoke(
    dt: number,
    position: THREE.Vector3,
    velocity: THREE.Vector3,
    vehicleHealth: number,
  ): void {
    // Fire light decay — always tick so it fades out when health recovers
    const onFire = vehicleHealth <= 0.25;
    const targetFireIntensity = onFire
      ? THREE.MathUtils.lerp(2, 6, 1 - vehicleHealth * 4)
      : 0;
    this.#fireLightIntensity += (targetFireIntensity - this.#fireLightIntensity) * Math.min(dt * 8, 1);

    if (this.#fireLightIntensity > 0.1) {
      // Flicker: random intensity variation for realistic fire
      const flicker = 0.75 + Math.random() * 0.5;
      this.#fireLight.intensity = this.#fireLightIntensity * flicker;
      this.#fireLight.position.copy(position);
      this.#fireLight.position.y += 1.2;
    } else {
      this.#fireLight.intensity = 0;
    }

    if (vehicleHealth > 0.5) return;

    // Emit faster as damage increases: every 0.08s at 0% health, 0.22s at 50%
    const severity = 1 - vehicleHealth * 2; // 0 at 50%, 1 at 0%
    const interval = THREE.MathUtils.lerp(0.22, 0.06, severity);
    this.#smokeTimer += dt;
    if (this.#smokeTimer < interval) return;
    this.#smokeTimer = 0;

    // Emit from hood area (front-center of vehicle)
    const speed = Math.hypot(velocity.x, velocity.z);
    this.#smokeOrigin.copy(position);
    if (speed > 1) {
      // Offset slightly forward — smoke comes from the engine bay
      this.#smokeOrigin.x += (velocity.x / speed) * 0.8;
      this.#smokeOrigin.z += (velocity.z / speed) * 0.8;
    }
    this.#smokeOrigin.y += 0.6;

    this.#smokeVelocity.set(
      velocity.x * 0.15,
      0.8 + severity * 0.6,
      velocity.z * 0.15,
    );

    const count = severity > 0.6 ? 3 : 2;
    this.#smokeSystem.emit(this.#smokeOrigin, this.#smokeVelocity, ENGINE_SMOKE_CONFIG, count);

    // Fire particles below 25% health
    if (onFire) {
      this.#fireTimer += dt;
      const fireInterval = THREE.MathUtils.lerp(0.08, 0.03, 1 - vehicleHealth * 4);
      if (this.#fireTimer >= fireInterval) {
        this.#fireTimer = 0;
        this.#fireOrigin.copy(this.#smokeOrigin);
        this.#fireOrigin.y += 0.15;
        const fireVelY = 1.8 + (1 - vehicleHealth * 4) * 1.2;
        this.#smokeVelocity.set(
          velocity.x * 0.08 + (Math.random() - 0.5) * 0.6,
          fireVelY,
          velocity.z * 0.08 + (Math.random() - 0.5) * 0.6,
        );
        const fireCount = vehicleHealth < 0.1 ? 4 : 2;
        this.#fireSystem.emit(this.#fireOrigin, this.#smokeVelocity, ENGINE_FIRE_CONFIG, fireCount);
      }
    }
  }

  /**
   * Emit sparks at a collision point between the player and an obstacle.
   */
  emitCollisionSparks(
    playerPosition: THREE.Vector3,
    playerVelocity: THREE.Vector3,
    correction: THREE.Vector3,
  ): void {
    // Spark origin is at the collision surface — opposite of correction direction
    const corrLen = Math.hypot(correction.x, correction.z);
    if (corrLen < 0.001) return;

    this.#collisionSparkOrigin.copy(playerPosition);
    this.#collisionSparkOrigin.x -= (correction.x / corrLen) * 1.6;
    this.#collisionSparkOrigin.z -= (correction.z / corrLen) * 1.6;
    this.#collisionSparkOrigin.y += 0.3;

    this.#collisionSparkVelocity.copy(playerVelocity);

    const speed = Math.hypot(playerVelocity.x, playerVelocity.z);
    const sparkCount = Math.min(Math.floor(speed * 0.8), 12);
    if (sparkCount < 2) return;

    this.#sparkSystem.emit(
      this.#collisionSparkOrigin,
      this.#collisionSparkVelocity,
      sparkCount,
      THREE.MathUtils.clamp(speed / 28, 0.3, 1),
    );
  }

  /** Clear tire tracks (on restart). */
  clearTracks(): void {
    this.#tireTrackSystem.clear();
  }

  /** Reset transient debris state. */
  resetDebris(): void {
    this.#ambientSkitterStrength = 0;
    this.#recentTrafficImpactDebris = 0;
    this.#lastTrafficCollisionSourceId = null;
    this.#slopeDebrisTimer = 0;
  }

  #updateAmbientDebris(
    dt: number,
    weather: WeatherSnapshot,
    trafficInteraction: AmbientTrafficPlayerInteraction,
    listenerPosition: THREE.Vector3,
  ): void {
    this.#recentTrafficImpactDebris = Math.max(0, this.#recentTrafficImpactDebris - dt * 1.6);
    this.#ambientSkitterStrength = Math.max(0, this.#ambientSkitterStrength - dt * 1.25);

    if (
      trafficInteraction.collision
      && trafficInteraction.sourceId
      && trafficInteraction.sourceId !== this.#lastTrafficCollisionSourceId
    ) {
      this.#emitTrafficImpactDebris(trafficInteraction, listenerPosition);
      this.#lastTrafficCollisionSourceId = trafficInteraction.sourceId;
    } else if (!trafficInteraction.collision) {
      this.#lastTrafficCollisionSourceId = null;
    }

    this.#slopeDebrisTimer += dt;
    const spawnInterval = THREE.MathUtils.lerp(0.42, 0.16, weather.rainDensity);
    if (this.#slopeDebrisTimer < spawnInterval) return;
    this.#slopeDebrisTimer = 0;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const angle = this.#debrisRandom.range(0, Math.PI * 2);
      const distance = this.#debrisRandom.range(5, 16);
      this.#debrisProbe.set(
        listenerPosition.x + Math.sin(angle) * distance,
        0,
        listenerPosition.z + Math.cos(angle) * distance,
      );
      if (!this.#terrain.isWithinBounds(this.#debrisProbe.x, this.#debrisProbe.z)) continue;

      const surface = this.#terrain.getSurfaceAt(this.#debrisProbe.x, this.#debrisProbe.z);
      if (surface === 'sand') continue;

      this.#debrisDownhill.copy(
        this.#terrain.getNormalAt(this.#debrisProbe.x, this.#debrisProbe.z),
      );
      this.#debrisDownhill.set(-this.#debrisDownhill.x, 0, -this.#debrisDownhill.z);
      const downhillStrength = this.#debrisDownhill.length();
      const roadInfluence = this.#terrain.getRoadInfluence(
        this.#debrisProbe.x,
        this.#debrisProbe.z,
      );
      const slopeStrength = THREE.MathUtils.clamp(
        (downhillStrength - 0.18) / 0.38,
        0,
        1,
      );
      if (slopeStrength < 0.22) continue;

      this.#debrisDownhill.normalize();
      this.#debrisLateral.crossVectors(this.#worldUp, this.#debrisDownhill).normalize();
      if (this.#debrisLateral.lengthSq() < 0.0001) {
        this.#debrisLateral.set(1, 0, 0);
      }

      this.#debrisOrigin.set(
        this.#debrisProbe.x,
        this.#terrain.getHeightAt(this.#debrisProbe.x, this.#debrisProbe.z) + 0.08,
        this.#debrisProbe.z,
      );
      const travelSpeed =
        this.#debrisRandom.range(1.6, 3.8)
        * THREE.MathUtils.lerp(0.82, 1.4, slopeStrength)
        * THREE.MathUtils.lerp(1, 1.28, weather.rainDensity);
      this.#debrisVelocity
        .copy(this.#debrisDownhill)
        .multiplyScalar(travelSpeed)
        .addScaledVector(this.#debrisLateral, this.#debrisRandom.signed() * 0.55)
        .setY(this.#debrisRandom.range(0.05, 0.16));

      const count =
        surface === 'rock'
          ? 2
          : roadInfluence > 0.24 || weather.rainDensity > 0.72
            ? 2
            : 1;
      this.#debrisSystem.emit(
        this.#debrisOrigin,
        this.#debrisVelocity,
        SLOPE_SKITTER_DEBRIS,
        count,
      );
      this.#ambientSkitterStrength = Math.max(
        this.#ambientSkitterStrength,
        slopeStrength * travelSpeed,
      );
      break;
    }
  }

  #emitTrafficImpactDebris(
    trafficInteraction: AmbientTrafficPlayerInteraction,
    playerPosition: THREE.Vector3,
  ): void {
    const sourcePosition = trafficInteraction.sourcePosition;
    if (!sourcePosition) return;

    this.#debrisOrigin
      .copy(playerPosition)
      .lerp(sourcePosition, 0.52);
    this.#debrisOrigin.y = Math.max(playerPosition.y, sourcePosition.y) + 0.45;

    this.#debrisVelocity.copy(trafficInteraction.impulse).setY(0);
    if (this.#debrisVelocity.lengthSq() < 0.0001) {
      this.#debrisVelocity.copy(playerPosition).sub(sourcePosition).setY(0);
    }
    if (this.#debrisVelocity.lengthSq() < 0.0001) {
      this.#debrisVelocity.set(1, 0, 0);
    }
    this.#debrisVelocity.normalize();
    this.#debrisLateral
      .crossVectors(this.#worldUp, this.#debrisVelocity)
      .normalize();
    if (this.#debrisLateral.lengthSq() < 0.0001) {
      this.#debrisLateral.set(0, 0, 1);
    }

    const impactStrength = Math.max(1, trafficInteraction.impulse.length());
    const launchSpeed = THREE.MathUtils.clamp(impactStrength * 2.4, 2.6, 5.2);
    this.#debrisVelocity
      .multiplyScalar(launchSpeed)
      .addScaledVector(this.#debrisLateral, this.#debrisRandom.signed() * 1.2)
      .setY(this.#debrisRandom.range(0.18, 0.42));

    this.#debrisSystem.emit(
      this.#debrisOrigin,
      this.#debrisVelocity,
      TRAFFIC_IMPACT_DEBRIS,
      8,
    );
    this.#recentTrafficImpactDebris = 1;
  }

  dispose(): void {
    this.rainSystem.dispose();
    this.#dustSystem.dispose();
    this.#snowSpraySystem.dispose();
    this.#debrisSystem.dispose();
    this.#sparkSystem.dispose();
    this.#smokeSystem.dispose();
    this.#fireSystem.dispose();
    this.#splashSystem.dispose();
    this.#mudSplashSystem.dispose();
    this.#tireTrackSystem.dispose();
  }
}
