/**
 * DriftScoreSystem — scores drifts and tracks run-level exploration stats.
 *
 * A drift scores points while active: abs(lateralSpeed) × forwardSpeed × dt.
 * When a drift ends, the accumulated score is emitted. The system tracks
 * per-run totals for the arrival summary.
 */

export interface ScoredDrift {
  /** Points earned from this drift (after combo multiplier). */
  points: number;
  /** Duration in seconds. */
  duration: number;
  /** Peak lateral speed during the drift. */
  peakLateralSpeed: number;
  /** Peak forward speed during the drift. */
  peakForwardSpeed: number;
  /** Combo multiplier applied to this drift (1-4). */
  comboMultiplier: number;
}

export interface DriftRunStats {
  /** Total drift points this run. */
  totalPoints: number;
  /** Number of scored drifts. */
  driftCount: number;
  /** Best single drift score. */
  bestDrift: number;
  /** Longest drift duration in seconds. */
  longestDriftS: number;
  /** Unique surfaces driven on this run. */
  surfacesVisited: Set<string>;
  /** Total distance driven in meters. */
  distanceDrivenM: number;
  /** Map discovery percent at run end. */
  mapPercent: number;
}

/** Minimum points for a drift to count (filters micro-slides). */
const MIN_DRIFT_POINTS = 8;
/** Minimum duration for a drift to count. */
const MIN_DRIFT_SECONDS = 0.4;

export class DriftScoreSystem {
  // ── Active drift state ──
  #isDrifting = false;
  #driftPoints = 0;
  #driftDuration = 0;
  #driftPeakLateral = 0;
  #driftPeakForward = 0;

  // ── Combo state ──
  #comboMultiplier = 1;
  #comboTimer = 0;
  #maxCombo = 4;
  #comboWindow = 3;

  // ── Run stats ──
  #totalPoints = 0;
  #driftCount = 0;
  #bestDrift = 0;
  #longestDriftS = 0;
  #surfacesVisited = new Set<string>();
  #distanceDrivenM = 0;
  #mapPercent = 0;

  // ── Event output (consumed by caller each frame) ──
  #lastScoredDrift: ScoredDrift | null = null;

  /** The most recently completed drift, or null. Consumed once per read. */
  consumeScoredDrift(): ScoredDrift | null {
    const drift = this.#lastScoredDrift;
    this.#lastScoredDrift = null;
    return drift;
  }

  get runStats(): DriftRunStats {
    return {
      totalPoints: Math.round(this.#totalPoints),
      driftCount: this.#driftCount,
      bestDrift: Math.round(this.#bestDrift),
      longestDriftS: this.#longestDriftS,
      surfacesVisited: this.#surfacesVisited,
      distanceDrivenM: this.#distanceDrivenM,
      mapPercent: this.#mapPercent,
    };
  }

  get totalPoints(): number {
    return Math.round(this.#totalPoints);
  }

  get activeDriftPoints(): number {
    return this.#isDrifting ? Math.round(this.#driftPoints) : 0;
  }

  get isActiveDrift(): boolean {
    return this.#isDrifting && this.#driftDuration > MIN_DRIFT_SECONDS;
  }

  get comboMultiplier(): number {
    return this.#comboMultiplier;
  }

  get comboActive(): boolean {
    return this.#comboMultiplier > 1;
  }

  update(
    dt: number,
    isDrifting: boolean,
    isGrounded: boolean,
    lateralSpeed: number,
    forwardSpeed: number,
    speed: number,
    surface: string,
  ): void {
    // Track exploration
    this.#distanceDrivenM += speed * dt;
    if (surface !== 'water') {
      this.#surfacesVisited.add(surface);
    }

    const driftActive = isDrifting && isGrounded && forwardSpeed > 4;

    // Tick combo timer when not drifting
    if (!driftActive && !this.#isDrifting && this.#comboMultiplier > 1) {
      this.#comboTimer += dt;
      if (this.#comboTimer >= this.#comboWindow) {
        this.#comboMultiplier = 1;
        this.#comboTimer = 0;
      }
    }

    if (driftActive) {
      // Accumulate score: lateral intensity × forward speed
      const absLateral = Math.abs(lateralSpeed);
      const frameScore = absLateral * Math.max(forwardSpeed, 0) * dt;
      this.#driftPoints += frameScore;
      this.#driftDuration += dt;
      this.#driftPeakLateral = Math.max(this.#driftPeakLateral, absLateral);
      this.#driftPeakForward = Math.max(this.#driftPeakForward, forwardSpeed);

      if (!this.#isDrifting) {
        // Drift just started — check combo window
        this.#isDrifting = true;
        if (this.#comboTimer > 0 && this.#comboTimer < this.#comboWindow) {
          this.#comboMultiplier = Math.min(this.#comboMultiplier + 1, this.#maxCombo);
        }
        this.#comboTimer = 0;
      }
    } else if (this.#isDrifting) {
      // Drift just ended — score it
      this.#isDrifting = false;
      this.#comboTimer = 0; // start combo window

      if (this.#driftPoints >= MIN_DRIFT_POINTS && this.#driftDuration >= MIN_DRIFT_SECONDS) {
        const comboPoints = Math.round(this.#driftPoints) * this.#comboMultiplier;
        const scored: ScoredDrift = {
          points: comboPoints,
          duration: this.#driftDuration,
          peakLateralSpeed: this.#driftPeakLateral,
          peakForwardSpeed: this.#driftPeakForward,
          comboMultiplier: this.#comboMultiplier,
        };

        this.#totalPoints += scored.points;
        this.#driftCount += 1;
        this.#bestDrift = Math.max(this.#bestDrift, scored.points);
        this.#longestDriftS = Math.max(this.#longestDriftS, scored.duration);
        this.#lastScoredDrift = scored;
      } else {
        // Drift too small to score — don't advance combo
        // (but don't reset it either; combo timer will handle expiry)
      }

      // Reset active drift state
      this.#driftPoints = 0;
      this.#driftDuration = 0;
      this.#driftPeakLateral = 0;
      this.#driftPeakForward = 0;
    }
  }

  /** Set current map discovery percent (call before reading runStats). */
  setMapPercent(percent: number): void {
    this.#mapPercent = percent;
  }

  reset(): void {
    this.#isDrifting = false;
    this.#driftPoints = 0;
    this.#driftDuration = 0;
    this.#driftPeakLateral = 0;
    this.#driftPeakForward = 0;
    this.#comboMultiplier = 1;
    this.#comboTimer = 0;
    this.#totalPoints = 0;
    this.#driftCount = 0;
    this.#bestDrift = 0;
    this.#longestDriftS = 0;
    this.#surfacesVisited = new Set<string>();
    this.#distanceDrivenM = 0;
    this.#mapPercent = 0;
    this.#lastScoredDrift = null;
  }
}
