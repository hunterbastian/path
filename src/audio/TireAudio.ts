/**
 * Procedural tire audio — skid/slip sounds and surface-specific rumble.
 * All sounds synthesized from noise buffers; no samples.
 * Connects to the shared compressor so it sits in the same mix as EngineAudio.
 */
import type { DriveSurface, DrivingState } from '../vehicle/DrivingState';

/** Per-surface rumble tuning: center frequency, Q, and gain ceiling. */
const SURFACE_RUMBLE: Record<DriveSurface, { freq: number; q: number; gain: number }> = {
  dirt:  { freq: 140, q: 0.8, gain: 0.028 },
  sand:  { freq: 90,  q: 0.6, gain: 0.022 },
  grass: { freq: 180, q: 1.0, gain: 0.018 },
  rock:  { freq: 240, q: 1.4, gain: 0.034 },
  snow:  { freq: 100, q: 0.5, gain: 0.014 },
  water: { freq: 60,  q: 0.4, gain: 0.020 },
};

export class TireAudio {
  readonly #context: AudioContext;
  readonly #output: GainNode;

  // --- Skid channel: high-pitched screech when sliding ---
  readonly #skidNoise: AudioBufferSourceNode;
  readonly #skidFilter: BiquadFilterNode;
  readonly #skidGain: GainNode;

  // --- Rumble channel: low rolling noise varying by surface ---
  readonly #rumbleNoise: AudioBufferSourceNode;
  readonly #rumbleFilter: BiquadFilterNode;
  readonly #rumbleGain: GainNode;

  // --- Gravel patter: bandpass clicks for rocky surfaces ---
  readonly #gravelNoise: AudioBufferSourceNode;
  readonly #gravelFilter: BiquadFilterNode;
  readonly #gravelGain: GainNode;

  constructor(context: AudioContext, destination: AudioNode) {
    this.#context = context;

    this.#output = context.createGain();
    this.#output.gain.value = 1;
    this.#output.connect(destination);

    const noiseBuffer = this.#createNoiseBuffer();

    // Skid: high-frequency bandpass noise
    this.#skidFilter = context.createBiquadFilter();
    this.#skidFilter.type = 'bandpass';
    this.#skidFilter.frequency.value = 2800;
    this.#skidFilter.Q.value = 1.6;

    this.#skidGain = context.createGain();
    this.#skidGain.gain.value = 0;

    this.#skidNoise = context.createBufferSource();
    this.#skidNoise.buffer = noiseBuffer;
    this.#skidNoise.loop = true;
    this.#skidNoise.connect(this.#skidFilter);
    this.#skidFilter.connect(this.#skidGain);
    this.#skidGain.connect(this.#output);
    this.#skidNoise.start();

    // Rumble: low-frequency rolling noise
    this.#rumbleFilter = context.createBiquadFilter();
    this.#rumbleFilter.type = 'bandpass';
    this.#rumbleFilter.frequency.value = 140;
    this.#rumbleFilter.Q.value = 0.8;

    this.#rumbleGain = context.createGain();
    this.#rumbleGain.gain.value = 0;

    this.#rumbleNoise = context.createBufferSource();
    this.#rumbleNoise.buffer = noiseBuffer;
    this.#rumbleNoise.loop = true;
    this.#rumbleNoise.connect(this.#rumbleFilter);
    this.#rumbleFilter.connect(this.#rumbleGain);
    this.#rumbleGain.connect(this.#output);
    this.#rumbleNoise.start();

    // Gravel: sharper bandpass for patter/clicking on hard surfaces
    this.#gravelFilter = context.createBiquadFilter();
    this.#gravelFilter.type = 'bandpass';
    this.#gravelFilter.frequency.value = 4200;
    this.#gravelFilter.Q.value = 3.2;

    this.#gravelGain = context.createGain();
    this.#gravelGain.gain.value = 0;

    this.#gravelNoise = context.createBufferSource();
    this.#gravelNoise.buffer = noiseBuffer;
    this.#gravelNoise.loop = true;
    this.#gravelNoise.connect(this.#gravelFilter);
    this.#gravelFilter.connect(this.#gravelGain);
    this.#gravelGain.connect(this.#output);
    this.#gravelNoise.start();
  }

  update(state: DrivingState): void {
    const now = this.#context.currentTime;
    const speedNorm = Math.min(state.speed / 30, 1);

    // ── Skid audio ──
    // Activates when drifting or braking hard at speed, proportional to lateral slip
    const lateralSlip = Math.min(Math.abs(state.lateralSpeed) / 12, 1);
    const driftFactor = state.isDrifting ? 0.7 + lateralSlip * 0.3 : 0;
    const brakeFactor = state.isBraking && state.speed > 4 ? 0.4 * speedNorm : 0;
    const skidIntensity = Math.min(driftFactor + brakeFactor, 1) * (state.isGrounded ? 1 : 0);

    // Surface affects skid character — softer surfaces have muted skid
    const skidSurfaceMult =
      state.surface === 'snow' ? 0.4 :
      state.surface === 'sand' ? 0.5 :
      state.surface === 'water' ? 0.3 :
      state.surface === 'grass' ? 0.65 :
      1.0;

    const skidTarget = skidIntensity * skidSurfaceMult * 0.06;
    this.#skidGain.gain.setTargetAtTime(skidTarget, now, 0.06);

    // Shift skid frequency based on speed: faster = higher pitched
    const skidFreq = 2200 + speedNorm * 1800 + lateralSlip * 600;
    this.#skidFilter.frequency.setTargetAtTime(skidFreq, now, 0.08);
    // Widen Q when drifting hard for a fuller screech
    this.#skidFilter.Q.setTargetAtTime(1.2 + lateralSlip * 1.4, now, 0.08);

    // ── Rumble audio ──
    // Continuous low-frequency rolling noise, louder at higher speed
    const rumbleProfile = SURFACE_RUMBLE[state.surface];
    const rumbleTarget = state.isGrounded
      ? rumbleProfile.gain * speedNorm * (1 + (state.isDrifting ? 0.3 : 0))
      : 0;
    this.#rumbleGain.gain.setTargetAtTime(rumbleTarget, now, 0.10);
    this.#rumbleFilter.frequency.setTargetAtTime(
      rumbleProfile.freq + speedNorm * 80,
      now,
      0.12,
    );
    this.#rumbleFilter.Q.setTargetAtTime(rumbleProfile.q, now, 0.12);

    // ── Gravel patter ──
    // Only audible on hard surfaces (rock, dirt with road influence) at speed
    const gravelSurfaces = state.surface === 'rock' || state.surface === 'dirt';
    const gravelTarget = gravelSurfaces && state.isGrounded
      ? (state.surface === 'rock' ? 0.022 : 0.012) * speedNorm
      : 0;
    this.#gravelGain.gain.setTargetAtTime(gravelTarget, now, 0.08);
    // Gravel patter pitch rises with speed
    this.#gravelFilter.frequency.setTargetAtTime(
      3400 + speedNorm * 2800,
      now,
      0.10,
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
