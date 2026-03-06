import type { ShellMode } from '../core/AppShell';
import type { DriveSurface, DrivingState } from '../vehicle/DrivingState';

interface EngineAudioDebug {
  active: boolean;
  contextState: string;
  masterGain: number;
  rpm: number;
  surface: DriveSurface;
  speedKmh: number;
}

const SURFACE_NOISE: Record<DriveSurface, { gain: number; frequency: number; q: number }> = {
  dirt: { gain: 0.035, frequency: 680, q: 0.9 },
  sand: { gain: 0.048, frequency: 520, q: 0.75 },
  grass: { gain: 0.028, frequency: 900, q: 1.1 },
  rock: { gain: 0.042, frequency: 1180, q: 1.35 },
  snow: { gain: 0.052, frequency: 1450, q: 1.5 },
  water: { gain: 0.07, frequency: 420, q: 0.65 },
};

export class EngineAudio {
  #context: AudioContext | null = null;
  #masterGain: GainNode | null = null;
  #compressor: DynamicsCompressorNode | null = null;
  #engineGain: GainNode | null = null;
  #idleGain: GainNode | null = null;
  #harmonicGain: GainNode | null = null;
  #surfaceGain: GainNode | null = null;
  #surfaceFilter: BiquadFilterNode | null = null;
  #boostGain: GainNode | null = null;
  #engineFilter: BiquadFilterNode | null = null;
  #idleOsc: OscillatorNode | null = null;
  #mainOsc: OscillatorNode | null = null;
  #harmonicOsc: OscillatorNode | null = null;
  #boostOsc: OscillatorNode | null = null;
  #surfaceNoise: AudioBufferSourceNode | null = null;
  #debug: EngineAudioDebug = {
    active: false,
    contextState: 'uninitialized',
    masterGain: 0,
    rpm: 0,
    surface: 'dirt',
    speedKmh: 0,
  };

  async activate(): Promise<void> {
    this.#ensureGraph();
    if (!this.#context) return;

    try {
      if (this.#context.state !== 'running') {
        await this.#context.resume();
      }
    } catch (error) {
      console.warn('Engine audio resume failed.', error);
    }

    this.#debug.contextState = this.#context.state;
  }

  update(state: DrivingState, mode: ShellMode): void {
    if (
      !this.#context ||
      !this.#masterGain ||
      !this.#engineGain ||
      !this.#idleGain ||
      !this.#harmonicGain ||
      !this.#surfaceGain ||
      !this.#surfaceFilter ||
      !this.#boostGain ||
      !this.#engineFilter ||
      !this.#idleOsc ||
      !this.#mainOsc ||
      !this.#harmonicOsc ||
      !this.#boostOsc
    ) {
      return;
    }

    const now = this.#context.currentTime;
    const active = mode !== 'title';
    const throttle = Math.abs(state.throttle);
    const speedNorm = Math.min(state.speed / 30, 1.4);
    const load = Math.min(speedNorm * 0.62 + throttle * 0.3 + (state.isBoosting ? 0.24 : 0), 1.5);
    const rpm = Math.min(0.18 + speedNorm * 0.66 + throttle * 0.26 + (state.isBoosting ? 0.18 : 0), 1.6);
    const engineFrequency = 34 + rpm * 96;
    const harmonicFrequency = engineFrequency * 2.03;
    const idleFrequency = 24 + rpm * 28;
    const boostFrequency = 220 + speedNorm * 330 + throttle * 60;
    const arrivalIdle = mode === 'arrived' ? 0.75 : 0;
    const driveMix = mode === 'driving' ? 1 : arrivalIdle;
    const masterTarget = active ? 0.22 : 0;
    const engineTarget = driveMix * (0.02 + load * 0.095);
    const idleTarget = active ? 0.028 + (mode === 'arrived' ? 0.02 : 0) : 0;
    const harmonicTarget = driveMix * (0.008 + load * 0.045);
    const surfaceProfile = SURFACE_NOISE[state.surface];
    const tractionNoise = driveMix
      * surfaceProfile.gain
      * Math.min(speedNorm * 1.2 + (state.isDrifting ? 0.3 : 0) + (state.isBraking ? 0.18 : 0), 1.4);
    const boostTarget = mode === 'driving' && state.isBoosting ? 0.02 + speedNorm * 0.03 : 0;

    this.#masterGain.gain.setTargetAtTime(masterTarget, now, 0.12);
    this.#engineGain.gain.setTargetAtTime(engineTarget, now, 0.08);
    this.#idleGain.gain.setTargetAtTime(idleTarget, now, 0.12);
    this.#harmonicGain.gain.setTargetAtTime(harmonicTarget, now, 0.08);
    this.#surfaceGain.gain.setTargetAtTime(tractionNoise, now, 0.1);
    this.#boostGain.gain.setTargetAtTime(boostTarget, now, 0.08);

    this.#idleOsc.frequency.setTargetAtTime(idleFrequency, now, 0.08);
    this.#mainOsc.frequency.setTargetAtTime(engineFrequency, now, 0.06);
    this.#harmonicOsc.frequency.setTargetAtTime(harmonicFrequency, now, 0.06);
    this.#boostOsc.frequency.setTargetAtTime(boostFrequency, now, 0.05);

    this.#engineFilter.frequency.setTargetAtTime(240 + load * 1350, now, 0.08);
    this.#engineFilter.Q.setTargetAtTime(0.8 + load * 1.1, now, 0.08);
    this.#surfaceFilter.frequency.setTargetAtTime(
      surfaceProfile.frequency + speedNorm * 260,
      now,
      0.1,
    );
    this.#surfaceFilter.Q.setTargetAtTime(surfaceProfile.q, now, 0.1);

    this.#debug = {
      active,
      contextState: this.#context.state,
      masterGain: masterTarget,
      rpm,
      surface: state.surface,
      speedKmh: Math.round(state.speed * 3.6),
    };
  }

  getDebugState(): EngineAudioDebug {
    return { ...this.#debug };
  }

  dispose(): void {
    const context = this.#context;
    this.#context = null;
    this.#masterGain = null;
    this.#compressor = null;
    this.#engineGain = null;
    this.#idleGain = null;
    this.#harmonicGain = null;
    this.#surfaceGain = null;
    this.#surfaceFilter = null;
    this.#boostGain = null;
    this.#engineFilter = null;
    this.#idleOsc = null;
    this.#mainOsc = null;
    this.#harmonicOsc = null;
    this.#boostOsc = null;
    this.#surfaceNoise = null;
    this.#debug.contextState = 'disposed';
    this.#debug.active = false;

    if (context) {
      void context.close().catch(() => undefined);
    }
  }

  #ensureGraph(): void {
    if (this.#context) return;

    const ContextCtor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ContextCtor) {
      this.#debug.contextState = 'unsupported';
      return;
    }

    const context = new ContextCtor();
    const compressor = context.createDynamicsCompressor();
    compressor.threshold.value = -18;
    compressor.knee.value = 12;
    compressor.ratio.value = 3.2;
    compressor.attack.value = 0.008;
    compressor.release.value = 0.18;

    const masterGain = context.createGain();
    masterGain.gain.value = 0;

    const engineFilter = context.createBiquadFilter();
    engineFilter.type = 'lowpass';
    engineFilter.frequency.value = 420;
    engineFilter.Q.value = 1.1;

    const engineGain = context.createGain();
    engineGain.gain.value = 0;

    const idleGain = context.createGain();
    idleGain.gain.value = 0;

    const harmonicGain = context.createGain();
    harmonicGain.gain.value = 0;

    const surfaceFilter = context.createBiquadFilter();
    surfaceFilter.type = 'bandpass';
    surfaceFilter.frequency.value = 840;
    surfaceFilter.Q.value = 1;

    const surfaceGain = context.createGain();
    surfaceGain.gain.value = 0;

    const boostFilter = context.createBiquadFilter();
    boostFilter.type = 'bandpass';
    boostFilter.frequency.value = 560;
    boostFilter.Q.value = 5.4;

    const boostGain = context.createGain();
    boostGain.gain.value = 0;

    const idleOsc = context.createOscillator();
    idleOsc.type = 'triangle';
    idleOsc.frequency.value = 26;
    idleOsc.connect(idleGain);
    idleGain.connect(engineFilter);

    const mainOsc = context.createOscillator();
    mainOsc.type = 'sawtooth';
    mainOsc.frequency.value = 42;
    mainOsc.connect(engineGain);
    engineGain.connect(engineFilter);

    const harmonicOsc = context.createOscillator();
    harmonicOsc.type = 'square';
    harmonicOsc.frequency.value = 88;
    harmonicOsc.connect(harmonicGain);
    harmonicGain.connect(engineFilter);

    const boostOsc = context.createOscillator();
    boostOsc.type = 'triangle';
    boostOsc.frequency.value = 240;
    boostOsc.connect(boostFilter);
    boostFilter.connect(boostGain);

    const surfaceNoise = context.createBufferSource();
    surfaceNoise.buffer = this.#createNoiseBuffer(context);
    surfaceNoise.loop = true;
    surfaceNoise.connect(surfaceFilter);
    surfaceFilter.connect(surfaceGain);

    engineFilter.connect(masterGain);
    surfaceGain.connect(masterGain);
    boostGain.connect(masterGain);
    masterGain.connect(compressor);
    compressor.connect(context.destination);

    idleOsc.start();
    mainOsc.start();
    harmonicOsc.start();
    boostOsc.start();
    surfaceNoise.start();

    this.#context = context;
    this.#compressor = compressor;
    this.#masterGain = masterGain;
    this.#engineGain = engineGain;
    this.#idleGain = idleGain;
    this.#harmonicGain = harmonicGain;
    this.#surfaceGain = surfaceGain;
    this.#surfaceFilter = surfaceFilter;
    this.#boostGain = boostGain;
    this.#engineFilter = engineFilter;
    this.#idleOsc = idleOsc;
    this.#mainOsc = mainOsc;
    this.#harmonicOsc = harmonicOsc;
    this.#boostOsc = boostOsc;
    this.#surfaceNoise = surfaceNoise;
    this.#debug.contextState = context.state;
  }

  #createNoiseBuffer(context: AudioContext): AudioBuffer {
    const length = context.sampleRate * 2;
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
      channel[index] = (Math.random() * 2 - 1) * 0.35;
    }
    return buffer;
  }
}
