export interface HudSnapshot {
  speedLabel: string;
  tractionLabel: string;
  surfaceLabel: string;
  driveLabel: string;
  landmarkLabel: string;
  boostLabel: string;
  weatherLabel: string;
  weatherCondition: 'cloudy' | 'rainy' | 'sunny';
  routeLabel: string;
}

export interface ArrivalSnapshot {
  timeLabel: string;
  peakSpeedLabel: string;
  boostLabel: string;
  mappedLabel: string;
  relayLabel: string;
  weatherLabel: string;
}

export interface MapLayoutSnapshot {
  worldSize: number;
  discoveryColumns: number;
  discoveryRows: number;
  pathPoints: Array<{ x: number; z: number }>;
  servicePaths: Array<Array<{ x: number; z: number }>>;
  waterPools: Array<{ x: number; z: number; radius: number }>;
  outposts: Array<{ x: number; z: number; objective: boolean }>;
  objective: { x: number; z: number };
  landmark: { x: number; z: number };
  cityCenter: { x: number; z: number };
}

export interface MapRuntimeSnapshot {
  discoveredCells: number[];
  discoveredRatio: number;
  checkpointStates: Array<'pending' | 'current' | 'reached'>;
  pulse: number;
  statusLabel: string;
  weatherCondition: 'cloudy' | 'rainy' | 'sunny';
  vehicle: { x: number; z: number; heading: number };
}

export type ShellMode = 'title' | 'driving' | 'arrived';

interface AppShellElements {
  canvasMount: HTMLDivElement;
  loading: HTMLDivElement;
  title: HTMLDivElement;
  titlePreviewMount: HTMLDivElement;
  startButton: HTMLButtonElement;
  arrival: HTMLDivElement;
  restartButton: HTMLButtonElement;
  pause: HTMLDivElement;
  pauseResumeButton: HTMLButtonElement;
  pauseGodModeButton: HTMLButtonElement;
  pauseRestartButton: HTMLButtonElement;
  titleWeather: HTMLSpanElement;
  titleAudio: HTMLSpanElement;
  arrivalTime: HTMLSpanElement;
  arrivalPeak: HTMLSpanElement;
  arrivalBoost: HTMLSpanElement;
  arrivalMapped: HTMLSpanElement;
  arrivalRelay: HTMLSpanElement;
  arrivalWeather: HTMLSpanElement;
  speed: HTMLSpanElement;
  routeLabel: HTMLDivElement;
  traction: HTMLSpanElement;
  surface: HTMLSpanElement;
  drive: HTMLSpanElement;
  landmark: HTMLSpanElement;
  boost: HTMLSpanElement;
  weather: HTMLSpanElement;
  weatherGlyph: HTMLSpanElement;
  mapDevice: HTMLDivElement;
  mapCanvas: HTMLCanvasElement;
  mapStatus: HTMLSpanElement;
  error: HTMLDivElement;
}

export class AppShell {
  readonly elements: AppShellElements;
  readonly #mapContext: CanvasRenderingContext2D;
  #mapLayout: MapLayoutSnapshot | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="app-shell">
        <div class="game-stage" id="game-stage"></div>

        <div id="loading" class="screen loading-screen" aria-live="polite">
          <div class="loading-card">
            <div class="loading-title">Path</div>
            <div class="loading-copy">loading terrain / weather / relay feed</div>
          </div>
        </div>

