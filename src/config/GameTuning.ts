import type { DriveSurface } from '../vehicle/DrivingState';

export interface SurfaceHandlingTuning {
  acceleration: number;
  grip: number;
  drag: number;
  turn: number;
  speed: number;
  steerResponse: number;
  slip: number;
  yawDamping: number;
  counterSteer: number;
}

export interface VehicleTuning {
  baseAcceleration: number;
  reverseAcceleration: number;
  gravity: number;
  slopeRollStrength: number;
  slopeRollStart: number;
  slopeBrakeHold: number;
  slopeIdleSlideBoost: number;
  slopeIdleDragScale: number;
  slopeIdleSpeedWindow: number;
  suspensionTravel: number;
  suspensionSpring: number;
  suspensionDamping: number;
  airControl: number;
  airTurnControl: number;
  maxCruiseSpeed: number;
  maxBoostSpeed: number;
  boostMultiplier: number;
  boostDrainPerSecond: number;
  boostRegenPerSecond: number;
  coastDragBase: number;
  brakeForwardBase: number;
  brakeLateralBase: number;
  dragVelocityFactor: number;
  maxSandSinkDepth: number;
  speedMultiplier: number;
  accelerationMultiplier: number;
  gripMultiplier: number;
  yawDampingMultiplier: number;
  sinkDepthMultiplier: number;
  surfaces: Record<DriveSurface, SurfaceHandlingTuning>;
}

export interface CameraDriveTuning {
  closeDistance: number;
  farDistance: number;
  closeHeight: number;
  farHeight: number;
  speedReference: number;
  lookAhead: number;
  lookHeight: number;
  distanceOffset: number;
  heightOffset: number;
  steeringOffset: number;
  suspensionHeave: number;
  driftLook: number;
  roughnessShake: number;
  rollStrength: number;
  checkpointBias: number;
  terrainClearance: number;
  terrainLift: number;
  velocityLead: number;
  lookSmoothing: number;
  fovBase: number;
  fovSpeedGain: number;
  fovBoostGain: number;
  fovAirborneGain: number;
  fovImpactGain: number;
  landingKick: number;
  orbitReturnDelay: number;
  orbitReturnYawResponse: number;
  orbitReturnPitchResponse: number;
}

export type WeatherCondition = 'cloudy' | 'rainy' | 'sunny';

