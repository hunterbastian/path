/**
 * Procedural impact/damage audio system.
 * All sounds are synthesized from oscillators and noise buffers — no samples.
 * Short-lived nodes auto-disconnect after playback; Web Audio GC handles cleanup.
 */
export class ImpactAudio {
  readonly #context: AudioContext;
  readonly #output: GainNode;
  readonly #noiseBuffer: AudioBuffer;

  constructor(context: AudioContext, destination: AudioNode) {
    this.#context = context;
    this.#output = context.createGain();
    this.#output.gain.value = 1;
    this.#output.connect(destination);
    this.#noiseBuffer = this.#createNoiseBuffer();
  }

  /**
   * Metal crunch — vehicle part detach.
   * Filtered noise burst + detuned oscillator thud for a metallic tearing quality.
   */
  playPartDetach(): void {
    const ctx = this.#context;
    const now = ctx.currentTime;

    // --- Noise crunch layer ---
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = this.#noiseBuffer;

    const noiseBandpass = ctx.createBiquadFilter();
    noiseBandpass.type = 'bandpass';
    noiseBandpass.frequency.setValueAtTime(2200, now);
    noiseBandpass.frequency.exponentialRampToValueAtTime(680, now + 0.12);
    noiseBandpass.Q.value = 2.4;

    const noiseHighpass = ctx.createBiquadFilter();
    noiseHighpass.type = 'highpass';
    noiseHighpass.frequency.value = 320;

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.28, now);
    noiseGain.gain.linearRampToValueAtTime(0.18, now + 0.04);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    noiseSource.connect(noiseBandpass);
    noiseBandpass.connect(noiseHighpass);
    noiseHighpass.connect(noiseGain);
    noiseGain.connect(this.#output);

    noiseSource.start(now);
    noiseSource.stop(now + 0.24);

    // --- Low thud oscillator ---
    const thudOsc = ctx.createOscillator();
    thudOsc.type = 'sine';
    thudOsc.frequency.setValueAtTime(72, now);
    thudOsc.frequency.exponentialRampToValueAtTime(36, now + 0.14);

    const thudGain = ctx.createGain();
    thudGain.gain.setValueAtTime(0.22, now);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    thudOsc.connect(thudGain);
    thudGain.connect(this.#output);

    thudOsc.start(now);
    thudOsc.stop(now + 0.2);

    // --- Detuned metallic oscillator ---
    const metalOsc = ctx.createOscillator();
    metalOsc.type = 'sawtooth';
    metalOsc.frequency.setValueAtTime(186, now);
    metalOsc.frequency.exponentialRampToValueAtTime(94, now + 0.1);

    const metalFilter = ctx.createBiquadFilter();
    metalFilter.type = 'bandpass';
    metalFilter.frequency.value = 640;
    metalFilter.Q.value = 3.2;

    const metalGain = ctx.createGain();
    metalGain.gain.setValueAtTime(0.14, now);
    metalGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    metalOsc.connect(metalFilter);
    metalFilter.connect(metalGain);
    metalGain.connect(this.#output);

    metalOsc.start(now);
    metalOsc.stop(now + 0.18);
  }

  /**
   * Hard landing thud — vehicle lands from a jump.
   * Low-frequency thump with rumble. Intensity scales with magnitude (0–1 normalized).
   */
  playLanding(magnitude: number): void {
    const ctx = this.#context;
    const now = ctx.currentTime;
    const intensity = Math.min(Math.max(magnitude, 0), 1);

    // --- Sub thump ---
    const thumpOsc = ctx.createOscillator();
    thumpOsc.type = 'sine';
    thumpOsc.frequency.setValueAtTime(48 + intensity * 18, now);
    thumpOsc.frequency.exponentialRampToValueAtTime(22, now + 0.18 + intensity * 0.08);

    const thumpGain = ctx.createGain();
    const thumpLevel = 0.08 + intensity * 0.12;
    thumpGain.gain.setValueAtTime(thumpLevel, now);
    thumpGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22 + intensity * 0.1);

    thumpOsc.connect(thumpGain);
    thumpGain.connect(this.#output);

    thumpOsc.start(now);
    thumpOsc.stop(now + 0.34);

    // --- Rumble noise layer ---
    const rumbleSource = ctx.createBufferSource();
    rumbleSource.buffer = this.#noiseBuffer;

    const rumbleLowpass = ctx.createBiquadFilter();
    rumbleLowpass.type = 'lowpass';
    rumbleLowpass.frequency.setValueAtTime(280 + intensity * 220, now);
    rumbleLowpass.frequency.exponentialRampToValueAtTime(80, now + 0.2);
    rumbleLowpass.Q.value = 0.7;

    const rumbleGain = ctx.createGain();
    const rumbleLevel = 0.06 + intensity * 0.1;
    rumbleGain.gain.setValueAtTime(rumbleLevel, now);
    rumbleGain.gain.exponentialRampToValueAtTime(0.001, now + 0.26 + intensity * 0.06);

    rumbleSource.connect(rumbleLowpass);
    rumbleLowpass.connect(rumbleGain);
    rumbleGain.connect(this.#output);

    rumbleSource.start(now);
    rumbleSource.stop(now + 0.34);

    // --- Body resonance (triangle for hollow thud) ---
    const bodyOsc = ctx.createOscillator();
    bodyOsc.type = 'triangle';
    bodyOsc.frequency.setValueAtTime(110 + intensity * 40, now);
    bodyOsc.frequency.exponentialRampToValueAtTime(60, now + 0.12);

    const bodyGain = ctx.createGain();
    bodyGain.gain.setValueAtTime(0.04 + intensity * 0.06, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);

    bodyOsc.connect(bodyGain);
    bodyGain.connect(this.#output);

    bodyOsc.start(now);
    bodyOsc.stop(now + 0.18);
  }

  /**
   * Collision impact — hitting props or traffic.
   * Mid-frequency crunch, shorter and sharper than part detach.
   */
  playCollision(magnitude: number): void {
    const ctx = this.#context;
    const now = ctx.currentTime;
    const intensity = Math.min(Math.max(magnitude, 0), 1);

    // --- Crunch noise ---
    const crunchSource = ctx.createBufferSource();
    crunchSource.buffer = this.#noiseBuffer;

    const crunchBandpass = ctx.createBiquadFilter();
    crunchBandpass.type = 'bandpass';
    crunchBandpass.frequency.setValueAtTime(1400 + intensity * 600, now);
    crunchBandpass.frequency.exponentialRampToValueAtTime(480, now + 0.08);
    crunchBandpass.Q.value = 1.8;

    const crunchGain = ctx.createGain();
    const crunchLevel = 0.1 + intensity * 0.1;
    crunchGain.gain.setValueAtTime(crunchLevel, now);
    crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1 + intensity * 0.04);

    crunchSource.connect(crunchBandpass);
    crunchBandpass.connect(crunchGain);
    crunchGain.connect(this.#output);

    crunchSource.start(now);
    crunchSource.stop(now + 0.16);

    // --- Impact thud ---
    const impactOsc = ctx.createOscillator();
    impactOsc.type = 'sine';
    impactOsc.frequency.setValueAtTime(96 + intensity * 30, now);
    impactOsc.frequency.exponentialRampToValueAtTime(44, now + 0.08);

    const impactGain = ctx.createGain();
    impactGain.gain.setValueAtTime(0.08 + intensity * 0.06, now);
    impactGain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    impactOsc.connect(impactGain);
    impactGain.connect(this.#output);

    impactOsc.start(now);
    impactOsc.stop(now + 0.12);
  }

  /**
   * Scrape — brief high-frequency filtered noise burst for glancing hits.
   */
  playScrape(): void {
    const ctx = this.#context;
    const now = ctx.currentTime;

    const scrapeSource = ctx.createBufferSource();
    scrapeSource.buffer = this.#noiseBuffer;

    const scrapeHighpass = ctx.createBiquadFilter();
    scrapeHighpass.type = 'highpass';
    scrapeHighpass.frequency.value = 3200;

    const scrapeBandpass = ctx.createBiquadFilter();
    scrapeBandpass.type = 'bandpass';
    scrapeBandpass.frequency.setValueAtTime(5400, now);
    scrapeBandpass.frequency.exponentialRampToValueAtTime(2800, now + 0.06);
    scrapeBandpass.Q.value = 2.0;

    const scrapeGain = ctx.createGain();
    scrapeGain.gain.setValueAtTime(0.09, now);
    scrapeGain.gain.linearRampToValueAtTime(0.06, now + 0.02);
    scrapeGain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    scrapeSource.connect(scrapeHighpass);
    scrapeHighpass.connect(scrapeBandpass);
    scrapeBandpass.connect(scrapeGain);
    scrapeGain.connect(this.#output);

    scrapeSource.start(now);
    scrapeSource.stop(now + 0.1);
  }

  /**
   * NPC horn — short doppler-shifted honk.
   * Two detuned square waves for a cheap car horn character.
   */
  playHonk(distance: number): void {
    const ctx = this.#context;
    const now = ctx.currentTime;
    // Volume falls off with distance
    const vol = Math.max(0.02, 0.18 - distance * 0.003);

    const horn1 = ctx.createOscillator();
    horn1.type = 'square';
    horn1.frequency.setValueAtTime(340, now);
    horn1.frequency.linearRampToValueAtTime(320, now + 0.28);

    const horn2 = ctx.createOscillator();
    horn2.type = 'square';
    horn2.frequency.setValueAtTime(420, now);
    horn2.frequency.linearRampToValueAtTime(395, now + 0.28);

    const hornFilter = ctx.createBiquadFilter();
    hornFilter.type = 'bandpass';
    hornFilter.frequency.value = 600;
    hornFilter.Q.value = 1.4;

    const hornGain = ctx.createGain();
    hornGain.gain.setValueAtTime(vol, now);
    hornGain.gain.setValueAtTime(vol, now + 0.22);
    hornGain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    horn1.connect(hornFilter);
    horn2.connect(hornFilter);
    hornFilter.connect(hornGain);
    hornGain.connect(this.#output);

    horn1.start(now);
    horn1.stop(now + 0.32);
    horn2.start(now);
    horn2.stop(now + 0.32);
  }

  #createNoiseBuffer(): AudioBuffer {
    const length = this.#context.sampleRate * 2;
    const buffer = this.#context.createBuffer(1, length, this.#context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * 0.35;
    }
    return buffer;
  }
}
