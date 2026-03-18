# PATH — UI Overhaul & Biome Progression Design

## Overview

Two connected workstreams: (1) a visual and functional overhaul of all UI screens and HUD using a retro-futuristic "Amber Terminal" aesthetic, and (2) a biome zone system with driving-based progression that gives the open world structure and replayability.

---

## 1. Visual Language — Amber Terminal

Retro-futuristic device aesthetic inspired by Teenage Engineering hardware (OP-1, TX-6). Every screen feels like interacting with a physical instrument.

### Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--chassis` | `#1c1e24` | Panel background |
| `--surround` | `#0e1420` | Full-screen backdrop |
| `--amber` | `#d4a74a` | Primary text/accents at varying opacities |
| `--amber-glow` | `box-shadow: 0 0 8px rgba(212,167,74,0.4)` | LED indicators |
| `--amber-muted` | `rgba(212,167,74, 0.35)` | Labels |
| `--amber-bright` | `rgba(212,167,74, 0.75)` | Values, active elements |
| `--amber-dim` | `rgba(212,167,74, 0.15)` | Borders, inactive elements |
| `--te-orange` | `#e8622c` | Toggle indicators (sparingly) |

### Shared Elements

- **Geist Mono** throughout, no serif/handscript
- **Square elements** — no border-radius anywhere (0px)
- **CRT scanline overlay** — `repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,0,0,0.06) 1px, rgba(0,0,0,0.06) 3px)`
- **Amber LED indicator** — 5×5px square with glow, in header bars
- **Header bar pattern** — dark bar with LED + label + metadata, consistent across all screens
- **Square slider knobs** — 8×8px amber squares on 2px track
- **Square toggle switches** — 24×12px dark housing, 10×10px amber square indicator
- **Segmented selectors** — equal-width cells, active cell gets amber background + bright text

---

## 2. Title Screen — The Device

Full-screen dark surround. Centered device panel.

### Structure (top to bottom)

1. **Header bar** (dark): amber LED + "PATH · Navigator Terminal" + version string
2. **Screen area**: live 3D preview in 16:9 aspect ratio, CRT scanline overlay, phosphor glow effect, "▸ Terrain preview active" placeholder text
3. **Data row**: 4 equal cells — Region / Grid / Conditions / Relay status. 1px amber border, amber labels (5px) + amber values (9px). Phase 1 defaults: Region="Patagonia", Grid="920 × 920", Conditions=current weather from Sky system, Relay="Online"/"Offline" from NetworkManager. Updated per-biome in Phase 2.
4. **Title block**: "PATH" at 52px 800-weight amber, subtitle "Open-world driving · autonomous navigation" below
5. **Bottom bar** (dark): callsign input (amber border, amber text) + "Initialize" button (amber border + text)

### Behavior

- Live 3D scene renders into the screen area behind the panel
- Callsign saves to localStorage (existing pattern)
- "Initialize" triggers game start (replaces current "Begin" button)
- Scanline overlay is CSS-only, no performance cost

---

## 3. Pause Screen — Compact Console

Single-column amber device panel. Settings + actions only — no run stats.

### Structure (top to bottom)

1. **Header bar**: amber LED + "System" + "Esc · close"
2. **Settings block**:
   - Volume: label + slider (square knob) + value
   - Graphics: label + segmented toggle (Low / Med / High)
   - Cam Shake: label + square toggle switch + ON/OFF text
   - Deadzone: label + slider (square knob) + value
3. **Actions list** (separated by 1px amber border):
   - "▸ Resume" (bright amber, bold)
   - "Restart run" (muted amber)
   - "Free camera" (muted amber)

### Settings Wiring

| Control | Target | Method |
|---------|--------|--------|
| Volume slider | `SampleAudio` | `setMasterVolume(value)` |
| Graphics toggle | `Engine` | Adjust `#maxPixelRatio`, `#minPixelRatio`, shadow map size, shadow type |
| Cam Shake toggle | `ThirdPersonCamera` | Add public `shakeScale` property (0.0 or 1.0) that multiplies all shake outputs (`#shakeOffsetX/Y/Z`, `#shakeRollOffset`, `#shakePitchOffset`) before applying to camera |
| Deadzone slider | `InputManager` | Refactor `GAMEPAD_AXIS_DEADZONE` from module-level `const` to a mutable instance property with a setter |

