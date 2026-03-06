# Changelog

All notable changes to this project are documented here.

## [0.1.0] - 2026-03-06

### Added

- Rebuilt the game around a deterministic fixed-step runtime.
- Added seeded procedural terrain and a stable terrain-following driving controller.
- Added title, driving, and arrival modes.
- Added a real objective loop with a destination marker and restart flow.
- Added a handheld field map with discovery fog-of-war.
- Added procedural engine audio with debug inspection hook.
- Added richer vehicle handling telemetry to `render_game_to_text`.
- Added soft-sand sink, berm buildup, and drive-out recovery behavior.
- Added deterministic browser hooks for `startPathGame`, `jumpPathToObjective`, `jumpPathToSand`, `advanceTime`, `render_game_to_text`, and `getPathAudioDebug`.
- Added ambient route outposts and a summit relay objective.
- Added a light rain weather layer.
- Added a shared live-tuning/config layer with a toggleable in-game debug panel.
- Added deterministic scenario fixtures for spawn, sand, outpost, water, drift, and final relay jumps.
- Added fading tire tracks that stamp from wheel contact points and clear themselves after 10 seconds.
- Added a render-debug output selector with scene color, luma, depth, fog, water mask, water depth, and world-height views for shader scaffolding.
- Added real gravity, airborne state, vertical-speed telemetry, and a route crest-drop fixture so the truck can leave the ground and land again.
- Added layered ambient world audio for wind, rain, relay hum, beacon buzz, and an arrival stinger on top of the existing procedural engine mix.
- Added extra brutalist outpost set dressing including retaining walls, entry stairs, floodlights, signal boxes, conduits, and barrier blocks.
- Added standard-mapped gamepad support with analog steering/throttle, start/restart actions, boost/brake bindings, and live input-source reporting.
- Added checkpointed relay progression with split tracking across the outpost route.
- Added ambient AI service trucks that patrol short loops around the basin and relay line.

### Changed

- Replaced the earlier unstable prototype architecture with a cleaner TypeScript game runtime.
- Reworked terrain coloring and classification into distinct biomes.
- Restyled the title screen into an editorial outdoor field-guide treatment.
- Restyled the vehicle into a rugged Patagonia/4Runner-like trail rig.
- Shifted the world objective from a simple flare read into a relay-outpost route.
- Evolved the environment from a brighter scenic basin into a more atmospheric, slightly overcast outpost line.
- Reworked the route outposts and summit relay into a more brutalist concrete-and-steel language with stacked plinths, slab overhangs, slit apertures, and harsher relay silhouettes.
- Reworked the map from a static novelty overlay into a meaningful discovery/navigation tool.
- Clarified player-facing copy across the title, HUD, arrival screen, map overlay, and debug panel so instructions and state labels are easier to understand at a glance.
- Made the truck suspension read more clearly by softening the ride slightly, increasing travel, and adding a modest landing rebound plus body-heave response.
- Tightened handling with stronger surface differentiation, yaw carry, drift behavior, and recovery.
- Reworked the chassis from terrain-snapped motion to gravity-supported suspension with a small route lip that produces visible airtime.
- Split run state, map discovery, scenario fixtures, world streaming, and weather state into standalone gameplay/runtime modules.
- Made the default vehicle tune modestly faster and exposed speed, grip, yaw damping, sink depth, rain, fog, and camera offsets for live adjustment.
- Polished the shell UI with clearer trail-copy, stronger HUD card hierarchy, softer map/HUD interplay, and better arrival-card emphasis.
- Expanded the arrival sequence with a short cinematic camera hold, stronger relay flare behavior, and a fuller results card that reads like a real payoff instead of a quick modal.
- Improved the driving controls so left/right steering now matches the expected direction, down-brake input slows the truck before it falls into reverse, and steering recenters more cleanly at low speed.
- Improved the driving camera with suspension-aware heave, steering/drift offset, body roll, surface roughness shake, and a mild look bias toward the next checkpoint.
- Improved the driving camera again with terrain-aware chase clearance, velocity-led framing, dynamic speed/airborne/impact FOV, landing kick response, and occlusion pull-in so steep drops keep the truck in view.
- Improved mouse-drag camera feel with damped orbit targets, softer release glide, and reduced-motion-aware fallback behavior instead of raw pointer-delta snapping.

### Improved

