interface FixedStepLoopOptions {
  stepSeconds: number;
  maxFrameSeconds?: number;
  maxSubSteps?: number;
  onStep: (dt: number) => void;
  onRender: (frameSeconds: number) => void;
}

export class FixedStepLoop {
  #stepSeconds: number;
  #maxFrameSeconds: number;
  #maxSubSteps: number;
  #onStep: (dt: number) => void;
  #onRender: (frameSeconds: number) => void;
  #accumulator = 0;
  #lastFrameTime = 0;
  #frameHandle = 0;
  #running = false;

  constructor({
    stepSeconds,
    maxFrameSeconds = 0.1,
    maxSubSteps = 5,
    onStep,
    onRender,
  }: FixedStepLoopOptions) {
    this.#stepSeconds = stepSeconds;
    this.#maxFrameSeconds = maxFrameSeconds;
    this.#maxSubSteps = Math.max(1, Math.floor(maxSubSteps));
    this.#onStep = onStep;
    this.#onRender = onRender;
  }

  start(): void {
    if (this.#running) return;
    this.#running = true;
    this.#lastFrameTime = performance.now();
    this.#frameHandle = window.requestAnimationFrame(this.#tick);
  }

  stop(): void {
    this.#running = false;
    if (this.#frameHandle !== 0) {
      window.cancelAnimationFrame(this.#frameHandle);
      this.#frameHandle = 0;
    }
  }

  advance(milliseconds: number): void {
    const totalSeconds = Math.max(milliseconds, 0) / 1000;
    const steps = Math.max(1, Math.round(totalSeconds / this.#stepSeconds));
    for (let index = 0; index < steps; index += 1) {
      this.#onStep(this.#stepSeconds);
    }
    this.#onRender(Math.max(totalSeconds, this.#stepSeconds));
    this.#lastFrameTime = performance.now();
  }

  #tick = (now: number): void => {
    if (!this.#running) return;

    const frameSeconds = Math.min(
      (now - this.#lastFrameTime) / 1000,
      this.#maxFrameSeconds,
    );
    this.#lastFrameTime = now;
    this.#accumulator += frameSeconds;

    let stepsProcessed = 0;
    while (
      this.#accumulator >= this.#stepSeconds &&
      stepsProcessed < this.#maxSubSteps
    ) {
      this.#onStep(this.#stepSeconds);
      this.#accumulator -= this.#stepSeconds;
      stepsProcessed += 1;
    }

    if (this.#accumulator >= this.#stepSeconds) {
      this.#accumulator %= this.#stepSeconds;
    }

    this.#onRender(frameSeconds);
    this.#frameHandle = window.requestAnimationFrame(this.#tick);
  };
}
