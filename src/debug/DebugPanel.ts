import type { GameTuningStore } from '../config/GameTuning';
import type { ScenarioFixtureId } from '../gameplay/ScenarioFixtures';
import type { RenderDebugViewId } from '../render/RenderDebugView';

export interface DebugScenarioOption {
  id: ScenarioFixtureId;
  label: string;
}

export interface DebugRenderViewOption {
  id: RenderDebugViewId;
  label: string;
}

export interface DebugTelemetrySnapshot {
  mode: string;
  speedLabel: string;
  surfaceLabel: string;
  mapLabel: string;
  weatherLabel: string;
  streamingLabel: string;
  renderLabel: string;
}

interface RangeControl {
  input: HTMLInputElement;
  value: HTMLSpanElement;
  read: () => number;
  write: (value: number) => void;
  format: (value: number) => string;
}

export class DebugPanel {
  readonly #store: GameTuningStore;
  readonly #root: HTMLDivElement;
  readonly #telemetryMode: HTMLSpanElement;
  readonly #telemetrySpeed: HTMLSpanElement;
  readonly #telemetrySurface: HTMLSpanElement;
  readonly #telemetryMap: HTMLSpanElement;
  readonly #telemetryWeather: HTMLSpanElement;
  readonly #telemetryStreaming: HTMLSpanElement;
  readonly #telemetryRender: HTMLSpanElement;
  readonly #controls: RangeControl[];
  readonly #renderButtons: Map<RenderDebugViewId, HTMLButtonElement>;
  #visible = false;

