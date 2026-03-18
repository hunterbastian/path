/**
 * ProgressionSystem — XP tracking and level calculation with localStorage persistence.
 *
 * XP sources:
 * - Distance driven: ~1.0 XP per meter (continuous, every frame)
 * - Discovery: ~15 XP per new fog-of-war cell discovered (one-time per cell)
 *
 * 8 levels with increasing thresholds. Progress persists across sessions.
 */

const STORAGE_KEY = 'path-progression';

const LEVEL_THRESHOLDS = [0, 300, 900, 2000, 4000, 7000, 12000, 20000] as const;

/** XP awarded per meter driven. */
const XP_PER_METER = 1.0;

/** XP awarded per newly discovered fog cell. */
const XP_PER_CELL = 15;

/** How often to auto-save, in seconds. */
const SAVE_INTERVAL_S = 30;

interface ProgressionData {
  xp: number;
  discoveredCells: number[];
}

export class ProgressionSystem {
  #xp = 0;
  #discoveredCells = new Set<number>();
  #pendingLevelUp: number | null = null;
  #saveTimer = 0;

  constructor() {
    this.#load();
  }

  // ── XP Sources ──

  /** Add XP from distance driven this frame. */
  addDriveXP(metersThisFrame: number): void {
    if (metersThisFrame <= 0) return;

    const previousLevel = this.level;
    this.#xp += metersThisFrame * XP_PER_METER;
    this.#checkLevelUp(previousLevel);
  }

  /**
   * Check fog cells and award XP for newly discovered ones.
   * Returns the number of new cells found this call.
   */
  addDiscoveryXP(cells: Uint8Array, columns: number): number {
    const previousLevel = this.level;
    let newCells = 0;

    for (let i = 0; i < cells.length; i += 1) {
      if (cells[i] !== 0 && !this.#discoveredCells.has(i)) {
        this.#discoveredCells.add(i);
        this.#xp += XP_PER_CELL;
        newCells += 1;
      }
    }

    if (newCells > 0) {
      this.#checkLevelUp(previousLevel);
    }

    return newCells;
  }

  /** Grant a flat XP bonus (e.g. viewpoint discovery rewards). */
  grantBonusXP(amount: number): void {
    if (amount <= 0) return;

    const previousLevel = this.level;
    this.#xp += amount;
    this.#checkLevelUp(previousLevel);
  }

  // ── Queries ──

  /** Current level (1-8). */
  get level(): number {
    for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i -= 1) {
      if (this.#xp >= LEVEL_THRESHOLDS[i]!) {
        return i + 1;
      }
    }
    return 1;
  }

  /** Total accumulated XP. */
  get xp(): number {
    return this.#xp;
  }

  /** XP needed to reach next level (0 if max). */
  get xpToNextLevel(): number {
    const currentLevel = this.level;
    if (currentLevel >= LEVEL_THRESHOLDS.length) return 0;
    return LEVEL_THRESHOLDS[currentLevel]! - this.#xp;
  }

  /** Progress fraction within current level (0-1). */
  get levelProgress(): number {
    const currentLevel = this.level;
    if (currentLevel >= LEVEL_THRESHOLDS.length) return 1;

    const currentThreshold = LEVEL_THRESHOLDS[currentLevel - 1]!;
    const nextThreshold = LEVEL_THRESHOLDS[currentLevel]!;
    const span = nextThreshold - currentThreshold;
    if (span <= 0) return 1;

    return (this.#xp - currentThreshold) / span;
  }

  /** Whether a level-up happened since last check. Returns new level or null. */
  consumeLevelUp(): number | null {
    const level = this.#pendingLevelUp;
    this.#pendingLevelUp = null;
    return level;
  }

  // ── Persistence ──

  /** Save to localStorage. Call periodically or on important events. */
  save(): void {
    const data: ProgressionData = {
      xp: this.#xp,
      discoveredCells: Array.from(this.#discoveredCells),
    };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Storage full or unavailable — silently ignore
    }
  }

  /**
   * Tick the auto-save timer. Call once per frame with delta time.
   * Saves automatically every SAVE_INTERVAL_S seconds.
   */
  tickSave(dt: number): void {
    this.#saveTimer += dt;
    if (this.#saveTimer >= SAVE_INTERVAL_S) {
      this.#saveTimer = 0;
      this.save();
    }
  }

  /** Reset all progress and clear localStorage. */
  reset(): void {
    this.#xp = 0;
    this.#discoveredCells = new Set<number>();
    this.#pendingLevelUp = null;
    this.#saveTimer = 0;
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  }

  // ── Private ──

  #load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw == null) return;

      const data = JSON.parse(raw) as Partial<ProgressionData>;
      if (typeof data.xp === 'number' && Number.isFinite(data.xp)) {
        this.#xp = Math.max(0, data.xp);
      }
      if (Array.isArray(data.discoveredCells)) {
        for (const index of data.discoveredCells) {
          if (typeof index === 'number' && Number.isFinite(index)) {
            this.#discoveredCells.add(index);
          }
        }
      }
    } catch {
      // Corrupted data — start fresh
    }
  }

  #checkLevelUp(previousLevel: number): void {
    const currentLevel = this.level;
    if (currentLevel > previousLevel) {
      this.#pendingLevelUp = currentLevel;
      this.save();
    }
  }
}