        <section
          id="title-screen"
          class="screen title-screen"
          aria-hidden="true"
        >
          <div class="title-card">
            <div class="title-topline">
              <div class="title-kicker">Path</div>
            </div>
            <div class="title-hero">
              <div class="title-copy-block">
                <div class="title-region">tower basin / live weather cycle</div>
                <div class="title-name">Path</div>
                <div class="title-rule"></div>
                <p class="title-copy">
                  Drive the last dirt line below Tower Mountain and bring the
                  summit relay back online.
                </p>
              </div>
              <div class="title-preview-shell" aria-label="Embedded alpha preview">
                <div class="title-preview-topline">
                  <span class="title-preview-kicker">Embedded preview</span>
                  <span class="title-preview-meta">loop / 00:08</span>
                </div>
                <div class="title-preview-frame">
                  <div id="title-alpha-preview" class="title-alpha-preview"></div>
                </div>
                <div class="title-preview-notes">
                  <span>Dirt paths</span>
                  <span>Weather cycle</span>
                  <span>Relay route</span>
                </div>
              </div>
            </div>
            <div class="title-facts">
              <div class="title-fact title-fact--conditions">
                <span class="title-fact-label">Weather</span>
                <span id="title-weather" class="title-fact-value">Cloudy now, rainy next in 1:30</span>
              </div>
              <div class="title-fact title-fact--audio">
                <span class="title-fact-label">Audio</span>
                <span id="title-audio" class="title-fact-value">Tap or press a key to enable</span>
              </div>
              <div class="title-fact title-fact--objective">
                <span class="title-fact-label">Objective</span>
                <span class="title-fact-value">Bring the summit relay online</span>
              </div>
              <div class="title-fact title-fact--terrain">
                <span class="title-fact-label">Terrain</span>
                <span class="title-fact-value">Dirt paths, snow, meltwater</span>
              </div>
            </div>
            <div class="title-actions">
              <button id="start-button" class="start-button" type="button">
                Enter Route
              </button>
              <div class="title-meta">Press Enter, Start, or A</div>
            </div>
            <div class="title-controls">
              <div class="title-controls-heading">Quick keys</div>
              <div class="title-controls-grid">
                <div class="title-control-item">
                  <span>Drive</span>
                  <strong>WASD or arrow keys</strong>
                </div>
                <div class="title-control-item">
                  <span>Brake / boost</span>
                  <strong>S brakes first, Shift slide-brakes, Space boosts</strong>
                </div>
                <div class="title-control-item">
                  <span>Map / menu</span>
                  <strong>M map, Esc menu, R reset</strong>
                </div>
                <div class="title-control-item">
                  <span>View</span>
                  <strong>Drag to orbit, double-click to center, god mode free-flies</strong>
                </div>
                <div class="title-control-item">
                  <span>Gamepad</span>
                  <strong>Left stick steers, RT drives, LT brakes, A boosts</strong>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          id="arrival-screen"
          class="screen arrival-screen"
          aria-hidden="true"
        >
          <div class="arrival-card">
            <div class="arrival-eyebrow">
              <span class="arrival-badge">Relay secured</span>
              <span id="arrival-weather" class="arrival-weather">Cold rain on the ridge</span>
            </div>
            <div class="title-kicker">Summit relay online</div>
            <div class="title-name arrival-name">Tower Mountain</div>
            <div class="title-rule"></div>
            <p class="title-copy">
              The summit line is lit. Run it again and see how much more speed
              you can carry between the basin relays and the final climb.
            </p>
            <div class="arrival-grid">
              <div class="arrival-stat arrival-stat--emphasis">
                <span class="status-label">Run time</span>
                <span id="arrival-time" class="status-value">0:00</span>
              </div>
              <div class="arrival-stat">
                <span class="status-label">Peak speed</span>
                <span id="arrival-peak" class="status-value">0 km/h</span>
              </div>
              <div class="arrival-stat">
                <span class="status-label">Mapped</span>
                <span id="arrival-mapped" class="status-value">0%</span>
              </div>
              <div class="arrival-stat">
                <span class="status-label">Boost left</span>
                <span id="arrival-boost" class="status-value">0%</span>
              </div>
            </div>
            <div class="arrival-footnote">
              <span id="arrival-route" class="arrival-route">Basin line restored</span>
              <span class="arrival-dot"></span>
              <span class="arrival-route-copy">Press Enter to run it back</span>
            </div>
            <div class="title-actions">
              <button id="restart-button" class="start-button" type="button">
                Start Another Run
              </button>
              <div class="title-meta">Press Enter, Start, or A to restart</div>
            </div>
          </div>
        </section>

