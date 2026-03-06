import type { ShellMode } from '../core/AppShell';
import type { DriveSurface, DrivingState } from '../vehicle/DrivingState';

export interface AmbientAudioState {
  rainDensity: number;
  routeActivity: number;
  windExposure: number;
  relayProximity: number;
  summitProximity: number;
  arrivalPulse: number;
}

interface EngineAudioDebug {
  active: boolean;
  contextState: string;
  masterGain: number;
  rpm: number;
  surface: DriveSurface;
  speedKmh: number;
  windGain: number;
  rainGain: number;
  relayGain: number;
  buzzGain: number;
  arrivalCue: number;
  relayProximity: number;
  summitProximity: number;
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
  #windGain: GainNode | null = null;
  #windFilter: BiquadFilterNode | null = null;
  #rainGain: GainNode | null = null;
  #rainFilter: BiquadFilterNode | null = null;
  #relayHumGain: GainNode | null = null;
  #relayBuzzGain: GainNode | null = null;
  #relayBuzzFilter: BiquadFilterNode | null = null;
  #arrivalCueGain: GainNode | null = null;
  #idleOsc: OscillatorNode | null = null;
  #mainOsc: OscillatorNode | null = null;
  #harmonicOsc: OscillatorNode | null = null;
  #boostOsc: OscillatorNode | null = null;
  #relayHumOsc: OscillatorNode | null = null;
  #relayBuzzOsc: OscillatorNode | null = null;
  #arrivalCueOsc: OscillatorNode | null = null;
  #arrivalCueHarmonic: OscillatorNode | null = null;
  #surfaceNoise: AudioBufferSourceNode | null = null;
  #windNoise: AudioBufferSourceNode | null = null;
  #rainNoise: AudioBufferSourceNode | null = null;
  #debug: EngineAudioDebug = {
    active: false,
    contextState: 'uninitialized',
    masterGain: 0,
    rpm: 0,
    surface: 'dirt',
    speedKmh: 0,
    windGain: 0,
    rainGain: 0,
    relayGain: 0,
    buzzGain: 0,
    arrivalCue: 0,
    relayProximity: 0,
    summitProximity: 0,
  };
  #arrivalCueEndsAt = 0;

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

  update(state: DrivingState, mode: ShellMode, ambient: AmbientAudioState): void {
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
      !this.#windGain ||
      !this.#windFilter ||
      !this.#rainGain ||
      !this.#rainFilter ||
      !this.#relayHumGain ||
      !this.#relayBuzzGain ||
      !this.#relayBuzzFilter ||
      !this.#arrivalCueGain ||
      !this.#idleOsc ||
      !this.#mainOsc ||
      !this.#harmonicOsc ||
      !this.#boostOsc ||
      !this.#relayHumOsc ||
      !this.#relayBuzzOsc ||
      !this.#arrivalCueOsc ||
      !this.#arrivalCueHarmonic
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
    const worldMix = mode === 'arrived' ? 0.86 : mode === 'driving' ? 1 : 0.44;
    const masterTarget = active ? 0.25 : 0;
    const engineTarget = driveMix * (0.02 + load * 0.095);
    const idleTarget = active ? 0.028 + (mode === 'arrived' ? 0.02 : 0) : 0;
    const harmonicTarget = driveMix * (0.008 + load * 0.045);
    const surfaceProfile = SURFACE_NOISE[state.surface];
    const tractionNoise = driveMix
      * surfaceProfile.gain
      * Math.min(speedNorm * 1.2 + (state.isDrifting ? 0.3 : 0) + (state.isBraking ? 0.18 : 0), 1.4);
    const boostTarget = mode === 'driving' && state.isBoosting ? 0.02 + speedNorm * 0.03 : 0;

    const windTarget = worldMix
      * (0.008
        + ambient.routeActivity * 0.01
        + ambient.windExposure * 0.038
        + Math.min(speedNorm, 1.2) * 0.012);
    const rainTarget = worldMix
      * ambient.rainDensity
      * (0.01 + Math.min(speedNorm, 1.1) * 0.012 + (mode === 'arrived' ? 0.004 : 0));
    const relayTarget = worldMix
      * (0.003 + ambient.relayProximity * 0.02 + ambient.summitProximity * 0.04);
    const buzzTarget = worldMix
      * (ambient.relayProximity * 0.009
        + ambient.summitProximity * 0.017
        + ambient.arrivalPulse * 0.02);

    this.#masterGain.gain.setTargetAtTime(masterTarget, now, 0.12);
    this.#engineGain.gain.setTargetAtTime(engineTarget, now, 0.08);
    this.#idleGain.gain.setTargetAtTime(idleTarget, now, 0.12);
    this.#harmonicGain.gain.setTargetAtTime(harmonicTarget, now, 0.08);
    this.#surfaceGain.gain.setTargetAtTime(tractionNoise, now, 0.1);
    this.#boostGain.gain.setTargetAtTime(boostTarget, now, 0.08);
    this.#windGain.gain.setTargetAtTime(windTarget, now, 0.18);
    this.#rainGain.gain.setTargetAtTime(rainTarget, now, 0.14);
    this.#relayHumGain.gain.setTargetAtTime(relayTarget, now, 0.12);
    this.#relayBuzzGain.gain.setTargetAtTime(buzzTarget, now, 0.09);

    this.#idleOsc.frequency.setTargetAtTime(idleFrequency, now, 0.08);
    this.#mainOsc.frequency.setTargetAtTime(engineFrequency, now, 0.06);
    this.#harmonicOsc.frequency.setTargetAtTime(harmonicFrequency, now, 0.06);
    this.#boostOsc.frequency.setTargetAtTime(boostFrequency, now, 0.05);
    this.#relayHumOsc.frequency.setTargetAtTime(
      56 + ambient.summitProximity * 26 + ambient.arrivalPulse * 12,
      now,
      0.12,
    );
    this.#relayBuzzOsc.frequency.setTargetAtTime(
      138 + ambient.relayProximity * 72 + ambient.summitProximity * 68,
      now,
      0.08,
    );

    this.#engineFilter.frequency.setTargetAtTime(240 + load * 1350, now, 0.08);
    this.#engineFilter.Q.setTargetAtTime(0.8 + load * 1.1, now, 0.08);
    this.#surfaceFilter.frequency.setTargetAtTime(
      surfaceProfile.frequency + speedNorm * 260,
      now,
      0.1,
    );
    this.#surfaceFilter.Q.setTargetAtTime(surfaceProfile.q, now, 0.1);
    this.#windFilter.frequency.setTargetAtTime(
      260 + ambient.windExposure * 900 + speedNorm * 220,
      now,
      0.18,
    );
    this.#rainFilter.frequency.setTargetAtTime(
      1700 + ambient.rainDensity * 2100 + speedNorm * 260,
      now,
      0.16,
    );
    this.#relayBuzzFilter.frequency.setTargetAtTime(
      520 + ambient.summitProximity * 520,
      now,
      0.1,
    );
    this.#relayBuzzFilter.Q.setTargetAtTime(
      3.2 + ambient.relayProximity * 2.2 + ambient.arrivalPulse,
      now,
      0.1,
    );

    this.#debug = {
      active,
      contextState: this.#context.state,
      masterGain: masterTarget,
      rpm,
      surface: state.surface,
      speedKmh: Math.round(state.speed * 3.6),
      windGain: windTarget,
      rainGain: rainTarget,
      relayGain: relayTarget,
      buzzGain: buzzTarget,
      arrivalCue: Math.max(0, Math.min(1, (this.#arrivalCueEndsAt - now) / 1.6)),
      relayProximity: Number(ambient.relayProximity.toFixed(2)),
      summitProximity: Number(ambient.summitProximity.toFixed(2)),
    };
  }

  triggerArrivalCue(): void {
    if (
      !this.#context ||
      !this.#arrivalCueGain ||
      !this.#arrivalCueOsc ||
      !this.#arrivalCueHarmonic
    ) {
      return;
    }

    const now = this.#context.currentTime;
    this.#arrivalCueEndsAt = now + 1.6;

    this.#arrivalCueGain.gain.cancelScheduledValues(now);
    this.#arrivalCueGain.gain.setValueAtTime(0.0001, now);
    this.#arrivalCueGain.gain.linearRampToValueAtTime(0.1, now + 0.05);
    this.#arrivalCueGain.gain.exponentialRampToValueAtTime(0.042, now + 0.38);
    this.#arrivalCueGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.55);

    this.#arrivalCueOsc.frequency.cancelScheduledValues(now);
    this.#arrivalCueOsc.frequency.setValueAtTime(280, now);
    this.#arrivalCueOsc.frequency.exponentialRampToValueAtTime(640, now + 0.34);
    this.#arrivalCueOsc.frequency.exponentialRampToValueAtTime(210, now + 1.5);

    this.#arrivalCueHarmonic.frequency.cancelScheduledValues(now);
    this.#arrivalCueHarmonic.frequency.setValueAtTime(420, now);
    this.#arrivalCueHarmonic.frequency.exponentialRampToValueAtTime(860, now + 0.28);
    this.#arrivalCueHarmonic.frequency.exponentialRampToValueAtTime(320, now + 1.45);
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
    this.#windGain = null;
    this.#windFilter = null;
    this.#rainGain = null;
    this.#rainFilter = null;
    this.#relayHumGain = null;
    this.#relayBuzzGain = null;
    this.#relayBuzzFilter = null;
    this.#arrivalCueGain = null;
    this.#idleOsc = null;
    this.#mainOsc = null;
    this.#harmonicOsc = null;
    this.#boostOsc = null;
    this.#relayHumOsc = null;
    this.#relayBuzzOsc = null;
    this.#arrivalCueOsc = null;
    this.#arrivalCueHarmonic = null;
    this.#surfaceNoise = null;
    this.#windNoise = null;
    this.#rainNoise = null;
    this.#debug.contextState = 'disposed';
    this.#debug.active = false;
    this.#arrivalCueEndsAt = 0;

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
    const noiseBuffer = this.#createNoiseBuffer(context);

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

    const windFilter = context.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 520;
    windFilter.Q.value = 0.6;

    const windGain = context.createGain();
    windGain.gain.value = 0;

    const rainFilter = context.createBiquadFilter();
    rainFilter.type = 'highpass';
    rainFilter.frequency.value = 2200;
    rainFilter.Q.value = 0.6;

    const rainGain = context.createGain();
    rainGain.gain.value = 0;

    const relayHumGain = context.createGain();
    relayHumGain.gain.value = 0;

    const relayBuzzFilter = context.createBiquadFilter();
    relayBuzzFilter.type = 'bandpass';
    relayBuzzFilter.frequency.value = 760;
    relayBuzzFilter.Q.value = 3.8;

    const relayBuzzGain = context.createGain();
    relayBuzzGain.gain.value = 0;

    const arrivalCueFilter = context.createBiquadFilter();
    arrivalCueFilter.type = 'bandpass';
    arrivalCueFilter.frequency.value = 540;
    arrivalCueFilter.Q.value = 2.6;

    const arrivalCueGain = context.createGain();
    arrivalCueGain.gain.value = 0.0001;

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

    const relayHumOsc = context.createOscillator();
    relayHumOsc.type = 'sine';
    relayHumOsc.frequency.value = 62;
    relayHumOsc.connect(relayHumGain);

    const relayBuzzOsc = context.createOscillator();
    relayBuzzOsc.type = 'sawtooth';
    relayBuzzOsc.frequency.value = 160;
    relayBuzzOsc.connect(relayBuzzFilter);
    relayBuzzFilter.connect(relayBuzzGain);

    const arrivalCueOsc = context.createOscillator();
    arrivalCueOsc.type = 'triangle';
    arrivalCueOsc.frequency.value = 320;
    arrivalCueOsc.connect(arrivalCueFilter);

    const arrivalCueHarmonic = context.createOscillator();
    arrivalCueHarmonic.type = 'sine';
    arrivalCueHarmonic.frequency.value = 480;
    arrivalCueHarmonic.connect(arrivalCueFilter);

    arrivalCueFilter.connect(arrivalCueGain);

    const surfaceNoise = context.createBufferSource();
    surfaceNoise.buffer = noiseBuffer;
    surfaceNoise.loop = true;
    surfaceNoise.connect(surfaceFilter);
    surfaceFilter.connect(surfaceGain);

    const windNoise = context.createBufferSource();
    windNoise.buffer = noiseBuffer;
    windNoise.loop = true;
    windNoise.connect(windFilter);
    windFilter.connect(windGain);

    const rainNoise = context.createBufferSource();
    rainNoise.buffer = noiseBuffer;
    rainNoise.loop = true;
    rainNoise.connect(rainFilter);
    rainFilter.connect(rainGain);

    engineFilter.connect(masterGain);
    surfaceGain.connect(masterGain);
    boostGain.connect(masterGain);
    windGain.connect(masterGain);
    rainGain.connect(masterGain);
    relayHumGain.connect(masterGain);
    relayBuzzGain.connect(masterGain);
    arrivalCueGain.connect(masterGain);
    masterGain.connect(compressor);
    compressor.connect(context.destination);

    idleOsc.start();
    mainOsc.start();
    harmonicOsc.start();
    boostOsc.start();
    relayHumOsc.start();
    relayBuzzOsc.start();
    arrivalCueOsc.start();
    arrivalCueHarmonic.start();
    surfaceNoise.start();
    windNoise.start();
    rainNoise.start();

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
    this.#windGain = windGain;
    this.#windFilter = windFilter;
    this.#rainGain = rainGain;
    this.#rainFilter = rainFilter;
    this.#relayHumGain = relayHumGain;
    this.#relayBuzzGain = relayBuzzGain;
    this.#relayBuzzFilter = relayBuzzFilter;
    this.#arrivalCueGain = arrivalCueGain;
    this.#idleOsc = idleOsc;
    this.#mainOsc = mainOsc;
    this.#harmonicOsc = harmonicOsc;
    this.#boostOsc = boostOsc;
    this.#relayHumOsc = relayHumOsc;
    this.#relayBuzzOsc = relayBuzzOsc;
    this.#arrivalCueOsc = arrivalCueOsc;
    this.#arrivalCueHarmonic = arrivalCueHarmonic;
    this.#surfaceNoise = surfaceNoise;
    this.#windNoise = windNoise;
    this.#rainNoise = rainNoise;
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
