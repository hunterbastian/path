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
- Added a rotating three-condition weather cycle that steps through cloudy, rainy, and sunny conditions every 90 seconds.
- Added weather gameplay modifiers so cloudy, rainy, and sunny conditions now affect grip, drag, puddle depth, ambient audio emphasis, and AI traffic pace/caution instead of changing only visuals.
- Added collision-aware ambient traffic that yields near the player, produces near-miss states, and applies light contact impulses when the truck is forced into an overlap.
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
- Added an in-run ESC field menu with resume and restart actions so driving can be paused without dropping back to the title screen.
- Added a pause-menu `God Mode` spectator state that detaches the camera into a free-fly view and uses `Esc` to snap back to the truck.
- Added slope-roll behavior on steep hills plus a deterministic `Slope Roll` fixture for validating natural downhill drift without throttle.
- Added tire tracks for ambient AI traffic so service trucks leave the same short-lived marks in snow, dirt, sand, and grass as the player.
- Added a dedicated mountain-side city-center landmark with a brutalist aircraft-hangar silhouette, annex blocks, floodlights, mast beacon, and apron slab near Tower Mountain.
- Added a deterministic `jumpPathToCityCenter` hook so the new mountain hub can be validated without a full drive from spawn.
- Added dirt service-road branches that connect the basin line to outposts, the mountain hangar, and the summit approach instead of leaving those landmarks as disconnected terrain.
- Added reactive roadside/world props including barriers, poles, signs, crates, and floodlights that can wobble, topple, or get shoved when the truck clips them.
- Added a deterministic `jumpPathToProps` hook for focused prop-impact validation.
- Added a visible title-screen audio state so the shell now tells the player when Web Audio still needs a real gesture to unlock.
- Added animated atmosphere drift to the sky mist bands so the basin haze now slides and lifts subtly instead of staying perfectly static.
- Added a lightweight wind-reactive grass field that places stylized tufts around grassy basin edges, dirt shoulders, outposts, and the mountain hangar approach.
- Added always-on headlights across the player truck and ambient service rigs so the route traffic now throws real forward light instead of reading as dark silhouettes.
- Added richer ground-response effects with snow spray, muddy puddle splash, darker rain-wet tracks, small rock/debris kick-up, and dirt-road rut pull so surface changes feel more physical under the truck.
- Added ambient loose debris that periodically skitters down steep wet slopes near the player/camera, so stormy hillsides now feel less static even when the truck is idle.
- Added collision debris bursts for traffic contact so clipping an ambient service truck now throws a short spray of loose material off the impact point.

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
- Improved the manual look camera so dragged views now hold after release and only ease back to the chase angle after a short delay.
- Improved the driving shell flow with a small pause overlay, softer HUD treatment while paused, and title-copy that now teaches the ESC menu explicitly.
- Improved grounded vehicle motion so steep cross-slopes now feed a real downhill pull instead of feeling magnetized to the hill surface.
- Improved ambient traffic from decorative patrols into light physical obstacles that can brake, yield, block a route, and trigger `Traffic Impact` feedback in the HUD.
- Improved the Tower Mountain approach by placing a more intentional secondary landmark near the massif instead of leaving that area as open terrain.
- Improved the handheld map and HUD with a more authored icon pass: custom mountain, hangar, outpost, summit-relay, truck, and weather glyphs replace the earlier generic marker shapes.
- Improved the procedural audio layer so browser gestures unlock Web Audio reliably, and the idle / wind / relay bed now reads clearly even when the truck is barely moving.
- Improved hill gravity so parked trucks now release and roll backward on steeper slopes when you come fully off the pedals instead of feeling pinned in place.
- Improved the world atmosphere with gently drifting mist plus more organic relay and hangar light shimmer instead of perfectly synchronized pulses.
- Improved the manual orbit camera so it now behaves more like `Dredge`: drag to a view and it stays there until you explicitly re-center it.
- Improved ground detail with denser, shorter grass tufts that now sway with weather-driven wind instead of reading as static terrain color.
- Restyled the shell UI into a flatter early-web look with `Geist Mono`, the supplied `Handscript` wordmark, lighter blue-gray panels, simpler control copy, and a more minimal title / HUD / map treatment.
- Added procedural parallax shading to terrain paths plus brutalist outpost / hangar materials so dirt, snow, concrete, and steel read with more depth and roughness without adding real geometry.
- Simplified the remaining shell branding so the loading screen, title screen, and map all identify the game as just `Path`.
- Tightened the traffic debug encounter hook so the lead service truck briefly stays committed to its line, which makes car-impact validation repeatable without changing the normal patrol feel.

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
- Weather readability through live HUD/title condition labels and a simple rotating forecast that now makes the active sky state explicit.
- Weather readability and feel through explicit gameplay-state telemetry, deeper puddles in rain, drier basins in sun, and slower/more cautious traffic when visibility drops.
- Surface feedback through stronger dirt-road grip cues, shallow muddy splash at puddle edges, darker rain-soaked tracks, and better distinction between dry dirt, water, and snow response.
- Surface reactivity through weather-driven slope debris and visible collision bursts when the truck tangles with ambient traffic.

### Fixed