Settings are read via `AppShell.getSettingsValues()` on pause close, applied immediately. Values persist to localStorage.

**Note**: "Free camera" action maps to the existing God Mode system (`#enterGodMode` / `#exitGodMode` in PathGame.ts). No new camera system needed — just rename the button label.

---

## 4. In-Game HUD

Progressive disclosure: essential stats always visible, full grid on Tab.

### Always Visible

| Element | Position | Description |
|---------|----------|-------------|
| Speedometer | Bottom center | Existing — restyle to amber on transparent (no paper panel). Speed value + km/h label + bar |
| Compass strip | Top center | Heading with cardinal labels, amber diamond marker. Fades when not turning. |
| Weather indicator | Near compass or corner | Amber icon + condition text. Updates on biome change. See § Per-Biome Weather. |
| Boost gauge | Near speedo or corner | Replaces existing HUD boost display. Shows `boostLevel` (0–1) as percentage + bar. "Glow" = `text-shadow` intensity scales with boost level. |
| Drift total | Floating | Persistent running score. Pulses during active drift. |
| Surface type | Small, unobtrusive | Color-coded terrain label (dirt=clay, sand=warm, rock=grey, grass=green) |
| Corner minimap | Bottom-left corner | 96×96px square. Renders the fog-of-war cell grid from MapDiscoverySystem to a small canvas (not the full topo map). Player dot (amber, glowing) + relay marker (amber outline). Border matches amber terminal style. |

### Tab-Expanded Grid

On Tab press, a full amber terminal overlay slides in showing: Relay distance, Run timer, Weather, Mapped %, Achievements unlocked, Players online. Same amber label/value styling. Dismisses on Tab release or second press.

### Styling

All HUD elements use the amber terminal palette — amber text on transparent/semi-transparent dark backgrounds. No paper panel aesthetic. Text shadows for readability over the 3D scene.

---

## 5. Biome Zone System

The island is divided into 5 distinct biomes radiating outward from a central elevated zone.

### Biomes

| # | Biome | Terrain | Surface | Mood | Difficulty |
|---|-------|---------|---------|------|------------|
| 1 | **Alpine Meadows** | Rolling grass fields, mountain ridges, wildflowers, rocky outcrops | Grass, dirt | Warm, open, dramatic vistas | Easy — starter zone |
| 2 | **Canyon** | Deep carved valleys, cliff-edge roads, narrow passages | Rock, dirt | Red/clay tones, dusty | Medium |
| 3 | **Salt Flats** | Wide open white expanse, cracked ground | Salt (fast surface) | Bright, heat shimmer | Medium — speed-focused |
| 4 | **Jagged Peaks** | Fitz Roy-style spires, switchback roads, steep grades | Rock, snow | Cold, dramatic, high contrast | Hard |
| 5 | **Coast** | Shoreline roads, sea stacks, beach | Sand, rock | Ocean breeze, spray | Medium |

### Per-Biome Weather

Weather is biome-local, not global. Each biome has its own weather state that cycles independently.

| Biome | Weather Options | Notes |
|-------|----------------|-------|
| Alpine Meadows | Clear, light rain | Gentle rain with sun breaks. No snow. |
| Canyon | Clear, dust storm | No rain — too dry. Dust storm reduces visibility. |
| Salt Flats | Clear only | Always dry, always bright. Weather is the heat shimmer. |
| Jagged Peaks | Clear, snow, blizzard | Snow is frequent. Blizzard = heavy snow + wind + low visibility. |
| Coast | Clear, rain, heavy rain | Coastal storms roll in. Rain + ocean spray. |

