import * as THREE from 'three';
import type { GameTuning, WeatherCondition, WeatherProfile } from '../config/GameTuning';
import { RainSystem } from '../effects/RainSystem';
import { Sky } from '../world/Sky';
import {
  sampleBiome,
  type BiomeDefinition,
  type BiomeWeatherConfig,
  BIOME_ALPINE_MEADOWS,
} from '../world/BiomeConfig';

export interface WeatherSnapshot {
  condition: WeatherCondition;
  label: string;
  cycleIndex: number;
  secondsUntilChange: number;
  rainDensity: number;
  fogNear: number;
  fogFar: number;
  mistStrength: number;
  visibilityScale: number;
  gripMultiplier: number;
  dragMultiplier: number;
  waterLevelOffset: number;
  waterActivityMultiplier: number;
  trafficSpeedMultiplier: number;
  trafficCautionMultiplier: number;
  windAudioMultiplier: number;
  relayAudioMultiplier: number;
}

// ---------------------------------------------------------------------------
// Weather event state machine
// ---------------------------------------------------------------------------

type EventPhase = 'clear' | 'fade_in' | 'hold' | 'fade_out';

/** Profiles for each active-weather condition (values at full intensity). */
const CONDITION_PROFILES: Record<
  Exclude<WeatherCondition, 'sunny' | 'cloudy'>,
  {
    label: string;
    rainDensity: number;
    fogNear: number;
    fogFar: number;
    mistStrength: number;
    visibilityScale: number;
    gripMultiplier: number;
    dragMultiplier: number;
    waterLevelOffset: number;
    waterActivityMultiplier: number;
    trafficSpeedMultiplier: number;
    trafficCautionMultiplier: number;
    windAudioMultiplier: number;
    relayAudioMultiplier: number;
  }
> = {
  rainy: {
    label: 'Rain',
    rainDensity: 1,
    fogNear: 44,
    fogFar: 380,
    mistStrength: 0.88,
    visibilityScale: 0.78,
    gripMultiplier: 0.84,
    dragMultiplier: 1.14,
    waterLevelOffset: 0.18,
    waterActivityMultiplier: 1.28,
    trafficSpeedMultiplier: 0.76,
    trafficCautionMultiplier: 1.22,
    windAudioMultiplier: 0.86,
    relayAudioMultiplier: 0.9,
  },
  snowy: {
    label: 'Snow',
    rainDensity: 0.7,
    fogNear: 40,
    fogFar: 360,
    mistStrength: 0.82,
    visibilityScale: 0.72,
    gripMultiplier: 0.74,
    dragMultiplier: 1.08,
    waterLevelOffset: 0.02,
    waterActivityMultiplier: 0.92,
    trafficSpeedMultiplier: 0.72,
    trafficCautionMultiplier: 1.18,
    windAudioMultiplier: 0.80,
    relayAudioMultiplier: 0.88,
  },
  blizzard: {
    label: 'Blizzard',
    rainDensity: 1.2,
    fogNear: 20,
    fogFar: 180,
    mistStrength: 0.96,
    visibilityScale: 0.35,
    gripMultiplier: 0.62,
    dragMultiplier: 1.18,
    waterLevelOffset: 0.02,
    waterActivityMultiplier: 0.88,
    trafficSpeedMultiplier: 0.58,
    trafficCautionMultiplier: 1.42,
    windAudioMultiplier: 1.2,
    relayAudioMultiplier: 0.72,
  },
  dust: {
    label: 'Dust Storm',
    rainDensity: 0,
    fogNear: 18,
    fogFar: 160,
    mistStrength: 0.94,
    visibilityScale: 0.38,
    gripMultiplier: 0.88,
    dragMultiplier: 1.10,
    waterLevelOffset: 0,
    waterActivityMultiplier: 0.96,
    trafficSpeedMultiplier: 0.68,
    trafficCautionMultiplier: 1.30,
    windAudioMultiplier: 1.15,
    relayAudioMultiplier: 0.78,
  },
};

/** Clear weather baseline values. */
const CLEAR_PROFILE = {
  rainDensity: 0,
  fogNear: 56,
  fogFar: 520,
  mistStrength: 0.48,
  visibilityScale: 1,
  gripMultiplier: 1.05,
  dragMultiplier: 0.96,
  waterLevelOffset: -0.08,
  waterActivityMultiplier: 0.84,
  trafficSpeedMultiplier: 1.08,
  trafficCautionMultiplier: 0.92,
  windAudioMultiplier: 0.78,
  relayAudioMultiplier: 1.08,
};

