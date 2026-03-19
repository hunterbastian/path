// src/world/BiomeConfig.ts
import type { SurfaceType } from './Terrain';
import type { WeatherCondition } from '../config/GameTuning';

export type BiomeName = 'alpine-meadows' | 'canyon' | 'salt-flats' | 'jagged-peaks' | 'coast';

export interface BiomeWeatherConfig {
  /** Available conditions (besides 'sunny'/'cloudy' which are always available) */
  conditions: WeatherCondition[];
  /** Minimum seconds of clear weather between events */
  minClearDuration: number;
  /** Maximum seconds of clear weather between events */
  maxClearDuration: number;
  /** How long active weather lasts (seconds) */
  eventDuration: number;
  /** Fade in/out time (seconds) */
  fadeDuration: number;
}

export interface BiomeNoiseParams {
  /** Primary terrain amplitude — controls how tall/dramatic the terrain is */
  amplitude: number;
  /** Primary terrain frequency — higher = more frequent hills */
  frequency: number;
  /** Detail noise amplitude — smaller features on top of primary */
  detailAmplitude: number;
  /** Detail noise frequency */
  detailFrequency: number;
  /** Base elevation offset from sea level. Alpine Meadows is highest. */
  baseElevation: number;
  /** Elevation falloff per meter from center (Alpine Meadows slopes outward) */
  elevationFalloff: number;
}

export interface BiomePalette {
  /** Flat ground color */
  ground: number;
  /** Sloped terrain color */
  slope: number;
  /** High elevation color */
  peak: number;
  /** Accent/detail color (wildflowers, minerals, etc.) */
  accent: number;
}

export interface BiomeGrassConfig {
  /** Spawn density multiplier (0 = no grass, 1 = full) */
  density: number;
  /** Base blade color */
  baseColor: number;
  /** Blade tip color */
  tipColor: number;
  /** Blade height multiplier (1 = default) */
  heightScale: number;
}

export interface BiomeFogConfig {
  /** Fog color (Three.js hex) */
  color: number;
  /** Fog density multiplier (0 = clear, 1 = default, 2 = thick) */
  density: number;
}

export interface BiomeSkyTint {
  /** Dawn/dusk color offset (additive RGB) */
  goldenHour: number;
  /** Night sky tint */
  night: number;
  /** Noon sky tint */
  noon: number;
}

export interface BiomeDefinition {
  name: BiomeName;
  displayName: string;
  noise: BiomeNoiseParams;
  palette: BiomePalette;
  primarySurface: SurfaceType;
  secondarySurface: SurfaceType;
  grass: BiomeGrassConfig;
  fog: BiomeFogConfig;
  skyTint: BiomeSkyTint;
  weather: BiomeWeatherConfig;
}

// --- Biome Definitions ---

export const BIOME_ALPINE_MEADOWS: BiomeDefinition = {
  name: 'alpine-meadows',
  displayName: 'Alpine Meadows',
  noise: {
    amplitude: 10,
    frequency: 0.004,
    detailAmplitude: 0,
    detailFrequency: 0,
    baseElevation: 25,
    elevationFalloff: 0.08,
  },
  palette: {
    ground: 0x4a8a38,  // rich emerald green
    slope: 0x8a7a50,   // warm golden earth
    peak: 0x9890a0,    // soft lavender-grey rock
    accent: 0xe8c040,  // bright wildflower gold
  },
  primarySurface: 'grass',
  secondarySurface: 'dirt',
  grass: {
    density: 1.0,
    baseColor: 0x3a7a28,
    tipColor: 0xe0c848,
    heightScale: 1.2,
  },
  fog: {
    color: 0xc8b8d0,
    density: 0.28,
  },
  skyTint: {
    goldenHour: 0x884400,  // rich golden sunset
    night: 0x0a0a14,       // neutral dark
    noon: 0x000000,        // no tint
  },
  weather: {
    conditions: ['rainy'],
    minClearDuration: 180,
    maxClearDuration: 480,
    eventDuration: 30,
    fadeDuration: 12,
  },
};

