// ---------------------------------------------------------------------------
// Driver Profile — persistent identity that evolves with playstyle
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'path-driver-profile';

// ---------------------------------------------------------------------------
// Raw accumulated data (persisted)
// ---------------------------------------------------------------------------

interface ProfileData {
  totalDistanceM: number;
  totalDriveTimeS: number;
  runsCompleted: number;
  bestRunTimeS: number | null;
  topSpeedKmh: number;
  totalDrifts: number;
  longestDriftS: number;
  totalAirtimeS: number;
  longestAirtimeS: number;
  totalPartsLost: number;
  totalCollisions: number;
  /** Accumulated time spent above 80 km/h. */
  highSpeedTimeS: number;
  /** Accumulated time spent on off-surfaces (snow, sand, water). */
  offSurfaceTimeS: number;
  /** Total distance driven without any collisions in a single run. */
  longestCleanStreakM: number;
}

function createEmpty(): ProfileData {
  return {
    totalDistanceM: 0,
    totalDriveTimeS: 0,
    runsCompleted: 0,
    bestRunTimeS: null,
    topSpeedKmh: 0,
    totalDrifts: 0,
    longestDriftS: 0,
    totalAirtimeS: 0,
    longestAirtimeS: 0,
    totalPartsLost: 0,
    totalCollisions: 0,
    highSpeedTimeS: 0,
    offSurfaceTimeS: 0,
    longestCleanStreakM: 0,
  };
}

function load(): ProfileData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ProfileData>;
      return { ...createEmpty(), ...parsed };
    }
  } catch { /* corrupt data */ }
  return createEmpty();
}

function persist(data: ProfileData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch { /* quota or private mode */ }
}

// ---------------------------------------------------------------------------
// Rank tiers (based on total distance)
// ---------------------------------------------------------------------------

interface Rank {
  title: string;
  thresholdM: number;
}

const RANKS: Rank[] = [
  { title: 'Newcomer',     thresholdM: 0 },
  { title: 'Scout',        thresholdM: 2_000 },
  { title: 'Ranger',       thresholdM: 10_000 },
  { title: 'Pathfinder',   thresholdM: 30_000 },
  { title: 'Trailblazer',  thresholdM: 80_000 },
  { title: 'Veteran',      thresholdM: 200_000 },
  { title: 'Legend',       thresholdM: 500_000 },
];

function getRank(distanceM: number): string {
  let rank = RANKS[0]!.title;
  for (const r of RANKS) {
    if (distanceM >= r.thresholdM) rank = r.title;
  }
  return rank;
}

// ---------------------------------------------------------------------------
// Driver style (derived from what you do most)
// ---------------------------------------------------------------------------

type DriverStyle =
  | 'Drifter'
  | 'Speed Runner'
  | 'Stunt Driver'
  | 'Wrecker'
  | 'Trail Runner'
  | 'Clean Driver'
  | 'Off-Roader';

function getStyle(data: ProfileData): DriverStyle {
  if (data.totalDriveTimeS < 30) return 'Trail Runner';

  const driftRate = data.totalDrifts / (data.totalDriveTimeS / 60);
  const airtimeRatio = data.totalAirtimeS / data.totalDriveTimeS;
  const collisionRate = data.totalCollisions / Math.max(1, data.runsCompleted);
  const highSpeedRatio = data.highSpeedTimeS / data.totalDriveTimeS;
  const offSurfaceRatio = data.offSurfaceTimeS / data.totalDriveTimeS;
  const cleanKm = data.longestCleanStreakM / 1000;

  // Score each style
  const scores: [DriverStyle, number][] = [
    ['Drifter',      driftRate * 2 + (data.longestDriftS > 5 ? 2 : 0)],
    ['Speed Runner', highSpeedRatio * 8 + (data.topSpeedKmh > 120 ? 2 : 0)],
    ['Stunt Driver', airtimeRatio * 20 + (data.longestAirtimeS > 3 ? 2 : 0)],
    ['Wrecker',      collisionRate * 1.5 + data.totalPartsLost * 0.3],
    ['Off-Roader',   offSurfaceRatio * 8],
    ['Clean Driver', cleanKm * 0.5 + (data.totalCollisions === 0 ? 4 : 0)],
    ['Trail Runner', Math.min(data.runsCompleted, 5) * 0.8],
  ];

  scores.sort((a, b) => b[1] - a[1]);
  return scores[0]![0];
}