/** Human-friendly label for the condition */
function conditionLabel(condition: WeatherCondition): string {
  if (condition === 'sunny') return 'Sunny';
  if (condition === 'cloudy') return 'Cloudy';
  return CONDITION_PROFILES[condition].label;
}

/** Determine the Sky mood for a given condition */
function conditionToMood(condition: WeatherCondition, intensity: number): WeatherCondition {
  if (condition === 'sunny' || condition === 'cloudy') return condition;
  // Below 30% intensity, show as cloudy rather than the active condition
  if (intensity < 0.3) return 'cloudy';
  return condition;
}

export class WeatherState {
  readonly #tuning: GameTuning;
  readonly #sky: Sky;
  readonly #rainSystem: RainSystem;

  // Event state machine
  #phase: EventPhase = 'clear';
  #phaseTimer = 0;
  #clearDuration = 0;
  #activeCondition: WeatherCondition = 'sunny';
  /** 0 = fully clear, 1 = full intensity */
  #eventIntensity = 0;
  #currentBiome: BiomeDefinition = BIOME_ALPINE_MEADOWS;
  #prevMoodCondition: WeatherCondition = 'sunny';

  #forcedCondition: WeatherCondition | null = null;
  #snapshot: WeatherSnapshot;

  // Simple seeded LCG for deterministic weather timing
  #seed = 0x57454154;

  constructor(tuning: GameTuning, sky: Sky, rainSystem: RainSystem) {
    this.#tuning = tuning;
    this.#sky = sky;
    this.#rainSystem = rainSystem;

    // Start in clear phase with a random timer
    this.#clearDuration = this.#randomClearDuration(BIOME_ALPINE_MEADOWS.weather);
    this.#phaseTimer = this.#clearDuration;
    this.#phase = 'clear';

    this.#snapshot = this.#buildSnapshot(1);
    this.update(0, 1);
  }

  get snapshot(): WeatherSnapshot {
    return this.#snapshot;
  }

  forceCondition(condition: WeatherCondition | null): WeatherSnapshot {
    this.#forcedCondition = condition;
    if (condition && condition !== 'sunny' && condition !== 'cloudy') {
      this.#activeCondition = condition;
      this.#eventIntensity = 1;
      this.#phase = 'hold';
      this.#phaseTimer = Infinity;
    } else if (condition === 'sunny' || condition === 'cloudy') {
      this.#activeCondition = condition;
      this.#eventIntensity = 0;
      this.#phase = 'clear';
      this.#phaseTimer = Infinity;
    } else {
      // null = un-force, restart natural cycle
      this.#phase = 'clear';
      this.#phaseTimer = this.#randomClearDuration(this.#currentBiome.weather);
      this.#eventIntensity = 0;
      this.#activeCondition = 'sunny';
    }
    return this.update(0, 1);
  }

