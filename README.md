# Path

Path is a stylized off-road driving prototype built with `three` and `vite`.
You drive a rugged trail rig through a seeded alpine basin toward a chain of remote relay outposts, crossing snow, dirt, sand, rock, and meltwater under light rain.

The current build focuses on atmosphere, readable terrain, deterministic runtime behavior, and a tight test loop for iterative game development.

## Current Features

- Fixed-step driving runtime with deterministic stepping support.
- Seeded procedural terrain with surface classification for `snow`, `dirt`, `sand`, `grass`, `rock`, and `water`.
- Third-person chase camera, title camera, and arrival camera.
- Stylized rugged vehicle with surface-responsive handling.
- Objective loop with route outposts, summit relay destination, arrival screen, and restart flow.
- Handheld field map with fog-of-war discovery and outpost markers.
- Procedural engine audio driven by throttle, boost, speed, and surface.
- Environment effects including dust, splash, wind, mist, and light rain.
- Deterministic debug hooks for browser-based validation.

## Controls

- `W` / `ArrowUp`: throttle
- `S` / `ArrowDown`: reverse
- `A` / `ArrowLeft`: steer left
- `D` / `ArrowRight`: steer right
- `Shift`: brake
- `Space`: boost
- `M`: toggle handheld map
- `R`: reset run
- `F`: toggle fullscreen
- `Enter`: start run / restart after arrival
- Drag on the canvas: orbit camera

## Getting Started

### Requirements

- Node.js 20+ recommended
- npm

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Vite will print the local URL. In this repo we commonly run it on `http://127.0.0.1:4173`.

### Production build

```bash
npm run build
```

### Preview production build

```bash
npm run preview
```

### Alpha preview reel

The title screen now includes a Remotion-powered early alpha reel that loops
inside the start screen.

For standalone Remotion work:

```bash
npm run alpha:studio
npm run alpha:render
```

`alpha:render` outputs `output/path-alpha-preview.mp4`.
On a fresh machine, the first render may download Remotion's Chrome Headless
Shell before exporting.

## Debug Hooks

The game intentionally exposes a small set of browser globals for deterministic testing and quick iteration:

- `window.startPathGame()`
- `window.jumpPathToObjective()`
- `window.jumpPathToSand()`
- `window.advanceTime(ms)`
- `window.render_game_to_text()`
- `window.getPathAudioDebug()`

`render_game_to_text()` returns concise JSON for the current game state, including vehicle telemetry, objective distance, outpost metadata, weather, and UI visibility.

## Testing and Validation

The project uses a practical browser-driven validation loop instead of a formal gameplay test suite.

Typical validation flow:

```bash
npm run build
node "$HOME/.codex/skills/develop-web-game/scripts/web_game_playwright_client.js" \
  --url http://127.0.0.1:4173 \
  --actions-json '{"steps":[{"buttons":["enter"],"frames":2},{"buttons":["up"],"frames":16}]}' \
  --iterations 1 \
  --pause-ms 250 \
  --screenshot-dir output/web-game/manual-check
```

Artifacts are preserved in `output/web-game/` as:

- screenshots
- `render_game_to_text` JSON state dumps
- occasional error logs when browser checks fail

Known validation note:

- The bundled Playwright client can be flaky when clicking the title screen `#start-button`. Keyboard-driven runs and browser-level checks are the reliable fallback.

## Project Structure

```text
src/
  app/        High-level game orchestration
  audio/      Procedural engine audio
  camera/     Chase/title/arrival camera logic
  core/       Engine, loop, input, UI shell, seeded RNG
  effects/    Dust, splash, wind, rain, particle helpers
  render/     Post-processing
  styles/     App styling
  vehicle/    Vehicle visuals, state, handling controller
  world/      Terrain, water, sky, outposts
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the deeper system breakdown.

## Deployment

The project is set up for Vercel deployment and GitHub-backed hosting.

- GitHub: `https://github.com/hunterbastian/path`
- Live site: `https://path-mu-eight.vercel.app`

## Current State

This is still a prototype, but it now has a coherent playable loop:

1. Start from camp.
2. Drive through the basin toward the relay route.
3. Use the field map to navigate and uncover terrain.
4. Manage handling across snow, dirt, water, and soft sand.
5. Reach the summit relay outpost and restart for another run.

## Additional Docs

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- [CHANGELOG.md](CHANGELOG.md)
- [progress.md](progress.md)