        <section
          id="pause-screen"
          class="screen pause-screen"
          aria-hidden="true"
          hidden
        >
          <div class="pause-card">
            <div class="pause-eyebrow">Field menu</div>
            <div class="pause-title">Route Paused</div>
            <p class="pause-copy">
              Hold your line, check the weather, or start the basin route over
              from the trailhead.
            </p>
            <div class="pause-actions">
              <button id="pause-resume-button" class="start-button" type="button">
                Resume Drive
              </button>
              <button
                id="pause-god-mode-button"
                class="start-button start-button--secondary"
                type="button"
              >
                Enter God Mode
              </button>
              <button
                id="pause-restart-button"
                class="start-button start-button--secondary"
                type="button"
              >
                Restart Run
              </button>
            </div>
            <div class="pause-meta">Press Esc or Start to close. Esc in god mode returns to drive.</div>
          </div>
        </section>

        <aside id="hud" class="hud" aria-live="polite">
          <div class="hud-panel">
            <div class="hud-main">
              <div class="speed-readout">
                <div class="hud-subtitle">Speed</div>
                <span id="speed" class="speed-value">0 km/h</span>
              </div>
              <div id="hud-route-label" class="hud-subtitle hud-route-label">Route to summit relay</div>
            </div>
            <div class="hud-grid">
              <div class="hud-stack">
                <span class="status-label">Contact</span>
                <span id="status-ground" class="status-value">Grounded</span>
              </div>
              <div class="hud-stack">
                <span class="status-label">Surface</span>
                <span id="status-surface" class="status-value">Dirt</span>
              </div>
              <div class="hud-stack">
                <span class="status-label">Status</span>
                <span id="status-drive" class="status-value">Cruising</span>
              </div>
              <div class="hud-stack hud-stack-objective">
                <span class="status-label status-label--icon"><span class="hud-glyph hud-glyph--relay" aria-hidden="true"></span>Relay</span>
                <span id="status-landmark" class="status-value">0 m away</span>
              </div>
              <div class="hud-stack">
                <span class="status-label">Boost</span>
                <span id="status-boost" class="status-value">Ready</span>
              </div>
              <div class="hud-stack">
                <span class="status-label status-label--icon"><span id="status-weather-glyph" class="hud-glyph hud-glyph--weather" data-condition="cloudy" aria-hidden="true"></span>Weather</span>
                <span id="status-weather" class="status-value">Cloudy</span>
              </div>
            </div>
          </div>
        </aside>

        <aside id="map-device" class="map-device" aria-hidden="true" hidden>
          <div class="map-shell">
            <div class="map-topline">
              <div class="map-led"></div>
              <div class="map-brand">Path</div>
            </div>
            <div class="map-screen-wrap">
              <canvas
                id="map-canvas"
                class="map-screen"
                width="176"
                height="160"
              ></canvas>
            </div>
            <div class="map-footer">
              <span id="map-status" class="map-status">Summit relay 0 m away</span>
              <span class="map-meta">M or Y closes</span>
            </div>
            <div class="map-controls">
              <div class="map-dpad">
                <span></span><span></span><span></span><span></span>
              </div>
              <div class="map-buttons">
                <span>A</span>
                <span>B</span>
              </div>
            </div>
          </div>
        </aside>

