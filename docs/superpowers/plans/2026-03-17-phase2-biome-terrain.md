# Phase 2: Biome Terrain System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single-biome Patagonian steppe with a 5-biome radial island where Alpine Meadows sits elevated at center, and Canyon, Salt Flats, Jagged Peaks, and Coast radiate outward as distinct sectors.

**Architecture:** The existing `Terrain.ts` already has a biome system using Gaussian RBFs with `getBiomeAt()`. We're replacing the biome definitions (centers, radii, names) and adding per-biome noise parameters, color palettes, and surface rules. Dependent systems (GrassField, EnvironmentalClutter, ValleyFog, DirtRoads, CloudSystem) query terrain at runtime, so they'll auto-adapt to new heights/surfaces — but they need biome-aware configs for density, color, and fog behavior.

**Tech Stack:** Three.js, TypeScript, Vite, procedural terrain generation

**Spec:** `docs/superpowers/specs/2026-03-17-ui-overhaul-and-biome-progression-design.md` — Sections 5, 6b (ambience), and per-biome weather/day-night.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `src/world/BiomeConfig.ts` | Create | Biome definitions: names, sectors, noise params, palettes, surface rules |
| `src/world/Terrain.ts` | Major modify | Radial biome lookup, per-biome height generation, per-biome vertex colors, surface type rules |
| `src/world/GrassField.ts` | Modify | Per-biome grass density, color, blade height |
| `src/world/EnvironmentalClutter.ts` | Modify | Per-biome clutter types and density |
| `src/world/ValleyFog.ts` | Modify | Per-biome fog color, density, height |
| `src/world/CloudSystem.ts` | Modify | Per-biome cloud density and altitude |
| `src/world/Sky.ts` or equivalent | Modify | Per-biome day/night color tinting |

---

## Task 1: BiomeConfig — Biome Definitions

**Files:**
- Create: `src/world/BiomeConfig.ts`

- [ ] **Step 1: Create the biome config module**

Define the 5 biomes with their sector angles, radial bounds, noise parameters, and color palettes:

```typescript
export type BiomeName = 'alpine-meadows' | 'canyon' | 'salt-flats' | 'jagged-peaks' | 'coast';

export interface BiomeConfig {
  name: BiomeName;
  displayName: string;
  /** Sector angle range in radians [start, end] from island center */
  sectorStart: number;
  sectorEnd: number;
  /** Radial bounds: inner and outer radius from center */
  innerRadius: number;
  outerRadius: number;
  /** Noise generation parameters */
  noiseAmplitude: number;
  noiseFrequency: number;
  detailAmplitude: number;
  detailFrequency: number;
  /** Base elevation offset (Alpine Meadows is highest) */
  baseElevation: number;
  /** Color palette [ground, slope, peak, accent] as hex */
  palette: { ground: number; slope: number; peak: number; accent: number };
  /** Surface type weights */
  primarySurface: DriveSurface;
  secondarySurface: DriveSurface;
  /** Grass config */
  grassDensity: number; // 0-1 multiplier
  grassColor: { base: number; tip: number };
  grassHeight: number; // multiplier
  /** Fog config */
  fogColor: number;
  fogDensity: number; // multiplier
}
```

Define all 5 biomes:
- **Alpine Meadows**: center (0-120m radius, all angles), high base elevation (slopes outward), moderate noise, green-gold palette, grass density 1.0
- **Canyon**: one sector (~0-72° or 0-1.26rad), 120-355m, high amplitude + sharp ridges, red/clay palette, grass density 0.1
- **Salt Flats**: one sector (~72-144°), 120-355m, near-zero amplitude (flat), white/cream, grass density 0.0
- **Jagged Peaks**: one sector (~144-252°), 120-355m, very high amplitude + sharp octaves, grey-blue + snow, grass density 0.05
- **Coast**: one sector (~252-360°), 120-355m, gradual falloff to sea level, sand/beach palette, grass density 0.3

- [ ] **Step 2: Add biome lookup function**

```typescript
export function getBiomeAt(x: number, z: number, islandEdge: number): { primary: BiomeConfig; secondary: BiomeConfig | null; blend: number } {
  // Calculate angle from center and distance from center
  // Return primary biome + optional secondary for blending in transition zones (30m)
}
```

