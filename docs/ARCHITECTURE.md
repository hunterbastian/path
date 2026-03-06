# Architecture

## Overview

Path is a small custom game runtime built around a fixed-step simulation and a thin browser shell.
It does not use a general-purpose game engine. Rendering is handled with `three`, orchestration is handled in TypeScript, and gameplay systems are composed directly from repo-local modules.

Core goals of the current architecture:

- deterministic stepping for browser automation
- stable, readable off-road driving
- stylized visuals without heavy runtime complexity
- small, understandable systems rather than deep engine abstraction

## Runtime Flow

### Boot path

`src/main.ts`

- mounts the app
- creates `PathGame`
- exposes debug hooks on `window`

`src/app/PathGame.ts`

- constructs all world, vehicle, UI, camera, audio, and effect systems
- owns game mode transitions: `title`, `driving`, `arrived`
- updates HUD, map state, arrival state, and debug output

`src/core/FixedStepLoop.ts`

- runs simulation at `1 / 60`
- supports deterministic `advance(ms)` stepping for automation

`src/core/Engine.ts`

- owns `THREE.Scene`, `PerspectiveCamera`, `WebGLRenderer`, and post-process
- handles resize and final render pass

## Main Systems

### UI shell

`src/core/AppShell.ts`

- title screen
- arrival screen
- HUD
- handheld map
- error banner

The shell is DOM-driven, while gameplay rendering stays in the WebGL canvas.

### Input

`src/core/InputManager.ts`

- keyboard state tracking
- one-shot input consumption for reset/fullscreen/map
- browser-default prevention for gameplay keys

### Camera

`src/camera/ThirdPersonCamera.ts`

- drive camera with speed-based chase distance
- title camera orbit around the scene
- arrival camera for destination framing
- pointer drag orbit support

### Game orchestration

`src/app/PathGame.ts`

Responsibilities:

- start/restart/arrival flow
- world and vehicle construction
- map discovery state
- objective distance checks
- HUD snapshot generation
- debug JSON generation via `render_game_to_text`
- test helper teleports

## World

### Terrain

`src/world/Terrain.ts`

The terrain is seeded and deterministic. It provides:

- terrain height sampling
- surface classification
- path centerline and path influence
- landmark position
- objective position
- outpost positions
- deterministic sand-start search

Important design detail:

- Terrain is gameplay data first, rendering data second. Systems ask the terrain for height, normal, and surface directly during simulation.

### Water

`src/world/Water.ts`

- creates and updates stylized water pools
- exposes pool locations for the handheld map
- supports water height checks for vehicle and splash systems

### Sky and atmosphere

`src/world/Sky.ts`

- directional/hemisphere lighting
- generated environment texture
- background and fog setup
- mist sprite layers

The current pass leans toward an overcast, rain-compatible atmosphere with enough warmth to preserve stylization.

### Outposts / objective

`src/world/ObjectiveBeacon.ts`

This class now covers both:

- basin route outposts
- final summit relay outpost

Non-objective outposts are small lit structures.
The final relay outpost adds a stronger beacon beam and ring to remain readable at distance.

## Vehicle

### Vehicle state

`src/vehicle/DrivingState.ts`

Carries current drive telemetry, including:

- speed
- forward / lateral speed
- steering / throttle
- grounded / braking / drifting / boosting
- current surface
- boost level
- sand sink depth
- sand buildup amount
- wheel compression / contact

### Vehicle controller

`src/vehicle/VehicleController.ts`

The controller is intentionally non-physics-engine based.
It is a deterministic terrain-following handling model with:

- surface tuning per biome
- acceleration, braking, and drag
- lateral grip and drift pressure
- yaw carry and countersteer recovery
- boost resource behavior
- water and sand-aware surface resolution
- soft-sand sink and escape behavior

Why this approach:

- easier to tune than a heavyweight rigid-body stack
- more stable for browser automation
- predictable enough for a stylized prototype

### Vehicle visuals

`src/vehicle/Vehicle.ts`

- rugged trail-rig body build
- animated wheel spin and steering
- body roll / pitch / sink
- sand berm visuals around the chassis

## Effects

### Dust and splash

`src/effects/DustEmitter.ts`
`src/effects/DustSystem.ts`
`src/effects/SplashEmitter.ts`
`src/effects/SplashSystem.ts`

These provide surface-driven motion cues.
Sand currently uses softer all-wheel plumes than normal dirt acceleration.

### Wind and rain

`src/effects/WindSystem.ts`
`src/effects/RainSystem.ts`

- wind adds ambient movement around the camera
- rain uses camera-relative line segments for a light drizzle layer

### Shared particle field

`src/effects/SpriteParticleField.ts`

Shared shader-driven point-sprite helper for dust, splash, and wind systems.

## Audio

`src/audio/EngineAudio.ts`

Procedural Web Audio engine built from oscillator and noise layers.
It reacts to:

- speed
- throttle
- boost
- surface
- game mode

Autoplay restrictions are handled by activating audio only after a real start interaction.

## Rendering

`src/render/GritPostProcess.ts`

The final image uses a stylized grade rather than raw renderer output.
The look combines:

- color shaping
- grit / texture
- scanline / vignette style treatment
- restrained retro/posterization influence

## Handheld Map

The map is rendered as a DOM canvas inside the shell.

Current map data includes:

- center route
- water pools
- landmark
- objective
- basin outposts
- vehicle heading
- fog-of-war discovery

Discovery is stored as a compact byte grid and revealed around the vehicle over time.

## Debug Hooks

Exposed in `src/main.ts`:

- `window.startPathGame()`
- `window.jumpPathToObjective()`
- `window.jumpPathToSand()`
- `window.advanceTime(ms)`
- `window.render_game_to_text()`
- `window.getPathAudioDebug()`

These hooks are part of the workflow, not accidental leftovers.

## Testing Strategy

The project relies on:

- `npm run build`
- browser automation via the bundled Playwright client
- browser MCP checks for flows that need more direct control
- screenshot review
- `render_game_to_text` snapshots

Typical validation targets:

- title screen
- start / restart flow
- handling changes
- map state
- arrival state
- surface-specific mechanics such as sand sink

## Known Constraints

- The bundled Playwright client still has intermittent trouble clicking the title screen button.
- There is no formal unit-test suite for gameplay systems yet.
- The `three` bundle remains the largest build chunk.
- Most balancing is still hand-tuned in code.

## Recommended Next Docs To Add

If the project grows, the next useful docs would be:

- a tuning guide for vehicle surface constants
- an art-direction guide for environment passes
- a testing cookbook for common browser scenarios