export const BIOME_CANYON: BiomeDefinition = {
  name: 'canyon',
  displayName: 'Canyon',
  noise: {
    amplitude: 22,
    frequency: 0.006,
    detailAmplitude: 1.5,
    detailFrequency: 0.015,
    baseElevation: 10,
    elevationFalloff: 0,
  },
  palette: {
    ground: 0xa06840,  // warm terracotta
    slope: 0xc08050,    // burnt sienna
    peak: 0x6a4a38,     // deep brown
    accent: 0xd09860,   // warm ochre
  },
  primarySurface: 'rock',
  secondarySurface: 'dirt',
  grass: {
    density: 0.1,
    baseColor: 0x8a7a3e,
    tipColor: 0xa09040,
    heightScale: 0.4,
  },
  fog: {
    color: 0xb8a088,
    density: 0.56,
  },
  skyTint: {
    goldenHour: 0xa85000,  // deep warm orange
    night: 0x281430,       // purple tint
    noon: 0x000000,
  },
  weather: {
    conditions: ['dust'],
    minClearDuration: 240,
    maxClearDuration: 600,
    eventDuration: 30,
    fadeDuration: 15,
  },
};

export const BIOME_SALT_FLATS: BiomeDefinition = {
  name: 'salt-flats',
  displayName: 'Salt Flats',
  noise: {
    amplitude: 1.5,
    frequency: 0.003,
    detailAmplitude: 0,
    detailFrequency: 0,
    baseElevation: 8,
    elevationFalloff: 0,
  },
  palette: {
    ground: 0xf0ece4,  // soft ivory
    slope: 0xe0d8d0,   // warm cream
    peak: 0xd0c8c0,    // pale warmth
    accent: 0xf8f4f0,  // near-white with warmth
  },
  primarySurface: 'sand',  // fast surface, reuse sand
  secondarySurface: 'sand',
  grass: {
    density: 0,
    baseColor: 0x000000,
    tipColor: 0x000000,
    heightScale: 0,
  },
  fog: {
    color: 0xe0d8d0,
    density: 0.096,
  },
  skyTint: {
    goldenHour: 0x1a1000,
    night: 0x0a0c18,      // pale blue
    noon: 0x141410,        // harsh white boost
  },
  weather: {
    conditions: [],
    minClearDuration: Infinity,
    maxClearDuration: Infinity,
    eventDuration: 0,
    fadeDuration: 0,
  },
};

export const BIOME_JAGGED_PEAKS: BiomeDefinition = {
  name: 'jagged-peaks',
  displayName: 'Jagged Peaks',
  noise: {
    amplitude: 35,
    frequency: 0.007,
    detailAmplitude: 2.5,
    detailFrequency: 0.02,
    baseElevation: 15,
    elevationFalloff: 0,
  },
  palette: {
    ground: 0x6a6a7a,  // soft blue-grey
    slope: 0x585868,   // lavender-grey
    peak: 0xf0eef4,    // warm white snow
    accent: 0x8080a0,  // lavender accent
  },
  primarySurface: 'rock',
  secondarySurface: 'snow',
  grass: {
    density: 0.05,
    baseColor: 0x607050,
    tipColor: 0x808870,
    heightScale: 0.3,
  },
  fog: {
    color: 0x8890a8,
    density: 0.72,
  },
  skyTint: {
    goldenHour: 0x502030,  // pink-lavender alpenglow
    night: 0x142040,       // cold blue
    noon: 0x000000,
  },
  weather: {
    conditions: ['snowy', 'blizzard'],
    minClearDuration: 120,
    maxClearDuration: 360,
    eventDuration: 30,
    fadeDuration: 12,
  },
};

export const BIOME_COAST: BiomeDefinition = {
  name: 'coast',
  displayName: 'Coast',
  noise: {
    amplitude: 7,
    frequency: 0.004,
    detailAmplitude: 0,
    detailFrequency: 0,
    baseElevation: 5,
    elevationFalloff: 0.05,
  },
  palette: {
    ground: 0xc0a868,  // warm sand gold
    slope: 0x5a8a4a,   // turquoise-influenced green
    peak: 0x909088,    // soft warm grey
    accent: 0xd8c890,  // beach gold
  },
  primarySurface: 'sand',
  secondarySurface: 'dirt',
  grass: {
    density: 0.5,
    baseColor: 0x3a6a30,
    tipColor: 0x6a8a50,
    heightScale: 0.8,
  },
  fog: {
    color: 0xa0b0b8,
    density: 0.4,
  },
  skyTint: {
    goldenHour: 0x704000,  // amber warmth
    night: 0x0a0e14,       // grey-blue
    noon: 0x000000,
  },
  weather: {
    conditions: ['rainy'],
    minClearDuration: 180,
    maxClearDuration: 480,
    eventDuration: 30,
    fadeDuration: 10,
  },
};

