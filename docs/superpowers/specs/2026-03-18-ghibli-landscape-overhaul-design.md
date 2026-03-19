# Ghibli Landscape Overhaul — Howl's Moving Castle Countryside

## Overview

Transform the terrain from rough Patagonian steppe to a painterly European countryside fantasy. Smooth rolling hills, warm saturated colors, lush vegetation, soft atmosphere. Cars glide over gentle terrain instead of bouncing on jagged noise.

## 1. Terrain Smoothness

### Noise Parameters
Reduce all frequencies and amplitudes. Kill micro-bumps entirely.

| Biome | amplitude | frequency | detailAmplitude | detailFrequency |
|-------|-----------|-----------|-----------------|-----------------|
| Alpine Meadows | 10 | 0.004 | 0 | 0 |
| Canyon | 22 | 0.006 | 1.5 | 0.015 |
| Salt Flats | 1.5 | 0.003 | 0 | 0 |
| Jagged Peaks | 35 | 0.007 | 2.5 | 0.02 |
| Coast | 7 | 0.004 | 0 | 0 |

Alpine Meadows and Coast get ZERO detail noise — pure smooth rolling.

### Mesh Resolution
Increase segments from 100×100 to 150×150 for smoother mesh interpolation.

### Vehicle Ride Height
Increase ride height smoothing tolerance — the car should float gently over hills, not track every meter of terrain change. Raise the snap threshold from 0.8 to 1.5m.

## 2. Ghibli Color Palette

Warm, saturated, painterly. Think Howl's Moving Castle patchwork fields.

### Alpine Meadows (starter — the iconic Ghibli meadow)
- ground: `0x4a8a38` — rich emerald green
- slope: `0x8a7a50` — warm golden earth
- peak: `0x9890a0` — soft lavender-grey rock
- accent: `0xe8c040` — bright wildflower gold
- grass base: `0x3a7a28` — deep lush green
- grass tip: `0xe0c848` — warm golden
- fog: `0xc8b8d0` — soft lavender haze

### Canyon
- ground: `0xa06840` — warm terracotta
- slope: `0xc08050` — burnt sienna
- peak: `0x6a4a38` — deep brown
- accent: `0xd09860` — warm ochre
- fog: `0xb8a088` — warm dust

### Salt Flats
- ground: `0xf0ece4` — soft ivory
- slope: `0xe0d8d0` — warm cream
- peak: `0xd0c8c0` — pale warmth
- accent: `0xf8f4f0` — near-white with warmth
- fog: `0xe0d8d0` — warm ivory haze

### Jagged Peaks
- ground: `0x6a6a7a` — soft blue-grey
- slope: `0x585868` — lavender-grey
- peak: `0xf0eef4` — warm white snow
- accent: `0x8080a0` — lavender accent
- fog: `0x8890a8` — cool lavender

### Coast
- ground: `0xc0a868` — warm sand gold
- slope: `0x5a8a4a` — turquoise-influenced green
- peak: `0x909088` — soft warm grey
- accent: `0xd8c890` — beach gold
- fog: `0xa0b0b8` — sea mist with warmth

## 3. Sky & Atmosphere

### Sky Tints (doubled warmth)
- Alpine Meadows golden hour: `0x884400` — rich golden sunset
- Canyon golden hour: `0xa85000` — deep warm orange
- Jagged Peaks golden hour: `0x502030` — pink-lavender alpenglow
- Coast golden hour: `0x704000` — amber warmth
- All biome nights: shift toward deep blue-purple, not cold grey

### Fog
- Reduce all fog densities by another 20% (atmosphere should be light, dreamy)
- Shift fog colors warmer (more lavender/peach, less grey)

## 4. Grass & Vegetation

### Density
- Increase max grass patches from 480 to 800
- Alpine Meadows density stays 1.0 — thick lush carpet
- Coast density: 0.3 → 0.5 (more coastal grass)

### Colors
All grass shifts warmer — golden tips everywhere, deeper green bases. No brown/dead grass in any biome.

### Height
- Alpine Meadows grass height: 1.0 → 1.2 (taller, flowing)
- Coast: 0.6 → 0.8

## 5. Biome Layout Tweaks

### Alpine Meadows expansion
Increase MEADOWS_RADIUS from 120m to 150m — the starter zone should feel spacious and welcoming. More room to learn before hitting biome boundaries.

### Gentler elevation
Alpine Meadows baseElevation: 35 → 25. The center doesn't need to be a mountain — gentle hills looking out over the world.
elevationFalloff: 0.15 → 0.08. Gradual slope, not a steep viewpoint.

### Wider transitions
BIOME_TRANSITION: 40m → 50m. Ghibli landscapes blend seamlessly — no hard edges between zones.

## 6. Vehicle Feel Tweaks

### Smoother ride
- Ride height expLerp rate: 14 (up) / 10 (down) → 10 / 7. Gentler tracking.
- Snap threshold: 0.8m → 1.5m. Car floats over bigger bumps before snapping.
- Sink tolerance: 0.15m → 0.3m. More suspension travel feel.
- Downward velocity damping: 0.5 → 0.3. Softer landing feel.

### Slightly higher ride
Add 0.3m to the vehicle clearance / ride height offset — car sits a bit higher above terrain, reducing ground clipping.

## Files to Modify
- `src/world/BiomeConfig.ts` — all noise params, palettes, grass, fog, layout constants
- `src/world/Terrain.ts` — segment count (100 → 150)
- `src/vehicle/VehicleController.ts` — ride height smoothing constants
- `src/config/GameTuning.ts` — vehicle clearance if defined there
