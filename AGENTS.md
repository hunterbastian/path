# AGENTS.md — PATH

## Overview
Arcade driving game built with Three.js + TypeScript + Vite.

## Build & Run
- `npm run dev` — start Vite dev server
- `npx tsc --noEmit` — type-check without emitting

## Architecture
- `src/core/AppShell.ts` — game shell, title screen, HUD, pointer lock
- `src/core/InputManager.ts` — keyboard + gamepad input (merged, highest-activity wins)
- `src/vehicle/VehicleController.ts` — physics, drift/grip model, boost, handbrake
- `src/camera/ThirdPersonCamera.ts` — pointer-lock freelook with auto-return
- `src/world/RaiderSystem.ts` — AI raiders, utility-based behavior, instanced rendering
- `src/app/PathGame.ts` — game entry point, wires systems together

## Controls (Crossout-style)
- WASD/Arrows — drive/steer
- Space — handbrake (drift)
- Shift — boost
- Mouse — freelook (pointer lock, auto-returns to vehicle heading)

## Rendering
- Custom post-processing pipeline in `src/render/GritPostProcess.ts` (no EffectComposer)
- PCFSoftShadowMap, 1024x1024 shadow map
- Effects in shader: pixelation, radial motion blur, chromatic aberration, grain, vignette, bloom, speed lines
- Bloom is inline in the post-process shader (5x5 luminance-thresholded tap), not a separate pass
- `src/app/EffectsCoordinator.ts` — wires all particle systems together
- `src/effects/TireSmokeSystem.ts` — drift smoke from rear wheels (200 particle cap)
- `src/world/EnvironmentalClutter.ts` — LOD system hides groups beyond 180m with hysteresis

## Deployment
- Vercel: https://drive-path.vercel.app
- `vercel --prod` to deploy

## Key Patterns
- Raider cars use `InstancedMesh` (4 vehicles, 1 draw call). Scale is baked into geometry via `applyMatrix4`.
- GLB models loaded via `Vehicle.loadModel()` static method.
- Input uses consume pattern: `consumeStartAction()`, `consumePauseToggle()`, etc. — single-frame press detection.
- `raider.glb` is 56MB — do not duplicate or clone geometry unnecessarily.
- All particle systems extend `SpriteParticleField` → `DustSystem`. New effects should reuse this pattern.

## Verification

Run `npx tsc --noEmit` after changes. Run `npm run build` before deploy. WebGL — verify via code logic and build, not screenshots.
