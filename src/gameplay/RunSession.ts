export type RunMode = 'title' | 'driving' | 'arrived';

export interface RunSnapshot {
  mode: RunMode;
  elapsedSeconds: number;
  peakSpeedKmh: number;
  checkpointsReached: number;
  checkpointCount: number;
  nextCheckpointIndex: number | null;
  splitSeconds: number[];
}

export interface RunUpdateResult {
  completed: boolean;
  checkpointReached: boolean;
  reachedCheckpointIndex: number | null;
}

export class RunSession {
  readonly #arrivalRadius: number;
  readonly #checkpointCount: number;
  #mode: RunMode = 'title';
  #elapsedSeconds = 0;
  #peakSpeedKmh = 0;
  #checkpointsReached = 0;
  #splitSeconds: number[] = [];

  constructor(arrivalRadius: number, checkpointCount: number) {
    this.#arrivalRadius = arrivalRadius;
    this.#checkpointCount = checkpointCount;
  }

  get snapshot(): RunSnapshot {
    return {
      mode: this.#mode,
      elapsedSeconds: this.#elapsedSeconds,
      peakSpeedKmh: this.#peakSpeedKmh,
      checkpointsReached: this.#checkpointsReached,
      checkpointCount: this.#checkpointCount,
      nextCheckpointIndex:
        this.#checkpointsReached < this.#checkpointCount
          ? this.#checkpointsReached
          : null,
      splitSeconds: [...this.#splitSeconds],
    };
  }

  get mode(): RunMode {
    return this.#mode;
  }

  start(): boolean {
    if (this.#mode === 'driving') return false;
    this.#mode = 'driving';
    this.#elapsedSeconds = 0;
    this.#peakSpeedKmh = 0;
    this.#checkpointsReached = 0;
    this.#splitSeconds = [];
    return true;
  }

  restart(): void {
    this.#mode = 'driving';
    this.#elapsedSeconds = 0;
    this.#peakSpeedKmh = 0;
    this.#checkpointsReached = 0;
    this.#splitSeconds = [];
  }

  update(
    dt: number,
    speedKmh: number,
    currentCheckpointDistance: number | null,
    objectiveDistance: number,
  ): RunUpdateResult {
    if (this.#mode !== 'driving') {
      return {
        completed: false,
        checkpointReached: false,
        reachedCheckpointIndex: null,
      };
    }

    this.#elapsedSeconds += dt;
    this.#peakSpeedKmh = Math.max(this.#peakSpeedKmh, Math.round(speedKmh));

    let checkpointReached = false;
    let reachedCheckpointIndex: number | null = null;

    if (
      currentCheckpointDistance !== null
      && this.#checkpointsReached < this.#checkpointCount
      && currentCheckpointDistance <= this.#arrivalRadius
    ) {
      reachedCheckpointIndex = this.#checkpointsReached;
      checkpointReached = true;
      this.#checkpointsReached += 1;
      this.#splitSeconds.push(this.#elapsedSeconds);
    }

    if (objectiveDistance <= this.#arrivalRadius) {
      this.#mode = 'arrived';
      return {
        completed: true,
        checkpointReached,
        reachedCheckpointIndex,
      };
    }

    return {
      completed: false,
      checkpointReached,
      reachedCheckpointIndex,
    };
  }

  complete(): boolean {
    if (this.#mode !== 'driving') return false;
    this.#mode = 'arrived';
    return true;
  }

  resetToTitle(): void {
    this.#mode = 'title';
    this.#elapsedSeconds = 0;
    this.#peakSpeedKmh = 0;
    this.#checkpointsReached = 0;
    this.#splitSeconds = [];
  }
}
