# Phase 4: Progression System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a driving-based XP system where distance driven + zone discovery = levels, with gated paths that require minimum levels to access.

**Architecture:** New `ProgressionSystem` tracks XP and level. XP sources: continuous distance driven + one-time bonus per fog-of-war grid cell discovered. Level gates are coordinate-defined barriers checked against player level. All state persists to localStorage via existing DriverProfile pattern. Viewpoints are high-altitude locations that reveal large map chunks.

**Tech Stack:** Three.js, TypeScript, Vite

---

## Task 1: ProgressionSystem — XP + Levels

Create `src/gameplay/ProgressionSystem.ts`:
- Track total XP, current level (5-8 levels)
- XP per meter driven (continuous, ~0.5 XP/m)
- XP per new fog cell discovered (one-time, ~10 XP/cell)
- Level thresholds: [0, 500, 1500, 3500, 7000, 12000, 20000, 30000]
- Persist to localStorage
- Public API: `addDriveXP(meters)`, `addDiscoveryXP(cells)`, `get level`, `get xp`, `get xpToNextLevel`

## Task 2: Level Gates

Create `src/gameplay/LevelGate.ts`:
- Define gate locations as coordinate + required level + description
- Place 3-4 gates in starter zones (Alpine Meadows paths that need level 3+)
- Physical barrier: invisible collision wall that shows a HUD message "Requires Level N"
- When player meets level, gate removes itself
- Gate positions stored in a config array

## Task 3: Viewpoints

Create `src/gameplay/ViewpointSystem.ts`:
- Define 5-8 viewpoint locations (high terrain spots, one per biome)
- When player drives within 15m of a viewpoint, trigger:
  - Discovery toast with viewpoint name
  - Reveal a large map radius (3x normal reveal) via MapDiscoverySystem
  - XP bonus
- Track visited viewpoints in localStorage
- Viewpoint markers on minimap (small amber outline squares)

## Task 4: HUD Integration

- Show level + XP bar in the Tab-expanded grid
- Level-up notification via achievement toast
- Gate collision shows brief amber message
- Viewpoint markers on minimap

## Task 5: Wire + Docs

- Instantiate ProgressionSystem in PathGame
- Feed distance driven per frame + discovery cells
- Add level gates to world
- Update CLAUDE.md
