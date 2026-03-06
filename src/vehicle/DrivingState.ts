import type { SurfaceType } from '../world/Terrain';

export type DriveSurface = SurfaceType | 'water';

export interface DrivingState {
  speed: number;
  forwardSpeed: number;
  lateralSpeed: number;
  verticalSpeed: number;
  airborneTime: number;
  steering: number;
  throttle: number;
  isGrounded: boolean;
  isBraking: boolean;
  isBoosting: boolean;
  isAccelerating: boolean;
  isDrifting: boolean;
  wasAirborne: boolean;
  surface: DriveSurface;
  boostLevel: number;
  sinkDepth: number;
  surfaceBuildup: number;
  wheelCompression: [number, number, number, number];
  wheelContact: [boolean, boolean, boolean, boolean];
}

export function createDefaultDrivingState(): DrivingState {
  return {
    speed: 0,
    forwardSpeed: 0,
    lateralSpeed: 0,
    verticalSpeed: 0,
    airborneTime: 0,
    steering: 0,
    throttle: 0,
    isGrounded: true,
    isBraking: false,
    isBoosting: false,
    isAccelerating: false,
    isDrifting: false,
    wasAirborne: false,
    surface: 'dirt',
    boostLevel: 1,
    sinkDepth: 0,
    surfaceBuildup: 0,
    wheelCompression: [0, 0, 0, 0],
    wheelContact: [true, true, true, true],
  };
}