- Weather is mostly clear/cloudy. Active weather (rain, snow, dust) lasts ~30 seconds, then fades back to clear. Feels like brief passing events, not sustained storms.
- Weather transitions smoothly (10-15s fade in, 30s active, 10-15s fade out)
- Long clear stretches between events (3-8 minutes of clear/cloudy)
- Existing `RainSystem` (120 drop cap) extends to support snow variant (slower fall, lateral drift, white particles)
- Weather affects driving during active events: rain reduces grip slightly, snow reduces grip more, dust storm / blizzard reduce draw distance
- Weather state per biome persisted in memory (not localStorage — resets each session)

### Weather on HUD

The always-visible HUD gets a **weather indicator** — small amber icon + condition text near the compass or corner. Shows current biome weather:

- Clear: `○` (empty circle)
- Rain: `≡` (horizontal lines)
- Snow: `✦` (crystal)
- Dust: `◌` (dotted circle)
- Blizzard: `✦✦` (double crystal)

Updates when crossing biome boundaries. Transitions with a brief fade.

### Island Layout

- **Radial design** — Alpine Meadows at center, elevated. Other biomes fan outward like sectors toward the island edge.
- **Angled terrain** — Alpine Meadows slopes outward so the player naturally looks downhill into the distance. The elevation drop means you can see all biomes stretching out below: canyon walls, white salt flats, jagged peaks, ocean glint. The landscape falls away like standing on a mountainside.
- **Alpine Meadows is a natural viewpoint** — visual menu of what's ahead before you even start driving.
- **Biome transitions** — terrain generation blends between zones over ~30m. Height, color palette, surface type, vegetation all crossfade. 30m keeps transitions tight while leaving ~70-120m of pure biome per sector.
- **Each biome has its own**: terrain generation parameters, color palette, grass/vegetation config, fog color, ambient sounds (when audio is wired).
- **Day/night tinting per biome** — existing Sky system (9 mood keyframes) gets biome-specific color offsets. Alpine Meadows: warmer golden hour, soft pink dawn. Canyon: deep orange sunsets, purple twilight. Salt Flats: harsh white noon, pale blue nights. Jagged Peaks: cold blue nights, pink alpenglow at dawn/dusk. Coast: warm amber sunsets, grey-blue overcast mornings.

### Terrain Generation Per Biome

**This replaces the existing terrain generation algorithm.** The current single-biome island (sinusoidal main path, uniform noise) is replaced with a biome-aware generator. Existing systems that depend on terrain (DirtRoads, EnvironmentalClutter, GrassField, WildflowerField, CoastalRocks, ValleyFog, Water) will need biome-aware configs.

Biome lookup based on world position (angle + distance from center). With `ISLAND_EDGE = 355`, Alpine Meadows occupies the inner ~120m radius, outer biomes each span ~100-150m radially, with 30m transition blends between zones:

- **Alpine Meadows**: moderate noise amplitude, green-gold palette, existing grass + wildflower system
- **Canyon**: high amplitude with sharp ridges, deep valleys cut by erosion noise, clay/red palette
- **Salt Flats**: near-zero amplitude (flat), white/cream surface, subtle cracking pattern
- **Jagged Peaks**: very high amplitude, sharp noise octaves, grey-blue rock + white snow above threshold
- **Coast**: gradual falloff to sea level (existing), beach sand palette, existing ocean/rocks systems

---

## 6. Route System

Named dirt roads connecting biomes and points of interest.

### Implementation

- Extend existing `DirtRoads.ts` with a route registry — named paths with waypoint arrays
- Routes follow terrain, generated as spline curves between waypoints
- Route names display on the HUD when driving on a named road (e.g., "Ridge Run", "Salt Crossing")
- Forks and intersections where routes meet

### Route Types

- **Main routes**: wider, connect biome centers. Always accessible.
- **Side paths**: narrower, lead to viewpoints or hidden areas. Some level-gated.

### Per-Biome Road Style

Road appearance changes based on biome — same DirtRoads mesh system, different material/width:

