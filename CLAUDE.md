# CLAUDE.md — PATH

## Overview
Arcade driving game built with Three.js + TypeScript + Vite. Focus on experience and multiplayer.

## Build & Run
- `npm run dev` — start Vite dev server
- `npx tsc --noEmit` — type-check without emitting

## Architecture
- `src/core/AppShell.ts` — game shell, title screen, HUD, pointer lock, drift score popup
- `src/core/InputManager.ts` — keyboard + gamepad input (merged, highest-activity wins)
- `src/core/Engine.ts` — renderer, adaptive quality, post-process pipeline, toneMapping state machine
- `src/vehicle/VehicleController.ts` — physics, drift/grip model, boost, handbrake
- `src/camera/ThirdPersonCamera.ts` — pointer-lock freelook with auto-return
- `src/world/DirtRoads.ts` — terrain-hugging road strip meshes along all paths
- `src/world/Terrain.ts` — procedural heightfield, surface types, #cacheKey helper for all caches
- `src/network/NetworkManager.ts` — SpacetimeDB multiplayer
- `src/world/GhostPlayerSystem.ts` — multiplayer ghost rendering (instanced)
- `src/gameplay/DriftScoreSystem.ts` — drift scoring (lateralSpeed × forwardSpeed), run stats, live counter
- `src/gameplay/AchievementSystem.ts` — 22 achievements with localStorage persistence
- `src/gameplay/DriverProfile.ts` — persistent career stats, rank, playstyle classification
- `src/gameplay/MapDiscoverySystem.ts` — grid-based fog-of-war, squared-distance reveal
- `src/app/PathGame.ts` — game entry point, wires systems together

## Controls (Crossout-style)
- WASD/Arrows — drive/steer
- Space — handbrake (drift)
- Shift — boost
- Mouse — freelook (pointer lock, auto-returns to vehicle heading)

## Rendering
- Custom post-processing pipeline in `src/render/GritPostProcess.ts` (no EffectComposer)
- ACES tone mapping in post-process shader (renderer is NoToneMapping for HDR bloom)
- Bloom threshold dynamically tracks Sky.sunIntensity (uBloomThreshold uniform)
- Engine toggles toneMapping only on state transition (#bypassPostProcess flag), not per-frame
- PCFSoftShadowMap, 1024x1024 shadow map, ±28 unit frustum following player
- Effects in shader: vignette (9% edge darken), bloom, film grain (scales with effectScale), speed desaturation
- `src/app/EffectsCoordinator.ts` — wires all particle systems together
- `src/effects/TireSmokeSystem.ts` — drift smoke, intensity-scaled config (size/growth/life/spread/lift)
- `src/effects/TireTrackSystem.ts` — ground marks, reusable #groundPoint vector (no per-frame alloc)
- `src/effects/SparkSystem.ts` — grinding sparks (120 particle cap)
- `src/effects/RainSystem.ts` — rain drops (120 drop cap)
- `src/world/EnvironmentalClutter.ts` — LOD with hysteresis, grouped mergeGeometries (multi-material), collider groupIndex skips hidden
- `src/world/GrassField.ts` — instanced grass, 4x4 spatial grid, 160m draw distance
- `src/world/ValleyFog.ts` — volumetric fog layers, density scales with time-of-day (dawn/dusk peaks)
- `src/world/Water.ts` — procedural pools with foam, specular, scene fog integration
- `src/render/applyProceduralParallax.ts` — material shader augmentation, 3-octave FBM

## Deployment
- Vercel: https://drive-path.vercel.app
- `vercel --prod` to deploy

## HUD
- Cartographic visual language: paper textures, ink colors, gold accents, Geist Mono throughout
- Grid stats: Contact, Surface (color-coded per type), Status (live drift score), Relay distance, Boost, Weather, Drift total, Mapped %, Unlocked achievements, Players online, Run timer
- Speed value glows above 95 km/h
- Drift popup: live counter during drift (pulsing), final score flash on end (scale + fade)
- Drive label shows `Drift +N` with live points during active drift

## Key Patterns
- GLB models loaded via `Vehicle.loadModel()` static method.
- Input uses consume pattern: `consumeStartAction()`, `consumePauseToggle()`, etc. — single-frame press detection.
- DriftScoreSystem uses consume pattern: `consumeScoredDrift()` — returns once then clears.
- All particle systems extend `SpriteParticleField` → `DustSystem`. New effects should reuse this pattern.
- Terrain height cache uses size-based eviction (8000 entry limit), not time-based. `#cacheKey(x, z)` shared by all caches.
- `Terrain.getNormalAt()` reuses a static vector — callers must read immediately, not store the reference.
- `PathGame.dispose()` must call dispose on all systems: network, input, camera, audio, effects, grass, clutter, water, dirtRoads, valleyFog, ghostPlayers, engine.

## Skills
- **Disable for this project**: gameplay-before-polish, pixel-art-scaling, sprite-sheet-check, mobile-check, design-check, make-interfaces-feel-better
- **Keep enabled**: game-scene-snapshot, game-session-handover, self-eval, bug-reproduce-first, voice-cleanup, scope-guard, uat-checklist

## Verification
Run `npx tsc --noEmit` after changes. Run `npm run build` before deploy. WebGL — verify via code logic and build, not screenshots (Playwright can screenshot but no interaction).