- Removed the earlier unstable force-based vehicle behavior and impossible speeds.
- Fixed title/map shell focus and visibility issues.
- Fixed sand-start teleport fallback so the debug hook lands on a real sand basin.
- Prevented gameplay keys from triggering default browser scrolling behavior.
- Fixed the apparent “no sound” startup issue by moving audio activation onto real browser gesture paths and surfacing the lock / unlock state in the title UI.
- Fixed the `Slope Roll` fixture so it now faces uphill, which makes the rollback validation reflect the intended backward-slide behavior.
- Fixed the old drag camera annoyance where the orbit would automatically drift back to chase view after a delay instead of respecting the player’s chosen viewing angle.
- Fixed the debris/traffic validation path so the focused encounter hook now produces a real service-truck collision instead of braking away before impact.

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
- The ESC menu pass is preserved in `output/web-game/esc-menu-smoke/` and `output/web-game/esc-menu-browser/`, including `shot-0.png`, `state-0.json`, `shot-menu-open.png`, `state-menu-open.json`, `state-menu-hold.json`, `shot-menu-closed.png`, `state-menu-closed.json`, `shot-after-restart.png`, and `state-after-restart.json`.
- The slope-roll / AI-track pass is preserved in `output/web-game/gravity-tracks-smoke/` and `output/web-game/slope-roll-ai-tracks-browser/`, including `shot-0.png`, `state-0.json`, `shot-slope-roll.png`, `state-slope-start.json`, `state-slope-roll.json`, `shot-ai-tracks.png`, `state-ai-start.json`, and `state-ai-tracks.json`.
- The rotating-weather / delayed-camera-return pass is preserved in `output/web-game/weather-camera-smoke/` and `output/web-game/weather-camera-browser/`, including `shot-title.png`, `state-title.json`, `shot-cloudy.png`, `state-cloudy.json`, `shot-rainy.png`, `state-rainy.json`, `shot-sunny.png`, `state-sunny.json`, `shot-camera-dragged.png`, `state-camera-dragged.json`, `shot-camera-held.png`, `state-camera-held.json`, `shot-camera-returning.png`, `state-camera-returning.json`, and `summary.json`.
- The weather-physics / traffic-contact pass is preserved in `output/web-game/weather-traffic-smoke/` and `output/web-game/weather-traffic-browser/`, including `shot-0.png`, `state-0.json`, `shot-cloudy.png`, `state-cloudy.json`, `shot-rainy.png`, `state-rainy.json`, `shot-sunny.png`, `state-sunny.json`, `shot-traffic-start.png`, `state-traffic-start.json`, `shot-traffic-contact.png`, `state-traffic-contact.json`, `shot-traffic-recovery.png`, `state-traffic-recovery.json`, `weather-summary.json`, and `summary.json`.
- The mountain-hub landmark pass is preserved in `output/web-game/mountain-hub-smoke/` and `output/web-game/mountain-hub-browser/`, including `shot-0.png`, `state-0.json`, `shot-city-side.png`, `state-city-side.json`, `shot-city-drive.png`, `state-city-drive.json`, and `summary.json`.
- The dirt-path / icon / reactive-prop pass is preserved in `output/web-game/props-icons-paths-smoke-clean/` and `output/web-game/props-icons-paths-browser/`, including `shot-0.png`, `state-0.json`, `shot-map-icons.png`, `state-map-icons.json`, `shot-props-before.png`, `state-props-before.json`, `shot-props-impact.png`, `state-props-impact.json`, `shot-props-after.png`, `state-props-after.json`, and `summary.json`.
- The audio unlock pass is preserved in `output/web-game/audio-layer-smoke/` and `output/web-game/audio-layer-browser/`, including `shot-0.png`, `state-0.json`, `shot-title-audio.png`, `shot-driving-audio.png`, `audio-driving.json`, `state-driving.json`, and `summary.json`.
- The hill-gravity / atmosphere pass is preserved in `output/web-game/slope-atmosphere-browser/`, including `shot-slope-start.png`, `state-slope-start.json`, `shot-slope-after.png`, `state-slope-after.json`, `shot-atmosphere.png`, `state-atmosphere.json`, and `summary.json`.
- The persistent-camera pass is preserved in `output/web-game/persistent-camera-browser/`, including `shot-dragging.png`, `state-dragging.json`, `shot-release.png`, `state-release.json`, `shot-held.png`, `state-held.json`, `shot-recentered.png`, `state-recentered.json`, and `summary.json`.
- The god-mode pass is preserved in `output/web-game/god-mode-browser/`, including `shot-menu.png`, `shot-god-mode.png`, `shot-returned.png`, `state-menu.json`, `state-god-entry.json`, `state-god-moved.json`, `state-returned.json`, and `summary.json`.
- The headlight pass is preserved in `output/web-game/headlights-browser/`, including `state-headlights.json` and `summary.json`.
- The richer ground-response pass is preserved in `output/web-game/ground-response-browser/`, including `shot-dirt-path.png`, `shot-water-crossing.png`, `shot-snow.png`, `state-dirt-path.json`, `state-water-crossing.json`, `state-snow.json`, and `summary.json`.
- The downhill-debris / traffic-impact pass is preserved in `output/web-game/debris-traffic-browser/`, including `shot-slope-debris.png` and `shot-traffic-impact.png`.
- The grass pass is preserved in `output/web-game/grass-smoke/` and `output/web-game/grass-browser/`, including `shot-0.png`, `state-0.json`, `shot-city-center.png`, `state-city-center.json`, `shot-driving-grass.png`, `state-driving-grass.json`, and `summary.json`.
- The bundled Playwright client still has intermittent issues clicking the title-screen start button, so keyboard-driven smoke runs and direct browser checks remain part of the workflow.
