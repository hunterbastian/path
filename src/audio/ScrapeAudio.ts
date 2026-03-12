/**
 * Procedural metal scraping audio — continuous grinding when wheels are missing.
 * Synthesized from filtered noise with metallic resonance overtones.
 * Intensity scales with speed and number of missing wheels.
 * Connects to the shared compressor so it sits in the same mix as EngineAudio.
 */
import type { DrivingState } from '../vehicle/DrivingState';

export class ScrapeAudio {
  readonly #context: AudioContext;
  readonly #output: GainNode;

  // --- Primary scrape: mid-high filtered noise for grinding metal ---
  readonly #scrapeNoise: AudioBufferSourceNode;
  readonly #scrapeFilter: BiquadFilterNode;
  readonly #scrapeGain: GainNode;

  // --- Metallic resonance: sawtooth oscillator for tonal ringing ---
  readonly #resonanceOsc: OscillatorNode;
  readonly #resonanceFilter: BiquadFilterNode;
  readonly #resonanceGain: GainNode;

  // --- Low rumble: heavy dragging undertone ---
  readonly #dragNoise: AudioBufferSourceNode;
  readonly #dragFilter: BiquadFilterNode;
  readonly #dragGain: GainNode;

  constructor(context: AudioContext, destination: AudioNode) {
    this.#context = context;

    this.#output = context.createGain();
    this.#output.gain.value = 1;
    this.#output.connect(destination);

    const noiseBuffer = this.#createNoiseBuffer();

    // Primary scrape: harsh mid-high grinding
    this.#scrapeFilter = context.createBiquadFilter();
    this.#scrapeFilter.type = 'bandpass';
    this.#scrapeFilter.frequency.value = 3200;
    this.#scrapeFilter.Q.value = 2.2;

    this.#scrapeGain = context.createGain();
    this.#scrapeGain.gain.value = 0;

    this.#scrapeNoise = context.createBufferSource();
    this.#scrapeNoise.buffer = noiseBuffer;
    this.#scrapeNoise.loop = true;
    this.#scrapeNoise.connect(this.#scrapeFilter);
    this.#scrapeFilter.connect(this.#scrapeGain);
    this.#scrapeGain.connect(this.#output);
    this.#scrapeNoise.start();

    // Metallic resonance: tonal ringing that gives it a metal character
    this.#resonanceOsc = context.createOscillator();
    this.#resonanceOsc.type = 'sawtooth';
    this.#resonanceOsc.frequency.value = 440;

    this.#resonanceFilter = context.createBiquadFilter();
    this.#resonanceFilter.type = 'bandpass';
    this.#resonanceFilter.frequency.value = 860;
    this.#resonanceFilter.Q.value = 6;

    this.#resonanceGain = context.createGain();
    this.#resonanceGain.gain.value = 0;

    this.#resonanceOsc.connect(this.#resonanceFilter);
    this.#resonanceFilter.connect(this.#resonanceGain);
    this.#resonanceGain.connect(this.#output);
    this.#resonanceOsc.start();

    // Low drag rumble: the heavy thudding of metal on ground
    this.#dragFilter = context.createBiquadFilter();
    this.#dragFilter.type = 'lowpass';
    this.#dragFilter.frequency.value = 220;
    this.#dragFilter.Q.value = 1.2;

    this.#dragGain = context.createGain();
    this.#dragGain.gain.value = 0;

    this.#dragNoise = context.createBufferSource();
    this.#dragNoise.buffer = noiseBuffer;
    this.#dragNoise.loop = true;
    this.#dragNoise.connect(this.#dragFilter);
    this.#dragFilter.connect(this.#dragGain);
    this.#dragGain.connect(this.#output);
    this.#dragNoise.start();
  }

  update(state: DrivingState): void {
    const now = this.#context.currentTime;

    // Count missing wheels
    let missingWheels = 0;
    for (let i = 0; i < 4; i++) {
      if (!state.wheelAttached[i]) missingWheels++;
    }

    // Only active when grounded, moving, and missing wheels
    const active = missingWheels > 0 && state.isGrounded && state.speed > 1;
    const speedNorm = Math.min(state.speed / 25, 1);
    // Intensity ramps up with more missing wheels: 1→mild, 4→brutal
    const intensity = active ? (missingWheels / 4) * speedNorm : 0;

    // ── Primary scrape ──
    const scrapeTarget = intensity * 0.055;
    this.#scrapeGain.gain.setTargetAtTime(scrapeTarget, now, 0.08);
    // Pitch rises with speed — faster = higher screech
    const scrapeFreq = 2400 + speedNorm * 2200 + missingWheels * 300;
    this.#scrapeFilter.frequency.setTargetAtTime(scrapeFreq, now, 0.1);
    // Widen Q at higher intensities for a nastier sound
    this.#scrapeFilter.Q.setTargetAtTime(1.6 + intensity * 2.0, now, 0.1);

    // ── Metallic resonance ──
    const resonanceTarget = intensity * 0.018;
    this.#resonanceGain.gain.setTargetAtTime(resonanceTarget, now, 0.1);
    // Oscillator frequency modulates slightly with speed for variation
    const resoFreq = 380 + speedNorm * 180 + Math.sin(now * 3.7) * 40;
    this.#resonanceOsc.frequency.setTargetAtTime(resoFreq, now, 0.12);
    this.#resonanceFilter.frequency.setTargetAtTime(
      720 + speedNorm * 400,
      now,
      0.12,
    );

    // ── Low drag rumble ──
    const dragTarget = intensity * 0.032;
    this.#dragGain.gain.setTargetAtTime(dragTarget, now, 0.1);
    this.#dragFilter.frequency.setTargetAtTime(
      160 + speedNorm * 120,
      now,
      0.12,
    );
  }

  #createNoiseBuffer(): AudioBuffer {
    const length = this.#context.sampleRate * 2;
    const buffer = this.#context.createBuffer(1, length, this.#context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      channel[i] = (Math.random() * 2 - 1) * 0.35;
    }
    return buffer;
  }
}
