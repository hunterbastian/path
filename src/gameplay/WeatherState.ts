import * as THREE from 'three';
import type { GameTuning, WeatherCondition, WeatherProfile } from '../config/GameTuning';
import { RainSystem } from '../effects/RainSystem';
import { Sky } from '../world/Sky';

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

export class WeatherState {
  readonly #tuning: GameTuning;
  readonly #sky: Sky;
  readonly #rainSystem: RainSystem;
  #elapsedSeconds = 0;
  #activeProfileIndex = -1;
  #forcedCondition: WeatherCondition | null = null;
  #snapshot: WeatherSnapshot;

  constructor(tuning: GameTuning, sky: Sky, rainSystem: RainSystem) {
    this.#tuning = tuning;
    this.#sky = sky;
    this.#rainSystem = rainSystem;
    const initialProfile = this.#getProfile(0);
    this.#snapshot = {
      condition: initialProfile.condition,
      label: initialProfile.label,
      cycleIndex: 0,
      secondsUntilChange: tuning.weather.cycleDurationSeconds,
      rainDensity: initialProfile.rainDensity,
      fogNear: initialProfile.fogNear,
      fogFar: initialProfile.fogFar,
      mistStrength: initialProfile.mistStrength,
      visibilityScale: initialProfile.visibilityScale,
      gripMultiplier: initialProfile.gripMultiplier,
      dragMultiplier: initialProfile.dragMultiplier,
      waterLevelOffset: initialProfile.waterLevelOffset,
      waterActivityMultiplier: initialProfile.waterActivityMultiplier,
      trafficSpeedMultiplier: initialProfile.trafficSpeedMultiplier,
      trafficCautionMultiplier: initialProfile.trafficCautionMultiplier,
      windAudioMultiplier: initialProfile.windAudioMultiplier,
      relayAudioMultiplier: initialProfile.relayAudioMultiplier,
    };
    this.update(0, 1);
  }

  get snapshot(): WeatherSnapshot {
    return this.#snapshot;
  }

  forceCondition(condition: WeatherCondition | null): WeatherSnapshot {
    this.#forcedCondition = condition;
    return this.update(0, 1);
  }

  update(dt: number, routeActivity: number): WeatherSnapshot {
    const weatherTuning = this.#tuning.weather;
    const profileCount = Math.max(weatherTuning.profiles.length, 1);
    const cycleDuration = Math.max(1, weatherTuning.cycleDurationSeconds);
    let cycleIndex = 0;
    let cycleTime = 0;
    let activeProfile: WeatherProfile;

    if (this.#forcedCondition) {
      cycleIndex = Math.max(
        0,
        weatherTuning.profiles.findIndex(
          (profile) => profile.condition === this.#forcedCondition,
        ),
      );
      cycleTime = cycleIndex * cycleDuration;
      activeProfile = this.#getProfile(cycleIndex);
    } else {
      this.#elapsedSeconds += dt;
      cycleTime = this.#elapsedSeconds % (cycleDuration * profileCount);
      cycleIndex = Math.floor(cycleTime / cycleDuration) % profileCount;
      activeProfile = this.#getProfile(cycleIndex);
    }

    if (cycleIndex !== this.#activeProfileIndex) {
      this.#activeProfileIndex = cycleIndex;
      this.#sky.setWeatherMood(activeProfile.condition);
    }

    const density = Math.max(
      0,
      activeProfile.rainDensity * weatherTuning.rainDensity * routeActivity,
    );
    const fogDistanceMultiplier = Math.max(0.2, this.#tuning.weather.fogDistanceMultiplier);
    const fogNear = activeProfile.fogNear * fogDistanceMultiplier;
    const fogFar = activeProfile.fogFar * fogDistanceMultiplier;
    const mistStrength = activeProfile.mistStrength * THREE.MathUtils.lerp(0.72, 1, routeActivity);
    const secondsUntilChange = this.#forcedCondition
      ? cycleDuration
      : Number((cycleDuration - (cycleTime % cycleDuration)).toFixed(1));

    this.#rainSystem.setDensityScale(density);
    this.#sky.setAtmosphere(fogNear, fogFar, mistStrength);

    this.#snapshot = {
      condition: activeProfile.condition,
      label: activeProfile.label,
      cycleIndex,
      secondsUntilChange,
      rainDensity: Number(density.toFixed(2)),
      fogNear: Number(fogNear.toFixed(1)),
      fogFar: Number(fogFar.toFixed(1)),
      mistStrength: Number(mistStrength.toFixed(2)),
      visibilityScale: Number(activeProfile.visibilityScale.toFixed(2)),
      gripMultiplier: Number(activeProfile.gripMultiplier.toFixed(2)),
      dragMultiplier: Number(activeProfile.dragMultiplier.toFixed(2)),
      waterLevelOffset: Number(activeProfile.waterLevelOffset.toFixed(2)),
      waterActivityMultiplier: Number(activeProfile.waterActivityMultiplier.toFixed(2)),
      trafficSpeedMultiplier: Number(activeProfile.trafficSpeedMultiplier.toFixed(2)),
      trafficCautionMultiplier: Number(activeProfile.trafficCautionMultiplier.toFixed(2)),
      windAudioMultiplier: Number(activeProfile.windAudioMultiplier.toFixed(2)),
      relayAudioMultiplier: Number(activeProfile.relayAudioMultiplier.toFixed(2)),
    };

    return this.#snapshot;
  }

  #getProfile(index: number): WeatherProfile {
    return this.#tuning.weather.profiles[index]
      ?? this.#tuning.weather.profiles[0]
      ?? {
        condition: 'cloudy',
        label: 'Cloudy',
        rainDensity: 0,
        fogNear: 42,
        fogFar: 390,
        mistStrength: 0.86,
        visibilityScale: 0.84,
        gripMultiplier: 0.97,
        dragMultiplier: 1.02,
        waterLevelOffset: 0.04,
        waterActivityMultiplier: 1.04,
        trafficSpeedMultiplier: 0.94,
        trafficCautionMultiplier: 1.05,
        windAudioMultiplier: 0.92,
        relayAudioMultiplier: 0.96,
      };
  }
}