        <div class="error-banner" hidden></div>
      </div>
    `;

    this.elements = {
      canvasMount: this.#query(root, '#game-stage'),
      loading: this.#query(root, '#loading'),
      title: this.#query(root, '#title-screen'),
      titlePreviewMount: this.#query(root, '#title-alpha-preview'),
      startButton: this.#query(root, '#start-button'),
      arrival: this.#query(root, '#arrival-screen'),
      restartButton: this.#query(root, '#restart-button'),
      pause: this.#query(root, '#pause-screen'),
      pauseResumeButton: this.#query(root, '#pause-resume-button'),
      pauseGodModeButton: this.#query(root, '#pause-god-mode-button'),
      pauseRestartButton: this.#query(root, '#pause-restart-button'),
      titleWeather: this.#query(root, '#title-weather'),
      titleAudio: this.#query(root, '#title-audio'),
      arrivalTime: this.#query(root, '#arrival-time'),
      arrivalPeak: this.#query(root, '#arrival-peak'),
      arrivalBoost: this.#query(root, '#arrival-boost'),
      arrivalMapped: this.#query(root, '#arrival-mapped'),
      arrivalRelay: this.#query(root, '#arrival-route'),
      arrivalWeather: this.#query(root, '#arrival-weather'),
      speed: this.#query(root, '#speed'),
      routeLabel: this.#query(root, '#hud-route-label'),
      traction: this.#query(root, '#status-ground'),
      surface: this.#query(root, '#status-surface'),
      drive: this.#query(root, '#status-drive'),
      landmark: this.#query(root, '#status-landmark'),
      boost: this.#query(root, '#status-boost'),
      weather: this.#query(root, '#status-weather'),
      weatherGlyph: this.#query(root, '#status-weather-glyph'),
      mapDevice: this.#query(root, '#map-device'),
      mapCanvas: this.#query(root, '#map-canvas'),
      mapStatus: this.#query(root, '#map-status'),
      error: this.#query(root, '.error-banner'),
    };

    const mapContext = this.elements.mapCanvas.getContext('2d');
    if (!mapContext) {
      throw new Error('Unable to create map canvas context.');
    }
    this.#mapContext = mapContext;
    this.#drawMap(null);
  }

  mountCanvas(canvas: HTMLCanvasElement): void {
    this.elements.canvasMount.replaceChildren(canvas);
  }

  setLoadingVisible(visible: boolean): void {
    this.elements.loading.hidden = !visible;
  }

  setTitleVisible(visible: boolean): void {
    if (!visible && this.elements.title.contains(document.activeElement)) {
      (document.activeElement as HTMLElement | null)?.blur();
    }
    this.elements.title.classList.toggle('visible', visible);
    this.elements.title.setAttribute('aria-hidden', String(!visible));
  }

  setArrivalVisible(visible: boolean): void {
    if (!visible && this.elements.arrival.contains(document.activeElement)) {
      (document.activeElement as HTMLElement | null)?.blur();
    }
    this.elements.arrival.classList.toggle('visible', visible);
    this.elements.arrival.setAttribute('aria-hidden', String(!visible));
  }

  setPauseVisible(visible: boolean): void {
    if (visible) {
      this.elements.pause.hidden = false;
      this.elements.pauseResumeButton.focus();
    } else if (this.elements.pause.contains(document.activeElement)) {
      (document.activeElement as HTMLElement | null)?.blur();
    }

    this.elements.pause.classList.toggle('visible', visible);
    this.elements.pause.hidden = !visible;
    this.elements.pause.setAttribute('aria-hidden', String(!visible));
    document.body.classList.toggle('pause-menu-open', visible);
  }

  setMode(mode: ShellMode): void {
    document.body.classList.toggle('game-started', mode === 'driving');
    document.body.classList.toggle('game-arrived', mode === 'arrived');
  }

  setMapVisible(visible: boolean): void {
    this.elements.mapDevice.hidden = !visible;
    this.elements.mapDevice.classList.toggle('visible', visible);
    this.elements.mapDevice.setAttribute('aria-hidden', String(!visible));
    document.body.classList.toggle('map-open', visible);
  }

  bindStart(handler: () => void): void {
    this.elements.startButton.addEventListener('click', handler);
  }

  bindRestart(handler: () => void): void {
    this.elements.restartButton.addEventListener('click', handler);
  }

  bindPauseResume(handler: () => void): void {
    this.elements.pauseResumeButton.addEventListener('click', handler);
  }

  bindPauseGodMode(handler: () => void): void {
    this.elements.pauseGodModeButton.addEventListener('click', handler);
  }

  bindPauseRestart(handler: () => void): void {
    this.elements.pauseRestartButton.addEventListener('click', handler);
  }

  updateHud(snapshot: HudSnapshot): void {
    this.elements.speed.textContent = snapshot.speedLabel;
    this.elements.traction.textContent = snapshot.tractionLabel;
    this.elements.surface.textContent = snapshot.surfaceLabel;
    this.elements.drive.textContent = snapshot.driveLabel;
    this.elements.landmark.textContent = snapshot.landmarkLabel;
    this.elements.boost.textContent = snapshot.boostLabel;
    this.elements.weather.textContent = snapshot.weatherLabel;
    this.elements.weatherGlyph.dataset.condition = snapshot.weatherCondition;
    this.elements.routeLabel.textContent = snapshot.routeLabel;

    this.elements.traction.dataset.tone =
      snapshot.tractionLabel === 'Airborne' ? 'warn' : 'stable';
    this.elements.surface.dataset.tone =
      snapshot.surfaceLabel === 'Water' ? 'cool' : 'stable';
    this.elements.drive.dataset.tone =
      snapshot.driveLabel === 'Arrived'
        ? 'goal'
        : snapshot.driveLabel.startsWith('Traffic')
          ? 'warn'
        : snapshot.driveLabel === 'Boosting'
          ? 'boost'
          : snapshot.driveLabel === 'Airborne'
            ? 'warn'
            : snapshot.driveLabel === 'Drifting'
              ? 'active'
              : snapshot.driveLabel === 'Braking'
                ? 'cool'
                : 'stable';
    this.elements.landmark.dataset.tone =
      snapshot.landmarkLabel === 'Reached' ? 'goal' : 'objective';
    this.elements.boost.dataset.tone =
      snapshot.boostLabel === 'Ready'
        ? 'boost'
        : snapshot.boostLabel.endsWith('%') && Number.parseInt(snapshot.boostLabel, 10) < 25
          ? 'warn'
          : 'stable';
    this.elements.weather.dataset.tone =
      snapshot.weatherLabel.startsWith('Rainy')
        ? 'cool'
        : snapshot.weatherLabel.startsWith('Sunny')
          ? 'boost'
          : 'stable';
  }

  setTitleWeather(label: string): void {
    this.elements.titleWeather.textContent = label;
  }

  setTitleAudio(label: string): void {
    this.elements.titleAudio.textContent = label;
  }

  updateArrival(snapshot: ArrivalSnapshot): void {
    this.elements.arrivalTime.textContent = snapshot.timeLabel;
    this.elements.arrivalPeak.textContent = snapshot.peakSpeedLabel;
    this.elements.arrivalBoost.textContent = snapshot.boostLabel;
    this.elements.arrivalMapped.textContent = snapshot.mappedLabel;
    this.elements.arrivalRelay.textContent = snapshot.relayLabel;
    this.elements.arrivalWeather.textContent = snapshot.weatherLabel;
  }

  configureMap(layout: MapLayoutSnapshot): void {
    this.#mapLayout = layout;
    this.#drawMap(null);
  }

  updateMap(snapshot: MapRuntimeSnapshot): void {
    this.elements.mapStatus.textContent = snapshot.statusLabel;
    this.#drawMap(snapshot);
  }

  showError(message: string): void {
    this.elements.error.hidden = false;
    this.elements.error.textContent = message;
  }

  hideError(): void {
    this.elements.error.hidden = true;
    this.elements.error.textContent = '';
  }

  #query<T extends Element>(root: ParentNode, selector: string): T {
    const element = root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`Missing required shell element: ${selector}`);
    }
    return element;
  }

  #drawMap(snapshot: MapRuntimeSnapshot | null): void {
    const context = this.#mapContext;
    const { width, height } = context.canvas;
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#9bbc0f';
    context.fillRect(0, 0, width, height);

    context.fillStyle = 'rgba(15, 56, 15, 0.08)';
    for (let y = 2; y < height; y += 4) {
      context.fillRect(0, y, width, 1);
    }

    if (!this.#mapLayout) {
      context.strokeStyle = '#306230';
      context.strokeRect(10, 10, width - 20, height - 20);
      return;
    }

    const project = (x: number, z: number): [number, number] => {
      const padding = 14;
      const usableWidth = width - padding * 2;
      const usableHeight = height - padding * 2;
      return [
        padding + ((x / this.#mapLayout!.worldSize) + 0.5) * usableWidth,
        padding + ((z / this.#mapLayout!.worldSize) + 0.5) * usableHeight,
      ];
    };

    context.strokeStyle = '#306230';
    context.lineCap = 'round';
    context.lineJoin = 'round';
    this.#drawRoadPath(context, project, this.#mapLayout.pathPoints, 13, '#3c6f2f', '#0f380f');
    for (const servicePath of this.#mapLayout.servicePaths) {
      this.#drawRoadPath(context, project, servicePath, 8, '#5f7d23', '#183a10');
    }

    context.fillStyle = '#306230';
    this.#mapLayout.waterPools.forEach((pool) => {
      const [x, y] = project(pool.x, pool.z);
      const radius = Math.max(3, (pool.radius / this.#mapLayout!.worldSize) * (width - 28));
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    });

    const discovery = snapshot?.discoveredCells ?? [];
    const discoveryColumns = this.#mapLayout.discoveryColumns;
    const discoveryRows = this.#mapLayout.discoveryRows;
    const fogCellWidth = (width - 28) / discoveryColumns;
    const fogCellHeight = (height - 28) / discoveryRows;

    context.fillStyle = '#183018';
    for (let row = 0; row < discoveryRows; row += 1) {
      for (let column = 0; column < discoveryColumns; column += 1) {
        const index = row * discoveryColumns + column;
        if (discovery[index] === 1) continue;
        const cellX = 14 + column * fogCellWidth;
        const cellY = 14 + row * fogCellHeight;
        context.fillRect(
          Math.floor(cellX),
          Math.floor(cellY),
          Math.ceil(fogCellWidth + 0.5),
          Math.ceil(fogCellHeight + 0.5),
        );
      }
    }

    context.strokeStyle = 'rgba(48, 98, 48, 0.32)';
    context.lineWidth = 1;
    for (let column = 1; column < discoveryColumns; column += 1) {
      const x = 14 + column * fogCellWidth;
      context.beginPath();
      context.moveTo(x, 14);
      context.lineTo(x, height - 14);
      context.stroke();
    }
    for (let row = 1; row < discoveryRows; row += 1) {
      const y = 14 + row * fogCellHeight;
      context.beginPath();
      context.moveTo(14, y);
      context.lineTo(width - 14, y);
      context.stroke();
    }

    const [landmarkX, landmarkY] = project(
      this.#mapLayout.landmark.x,
      this.#mapLayout.landmark.z,
    );
    context.globalAlpha = this.#getDiscoveryAlpha(
      this.#mapLayout.landmark.x,
      this.#mapLayout.landmark.z,
      discovery,
    );
    this.#drawMountainIcon(context, landmarkX, landmarkY);

    const [cityCenterX, cityCenterY] = project(
      this.#mapLayout.cityCenter.x,
      this.#mapLayout.cityCenter.z,
    );
    context.globalAlpha = Math.max(
      0.42,
      this.#getDiscoveryAlpha(
        this.#mapLayout.cityCenter.x,
        this.#mapLayout.cityCenter.z,
        discovery,
      ),
    );
    this.#drawHangarIcon(context, cityCenterX, cityCenterY);

    this.#mapLayout.outposts.forEach((outpost, index) => {
      const [outpostX, outpostY] = project(outpost.x, outpost.z);
      const pulse = snapshot ? 0.55 + 0.45 * Math.sin(snapshot.pulse * 4.4) : 0.5;
      const checkpointState = snapshot?.checkpointStates[index] ?? 'pending';
      context.globalAlpha = Math.max(
        0.5,
        this.#getDiscoveryAlpha(
          outpost.x,
          outpost.z,
          discovery,
        ),
      );
      context.strokeStyle = '#0f380f';
      context.fillStyle =
        checkpointState === 'reached'
          ? '#0f380f'
          : checkpointState === 'current' && pulse > 0.62
            ? '#0f380f'
            : '#306230';
      this.#drawOutpostIcon(
        context,
        outpostX,
        outpostY,
        outpost.objective,
        checkpointState,
        pulse,
      );
      if (checkpointState === 'reached') {
        context.beginPath();
        context.moveTo(outpostX - 2.6, outpostY + 0.2);
        context.lineTo(outpostX - 0.5, outpostY + 2.3);
        context.lineTo(outpostX + 3.2, outpostY - 2.1);
        context.stroke();
      } else if (checkpointState === 'current') {
        context.beginPath();
        context.arc(outpostX, outpostY, outpost.objective ? 8 : 7, 0, Math.PI * 2);
        context.stroke();
      }
      context.globalAlpha = 1;
    });

    const [objectiveX, objectiveY] = project(
      this.#mapLayout.objective.x,
      this.#mapLayout.objective.z,
    );
    const pulse = snapshot ? 0.55 + 0.45 * Math.sin(snapshot.pulse * 4.4) : 0.5;
    context.globalAlpha = Math.max(
      0.62,
      this.#getDiscoveryAlpha(
        this.#mapLayout.objective.x,
        this.#mapLayout.objective.z,
        discovery,
      ),
    );
    this.#drawObjectiveIcon(context, objectiveX, objectiveY, pulse);
    context.globalAlpha = 1;

    if (snapshot) {
      const [vehicleX, vehicleY] = project(snapshot.vehicle.x, snapshot.vehicle.z);
      this.#drawTruckIcon(context, vehicleX, vehicleY, snapshot.vehicle.heading);
      this.#drawWeatherIcon(context, width - 22, 22, snapshot.weatherCondition);
    }

    context.strokeStyle = '#0f380f';
    context.lineWidth = 3;
    context.strokeRect(4, 4, width - 8, height - 8);
  }

  #drawRoadPath(
    context: CanvasRenderingContext2D,
    project: (x: number, z: number) => [number, number],
    path: Array<{ x: number; z: number }>,
    width: number,
    fill: string,
    edge: string,
  ): void {
    context.strokeStyle = fill;
    context.lineWidth = width;
    context.beginPath();
    path.forEach((point, index) => {
      const [x, y] = project(point.x, point.z);
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();
    context.strokeStyle = edge;
    context.lineWidth = Math.max(2, width * 0.28);
    context.stroke();
  }

  #drawMountainIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    context.fillStyle = '#0f380f';
    context.beginPath();
    context.moveTo(x - 10, y + 7);
    context.lineTo(x - 1, y - 8);
    context.lineTo(x + 8, y + 7);
    context.closePath();
    context.fill();
    context.fillStyle = '#306230';
    context.beginPath();
    context.moveTo(x - 2, y - 4);
    context.lineTo(x + 1, y - 8);
    context.lineTo(x + 4, y - 3);
    context.closePath();
    context.fill();
  }

  #drawHangarIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
  ): void {
    context.strokeStyle = '#0f380f';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(x - 7, y + 4);
    context.quadraticCurveTo(x, y - 7, x + 7, y + 4);
    context.stroke();
    context.beginPath();
    context.moveTo(x - 8, y + 4);
    context.lineTo(x - 8, y + 7);
    context.lineTo(x + 8, y + 7);
    context.lineTo(x + 8, y + 4);
    context.stroke();
    context.fillStyle = '#306230';
    context.fillRect(x - 3, y + 1, 6, 5);
  }

  #drawOutpostIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    objective: boolean,
    state: 'pending' | 'current' | 'reached',
    pulse: number,
  ): void {
    context.strokeStyle = '#0f380f';
    context.lineWidth = objective ? 2.2 : 1.6;
    context.fillStyle =
      state === 'reached'
        ? '#0f380f'
        : state === 'current' && pulse > 0.62
          ? '#0f380f'
          : '#306230';
    context.fillRect(x - 3, y + 1, 6, 4);
    context.strokeRect(x - 4.5, y - 0.5, 9, 6);
    context.beginPath();
    context.moveTo(x - 5.6, y - 0.5);
    context.lineTo(x, y - 5.5);
    context.lineTo(x + 5.6, y - 0.5);
    context.stroke();
    if (objective) {
      context.beginPath();
      context.moveTo(x + 6.4, y + 0.8);
      context.lineTo(x + 8.6, y - 6.2);
      context.stroke();
    }
  }

  #drawObjectiveIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    pulse: number,
  ): void {
    context.strokeStyle = '#0f380f';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(x, y, 6, 0, Math.PI * 2);
    context.stroke();
    context.beginPath();
    context.moveTo(x, y - 10);
    context.lineTo(x, y - 2);
    context.stroke();
    context.fillStyle = pulse > 0.72 ? '#0f380f' : '#306230';
    context.fillRect(x - 2.5, y - 1.5, 5, 5);
  }

  #drawTruckIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    heading: number,
  ): void {
    context.save();
    context.translate(x, y);
    context.rotate(heading);
    context.fillStyle = '#0f380f';
    context.fillRect(-4.5, -5.2, 9, 8.2);
    context.fillRect(-2.2, -7.2, 4.4, 2.4);
    context.fillRect(-5.2, -1.2, 1.3, 2.6);
    context.fillRect(3.9, -1.2, 1.3, 2.6);
    context.fillStyle = '#306230';
    context.fillRect(-2, -3.8, 4, 2);
    context.restore();
  }

  #drawWeatherIcon(
    context: CanvasRenderingContext2D,
    x: number,
    y: number,
    condition: 'cloudy' | 'rainy' | 'sunny',
  ): void {
    context.save();
    context.translate(x, y);
    context.strokeStyle = '#0f380f';
    context.fillStyle = '#306230';
    context.lineWidth = 1.8;

    if (condition === 'sunny') {
      context.beginPath();
      context.arc(0, 0, 4, 0, Math.PI * 2);
      context.fill();
      for (let index = 0; index < 8; index += 1) {
        const angle = (Math.PI * 2 * index) / 8;
        context.beginPath();
        context.moveTo(Math.cos(angle) * 6, Math.sin(angle) * 6);
        context.lineTo(Math.cos(angle) * 9, Math.sin(angle) * 9);
        context.stroke();
      }
    } else {
      context.beginPath();
      context.arc(-3, 1, 3, Math.PI * 0.9, Math.PI * 2);
      context.arc(1, -1, 4, Math.PI, Math.PI * 2);
      context.arc(5, 1, 3, Math.PI, Math.PI * 2.1);
      context.lineTo(8, 5);
      context.lineTo(-6, 5);
      context.closePath();
      context.fill();
      if (condition === 'rainy') {
        for (const dropX of [-3, 1, 5]) {
          context.beginPath();
          context.moveTo(dropX, 7);
          context.lineTo(dropX - 1, 10);
          context.stroke();
        }
      }
    }

    context.restore();
  }

  #getDiscoveryAlpha(x: number, z: number, discoveredCells: number[]): number {
    if (!this.#mapLayout || discoveredCells.length === 0) {
      return 0.28;
    }

    const column = Math.max(
      0,
      Math.min(
        this.#mapLayout.discoveryColumns - 1,
        Math.floor(((x / this.#mapLayout.worldSize) + 0.5) * this.#mapLayout.discoveryColumns),
      ),
    );
    const row = Math.max(
      0,
      Math.min(
        this.#mapLayout.discoveryRows - 1,
        Math.floor(((z / this.#mapLayout.worldSize) + 0.5) * this.#mapLayout.discoveryRows),
      ),
    );
    const index = row * this.#mapLayout.discoveryColumns + column;
    return discoveredCells[index] === 1 ? 1 : 0.34;
  }
}