  update(dt: number, routeActivity: number, playerPosition?: THREE.Vector3): WeatherSnapshot {
    // Determine current biome from player position
    if (playerPosition) {
      const sample = sampleBiome(playerPosition.x, playerPosition.z);
      this.#currentBiome = sample.primary;
    }

    // Advance the event state machine (unless forced)
    if (!this.#forcedCondition) {
      this.#advanceStateMachine(dt);
    }

    // Build and apply snapshot
    this.#snapshot = this.#buildSnapshot(routeActivity);

    // Update Sky mood
    const moodCondition = conditionToMood(this.#activeCondition, this.#eventIntensity);
    if (moodCondition !== this.#prevMoodCondition) {
      this.#prevMoodCondition = moodCondition;
      this.#sky.setWeatherMood(moodCondition);
    }

    // Apply rain density and atmosphere
    const fogDistanceMultiplier = Math.max(0.2, this.#tuning.weather.fogDistanceMultiplier);
    const fogNear = this.#snapshot.fogNear * fogDistanceMultiplier;
    const fogFar = this.#snapshot.fogFar * fogDistanceMultiplier;
    const mistStrength = this.#snapshot.mistStrength * THREE.MathUtils.lerp(0.72, 1, routeActivity);

    const rainDensity = this.#snapshot.rainDensity * this.#tuning.weather.rainDensity * routeActivity;
    this.#rainSystem.setDensityScale(Math.max(0, rainDensity));

    // Set rain mode based on active condition
    const isSnowCondition = this.#activeCondition === 'snowy' || this.#activeCondition === 'blizzard';
    this.#rainSystem.setMode(isSnowCondition && this.#eventIntensity > 0.1 ? 'snow' : 'rain');

    this.#sky.setAtmosphere(fogNear, fogFar, mistStrength);

    // Update snapshot with final computed fog values
    this.#snapshot.fogNear = Number(fogNear.toFixed(1));
    this.#snapshot.fogFar = Number(fogFar.toFixed(1));
    this.#snapshot.mistStrength = Number(mistStrength.toFixed(2));
    this.#snapshot.rainDensity = Number(Math.max(0, rainDensity).toFixed(2));

    return this.#snapshot;
  }

  // ─── State Machine ──────────────────────────────────────────

  #advanceStateMachine(dt: number): void {
    const biomeWeather = this.#currentBiome.weather;

    this.#phaseTimer -= dt;

    switch (this.#phase) {
      case 'clear': {
        this.#eventIntensity = 0;
        if (this.#phaseTimer <= 0) {
          // Time for a weather event — pick a condition
          if (biomeWeather.conditions.length === 0) {
            // No weather for this biome, restart clear timer
            this.#phaseTimer = this.#randomClearDuration(biomeWeather);
            return;
          }
          this.#activeCondition = biomeWeather.conditions[
            this.#randomInt(biomeWeather.conditions.length)
          ]!;
          this.#phase = 'fade_in';
          this.#phaseTimer = biomeWeather.fadeDuration;
        }
        break;
      }
      case 'fade_in': {
        const fadeDuration = Math.max(1, biomeWeather.fadeDuration);
        const elapsed = fadeDuration - this.#phaseTimer;
        this.#eventIntensity = THREE.MathUtils.clamp(elapsed / fadeDuration, 0, 1);
        // Smooth step
        this.#eventIntensity =
          this.#eventIntensity * this.#eventIntensity * (3 - 2 * this.#eventIntensity);
        if (this.#phaseTimer <= 0) {
          this.#eventIntensity = 1;
          this.#phase = 'hold';
          this.#phaseTimer = biomeWeather.eventDuration;
        }
        break;
      }
      case 'hold': {
        this.#eventIntensity = 1;
        if (this.#phaseTimer <= 0) {
          this.#phase = 'fade_out';
          this.#phaseTimer = biomeWeather.fadeDuration;
        }
        break;
      }
      case 'fade_out': {
        const fadeDuration = Math.max(1, biomeWeather.fadeDuration);
        const elapsed = fadeDuration - this.#phaseTimer;
        this.#eventIntensity = THREE.MathUtils.clamp(1 - elapsed / fadeDuration, 0, 1);
        // Smooth step
        this.#eventIntensity =
          this.#eventIntensity * this.#eventIntensity * (3 - 2 * this.#eventIntensity);
        if (this.#phaseTimer <= 0) {
          this.#eventIntensity = 0;
          this.#activeCondition = 'sunny';
          this.#phase = 'clear';
          this.#phaseTimer = this.#randomClearDuration(biomeWeather);
        }
        break;
      }
    }
  }

  // ─── Snapshot Builder ───────────────────────────────────────

  #buildSnapshot(routeActivity: number): WeatherSnapshot {
    const t = this.#eventIntensity;
    const condition = t > 0.05 ? this.#activeCondition : 'sunny';
    const isActiveWeather =
      condition !== 'sunny' && condition !== 'cloudy';

    const active = isActiveWeather
      ? CONDITION_PROFILES[condition]
      : null;

