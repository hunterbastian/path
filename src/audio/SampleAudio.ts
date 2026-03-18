import { Howl, Howler } from 'howler';
import { expLerp } from '../core/math';
import type { DriveSurface, DrivingState } from '../vehicle/DrivingState';

/**
 * Sample-based audio system using Howler.js.
 * Replaces the oscillator-based EngineAudio with real recorded sounds.
 *
 * Required files in public/audio/:
 *   engine-low.ogg   — engine idle/low RPM loop
 *   engine-high.ogg  — engine high RPM loop
 *   wind.ogg         — ambient wind loop
 *   gravel.ogg       — tire-on-gravel loop
 *   skid.ogg         — tire screech/drift loop
 *   impact-light.ogg — light collision
 *   impact-heavy.ogg — heavy collision / landing
 *   splash.ogg       — water entry
 */

interface LoopSound {
  howl: Howl;
  id: number | null;
  volume: number;
  targetVolume: number;
  rate: number;
  targetRate: number;
}

const SURFACE_VOLUME: Record<DriveSurface, number> = {
  dirt: 0.3,
  sand: 0.35,
  grass: 0.2,
  rock: 0.4,
  snow: 0.25,
  water: 0.15,
};

export class SampleAudio {
  #engine: LoopSound | null = null;
  #engineHigh: LoopSound | null = null;
  #wind: LoopSound | null = null;
  #gravel: LoopSound | null = null;
  #skid: LoopSound | null = null;
  #impactLight: Howl | null = null;
  #impactHeavy: Howl | null = null;
  #splash: Howl | null = null;
  #activated = false;
  #masterVolume = 0.7;
  #wasInWater = false;

  activate(): void {
    if (this.#activated) return;
    this.#activated = true;

    // Loops — start silent, fade in based on game state
    this.#engine = this.#createLoop('audio/engine-low.ogg', 0, 1.0);
    this.#engineHigh = this.#createLoop('audio/engine-high.ogg', 0, 1.0);
    this.#wind = this.#createLoop('audio/wind.ogg', 0, 1.0);
    this.#gravel = this.#createLoop('audio/gravel.ogg', 0, 1.0);
    this.#skid = this.#createLoop('audio/skid.ogg', 0, 1.0);

    // One-shots
    this.#impactLight = new Howl({ src: ['audio/impact-light.ogg'], volume: 0.5 });
    this.#impactHeavy = new Howl({ src: ['audio/impact-heavy.ogg'], volume: 0.6 });
    this.#splash = new Howl({ src: ['audio/splash.ogg'], volume: 0.5 });
  }

  #createLoop(src: string, volume: number, rate: number): LoopSound {
    const howl = new Howl({
      src: [src],
      loop: true,
      volume: 0,
    });
    const id = howl.play();
    return { howl, id: typeof id === 'number' ? id : null, volume, targetVolume: volume, rate, targetRate: rate };
  }

  update(dt: number, state: DrivingState): void {
    if (!this.#activated) return;

    const speed = state.speed;
    const speedNorm = Math.min(speed / 34, 1);
    const throttle = Math.abs(state.throttle);

    // --- Engine ---
    if (this.#engine) {
      // Low engine: loud at idle, fades as speed increases
      this.#engine.targetVolume = Math.max(0.15, (1 - speedNorm * 0.7)) * 0.5 * this.#masterVolume;
      this.#engine.targetRate = 0.7 + throttle * 0.3 + speedNorm * 0.4;
    }
    if (this.#engineHigh) {
      // High engine: fades in with speed
      this.#engineHigh.targetVolume = speedNorm * 0.45 * this.#masterVolume;
      this.#engineHigh.targetRate = 0.8 + speedNorm * 0.7 + throttle * 0.2;
    }

    // --- Wind ---
    if (this.#wind) {
      this.#wind.targetVolume = (0.05 + speedNorm * 0.35) * this.#masterVolume;
      this.#wind.targetRate = 0.8 + speedNorm * 0.4;
    }

    // --- Surface crunch ---
    if (this.#gravel) {
      const surfaceVol = SURFACE_VOLUME[state.surface] ?? 0.25;
      this.#gravel.targetVolume = state.isGrounded
        ? surfaceVol * speedNorm * this.#masterVolume
        : 0;
      this.#gravel.targetRate = 0.6 + speedNorm * 0.8;
    }

    // --- Skid/drift ---
    if (this.#skid) {
      this.#skid.targetVolume = state.isDrifting
        ? Math.min(Math.abs(state.lateralSpeed) / 8, 1) * 0.3 * this.#masterVolume
        : 0;
      this.#skid.targetRate = 0.8 + Math.abs(state.lateralSpeed) * 0.03;
    }

    // --- One-shot triggers ---
    // Impact
    if (state.impactMagnitude > 0.5 && !state.wasAirborne) {
      if (state.impactMagnitude > 4) {
        this.#impactHeavy?.play();
      } else {
        this.#impactLight?.play();
      }
    }

    // Landing
    if (state.wasAirborne && Math.abs(state.verticalSpeed) > 3) {
      this.#impactHeavy?.play();
    }

    // Water entry
    const inWater = state.surface === 'water';
    if (inWater && !this.#wasInWater && speed > 4) {
      this.#splash?.play();
    }
    this.#wasInWater = inWater;

    // --- Smooth all loops ---
    this.#smoothLoop(this.#engine, dt);
    this.#smoothLoop(this.#engineHigh, dt);
    this.#smoothLoop(this.#wind, dt);
    this.#smoothLoop(this.#gravel, dt);
    this.#smoothLoop(this.#skid, dt);
  }

  #smoothLoop(loop: LoopSound | null, dt: number): void {
    if (!loop || loop.id === null) return;

    loop.volume = expLerp(loop.volume, loop.targetVolume, 8, dt);
    loop.rate = expLerp(loop.rate, loop.targetRate, 6, dt);

    loop.howl.volume(Math.max(loop.volume, 0.001), loop.id);
    loop.howl.rate(Math.max(loop.rate, 0.1), loop.id);
  }

  setMasterVolume(volume: number): void {
    this.#masterVolume = Math.max(0, Math.min(1, volume));
  }

  mute(): void {
    Howler.mute(true);
  }

  unmute(): void {
    Howler.mute(false);
  }

  dispose(): void {
    this.#engine?.howl.unload();
    this.#engineHigh?.howl.unload();
    this.#wind?.howl.unload();
    this.#gravel?.howl.unload();
    this.#skid?.howl.unload();
    this.#impactLight?.unload();
    this.#impactHeavy?.unload();
    this.#splash?.unload();
  }
}
