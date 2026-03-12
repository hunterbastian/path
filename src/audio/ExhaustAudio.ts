/**
 * Procedural exhaust audio — backfire pops on throttle lift at speed.
 * Short-lived oscillator + noise bursts fired at random intervals during decel.
 * Nodes auto-disconnect after playback.
 */
export class ExhaustAudio {
  readonly #context: AudioContext;
  readonly #output: GainNode;
  readonly #noiseBuffer: AudioBuffer;

  /** Cooldown timer (seconds) between pops to avoid machine-gun sound. */
  #popCooldown = 0;
  /** Was throttle applied last frame? Used to detect lift-off. */
  #wasThrottling = false;
  /** Accumulated decel time while eligible for pops. */
  #decelTime = 0;

  constructor(context: AudioContext, destination: AudioNode) {
    this.#context = context;
    this.#output = context.createGain();
    this.#output.gain.value = 1;
    this.#output.connect(destination);
    this.#noiseBuffer = this.#createNoiseBuffer();
  }

  /**
   * Call each frame with current driving state.
   * @param dt — frame delta in seconds
   * @param speed — vehicle speed
   * @param throttle — throttle input (-1 to 1)
   * @param isBoosting — whether boost is active
   */
  update(dt: number, speed: number, throttle: number, isBoosting: boolean): void {
    this.#popCooldown = Math.max(0, this.#popCooldown - dt);

    const isThrottling = Math.abs(throttle) > 0.15 || isBoosting;
    const justLifted = this.#wasThrottling && !isThrottling;
    this.#wasThrottling = isThrottling;

    // Eligible: not throttling, moving fast enough, and grounded (speed > 0 implies motion)
    const eligible = !isThrottling && speed > 8;

    if (justLifted && speed > 12) {
      // Immediate pop on throttle lift at high speed
      this.#decelTime = 0;
      this.#firePop(speed);
      this.#popCooldown = 0.12 + Math.random() * 0.08;
      return;
    }

    if (eligible) {
      this.#decelTime += dt;

      // Random pops during coast-down, less frequent over time
      if (this.#popCooldown <= 0 && this.#decelTime < 2.5) {
        // Probability decreases as decel time increases
        const popChance = (0.8 - this.#decelTime * 0.3) * dt * 4;
        if (Math.random() < popChance) {
          this.#firePop(speed);
          // Randomize next pop timing
          this.#popCooldown = 0.15 + Math.random() * 0.25;
        }
      }
    } else {
      this.#decelTime = 0;
    }
  }

  #firePop(speed: number): void {
    const ctx = this.#context;
    const now = ctx.currentTime;
    const speedFactor = Math.min(speed / 30, 1);

    // Randomize pop character
    const popType = Math.random();

    if (popType < 0.5) {
      // --- Crack: short noise burst ---
      this.#fireNoisePop(now, speedFactor);
    } else if (popType < 0.8) {
      // --- Thud + crack: low thump with noise ---
      this.#fireThudPop(now, speedFactor);
    } else {
      // --- Double pop: two quick bursts ---
      this.#fireNoisePop(now, speedFactor * 0.7);
      this.#fireNoisePop(now + 0.04 + Math.random() * 0.03, speedFactor * 0.5);
    }
  }

  /** Short bandpass noise crack. */
  #fireNoisePop(startTime: number, intensity: number): void {
    const ctx = this.#context;
    const source = ctx.createBufferSource();
    source.buffer = this.#noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 800 + Math.random() * 600 + intensity * 400;
    filter.Q.value = 2.0 + Math.random() * 1.5;

    const gain = ctx.createGain();
    const vol = (0.04 + intensity * 0.04) * (0.7 + Math.random() * 0.3);
    gain.gain.setValueAtTime(vol, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.04 + intensity * 0.03);

    source.connect(filter);
    filter.connect(gain);
    gain.connect(this.#output);

    source.start(startTime);
    source.stop(startTime + 0.08);
  }

  /** Low-frequency thud pop with body resonance. */
  #fireThudPop(startTime: number, intensity: number): void {
    const ctx = this.#context;

    // Noise component
    const source = ctx.createBufferSource();
    source.buffer = this.#noiseBuffer;

    const lowpass = ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 400 + intensity * 200;
    lowpass.Q.value = 0.8;

    const noiseGain = ctx.createGain();
    const noiseVol = (0.03 + intensity * 0.03) * (0.7 + Math.random() * 0.3);
    noiseGain.gain.setValueAtTime(noiseVol, startTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);

    source.connect(lowpass);
    lowpass.connect(noiseGain);
    noiseGain.connect(this.#output);
    source.start(startTime);
    source.stop(startTime + 0.08);

    // Low oscillator thud
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60 + Math.random() * 20, startTime);
    osc.frequency.exponentialRampToValueAtTime(30, startTime + 0.05);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.025 + intensity * 0.02, startTime);
    oscGain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.06);

    osc.connect(oscGain);
    oscGain.connect(this.#output);
    osc.start(startTime);
    osc.stop(startTime + 0.08);
  }

  #createNoiseBuffer(): AudioBuffer {
    const length = this.#context.sampleRate;
    const buffer = this.#context.createBuffer(1, length, this.#context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      channel[i] = (Math.random() * 2 - 1) * 0.4;
    }
    return buffer;
  }
}