    // Lerp between clear and active weather
    const lerp = THREE.MathUtils.lerp;
    const rainDensity = active ? lerp(0, active.rainDensity, t) : 0;
    const fogNear = active ? lerp(CLEAR_PROFILE.fogNear, active.fogNear, t) : CLEAR_PROFILE.fogNear;
    const fogFar = active ? lerp(CLEAR_PROFILE.fogFar, active.fogFar, t) : CLEAR_PROFILE.fogFar;
    const mistStrength = active
      ? lerp(CLEAR_PROFILE.mistStrength, active.mistStrength, t)
      : CLEAR_PROFILE.mistStrength;
    const visibilityScale = active
      ? lerp(CLEAR_PROFILE.visibilityScale, active.visibilityScale, t)
      : CLEAR_PROFILE.visibilityScale;
    const gripMultiplier = active
      ? lerp(CLEAR_PROFILE.gripMultiplier, active.gripMultiplier, t)
      : CLEAR_PROFILE.gripMultiplier;
    const dragMultiplier = active
      ? lerp(CLEAR_PROFILE.dragMultiplier, active.dragMultiplier, t)
      : CLEAR_PROFILE.dragMultiplier;
    const waterLevelOffset = active
      ? lerp(CLEAR_PROFILE.waterLevelOffset, active.waterLevelOffset, t)
      : CLEAR_PROFILE.waterLevelOffset;
    const waterActivityMultiplier = active
      ? lerp(CLEAR_PROFILE.waterActivityMultiplier, active.waterActivityMultiplier, t)
      : CLEAR_PROFILE.waterActivityMultiplier;
    const trafficSpeedMultiplier = active
      ? lerp(CLEAR_PROFILE.trafficSpeedMultiplier, active.trafficSpeedMultiplier, t)
      : CLEAR_PROFILE.trafficSpeedMultiplier;
    const trafficCautionMultiplier = active
      ? lerp(CLEAR_PROFILE.trafficCautionMultiplier, active.trafficCautionMultiplier, t)
      : CLEAR_PROFILE.trafficCautionMultiplier;
    const windAudioMultiplier = active
      ? lerp(CLEAR_PROFILE.windAudioMultiplier, active.windAudioMultiplier, t)
      : CLEAR_PROFILE.windAudioMultiplier;
    const relayAudioMultiplier = active
      ? lerp(CLEAR_PROFILE.relayAudioMultiplier, active.relayAudioMultiplier, t)
      : CLEAR_PROFILE.relayAudioMultiplier;

    // Compute seconds until next change
    let secondsUntilChange = 0;
    switch (this.#phase) {
      case 'clear':
        secondsUntilChange = Math.max(0, this.#phaseTimer);
        break;
      case 'fade_in':
      case 'hold':
      case 'fade_out':
        secondsUntilChange = Math.max(0, this.#phaseTimer);
        break;
    }

    const label = t > 0.05 ? conditionLabel(condition) : 'Clear';

    return {
      condition,
      label,
      cycleIndex: 0,
      secondsUntilChange: Number(secondsUntilChange.toFixed(1)),
      rainDensity: Number(rainDensity.toFixed(2)),
      fogNear: Number(fogNear.toFixed(1)),
      fogFar: Number(fogFar.toFixed(1)),
      mistStrength: Number(mistStrength.toFixed(2)),
      visibilityScale: Number(visibilityScale.toFixed(2)),
      gripMultiplier: Number(gripMultiplier.toFixed(2)),
      dragMultiplier: Number(dragMultiplier.toFixed(2)),
      waterLevelOffset: Number(waterLevelOffset.toFixed(2)),
      waterActivityMultiplier: Number(waterActivityMultiplier.toFixed(2)),
      trafficSpeedMultiplier: Number(trafficSpeedMultiplier.toFixed(2)),
      trafficCautionMultiplier: Number(trafficCautionMultiplier.toFixed(2)),
      windAudioMultiplier: Number(windAudioMultiplier.toFixed(2)),
      relayAudioMultiplier: Number(relayAudioMultiplier.toFixed(2)),
    };
  }

  // ─── RNG Helpers ────────────────────────────────────────────

  #nextRandom(): number {
    this.#seed = (this.#seed * 1664525 + 1013904223) & 0x7fffffff;
    return this.#seed / 0x7fffffff;
  }

  #randomInt(max: number): number {
    return Math.floor(this.#nextRandom() * max);
  }

  #randomClearDuration(config: BiomeWeatherConfig): number {
    if (config.conditions.length === 0) return Infinity;
    const range = config.maxClearDuration - config.minClearDuration;
    return config.minClearDuration + this.#nextRandom() * range;
  }
}
