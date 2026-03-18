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
  { id: 'meadow_overlook',   name: 'Meadow Overlook',   x: 0,    z: -30,  triggerRadius: 15, revealRadius: 120, xpReward: 100 },
  // Canyon — deeper into canyon (~45°, ~240m out)
  { id: 'red_ridge',         name: 'Red Ridge',          x: 200,  z: -130, triggerRadius: 15, revealRadius: 120, xpReward: 100 },
  // Salt Flats — out in salt flats (~315°, ~270m out)
  { id: 'salt_basin_vista',  name: 'Salt Basin Vista',   x: -220, z: -150, triggerRadius: 15, revealRadius: 120, xpReward: 100 },
  // Jagged Peaks — deep in peaks (~135°, ~280m out)
  { id: 'fitz_roy_point',    name: 'Fitz Roy Point',     x: 200,  z: 200,  triggerRadius: 15, revealRadius: 120, xpReward: 100 },
  // Coast — along coast (~225°, ~250m out)
  { id: 'shoreline_bluff',   name: 'Shoreline Bluff',    x: -180, z: 180,  triggerRadius: 15, revealRadius: 120, xpReward: 100 },
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