export interface WeatherProfile {
  condition: WeatherCondition;
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

export interface CameraOrbitTuning {
  radius: number;
  height: number;
  horizontalDepth: number;
  verticalWave: number;
}

export interface CameraArrivalTuning extends CameraOrbitTuning {
  holdSeconds: number;
  introRadius: number;
  introHeight: number;
  orbitSpeed: number;
  holdLookHeight: number;
}

export interface CameraGodTuning {
  moveSpeed: number;
  verticalSpeed: number;
  lookResponse: number;
  dragResponse: number;
  momentumDamping: number;
  terrainClearance: number;
  pitchMin: number;
  pitchMax: number;
}

export interface CameraTuning {
  drive: CameraDriveTuning;
  title: CameraOrbitTuning;
  arrival: CameraArrivalTuning;
  god: CameraGodTuning;
}

export interface WeatherTuning {
  cycleDurationSeconds: number;
  rainDensity: number;
  fogDistanceMultiplier: number;
  profiles: WeatherProfile[];
}

export interface WorldStreamingTuning {
  routeNearDistance: number;
  routeFarDistance: number;
  outpostNearDistance: number;
  outpostFarDistance: number;
  waterNearDistance: number;
  waterFarDistance: number;
  minOutpostIntensity: number;
  minWindDensity: number;
  minWaterActivity: number;
}

export interface MapTuning {
  discoveryColumns: number;
  discoveryRows: number;
  revealRadius: number;
  startRevealRadius: number;
}

export interface RunTuning {
  arrivalRadius: number;
}

export interface GameTuning {
  vehicle: VehicleTuning;
  camera: CameraTuning;
  weather: WeatherTuning;
  streaming: WorldStreamingTuning;
  map: MapTuning;
  run: RunTuning;
}

export const DEFAULT_GAME_TUNING: GameTuning = {
  vehicle: {
    baseAcceleration: 14.8,
    reverseAcceleration: 7.6,
    gravity: 24,
    slopeRollStrength: 0.82,
    slopeRollStart: 0.10,
    slopeBrakeHold: 0.22,
    slopeIdleSlideBoost: 1.88,
    slopeIdleDragScale: 0.48,
    slopeIdleSpeedWindow: 6.4,
    suspensionTravel: 0.54,
    suspensionSpring: 58,
    suspensionDamping: 20,
    airControl: 0.03,
    airTurnControl: 0.08,
    maxCruiseSpeed: 28,
    maxBoostSpeed: 36,
    boostMultiplier: 1.28,
    boostDrainPerSecond: 0.24,
    boostRegenPerSecond: 0.11,
    coastDragBase: 1.12,
    brakeForwardBase: 5.8,
    brakeLateralBase: 7.2,
    dragVelocityFactor: 0.024,
    maxSandSinkDepth: 0.28,
    speedMultiplier: 1,
    accelerationMultiplier: 1,
    gripMultiplier: 1,
    yawDampingMultiplier: 1,
    sinkDepthMultiplier: 1,
    surfaces: {
      dirt: {
        acceleration: 1,
        grip: 7.4,
        drag: 1.08,
        turn: 0.92,
        speed: 1.0,
        steerResponse: 8.8,
        slip: 0.28,
        yawDamping: 8.6,
        counterSteer: 1.12,
      },
      sand: {
        acceleration: 0.72,
        grip: 5.8,
        drag: 1.42,
        turn: 0.74,
        speed: 0.76,
        steerResponse: 6.4,
        slip: 0.36,
        yawDamping: 7.0,
        counterSteer: 1.08,
      },
      grass: {
        acceleration: 0.86,
        grip: 6.2,
        drag: 1.16,
        turn: 0.82,
        speed: 0.88,
        steerResponse: 7.6,
        slip: 0.32,
        yawDamping: 7.6,
        counterSteer: 1.10,
      },
      rock: {
        acceleration: 0.82,
        grip: 7.0,
        drag: 1.10,
        turn: 0.82,
        speed: 0.84,
        steerResponse: 8.0,
        slip: 0.22,
        yawDamping: 9.0,
        counterSteer: 1.14,
      },
      snow: {
        acceleration: 0.66,
        grip: 4.6,
        drag: 1.22,
        turn: 0.68,
        speed: 0.72,
        steerResponse: 5.8,
        slip: 0.52,
        yawDamping: 5.6,
        counterSteer: 1.42,
      },
      water: {
        acceleration: 0.46,
        grip: 3.2,
        drag: 1.82,
        turn: 0.56,
        speed: 0.54,
        steerResponse: 4.4,
        slip: 0.58,
        yawDamping: 4.4,
        counterSteer: 1.52,
      },
    },
  },
  camera: {
    drive: {
      closeDistance: 10.5,
      farDistance: 13.5,
      closeHeight: 4.8,
      farHeight: 5.8,
      speedReference: 28,
      lookAhead: 5.6,
      lookHeight: 1.8,
      distanceOffset: 0,
      heightOffset: 0,
      steeringOffset: 0.9,
      suspensionHeave: 0.38,
      driftLook: 1.25,
      roughnessShake: 0.22,
      rollStrength: 0.08,
      checkpointBias: 0.18,
      terrainClearance: 1.8,
      terrainLift: 0.8,
      velocityLead: 0.11,
      lookSmoothing: 6.4,
      fovBase: 60,
      fovSpeedGain: 6.5,
      fovBoostGain: 3.2,
      fovAirborneGain: 2.4,
      fovImpactGain: 4.6,
      landingKick: 0.48,
      orbitReturnDelay: 3,
      orbitReturnYawResponse: 0.95,
      orbitReturnPitchResponse: 1.15,
    },
    title: {
      radius: 34,
      height: 13,
      horizontalDepth: 18,
      verticalWave: 2.2,
    },
    arrival: {
      radius: 18.6,
      height: 8.8,
      horizontalDepth: 12.4,
      verticalWave: 1.55,
      holdSeconds: 1.3,
      introRadius: 12.8,
      introHeight: 6.9,
      orbitSpeed: 0.18,
      holdLookHeight: 7.2,
    },
    god: {
      moveSpeed: 20,
      verticalSpeed: 16,
      lookResponse: 10.5,
      dragResponse: 16,
      momentumDamping: 8.5,
      terrainClearance: 1.9,
      pitchMin: -1.2,
      pitchMax: 1.05,
    },
  },
  weather: {
    cycleDurationSeconds: 90,
    rainDensity: 1,
    fogDistanceMultiplier: 1,
    profiles: [
      {
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
      },
      {
        condition: 'rainy',
        label: 'Rainy',
        rainDensity: 1,
        fogNear: 34,
        fogFar: 310,
        mistStrength: 1.18,
        visibilityScale: 0.68,
        gripMultiplier: 0.84,
        dragMultiplier: 1.14,
        waterLevelOffset: 0.18,
        waterActivityMultiplier: 1.28,
        trafficSpeedMultiplier: 0.76,
        trafficCautionMultiplier: 1.22,
        windAudioMultiplier: 0.86,
        relayAudioMultiplier: 0.9,
      },
      {
        condition: 'sunny',
        label: 'Sunny',
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
      },
    ],
  },
  streaming: {
    routeNearDistance: 18,
    routeFarDistance: 96,
    outpostNearDistance: 56,
    outpostFarDistance: 280,
    waterNearDistance: 22,
    waterFarDistance: 140,
    minOutpostIntensity: 0.14,
    minWindDensity: 0.38,
    minWaterActivity: 0.46,
  },
  map: {
    discoveryColumns: 28,
    discoveryRows: 24,
    revealRadius: 52,
    startRevealRadius: 72,
  },
  run: {
    arrivalRadius: 16,
  },
};

export function cloneGameTuning(source: GameTuning = DEFAULT_GAME_TUNING): GameTuning {
  return structuredClone(source);
}

export class GameTuningStore {
  readonly values = cloneGameTuning();

  reset(): void {
    Object.assign(this.values, cloneGameTuning());
  }
}