| Biome | Road Look | Width |
|-------|-----------|-------|
| Alpine Meadows | Worn dirt trail, grass encroaching at edges | Medium |
| Canyon | Carved rock shelf, sandy/red surface, narrow cliff edges | Narrow |
| Salt Flats | Faint tire tracks on white crust, barely visible | Wide |
| Jagged Peaks | Gravel switchbacks, rocky borders, snow-dusted | Narrow |
| Coast | Packed sand path, driftwood/seagrass edges | Medium |

---

## 6b. Biome Ambience — Particles & Wildlife

Each biome has ambient particle systems and simple wildlife to make it feel alive. Built on the existing `SpriteParticleField` / `DustSystem` pattern.

### Per-Biome Ambience

| Biome | Particles | Wildlife |
|-------|-----------|----------|
| Alpine Meadows | Pollen drifts, dandelion seeds, light dust | Birds circling overhead (instanced billboard sprites on looping paths), butterflies near wildflowers |
| Canyon | Red dust clouds, small rock debris near cliffs | Hawks soaring in thermals (slow, wide circles) |
| Salt Flats | Heat shimmer (shader distortion), fine white dust | Nothing — empty, desolate feel is the point |
| Jagged Peaks | Snow flurries, ice crystals catching light | Eagles at high altitude (rare, distant) |
| Coast | Sea spray, foam particles near shore | Seabirds (existing bird system if any), crabs skittering on rocks (ground sprites) |

### Implementation Notes

- **Particles**: new instances of `SpriteParticleField` per biome, spawned only when player is in that biome. Despawn when leaving.
- **Wildlife**: instanced billboard sprites on simple spline/circle paths. Not physical — no collision. 2-3 species per biome max. LOD culled beyond ~120m.
- **Sound**: when audio is wired, each biome gets ambient loops (wind variants, bird calls, ocean, silence for salt flats).

---

## 7. Progression System

Driving is the XP source. No grinding — just play.

### Leveling

- **XP sources**: distance driven (continuous) + new zone discovery (one-time bonus per grid cell)
- **Level thresholds**: simple curve, ~5-8 levels total
- **Level displayed**: in the Tab-expanded HUD grid and on the pause/title screens

### Level Gates

- Certain paths or areas within zones require a minimum level to access
- Gates are physical barriers (e.g., a collapsed road that "clears" at level 3, a locked gate that "opens" at level 5)
- Some gates exist in the starter zone — reason to come back after leveling up in outer biomes
- Gate state persisted to localStorage alongside existing DriverProfile

### Discovery Rewards

- Fog-of-war reveals via driving (existing MapDiscoverySystem)
- **Viewpoints**: specific high locations that reveal a large map chunk when reached. Marked on minimap as undiscovered markers.
- Zone completion percentage tracked per biome
- Discovery triggers the existing achievement toast system

---

## 8. Phased Build Order

### Phase 1: UI Overhaul (no gameplay changes)
- Amber terminal CSS palette and shared styles
- Title screen rebuild
- Pause screen rebuild + settings wiring
- HUD: compass, boost, drift, surface, minimap as floating amber elements
- Tab-expanded stat grid

### Phase 2: Biome Terrain
- Biome lookup system in Terrain.ts (position → biome)
- Per-biome terrain generation parameters
- Per-biome color palettes, grass config, fog
- Biome transition blending

### Phase 3: Routes + Ambience + Weather
- Route registry with named waypoint paths
- Extend DirtRoads with route-aware road generation
- Per-biome road materials and widths
- HUD: route name display when on a named road
- Per-biome ambient particles (pollen, dust, snow, spray)
- Wildlife billboard sprites on looping paths
- Per-biome weather system (rain, snow, dust storms)
- Weather HUD indicator
- Weather → grip effects on vehicle

### Phase 4: Progression
- XP system (distance + discovery)
- Level calculation and persistence
- Level gates (physical barriers tied to level)
- Viewpoint system (map reveal on arrival)
- Per-biome discovery percentage

Each phase ships independently and the game is playable after each.
