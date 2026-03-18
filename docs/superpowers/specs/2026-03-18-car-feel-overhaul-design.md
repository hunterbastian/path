# Car Feel Overhaul — Forza Horizon Responsiveness

## Overview

Remove input lag and add physical weight. Steering, throttle, and braking become instantly responsive. Weight comes from gravity, inertia, and weight transfer — not from smoothing delays.

## Changes

### Steering Response
- `steerResponse` per surface: 4.4-8.8 → 9-16 (double across all surfaces)
- Remove low-speed steering boost (1.35x multiplier) — no longer needed
- Remove very-low-speed boost (1.16x) — same reason

### Yaw (Rotation)
- Yaw acceleration scalar: 3.3 → 4.2
- Yaw damping per surface: 4.4-9.0 → 6-12 (scaled proportionally)

### Throttle/Brake
- Base acceleration: 18.5 → 22
- Reverse acceleration: 9.2 → 11
- Brake forward force: 6.5 → 8.5
- Brake lateral force: 7.2 → 9.0
- Coast drag: 0.72 → 0.85

### Weight Transfer
- Brake pitch (nose dive): 0.04 → 0.065
- Acceleration pitch (squat): -0.0018 → -0.003
- Boost pitch: -0.02 → -0.03
- Pitch clamp: ±0.06 → ±0.09
- Roll from yaw: 0.0012 → 0.002
- Roll from lateral: 0.003 → 0.005
- Roll clamp: ±0.05 → ±0.08
- Pitch expLerp rate: 5 → 8
- Roll expLerp rate: 4 → 6

### Gravity
- Gravity: 24 → 28

### What stays the same
- Drift model (handbrake grip loss, tire slip curve, counter-steer bonus)
- Boost mechanics (drain/regen rates, speed multiplier)
- Surface handling coefficients (grip, slip, acceleration multipliers)
- Max speeds (34 cruise, 44 boost)
- Air control (0.03)
- Sand sinking, water drag, slope behavior

## Files
- Modify: `src/config/GameTuning.ts` — tuning constants
- Modify: `src/vehicle/VehicleController.ts` — remove low-speed steering hacks, update weight transfer constants

## Expected Feel
Turn-in is immediate. Braking dips the nose. Corners lean the car. Lifting throttle slows naturally. The car feels planted and heavy but never sluggish. Inputs are honored instantly — physics creates the weight, not smoothing.
