import type { DrivingState } from '../vehicle/DrivingState';
import type { RunSnapshot } from './RunSession';
import type { CameraView } from '../camera/ThirdPersonCamera';

// ---------------------------------------------------------------------------
// Achievement definitions
// ---------------------------------------------------------------------------

export interface AchievementDef {
  id: string;
  title: string;
  description: string;
  /** Icon character (emoji-free — uses simple ASCII/unicode symbols). */
  icon: string;
}

const ACHIEVEMENTS: AchievementDef[] = [
  // --- Speed ---
  { id: 'speed_60',   title: 'Getting Rolling',   description: 'Reach 60 km/h',             icon: '>' },
  { id: 'speed_100',  title: 'Speed Demon',        description: 'Reach 100 km/h',            icon: '>>' },
  { id: 'speed_140',  title: 'Terminal Velocity',   description: 'Reach 140 km/h',            icon: '>>>' },

  // --- Drift ---
  { id: 'drift_3',    title: 'Sideways',           description: 'Drift for 3 seconds',        icon: '~' },
  { id: 'drift_8',    title: 'Full Send',          description: 'Drift for 8 seconds',        icon: '~~' },

  // --- Airtime ---
  { id: 'air_1',      title: 'Getting Air',        description: '1 second airborne',           icon: '^' },
  { id: 'air_3',      title: 'Frequent Flyer',     description: '3 seconds airborne',          icon: '^^' },
  { id: 'air_5',      title: 'Sky High',           description: '5 seconds airborne',          icon: '^^^' },

  // --- Tumble ---
  { id: 'tumble',     title: 'Barrel Roll',        description: 'Tumble and survive',          icon: '@' },

  // --- Damage ---
  { id: 'damage_hit', title: 'First Scratch',      description: 'Take damage',                 icon: '!' },
  { id: 'parts_3',    title: 'Skeleton Crew',      description: 'Lose 3 parts',                icon: '!!!' },
  { id: 'low_health', title: 'Held Together',       description: 'Drive with under 25% health', icon: '*' },

  // --- Completion ---
  { id: 'first_run',  title: 'Trailblazer',        description: 'Complete your first run',      icon: '+' },
  { id: 'fast_run',   title: 'Speed Run',          description: 'Complete a run under 3 min',   icon: '++' },

  // --- Exploration ---
  { id: 'map_25',     title: 'Pathfinder',         description: 'Discover 25% of the map',     icon: '#' },
  { id: 'map_50',     title: 'Explorer',           description: 'Discover 50% of the map',     icon: '##' },
  { id: 'map_90',     title: 'Cartographer',       description: 'Discover 90% of the map',     icon: '###' },

  // --- Surfaces ---
  { id: 'snow_drive', title: 'Snow Plow',          description: 'Drive on snow for 30 seconds', icon: '.' },
  { id: 'sand_drive', title: 'Sand Surfer',        description: 'Drive on sand for 30 seconds', icon: '..' },
  { id: 'water_cross',title: 'Aquaplaner',         description: 'Drive through water',          icon: '...' },

  // --- Boost ---
  { id: 'boost_empty',title: 'Nitro Junkie',       description: 'Fully deplete your boost',    icon: '=' },

  // --- Camera ---
  { id: 'cockpit',    title: 'Behind the Wheel',   description: 'Use cockpit camera',           icon: 'o' },

  // --- Weather ---
  { id: 'rain_drive', title: 'Storm Chaser',       description: 'Drive in the rain',            icon: '|' },
  { id: 'night_drive',title: 'Night Rider',        description: 'Drive at night',               icon: '/' },
];

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'path-achievements';

function loadUnlocked(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr as string[]);
    }
  } catch { /* ignore corrupt data */ }
  return new Set();
}

function saveUnlocked(set: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...set]));
  } catch { /* quota exceeded or private browsing */ }
}

// ---------------------------------------------------------------------------
// Tracking state (accumulated per session, not per frame)
// ---------------------------------------------------------------------------

interface TrackingState {
  driftTime: number;
  snowTime: number;
  sandTime: number;
  hasDriven: boolean;
  hasTumbled: boolean;
  hasSurvivedTumble: boolean;
  detachedPartCount: number;
  prevTotalHealth: number;
}

// ---------------------------------------------------------------------------
// Achievement system
// ---------------------------------------------------------------------------

export type AchievementCallback = (def: AchievementDef) => void;

