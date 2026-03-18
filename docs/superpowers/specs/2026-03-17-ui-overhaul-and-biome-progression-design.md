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
| `--amber-muted` | `rgba(212,167,74, 0.25–0.4)` | Labels |
| `--amber-bright` | `rgba(212,167,74, 0.7–0.85)` | Values, active elements |
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
3. **Data row**: 4 equal cells — Region / Grid / Conditions / Relay status. 1px amber border, amber labels (5px) + amber values (9px)
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
| Cam Shake toggle | `ThirdPersonCamera` | Shake intensity multiplier (1.0 or 0.0) |
| Deadzone slider | `InputManager` | Gamepad stick deadzone threshold |

Settings are read via `AppShell.getSettingsValues()` on pause close, applied immediately. Values persist to localStorage.

---

## 4. In-Game HUD

Progressive disclosure: essential stats always visible, full grid on Tab.

### Always Visible

| Element | Position | Description |
|---------|----------|-------------|
| Speedometer | Bottom center | Existing — restyle to amber on transparent (no paper panel). Speed value + km/h label + bar |
| Compass strip | Top center | Heading with cardinal labels, amber diamond marker. Fades when not turning. |
| Boost gauge | Near speedo or corner | Small bar + percentage. Glows brighter as boost charges. |
| Drift total | Floating | Persistent running score. Pulses during active drift. |
| Surface type | Small, unobtrusive | Color-coded terrain label (dirt=clay, sand=warm, rock=grey, grass=green) |
| Corner minimap | Bottom-left or top-left corner | 72×72px square. Fog-of-war from MapDiscoverySystem. Player dot (amber, glowing) + relay marker (amber outline). Border matches amber terminal style. |

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

### Island Layout

- **Radial design** — Alpine Meadows at center, elevated. Other biomes fan outward like sectors toward the island edge.
- **Alpine Meadows is a natural viewpoint** — from the center you can see all biomes on the horizon: canyon walls, white salt flats, jagged peaks, ocean glint. Visual menu of what's ahead.
- **Biome transitions** — terrain generation blends between zones over ~50m. Height, color palette, surface type, vegetation all crossfade.
- **Each biome has its own**: terrain generation parameters, color palette, grass/vegetation config, fog color, ambient sounds (when audio is wired).

### Terrain Generation Per Biome

Extend `Terrain.ts` with a biome lookup based on world position (angle + distance from center):

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

### Phase 3: Routes
- Route registry with named waypoint paths
- Extend DirtRoads with route-aware road generation
- HUD: route name display when on a named road

### Phase 4: Progression
- XP system (distance + discovery)
- Level calculation and persistence
- Level gates (physical barriers tied to level)
- Viewpoint system (map reveal on arrival)
- Per-biome discovery percentage

Each phase ships independently and the game is playable after each.