// --- All biomes ordered by sector ---
export const BIOMES: readonly BiomeDefinition[] = [
  BIOME_CANYON,       // sector 0: ~0° to ~90° (N to E)
  BIOME_JAGGED_PEAKS, // sector 1: ~90° to ~180° (E to S)
  BIOME_COAST,        // sector 2: ~180° to ~270° (S to W)
  BIOME_SALT_FLATS,   // sector 3: ~270° to ~360° (W to N)
] as const;

/** Radius of the central Alpine Meadows zone */
export const MEADOWS_RADIUS = 150;

/** Width of transition blend between biomes */
export const BIOME_TRANSITION = 50;

export interface BiomeSample {
  /** Primary biome at this location */
  primary: BiomeDefinition;
  /** Secondary biome for blending (null if not in transition zone) */
  secondary: BiomeDefinition | null;
  /** Blend factor: 0 = fully primary, 1 = fully secondary */
  blend: number;
}

/**
 * Determine which biome(s) a world position falls in.
 * Alpine Meadows occupies the center circle (0 to MEADOWS_RADIUS).
 * Outer biomes are divided into angular sectors.
 * Transition zones blend over BIOME_TRANSITION meters.
 */
export function sampleBiome(x: number, z: number): BiomeSample {
  const dist = Math.sqrt(x * x + z * z);

  // --- Center zone: Alpine Meadows ---
  if (dist < MEADOWS_RADIUS - BIOME_TRANSITION) {
    return { primary: BIOME_ALPINE_MEADOWS, secondary: null, blend: 0 };
  }

  // --- Determine outer biome from angle ---
  // atan2 returns -PI to PI; normalize to 0-2PI
  let angle = Math.atan2(z, x);
  if (angle < 0) angle += Math.PI * 2;

  const sectorSize = (Math.PI * 2) / BIOMES.length;
  const sectorIndex = Math.floor(angle / sectorSize);
  const sectorFraction = (angle % sectorSize) / sectorSize;

  const outerBiome = BIOMES[sectorIndex % BIOMES.length]!;

  // --- Radial transition: Meadows → outer biome ---
  if (dist < MEADOWS_RADIUS + BIOME_TRANSITION) {
    const t = (dist - (MEADOWS_RADIUS - BIOME_TRANSITION)) / (BIOME_TRANSITION * 2);
    const blend = Math.max(0, Math.min(1, t));
    // Smooth step for nicer transition
    const smooth = blend * blend * (3 - 2 * blend);
    return { primary: BIOME_ALPINE_MEADOWS, secondary: outerBiome, blend: smooth };
  }

  // --- Angular transition between adjacent outer biomes ---
  // Check if near sector boundary
  const edgeFraction = BIOME_TRANSITION / (dist * sectorSize); // approximate angular width of transition

  if (sectorFraction < edgeFraction) {
    // Near start of sector — blend with previous sector
    const prevIndex = (sectorIndex - 1 + BIOMES.length) % BIOMES.length;
    const prevBiome = BIOMES[prevIndex]!;
    const t = sectorFraction / edgeFraction;
    const smooth = t * t * (3 - 2 * t);
    return { primary: prevBiome, secondary: outerBiome, blend: smooth };
  }

  if (sectorFraction > 1 - edgeFraction) {
    // Near end of sector — blend with next sector
    const nextIndex = (sectorIndex + 1) % BIOMES.length;
    const nextBiome = BIOMES[nextIndex]!;
    const t = (sectorFraction - (1 - edgeFraction)) / edgeFraction;
    const smooth = t * t * (3 - 2 * t);
    return { primary: outerBiome, secondary: nextBiome, blend: smooth };
  }

  // --- Pure outer biome ---
  return { primary: outerBiome, secondary: null, blend: 0 };
}
