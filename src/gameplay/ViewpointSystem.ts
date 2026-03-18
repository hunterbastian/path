// ---------------------------------------------------------------------------
// ViewpointSystem — high terrain locations that reveal large map chunks
// ---------------------------------------------------------------------------

export interface ViewpointDefinition {
  id: string;
  name: string;
  x: number;
  z: number;
  /** Distance within which the viewpoint triggers (meters). */
  triggerRadius: number;
  /** Fog-of-war reveal radius when triggered (meters). */
  revealRadius: number;
  /** XP awarded on discovery. */
  xpReward: number;
}

// ---------------------------------------------------------------------------
// Viewpoint placements — one per biome, at high terrain
// ---------------------------------------------------------------------------

const VIEWPOINTS: readonly ViewpointDefinition[] = [
  // Alpine Meadows — center ridge
  { id: 'meadow_overlook',   name: 'Meadow Overlook',   x: 0,    z: -20,  triggerRadius: 15, revealRadius: 120, xpReward: 50 },
  // Canyon — NE rim (~45°, ~200m out)
  { id: 'red_ridge',         name: 'Red Ridge',          x: 160,  z: -100, triggerRadius: 15, revealRadius: 120, xpReward: 50 },
  // Salt Flats — NW edge (~315°, ~220m out)
  { id: 'salt_basin_vista',  name: 'Salt Basin Vista',   x: -180, z: -120, triggerRadius: 15, revealRadius: 120, xpReward: 50 },
  // Jagged Peaks — SE summit (~135°, ~240m out)
  { id: 'fitz_roy_point',    name: 'Fitz Roy Point',     x: 170,  z: 170,  triggerRadius: 15, revealRadius: 120, xpReward: 50 },
  // Coast — SW cliff (~225°, ~200m out)
  { id: 'shoreline_bluff',   name: 'Shoreline Bluff',    x: -140, z: 140,  triggerRadius: 15, revealRadius: 120, xpReward: 50 },
] as const;

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'path-viewpoints';

function loadVisited(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr as string[]);
    }
  } catch { /* ignore corrupt data */ }
  return new Set();
}

function saveVisited(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch { /* quota exceeded or private browsing */ }
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

export class ViewpointSystem {
  readonly #visited: Set<string>;

  constructor() {
    this.#visited = loadVisited();
  }

  /**
   * Check if the player is near any unvisited viewpoint.
   * Returns the viewpoint definition once when triggered, null otherwise.
   */
  check(playerX: number, playerZ: number): ViewpointDefinition | null {
    for (const vp of VIEWPOINTS) {
      if (this.#visited.has(vp.id)) continue;

      const dx = playerX - vp.x;
      const dz = playerZ - vp.z;
      if (dx * dx + dz * dz <= vp.triggerRadius * vp.triggerRadius) {
        this.markVisited(vp.id);
        return vp;
      }
    }
    return null;
  }

  /** All viewpoint definitions (for minimap rendering). */
  get viewpoints(): readonly ViewpointDefinition[] {
    return VIEWPOINTS;
  }

  /** Check if a specific viewpoint has been visited. */
  isVisited(id: string): boolean {
    return this.#visited.has(id);
  }

  /** Mark a viewpoint as visited and persist. */
  markVisited(id: string): void {
    this.#visited.add(id);
    saveVisited(this.#visited);
  }

  /** Reset all viewpoints and clear storage. */
  reset(): void {
    this.#visited.clear();
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch { /* ignore */ }
  }
}
