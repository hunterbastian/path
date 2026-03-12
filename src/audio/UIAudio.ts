/**
 * Procedural UI audio — mechanical clicks with organic undertones.
 * All sounds synthesized via Web Audio API. No samples.
 */
export class UIAudio {
  readonly #context: AudioContext;
  readonly #output: GainNode;

  constructor(context: AudioContext, destination: AudioNode) {
    this.#context = context;
    this.#output = context.createGain();
    this.#output.gain.value = 0.35;
    this.#output.connect(destination);
  }

  /**
   * Soft mechanical tick — menu navigation, map toggle, hover.
   * Short filtered click with a faint woody resonance.
   */
  playTick(): void {
    const ctx = this.#context;
    const now = ctx.currentTime;

    // Mechanical click — short impulse through a resonant filter
    const clickOsc = ctx.createOscillator();
    clickOsc.type = 'square';
    clickOsc.frequency.setValueAtTime(3200, now);
    clickOsc.frequency.exponentialRampToValueAtTime(1200, now + 0.008);

    const clickFilter = ctx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.value = 2400;
    clickFilter.Q.value = 4.0;

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.18, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);

    clickOsc.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(this.#output);

    clickOsc.start(now);
    clickOsc.stop(now + 0.04);

    // Organic undertone — faint wooden resonance
    const woodOsc = ctx.createOscillator();
    woodOsc.type = 'triangle';
    woodOsc.frequency.setValueAtTime(680, now);
    woodOsc.frequency.exponentialRampToValueAtTime(420, now + 0.025);

    const woodGain = ctx.createGain();
    woodGain.gain.setValueAtTime(0.06, now);
    woodGain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);

    woodOsc.connect(woodGain);
    woodGain.connect(this.#output);

    woodOsc.start(now);
    woodOsc.stop(now + 0.05);
  }

  /**
   * Confirm — pressing Enter Route, resuming from pause.
   * Slightly richer: two-tone latch with a breathy release.
   */
  playConfirm(): void {
    const ctx = this.#context;
    const now = ctx.currentTime;

    // Latch tone 1 — bright ping
    const ping1 = ctx.createOscillator();
    ping1.type = 'sine';
    ping1.frequency.setValueAtTime(1100, now);
    ping1.frequency.exponentialRampToValueAtTime(880, now + 0.04);

    const ping1Gain = ctx.createGain();
    ping1Gain.gain.setValueAtTime(0.12, now);
    ping1Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    ping1.connect(ping1Gain);
    ping1Gain.connect(this.#output);
    ping1.start(now);
    ping1.stop(now + 0.09);

    // Latch tone 2 — harmonic, slightly delayed
    const ping2 = ctx.createOscillator();
    ping2.type = 'sine';
    ping2.frequency.setValueAtTime(1650, now + 0.015);
    ping2.frequency.exponentialRampToValueAtTime(1320, now + 0.055);

    const ping2Gain = ctx.createGain();
    ping2Gain.gain.setValueAtTime(0.0, now);
    ping2Gain.gain.linearRampToValueAtTime(0.08, now + 0.018);
    ping2Gain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);

    ping2.connect(ping2Gain);
    ping2Gain.connect(this.#output);
    ping2.start(now);
    ping2.stop(now + 0.08);

    // Mechanical latch body
    const latchOsc = ctx.createOscillator();
    latchOsc.type = 'square';
    latchOsc.frequency.setValueAtTime(4800, now);
    latchOsc.frequency.exponentialRampToValueAtTime(1600, now + 0.006);

    const latchFilter = ctx.createBiquadFilter();
    latchFilter.type = 'highpass';
    latchFilter.frequency.value = 1800;

    const latchGain = ctx.createGain();
    latchGain.gain.setValueAtTime(0.1, now);
    latchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    latchOsc.connect(latchFilter);
    latchFilter.connect(latchGain);
    latchGain.connect(this.#output);
    latchOsc.start(now);
    latchOsc.stop(now + 0.03);
  }

  /**
   * Open — map opening, pause menu appearing.
   * Soft mechanical slide with a breath of wind.
   */
  playOpen(): void {
    const ctx = this.#context;
    const now = ctx.currentTime;

    // Slide up — rising filtered tone
    const slideOsc = ctx.createOscillator();
    slideOsc.type = 'triangle';
    slideOsc.frequency.setValueAtTime(320, now);
    slideOsc.frequency.exponentialRampToValueAtTime(640, now + 0.06);

    const slideFilter = ctx.createBiquadFilter();
    slideFilter.type = 'bandpass';
    slideFilter.frequency.setValueAtTime(400, now);
    slideFilter.frequency.exponentialRampToValueAtTime(800, now + 0.06);
    slideFilter.Q.value = 2.0;

    const slideGain = ctx.createGain();
    slideGain.gain.setValueAtTime(0.0, now);
    slideGain.gain.linearRampToValueAtTime(0.1, now + 0.01);
    slideGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    slideOsc.connect(slideFilter);
    slideFilter.connect(slideGain);
    slideGain.connect(this.#output);
    slideOsc.start(now);
    slideOsc.stop(now + 0.09);

    // Breathy noise — wind texture
    const noiseLength = ctx.sampleRate * 0.12;
    const noiseBuffer = ctx.createBuffer(1, noiseLength, ctx.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noiseLength; i += 1) {
      noiseData[i] = (Math.random() * 2 - 1) * 0.15;
    }

    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;

    const noiseLowpass = ctx.createBiquadFilter();
    noiseLowpass.type = 'lowpass';
    noiseLowpass.frequency.setValueAtTime(1200, now);
    noiseLowpass.frequency.exponentialRampToValueAtTime(600, now + 0.1);

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.0, now);
    noiseGain.gain.linearRampToValueAtTime(0.06, now + 0.02);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    noiseSource.connect(noiseLowpass);
    noiseLowpass.connect(noiseGain);
    noiseGain.connect(this.#output);
    noiseSource.start(now);
    noiseSource.stop(now + 0.12);
  }

  /**
   * Close — map closing, pause dismiss.
   * Reverse of open: descending slide with fading breath.
   */
  playClose(): void {
    const ctx = this.#context;
    const now = ctx.currentTime;

    const slideOsc = ctx.createOscillator();
    slideOsc.type = 'triangle';
    slideOsc.frequency.setValueAtTime(580, now);
    slideOsc.frequency.exponentialRampToValueAtTime(280, now + 0.05);

    const slideFilter = ctx.createBiquadFilter();
    slideFilter.type = 'bandpass';
    slideFilter.frequency.setValueAtTime(700, now);
    slideFilter.frequency.exponentialRampToValueAtTime(350, now + 0.05);
    slideFilter.Q.value = 2.0;

    const slideGain = ctx.createGain();
    slideGain.gain.setValueAtTime(0.1, now);
    slideGain.gain.exponentialRampToValueAtTime(0.001, now + 0.06);

    slideOsc.connect(slideFilter);
    slideFilter.connect(slideGain);
    slideGain.connect(this.#output);
    slideOsc.start(now);
    slideOsc.stop(now + 0.07);
  }
}