  constructor(
    root: HTMLElement,
    store: GameTuningStore,
    scenarios: DebugScenarioOption[],
    renderViews: DebugRenderViewOption[],
    onScenario: (id: ScenarioFixtureId) => void,
    onRenderView: (id: RenderDebugViewId) => void,
  ) {
    this.#store = store;
    this.#root = document.createElement('div');
    this.#root.className = 'debug-panel';
    this.#root.hidden = true;
    this.#root.innerHTML = `
      <div class="debug-panel__card">
        <div class="debug-panel__header">
          <div>
            <div class="debug-panel__kicker">Debug Panel</div>
            <h2 class="debug-panel__title">Live Tuning</h2>
          </div>
          <div class="debug-panel__hint">\` show or hide  [ ] switch views</div>
        </div>
        <div class="debug-panel__telemetry">
          <div><span>Mode</span><strong data-debug-value="mode">title</strong></div>
          <div><span>Speed</span><strong data-debug-value="speed">0 km/h</strong></div>
          <div><span>Surface</span><strong data-debug-value="surface">dirt</strong></div>
          <div><span>Map coverage</span><strong data-debug-value="map">0% mapped</strong></div>
          <div><span>Weather</span><strong data-debug-value="weather">Cloudy</strong></div>
          <div><span>World activity</span><strong data-debug-value="streaming">route 1.00</strong></div>
          <div><span>Render view</span><strong data-debug-value="render">Final Grade</strong></div>
        </div>
        <div class="debug-panel__section-label">Render View</div>
        <div class="debug-panel__render-views">
          ${renderViews
            .map(
              (view) =>
                `<button type="button" data-render-view="${view.id}">${view.label}</button>`,
            )
            .join('')}
        </div>
        <div class="debug-panel__controls">
          ${this.#rangeMarkup('speed-scale', 'Top speed', 0.8, 1.45, 0.01)}
          ${this.#rangeMarkup('accel-scale', 'Acceleration', 0.8, 1.4, 0.01)}
          ${this.#rangeMarkup('grip-scale', 'Grip', 0.7, 1.4, 0.01)}
          ${this.#rangeMarkup('yaw-scale', 'Yaw damping', 0.7, 1.4, 0.01)}
          ${this.#rangeMarkup('sink-scale', 'Sand sink', 0.6, 1.45, 0.01)}
          ${this.#rangeMarkup('rain-scale', 'Rain density', 0, 1.6, 0.01)}
          ${this.#rangeMarkup('fog-scale', 'Fog distance', 0.55, 1.55, 0.01)}
          ${this.#rangeMarkup('camera-distance', 'Camera distance', -4, 4, 0.1)}
          ${this.#rangeMarkup('camera-height', 'Camera height', -2, 3, 0.1)}
        </div>
        <div class="debug-panel__actions">
          <button type="button" data-debug-action="reset">Reset tuning</button>
        </div>
        <div class="debug-panel__section-label">Test Scenarios</div>
        <div class="debug-panel__scenarios">
          ${scenarios
            .map(
              (scenario) =>
                `<button type="button" data-scenario-id="${scenario.id}">${scenario.label}</button>`,
            )
            .join('')}
        </div>
      </div>
    `;

    root.append(this.#root);

    this.#telemetryMode = this.#query('[data-debug-value="mode"]');
    this.#telemetrySpeed = this.#query('[data-debug-value="speed"]');
    this.#telemetrySurface = this.#query('[data-debug-value="surface"]');
    this.#telemetryMap = this.#query('[data-debug-value="map"]');
    this.#telemetryWeather = this.#query('[data-debug-value="weather"]');
    this.#telemetryStreaming = this.#query('[data-debug-value="streaming"]');
    this.#telemetryRender = this.#query('[data-debug-value="render"]');

    const resetButton = this.#query<HTMLButtonElement>('[data-debug-action="reset"]');
    resetButton.addEventListener('click', () => {
      this.#store.reset();
      this.syncFromTuning();
    });

    const scenarioButtons = Array.from(
      this.#root.querySelectorAll<HTMLButtonElement>('[data-scenario-id]'),
    );
    for (const button of scenarioButtons) {
      button.addEventListener('click', () => {
        const id = button.dataset.scenarioId as ScenarioFixtureId | undefined;
        if (!id) return;
        onScenario(id);
      });
    }

    const renderButtons = Array.from(
      this.#root.querySelectorAll<HTMLButtonElement>('[data-render-view]'),
    );
    this.#renderButtons = new Map(
      renderButtons.flatMap((button) => {
        const id = button.dataset.renderView as RenderDebugViewId | undefined;
        if (!id) return [];
        button.addEventListener('click', () => {
          onRenderView(id);
        });
        return [[id, button] as const];
      }),
    );

    this.#controls = [
      this.#createRangeControl(
        'speed-scale',
        () => this.#store.values.vehicle.speedMultiplier,
        (value) => {
          this.#store.values.vehicle.speedMultiplier = value;
        },
        (value) => `${Math.round(value * 100)}%`,
      ),
      this.#createRangeControl(
        'accel-scale',
        () => this.#store.values.vehicle.accelerationMultiplier,
        (value) => {
          this.#store.values.vehicle.accelerationMultiplier = value;
        },
        (value) => `${Math.round(value * 100)}%`,
      ),
      this.#createRangeControl(
        'grip-scale',
        () => this.#store.values.vehicle.gripMultiplier,
        (value) => {
          this.#store.values.vehicle.gripMultiplier = value;
        },
        (value) => `${Math.round(value * 100)}%`,
      ),
      this.#createRangeControl(
        'yaw-scale',
        () => this.#store.values.vehicle.yawDampingMultiplier,
        (value) => {
          this.#store.values.vehicle.yawDampingMultiplier = value;
        },
        (value) => `${Math.round(value * 100)}%`,
      ),
      this.#createRangeControl(
        'sink-scale',
        () => this.#store.values.vehicle.sinkDepthMultiplier,
        (value) => {
          this.#store.values.vehicle.sinkDepthMultiplier = value;
        },
        (value) => `${Math.round(value * 100)}%`,
      ),
      this.#createRangeControl(
        'rain-scale',
        () => this.#store.values.weather.rainDensity,
        (value) => {
          this.#store.values.weather.rainDensity = value;
        },
        (value) => `${value.toFixed(2)}x`,
      ),
      this.#createRangeControl(
        'fog-scale',
        () => this.#store.values.weather.fogDistanceMultiplier,
        (value) => {
          this.#store.values.weather.fogDistanceMultiplier = value;
        },
        (value) => `${value.toFixed(2)}x`,
      ),
      this.#createRangeControl(
        'camera-distance',
        () => this.#store.values.camera.drive.distanceOffset,
        (value) => {
          this.#store.values.camera.drive.distanceOffset = value;
        },
        (value) => `${value.toFixed(1)} m`,
      ),
      this.#createRangeControl(
        'camera-height',
        () => this.#store.values.camera.drive.heightOffset,
        (value) => {
          this.#store.values.camera.drive.heightOffset = value;
        },
        (value) => `${value.toFixed(1)} m`,
      ),
    ];

    this.syncFromTuning();
    this.setRenderView(renderViews[0]?.id ?? 'final');
  }

  toggle(): boolean {
    this.setVisible(!this.#visible);
    return this.#visible;
  }

  setVisible(visible: boolean): void {
    this.#visible = visible;
    this.#root.hidden = !visible;
    document.body.classList.toggle('debug-open', visible);
  }

  get visible(): boolean {
    return this.#visible;
  }

  syncFromTuning(): void {
    for (const control of this.#controls) {
      const value = control.read();
      control.input.value = String(value);
      control.value.textContent = control.format(value);
    }
  }

  updateTelemetry(snapshot: DebugTelemetrySnapshot): void {
    this.#telemetryMode.textContent = snapshot.mode;
    this.#telemetrySpeed.textContent = snapshot.speedLabel;
    this.#telemetrySurface.textContent = snapshot.surfaceLabel;
    this.#telemetryMap.textContent = snapshot.mapLabel;
    this.#telemetryWeather.textContent = snapshot.weatherLabel;
    this.#telemetryStreaming.textContent = snapshot.streamingLabel;
    this.#telemetryRender.textContent = snapshot.renderLabel;
  }

  setRenderView(view: RenderDebugViewId): void {
    for (const [id, button] of this.#renderButtons) {
      button.classList.toggle('is-active', id === view);
    }
  }

  #createRangeControl(
    key: string,
    read: () => number,
    write: (value: number) => void,
    format: (value: number) => string,
  ): RangeControl {
    const input = this.#query<HTMLInputElement>(`input[data-debug-range="${key}"]`);
    const value = this.#query<HTMLSpanElement>(`[data-debug-display="${key}"]`);
    const control: RangeControl = { input, value, read, write, format };
    input.addEventListener('input', () => {
      const nextValue = Number(input.value);
      control.write(nextValue);
      value.textContent = format(nextValue);
    });
    return control;
  }

  #rangeMarkup(
    key: string,
    label: string,
    min: number,
    max: number,
    step: number,
  ): string {
    return `
      <label class="debug-panel__range">
        <div class="debug-panel__range-topline">
          <span>${label}</span>
          <strong data-debug-display="${key}"></strong>
        </div>
        <input
          data-debug-range="${key}"
          type="range"
          min="${min}"
          max="${max}"
          step="${step}"
          value="${min}"
        />
      </label>
    `;
  }

  #query<T extends Element = HTMLSpanElement>(selector: string): T {
    const element = this.#root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Missing debug panel element: ${selector}`);
    }
    return element;
  }
}
