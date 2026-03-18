# Phase 3: Routes + Ambience + Weather Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Per-biome road styles, biome-local weather (brief rain/snow/dust events), ambient wildlife particles, and snow particle variant.

**Architecture:** WeatherState already cycles conditions with grip/drag multipliers. Make it biome-aware (different cycles per biome, brief 30s events). RainSystem handles rain drops — extend for snow variant. DirtRoads generates road meshes — add per-biome material colors/widths. New wildlife system uses instanced billboard sprites.

**Tech Stack:** Three.js, TypeScript, Vite

---

## Task 1: Per-Biome Road Styles

Modify DirtRoads to vary road appearance by biome. Road width and color shift based on which biome the road segment passes through.

## Task 2: Biome-Local Weather

Make WeatherState biome-aware. Each biome has its own weather cycle:
- Alpine Meadows: clear, light rain
- Canyon: clear, dust storm
- Salt Flats: always clear
- Jagged Peaks: clear, snow, blizzard
- Coast: clear, rain, heavy rain

Weather events are brief (~30s active, 3-8min clear between). Snow variant extends RainSystem (slower fall, lateral drift, white particles).

## Task 3: Ambient Wildlife Particles

New `BiomeAmbience` system — instanced billboard sprites on looping paths:
- Alpine Meadows: birds circling, butterflies near ground
- Canyon: hawks soaring (slow wide circles)
- Salt Flats: nothing
- Jagged Peaks: eagles (rare, distant)
- Coast: seabirds

Plus per-biome ambient particles (pollen, dust, snow flurries, sea spray) extending the DustSystem pattern.

## Task 4: Weather HUD + Integration

Update HUD weather indicator with biome-specific icons. Wire biome weather to grip effects.

## Task 5: Docs Update

Update CLAUDE.md with weather and ambience systems.