- Stability of movement, camera behavior, and start/restart flow.
- Keyboard driving readability and control feel through corrected steering input, smarter brake/reverse behavior, and better low-speed steering settle.
- Terrain readability through path shaping, biome contrast, and landmark placement.
- World atmosphere through fog, mist, lighting, color grading, and rain.
- World atmosphere through layered ambient sound that now responds to weather, route exposure, and relay proximity.
- Route readability and run structure through checkpoint-focused HUD labels, next-relay distance targeting, and map markers that distinguish pending, current, and reached outposts.
- Camera readability through stronger sense of speed, clearer airborne/landing response, and safer framing on steep terrain without burying the truck behind ridges.
- Camera interaction quality through smoother cursor-drag orbiting that now eases toward the dragged view and settles back more gracefully after release.
- World liveliness through small ambient vehicles that now circulate near spawn, the basin outposts, and the summit approach.
- Sensory feedback through engine audio, dust, splash, wind, and sand behavior.
- Outpost readability and route authorship through harsher brutalist detailing, local utility lights, cable runs, and entry structures.
- Surface feedback through fading wheel tracks that linger briefly on snow, sand, dirt, and grass.
- Browser-based validation through deterministic state hooks and repeatable screenshots.
- Render/scaffolding iteration through selectable post-process debug outputs and deterministic render-debug hooks.
- Runtime scalability through lightweight camera-driven streaming of outpost intensity, wind density, water activity, and weather response.
- UI resilience through safer touch/focus states, safe-area-aware layout spacing, reduced-motion fallbacks, and more balanced text wrapping on title/arrival screens.
- Shell validation through a state-aware polish audit that captures desktop/mobile title and map states plus a browser-confirmed arrival overlay.
- UX clarity through simpler verbs, more specific relay/map wording, less internal jargon in HUD states, and clearer debug-panel controls.

### Fixed

- Removed the earlier unstable force-based vehicle behavior and impossible speeds.
- Fixed title/map shell focus and visibility issues.
- Fixed sand-start teleport fallback so the debug hook lands on a real sand basin.
- Prevented gameplay keys from triggering default browser scrolling behavior.

### Tooling

- `build` now runs typechecking before Vite build output.
- Vite build output splits `three` into its own chunk.
- TypeScript configuration is stricter and targets modern ECMAScript output.

### Validation Notes

- `npm run build` is the primary sanity check and currently passes.
- Browser validation artifacts are preserved in `output/web-game/`.
- The ambient-audio / arrival / brutalist-detail pass is preserved in `output/web-game/atmosphere-arrival-browser/`, including `shot-outpost.png`, `shot-arrival.png`, `state-outpost.json`, `state-arrival.json`, `audio-outpost.json`, and `audio-arrival.json`.
- The control pass is preserved in `output/web-game/controls-browser/`, including `shot-left-turn.png`, `shot-brake.png`, `state-left-turn.json`, `state-pre-brake.json`, and `state-brake.json`.
- The shell polish pass is preserved in `output/web-game/polish-audit/`, including desktop/mobile UI captures plus a browser-confirmed arrival overlay (`arrival-desktop.png`, `arrival-desktop-browser.png`) and `arrival-state.json`.
- The brutalist outpost pass is preserved in `output/web-game/brutalist-outpost-browser/`, including close route captures (`shot-outpost.png`, `shot-route.png`) and matching `state-outpost.json` / `state-route.json`.
- The gamepad/checkpoint/camera pass is preserved in `output/web-game/checkpoints-gamepad-smoke/` and `output/web-game/gamepad-checkpoints-browser/`, including `shot-gamepad-drive.png`, `state-gamepad-drive.json`, `shot-checkpoint.png`, and `state-checkpoint.json`.
- The camera polish pass is preserved in `output/web-game/camera-smoke/` and `output/web-game/camera-browser/`, including `shot-turning.png`, `state-turning.json`, `shot-airborne.png`, `state-airborne.json`, `shot-impact.png`, and `state-impact.json`.
- The drag-camera interaction pass is preserved in `output/web-game/drag-camera-smoke/` and `output/web-game/drag-camera-browser/`, including `shot-dragging.png`, `state-dragging.json`, `shot-release.png`, `state-release.json`, `shot-settle.png`, and `state-settle.json`.
- The ambient-traffic pass is preserved in `output/web-game/ambient-traffic-smoke/` and `output/web-game/ambient-traffic-browser/`, including `shot-0.png`, `state-0.json`, `shot-outpost-start.png`, `state-outpost-start.json`, `shot-outpost-after.png`, `state-outpost-after.json`, and `movement.json`.
- The bundled Playwright client still has intermittent issues clicking the title-screen start button, so keyboard-driven smoke runs and direct browser checks remain part of the workflow.
