import * as THREE from 'three';
import { EngineAudio, type AmbientAudioState } from '../audio/EngineAudio';
import { ExhaustAudio } from '../audio/ExhaustAudio';
import { ImpactAudio } from '../audio/ImpactAudio';
import { ScrapeAudio } from '../audio/ScrapeAudio';
import { TireAudio } from '../audio/TireAudio';
import { UIAudio } from '../audio/UIAudio';
import type { ShellMode } from '../core/AppShell';
import type { DrivingState } from '../vehicle/DrivingState';

export interface AudioManagerDeps {
  getListenerPosition: () => THREE.Vector3;
  getControllerState: () => DrivingState;
  getObjectivePosition: () => THREE.Vector3;
  getLandmarkPosition: () => THREE.Vector3;
  getOutpostPositions: () => THREE.Vector3[];
  getRainDensity: () => number;
  getRouteActivity: () => number;
  getWindAudioMultiplier: () => number;
  getRelayAudioMultiplier: () => number;
  isArrived: () => boolean;
}

export class AudioManager {
  readonly #engineAudio: EngineAudio;
  #impactAudio: ImpactAudio | null = null;
  #tireAudio: TireAudio | null = null;
  #exhaustAudio: ExhaustAudio | null = null;
  #scrapeAudio: ScrapeAudio | null = null;
  #uiAudio: UIAudio | null = null;
  #honkCooldown = 0;
  #prevDamageHealth = 1;
  readonly #deps: AudioManagerDeps;
  readonly #handleUnlockGesture = (): void => {
    void this.activate();
  };

  constructor(deps: AudioManagerDeps) {
    this.#deps = deps;
    this.#engineAudio = new EngineAudio();
  }

  get engineAudio(): EngineAudio {
    return this.#engineAudio;
  }

  get uiAudio(): UIAudio | null {
    return this.#uiAudio;
  }

  get impactAudio(): ImpactAudio | null {
    return this.#impactAudio;
  }

  async activate(): Promise<void> {
    const unlocked = await this.#engineAudio.activate();
    if (unlocked) {
      this.removeUnlockListeners();
      if (!this.#impactAudio) {
        const ctx = this.#engineAudio.audioContext;
        const dest = this.#engineAudio.compressorNode;
        if (ctx && dest) {
          this.#impactAudio = new ImpactAudio(ctx, dest);
          this.#tireAudio = new TireAudio(ctx, dest);
          this.#exhaustAudio = new ExhaustAudio(ctx, dest);
          this.#scrapeAudio = new ScrapeAudio(ctx, dest);
          this.#uiAudio = new UIAudio(ctx, dest);
        }
      }
    }
  }

  installUnlockListeners(): void {
    window.addEventListener('pointerdown', this.#handleUnlockGesture);
    window.addEventListener('keydown', this.#handleUnlockGesture);
  }

  removeUnlockListeners(): void {
    window.removeEventListener('pointerdown', this.#handleUnlockGesture);
    window.removeEventListener('keydown', this.#handleUnlockGesture);
  }

  updateDriving(
    dt: number,
    mode: ShellMode,
    state: DrivingState,
    damageHealth: number,
    nearestHonkDistance: number,
  ): void {
    // Impact audio triggers
    if (this.#impactAudio) {
      if (damageHealth < this.#prevDamageHealth) {
        this.#impactAudio.playPartDetach();
      }
      this.#prevDamageHealth = damageHealth;

      if (state.wasAirborne) {
        const mag = Math.min(Math.abs(state.impactMagnitude) / 12, 1);
        this.#impactAudio.playLanding(mag);
      }

      if (state.impactMagnitude > 1.5 && !state.wasAirborne) {
        const mag = Math.min(state.impactMagnitude / 10, 1);
        this.#impactAudio.playCollision(mag);
      } else if (state.impactMagnitude > 0.3 && state.impactMagnitude <= 1.5) {
        this.#impactAudio.playScrape();
      }

      // Honk audio from NPCs
      this.#honkCooldown = Math.max(0, this.#honkCooldown - dt);
      if (this.#honkCooldown <= 0 && nearestHonkDistance >= 0) {
        this.#impactAudio.playHonk(nearestHonkDistance);
        this.#honkCooldown = 1.5;
      }
    }

    this.#engineAudio.update(state, mode, this.#buildAmbientSnapshot());
    this.#tireAudio?.update(state);
    this.#scrapeAudio?.update(state);
    this.#exhaustAudio?.update(dt, state.speed, state.throttle, state.isBoosting);
  }

  updatePaused(pausedState: DrivingState): void {
    this.#engineAudio.update(pausedState, 'driving', this.#buildAmbientSnapshot());
  }

  resetDamageTracking(): void {
    this.#prevDamageHealth = 1;
  }

  #buildAmbientSnapshot(): AmbientAudioState {
    const listenerPosition = this.#deps.getListenerPosition();
    const objectivePosition = this.#deps.getObjectivePosition();
    const landmarkPosition = this.#deps.getLandmarkPosition();
    const outpostPositions = this.#deps.getOutpostPositions();
    const state = this.#deps.getControllerState();

    const objectiveDistance = Math.hypot(
      listenerPosition.x - objectivePosition.x,
      listenerPosition.z - objectivePosition.z,
    );
    let relayDistance = Number.POSITIVE_INFINITY;
    for (const outpost of outpostPositions) {
      relayDistance = Math.min(
        relayDistance,
        Math.hypot(
          listenerPosition.x - outpost.x,
          listenerPosition.z - outpost.z,
        ),
      );
    }
    const landmarkDistance = Math.hypot(
      listenerPosition.x - landmarkPosition.x,
      listenerPosition.z - landmarkPosition.z,
    );
    const mountainProximity = THREE.MathUtils.clamp(1 - landmarkDistance / 320, 0, 1);
    const relayProximity = THREE.MathUtils.clamp(1 - relayDistance / 92, 0, 1);
    const summitProximity = THREE.MathUtils.clamp(1 - objectiveDistance / 120, 0, 1);
    const windExposure = THREE.MathUtils.clamp(
      0.22
      + mountainProximity * 0.72
      + Math.abs(state.verticalSpeed) * 0.08
      + Math.min(state.speed / 26, 1) * 0.12,
      0,
      1.35,
    );

    return {
      rainDensity: this.#deps.getRainDensity(),
      routeActivity: this.#deps.getRouteActivity(),
      windExposure,
      weatherWindMix: this.#deps.getWindAudioMultiplier(),
      weatherRelayMix: this.#deps.getRelayAudioMultiplier(),
      relayProximity,
      summitProximity,
      arrivalPulse: this.#deps.isArrived() ? 1 : 0,
    };
  }

  dispose(): void {
    this.removeUnlockListeners();
    this.#engineAudio.dispose();
  }
}
