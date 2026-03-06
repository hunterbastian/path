import * as THREE from 'three';

export const VEHICLE_CLEARANCE = 0.98;
export const VEHICLE_WHEEL_RADIUS = 0.48;
export const VEHICLE_WHEEL_CONTACT_CLEARANCE = 0.22;
export const VEHICLE_WHEEL_TRAVEL = 0.34;

export const VEHICLE_WHEEL_OFFSETS = [
  new THREE.Vector3(-1.08, -0.3, 1.45),
  new THREE.Vector3(1.08, -0.3, 1.45),
  new THREE.Vector3(-1.08, -0.3, -1.32),
  new THREE.Vector3(1.08, -0.3, -1.32),
] as const;