export class AchievementSystem {
  readonly #unlocked: Set<string>;
  readonly #tracking: TrackingState = {
    driftTime: 0,
    snowTime: 0,
    sandTime: 0,
    hasDriven: false,
    hasTumbled: false,
    hasSurvivedTumble: false,
    detachedPartCount: 0,
    prevTotalHealth: 1,
  };
  #onUnlock: AchievementCallback | null = null;

  constructor() {
    this.#unlocked = loadUnlocked();
  }

  /** Register callback for when an achievement unlocks. */
  onUnlock(cb: AchievementCallback): void {
    this.#onUnlock = cb;
  }

  /** All achievement definitions. */
  get definitions(): readonly AchievementDef[] {
    return ACHIEVEMENTS;
  }

  /** Check if a specific achievement is unlocked. */
  isUnlocked(id: string): boolean {
    return this.#unlocked.has(id);
  }

  /** Number of unlocked achievements. */
  get unlockedCount(): number {
    return this.#unlocked.size;
  }

  /** Total number of achievements. */
  get totalCount(): number {
    return ACHIEVEMENTS.length;
  }

  /** Call every physics frame while driving. */
  update(
    dt: number,
    state: DrivingState,
    run: RunSnapshot,
    totalHealth: number,
    detachedPartCount: number,
    mapPercent: number,
    rainDensity: number,
    dayTime: number,
    cameraView: CameraView,
  ): void {
    this.#tracking.hasDriven = true;

    // --- Speed ---
    const kmh = state.speed * 3.6;
    if (kmh >= 60) this.#tryUnlock('speed_60');
    if (kmh >= 100) this.#tryUnlock('speed_100');
    if (kmh >= 140) this.#tryUnlock('speed_140');

    // --- Drift ---
    if (state.isDrifting && state.isGrounded) {
      this.#tracking.driftTime += dt;
    } else {
      this.#tracking.driftTime = 0;
    }
    if (this.#tracking.driftTime >= 3) this.#tryUnlock('drift_3');
    if (this.#tracking.driftTime >= 8) this.#tryUnlock('drift_8');

    // --- Airtime ---
    if (state.airborneTime >= 1) this.#tryUnlock('air_1');
    if (state.airborneTime >= 3) this.#tryUnlock('air_3');
    if (state.airborneTime >= 5) this.#tryUnlock('air_5');

    // --- Tumble ---
    if (state.isTumbling) {
      this.#tracking.hasTumbled = true;
    }
    if (this.#tracking.hasTumbled && state.isGrounded && !state.isTumbling) {
      this.#tracking.hasSurvivedTumble = true;
      this.#tracking.hasTumbled = false;
      this.#tryUnlock('tumble');
    }

    // --- Damage ---
    if (totalHealth < 0.99) this.#tryUnlock('damage_hit');
    if (totalHealth < 0.25 && state.speed > 2) this.#tryUnlock('low_health');
    if (detachedPartCount >= 3) this.#tryUnlock('parts_3');
    this.#tracking.prevTotalHealth = totalHealth;
    this.#tracking.detachedPartCount = detachedPartCount;

    // --- Surfaces ---
    if (state.surface === 'snow' && state.isGrounded && state.speed > 1) {
      this.#tracking.snowTime += dt;
    }
    if (state.surface === 'sand' && state.isGrounded && state.speed > 1) {
      this.#tracking.sandTime += dt;
    }
    if (state.surface === 'water' && state.speed > 2) {
      this.#tryUnlock('water_cross');
    }
    if (this.#tracking.snowTime >= 30) this.#tryUnlock('snow_drive');
    if (this.#tracking.sandTime >= 30) this.#tryUnlock('sand_drive');

    // --- Boost ---
    if (state.boostLevel <= 0.01) this.#tryUnlock('boost_empty');

    // --- Map ---
    if (mapPercent >= 25) this.#tryUnlock('map_25');
    if (mapPercent >= 50) this.#tryUnlock('map_50');
    if (mapPercent >= 90) this.#tryUnlock('map_90');

    // --- Weather ---
    if (rainDensity > 0.3 && state.speed > 3) this.#tryUnlock('rain_drive');

    // --- Time of day (night = 0.88–0.12, roughly) ---
    if ((dayTime >= 0.88 || dayTime <= 0.12) && state.speed > 3) {
      this.#tryUnlock('night_drive');
    }

    // --- Camera ---
    if (cameraView === 'cockpit') this.#tryUnlock('cockpit');
  }

  /** Call when a run completes (arrived). */
  onRunComplete(run: RunSnapshot): void {
    this.#tryUnlock('first_run');
    if (run.elapsedSeconds <= 180) this.#tryUnlock('fast_run');
  }

  /** Reset per-run tracking (call on restart). */
  resetTracking(): void {
    this.#tracking.driftTime = 0;
    this.#tracking.snowTime = 0;
    this.#tracking.sandTime = 0;
    this.#tracking.hasDriven = false;
    this.#tracking.hasTumbled = false;
    this.#tracking.hasSurvivedTumble = false;
    this.#tracking.detachedPartCount = 0;
    this.#tracking.prevTotalHealth = 1;
  }

  #tryUnlock(id: string): void {
    if (this.#unlocked.has(id)) return;
    this.#unlocked.add(id);
    saveUnlocked(this.#unlocked);
    const def = ACHIEVEMENTS.find(a => a.id === id);
    if (def && this.#onUnlock) {
      this.#onUnlock(def);
    }
  }
}