The blend function uses angle + distance to determine which biome sector the point falls in, with 30m-wide transition zones between adjacent sectors.

- [ ] **Step 3: Run `npx tsc --noEmit`**

- [ ] **Step 4: Commit**

```bash
git add src/world/BiomeConfig.ts
git commit -m "feat(biome): add BiomeConfig with 5 radial biome definitions"
```

---

## Task 2: Terrain Generation — Per-Biome Height + Colors

**Files:**
- Modify: `src/world/Terrain.ts`

This is the core task. The existing terrain generates a single noise field. We need it to sample the biome at each point and use biome-specific noise parameters.

- [ ] **Step 1: Replace biome system in Terrain.ts**

Import the new `BiomeConfig` module. Replace the existing `getBiomeAt()` (Gaussian RBF-based) with the new radial sector-based lookup.

- [ ] **Step 2: Modify `#sampleHeight()` to use per-biome noise**

Currently uses fixed noise amplitudes. Change to:
1. Get biome at (x, z) via `getBiomeAt()`
2. Use `biome.noiseAmplitude`, `biome.noiseFrequency`, `biome.detailAmplitude`, `biome.detailFrequency`
3. Add `biome.baseElevation` offset
4. If in a transition zone (blend > 0), lerp between primary and secondary biome heights
5. Alpine Meadows: add outward slope — elevation decreases with distance from center, creating the viewpoint effect

- [ ] **Step 3: Modify vertex color assignment**

Replace the current single palette with per-biome palettes. For each vertex:
1. Get biome at vertex position
2. Use `biome.palette` colors based on height/slope
3. Blend colors in transition zones

- [ ] **Step 4: Modify `#computeSurfaceType()` for per-biome rules**

Use `biome.primarySurface` and `biome.secondarySurface` instead of the current global rules. Canyon defaults to rock/dirt, Salt Flats to a new "salt" surface (or reuse sand), Jagged Peaks to rock/snow, etc.

- [ ] **Step 5: Clear all caches when terrain regenerates**

The height/surface/road caches use the same `#cacheKey()`. Make sure cache eviction handles the new biome-aware generation correctly.

- [ ] **Step 6: Run `npx tsc --noEmit` and `npm run build`**

- [ ] **Step 7: Commit**

```bash
git add src/world/Terrain.ts
git commit -m "feat(biome): per-biome terrain height, colors, and surface types"
```

---

## Task 3: GrassField — Per-Biome Density + Color

**Files:**
- Modify: `src/world/GrassField.ts`

- [ ] **Step 1: Read GrassField.ts to understand spawn logic**

Find where grass instances are placed and how density/color are determined.

- [ ] **Step 2: Query biome at each grass spawn point**

Before placing a grass instance, get the biome. Multiply spawn probability by `biome.grassDensity`. This means:
- Alpine Meadows: full grass coverage
- Coast: 30% coverage
- Canyon: 10% (sparse scrub)
- Jagged Peaks: 5% (alpine tundra)
- Salt Flats: 0% (nothing grows)

- [ ] **Step 3: Per-biome grass color**

Use `biome.grassColor.base` and `biome.grassColor.tip` to tint grass blades:
- Alpine Meadows: green-gold (existing)
- Canyon: yellow-brown dry grass
- Coast: dark green coastal grass
- Jagged Peaks: grey-green alpine grass

- [ ] **Step 4: Per-biome blade height**

Multiply blade height by `biome.grassHeight`:
- Alpine Meadows: 1.0 (tall meadow grass)
- Canyon: 0.4 (short scrub)
- Coast: 0.6 (medium)
- Jagged Peaks: 0.3 (low alpine)

- [ ] **Step 5: Run `npx tsc --noEmit`**

- [ ] **Step 6: Commit**

```bash
git add src/world/GrassField.ts
git commit -m "feat(biome): per-biome grass density, color, and height"
```

---

## Task 4: EnvironmentalClutter — Per-Biome Objects

**Files:**
- Modify: `src/world/EnvironmentalClutter.ts`

- [ ] **Step 1: Read EnvironmentalClutter.ts**

Understand what clutter objects exist and how they're placed.