// ---------------------------------------------------------------------------
// Signature stat — the single thing you're most notable for
// ---------------------------------------------------------------------------

interface SignatureStat {
  label: string;
  value: string;
}

function getSignature(data: ProfileData): SignatureStat {
  const candidates: { label: string; value: string; weight: number }[] = [];

  if (data.topSpeedKmh > 0) {
    candidates.push({
      label: 'Top speed',
      value: `${data.topSpeedKmh} km/h`,
      weight: data.topSpeedKmh / 140,
    });
  }
  if (data.longestDriftS > 1) {
    candidates.push({
      label: 'Longest drift',
      value: `${data.longestDriftS.toFixed(1)}s`,
      weight: data.longestDriftS / 8,
    });
  }
  if (data.longestAirtimeS > 0.5) {
    candidates.push({
      label: 'Hang time',
      value: `${data.longestAirtimeS.toFixed(1)}s`,
      weight: data.longestAirtimeS / 5,
    });
  }
  if (data.bestRunTimeS !== null) {
    const min = Math.floor(data.bestRunTimeS / 60);
    const sec = Math.round(data.bestRunTimeS % 60);
    candidates.push({
      label: 'Best run',
      value: `${min}:${sec.toString().padStart(2, '0')}`,
      weight: Math.max(0, (300 - data.bestRunTimeS) / 300),
    });
  }
  if (data.longestCleanStreakM > 500) {
    const km = data.longestCleanStreakM / 1000;
    candidates.push({
      label: 'Clean streak',
      value: `${km.toFixed(1)} km`,
      weight: km / 5,
    });
  }
  if (data.totalPartsLost > 5) {
    candidates.push({
      label: 'Parts lost',
      value: `${data.totalPartsLost}`,
      weight: data.totalPartsLost / 20,
    });
  }

  if (candidates.length === 0) {
    return { label: 'Distance', value: formatDistance(data.totalDistanceM) };
  }

  candidates.sort((a, b) => b.weight - a.weight);
  return candidates[0]!;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDistance(m: number): string {
  const km = m / 1000;
  return km < 1 ? `${Math.round(m)} m` : `${km.toFixed(1)} km`;
}

function formatTime(seconds: number): string {
  const hours = seconds / 3600;
  if (hours < 1) {
    return `${Math.round(seconds / 60)} min`;
  }
  return `${hours.toFixed(1)} hr`;
}

// ---------------------------------------------------------------------------
// Per-frame tracking
// ---------------------------------------------------------------------------

interface FrameTracking {
  wasDrifting: boolean;
  currentDriftS: number;
  prevDetachedCount: number;
  prevImpactMagnitude: number;
  /** Distance in current run without a collision. */
  cleanStreakM: number;
  hadCollisionThisRun: boolean;
}

// ---------------------------------------------------------------------------
// DriverProfile
// ---------------------------------------------------------------------------

export class DriverProfile {
  readonly #data: ProfileData;
  readonly #tracking: FrameTracking = {
    wasDrifting: false,
    currentDriftS: 0,
    prevDetachedCount: 0,
    prevImpactMagnitude: 0,
    cleanStreakM: 0,
    hadCollisionThisRun: false,
  };

  constructor() {
    this.#data = load();
  }

  /** Call every physics frame while driving. */
  update(
    dt: number,
    speedMs: number,
    speedKmh: number,
    isDrifting: boolean,
    isGrounded: boolean,
    airborneTime: number,
    detachedPartCount: number,
    impactMagnitude: number,
    surface: string,
  ): void {
    this.#data.totalDistanceM += speedMs * dt;
    this.#data.totalDriveTimeS += dt;

    if (speedKmh > this.#data.topSpeedKmh) {
      this.#data.topSpeedKmh = Math.round(speedKmh);
    }

    // High-speed time
    if (speedKmh > 80) {
      this.#data.highSpeedTimeS += dt;
    }

    // Off-surface time
    if (surface === 'snow' || surface === 'sand' || surface === 'water') {
      this.#data.offSurfaceTimeS += dt;
    }

    // Drift tracking
    if (isDrifting && isGrounded) {
      if (!this.#tracking.wasDrifting) {
        this.#data.totalDrifts++;
      }
      this.#tracking.currentDriftS += dt;
      if (this.#tracking.currentDriftS > this.#data.longestDriftS) {
        this.#data.longestDriftS = this.#tracking.currentDriftS;
      }
    } else {
      this.#tracking.currentDriftS = 0;
    }
    this.#tracking.wasDrifting = isDrifting && isGrounded;

    // Airtime
    if (!isGrounded) {
      this.#data.totalAirtimeS += dt;
      if (airborneTime > this.#data.longestAirtimeS) {
        this.#data.longestAirtimeS = airborneTime;
      }
    }

    // Parts lost
    if (detachedPartCount > this.#tracking.prevDetachedCount) {
      this.#data.totalPartsLost += detachedPartCount - this.#tracking.prevDetachedCount;
    }
    this.#tracking.prevDetachedCount = detachedPartCount;

    // Collisions
    if (impactMagnitude > 3 && this.#tracking.prevImpactMagnitude <= 3) {
      this.#data.totalCollisions++;
      this.#tracking.hadCollisionThisRun = true;
      this.#tracking.cleanStreakM = 0;
    }
    this.#tracking.prevImpactMagnitude = impactMagnitude;

    // Clean streak
    if (!this.#tracking.hadCollisionThisRun) {
      this.#tracking.cleanStreakM += speedMs * dt;
      if (this.#tracking.cleanStreakM > this.#data.longestCleanStreakM) {
        this.#data.longestCleanStreakM = this.#tracking.cleanStreakM;
      }
    }
  }

  /** Call when a run completes. */
  onRunComplete(elapsedSeconds: number): void {
    this.#data.runsCompleted++;
    if (
      this.#data.bestRunTimeS === null ||
      elapsedSeconds < this.#data.bestRunTimeS
    ) {
      this.#data.bestRunTimeS = elapsedSeconds;
    }
    this.save();
  }

  save(): void {
    persist(this.#data);
  }

  resetTracking(): void {
    this.#tracking.wasDrifting = false;
    this.#tracking.currentDriftS = 0;
    this.#tracking.prevDetachedCount = 0;
    this.#tracking.prevImpactMagnitude = 0;
    this.#tracking.cleanStreakM = 0;
    this.#tracking.hadCollisionThisRun = false;
  }

  // -----------------------------------------------------------------------
  // Profile identity
  // -----------------------------------------------------------------------

  get rank(): string {
    return getRank(this.#data.totalDistanceM);
  }

  get style(): DriverStyle {
    return getStyle(this.#data);
  }

  get signature(): SignatureStat {
    return getSignature(this.#data);
  }

  get runsCompleted(): number {
    return this.#data.runsCompleted;
  }

  get distanceLabel(): string {
    return formatDistance(this.#data.totalDistanceM);
  }

  get driveTimeLabel(): string {
    return formatTime(this.#data.totalDriveTimeS);
  }

  /** e.g. "Ranger · Drifter" */
  get titleLabel(): string {
    return `${this.rank} · ${this.style}`;
  }

  /** e.g. "Ranger · Drifter · Longest drift 6.2s" */
  get fullLabel(): string {
    const sig = this.signature;
    return `${this.rank} · ${this.style} · ${sig.label} ${sig.value}`;
  }

  /** Short stat line for arrival screen. */
  get arrivalLabel(): string {
    const sig = this.signature;
    return `${sig.label}: ${sig.value}`;
  }

  /** True if the player has enough data for a meaningful profile. */
  get hasHistory(): boolean {
    return this.#data.totalDriveTimeS > 30;
  }
}