- [ ] **Step 2: Filter clutter by biome**

When placing clutter, query the biome and only place biome-appropriate objects:
- Alpine Meadows: wildflowers, rocks, small boulders
- Canyon: large boulders, debris, dead wood
- Salt Flats: nothing (or very sparse cracked ground details)
- Jagged Peaks: rock formations, snow-covered boulders, ice
- Coast: driftwood, sea grass, existing coastal rocks

- [ ] **Step 3: Adjust density per biome**

Use biome-specific density multipliers for clutter placement.

- [ ] **Step 4: Run `npx tsc --noEmit`**

- [ ] **Step 5: Commit**

```bash
git add src/world/EnvironmentalClutter.ts
git commit -m "feat(biome): per-biome environmental clutter types and density"
```

---

## Task 5: ValleyFog + CloudSystem — Per-Biome Atmosphere

**Files:**
- Modify: `src/world/ValleyFog.ts`
- Modify: `src/world/CloudSystem.ts`

- [ ] **Step 1: Per-biome fog**

ValleyFog currently has uniform fog across the island. Modify to:
- Alpine Meadows: light, warm-tinted fog in valleys
- Canyon: dusty, thick fog in deep cuts (red-tinted)
- Salt Flats: very thin, shimmery (near zero)
- Jagged Peaks: heavy cold fog, blue-grey
- Coast: sea mist, rolling in from edges

Fog density and color shift based on player's current biome.

- [ ] **Step 2: Per-biome clouds**

CloudSystem currently spawns uniform clouds. Adjust:
- Alpine Meadows: scattered cumulus, high
- Canyon: minimal clouds
- Salt Flats: clear skies, barely any
- Jagged Peaks: dense low clouds around peaks
- Coast: overcast tendency, lower altitude

- [ ] **Step 3: Run `npx tsc --noEmit`**

- [ ] **Step 4: Commit**

```bash
git add src/world/ValleyFog.ts src/world/CloudSystem.ts
git commit -m "feat(biome): per-biome fog density/color and cloud configuration"
```

---

## Task 6: Day/Night Per-Biome Tinting

**Files:**
- Modify: Sky system (find the file — likely `src/world/Sky.ts` or similar)

- [ ] **Step 1: Find and read the Sky/lighting system**

The existing system has 9 mood keyframes for day/night cycle. Find where sky color, sun color, and ambient light are set.

- [ ] **Step 2: Add biome color offsets**

Based on the current biome the player is in, apply color offsets to the sky:
- Alpine Meadows: warmer golden hour (+orange), soft pink dawn
- Canyon: deep orange sunsets, purple twilight
- Salt Flats: harsh white noon, pale blue nights
- Jagged Peaks: cold blue nights, pink alpenglow at dawn/dusk
- Coast: warm amber sunsets, grey-blue overcast mornings

Implementation: multiply/add biome color offsets to the existing keyframe interpolation.

- [ ] **Step 3: Smooth transitions between biome tints**

When driving between biomes, lerp the sky tint over ~3 seconds so it's not a jarring shift.

- [ ] **Step 4: Run `npx tsc --noEmit`**

- [ ] **Step 5: Commit**

```bash
git add src/world/Sky.ts
git commit -m "feat(biome): per-biome day/night sky color tinting"
```

---

## Task 7: Integration + Polish

**Files:**
- Modify: `src/app/PathGame.ts` (pass biome info to HUD)
- Modify: `CLAUDE.md`

- [ ] **Step 1: Display current biome on HUD**

Add biome name to the surface indicator or as its own element. When the player crosses a biome boundary, show a brief notification (use existing discovery toast).

- [ ] **Step 2: Update spawn position**

Ensure the player spawns in Alpine Meadows (center of island) at an elevated position looking outward.

- [ ] **Step 3: Update CLAUDE.md**

Document the new biome system, biome names, and radial layout.

- [ ] **Step 4: Run full build verification**

```bash
npx tsc --noEmit && npm run build
```

- [ ] **Step 5: Commit**

```bash
git add src/app/PathGame.ts CLAUDE.md
git commit -m "feat(biome): HUD biome display, spawn in Alpine Meadows, docs update"
```
