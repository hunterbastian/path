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
  achievementsLabel: string;
  relayLabel: string;
  weatherLabel: string;
  profileLabel: string;
  signatureLabel: string;
  distanceLabel: string;
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
  terrainGrid: {
    columns: number;
    rows: number;
    heights: number[];
    surfaces: string[];
  };
}

export interface MapRuntimeSnapshot {
  discoveredCells: number[];
  discoveredRatio: number;
  checkpointStates: Array<'pending' | 'current' | 'reached'>;
  pulse: number;
  statusLabel: string;
  weatherCondition: 'cloudy' | 'rainy' | 'sunny';
  vehicle: { x: number; z: number; heading: number };
  trail: Array<{ x: number; z: number }>;
  trailDistanceMeters: number;
  raiders: Array<{ x: number; z: number; behavior: string }>;
}

export type ShellMode = 'title' | 'driving' | 'arrived';

interface AppShellElements {
  canvasMount: HTMLDivElement;
  loading: HTMLDivElement;
  title: HTMLDivElement;
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
  arrivalAchievements: HTMLSpanElement;
  arrivalRelay: HTMLSpanElement;
  arrivalWeather: HTMLSpanElement;
  arrivalSignature: HTMLSpanElement;
  arrivalDistance: HTMLSpanElement;
  arrivalProfile: HTMLSpanElement;
  titleCareer: HTMLSpanElement;
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
  radioLog: HTMLDivElement;
}

// ── Topo map palette ──
const TOPO_BG = '#f0e8d8';
const TOPO_SURFACE: Record<string, string> = {
  snow: '#dce8f0',
  rock: '#b8a99a',
  dirt: '#c9a97a',
  grass: '#8ab06a',
  sand: '#d4c090',
};
const TOPO_CONTOUR = 'rgba(110, 82, 52, 0.18)';
const TOPO_CONTOUR_MAJOR = 'rgba(110, 82, 52, 0.38)';
const TOPO_WATER = '#7cbcc8';
const TOPO_WATER_EDGE = '#5a9caa';
const TOPO_ROAD = '#9a7a55';
const TOPO_ROAD_EDGE = '#705838';
const TOPO_SERVICE_ROAD = '#b09670';
const TOPO_SERVICE_EDGE = '#8a7050';
const TOPO_TRAIL = '#cc3a2a';
const TOPO_ICON = '#4a3828';
const TOPO_ICON_ACCENT = '#7a5e42';
const TOPO_BORDER = '#8a7a68';
const CONTOUR_INTERVAL = 8;
const CONTOUR_MAJOR_EVERY = 5;

export class AppShell {
  readonly elements: AppShellElements;
  readonly #mapContext: CanvasRenderingContext2D;
  readonly #fogCanvas: HTMLCanvasElement;
  readonly #fogContext: CanvasRenderingContext2D;
  #mapLayout: MapLayoutSnapshot | null = null;
  #achievementToastContainer: HTMLDivElement | null = null;

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
              <div class="title-fact title-fact--career">
                <span class="title-fact-label">Career</span>
                <span id="title-career" class="title-fact-value">No runs yet</span>
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
              <div class="arrival-stat">
                <span class="status-label">Achievements</span>
                <span id="arrival-achievements" class="status-value">0 / 0</span>
              </div>
              <div class="arrival-stat">
                <span class="status-label">Signature</span>
                <span id="arrival-signature" class="status-value">--</span>
              </div>
              <div class="arrival-stat">
                <span class="status-label">Odometer</span>
                <span id="arrival-distance" class="status-value">0 m</span>
              </div>
            </div>
            <div class="arrival-profile">
              <span id="arrival-profile" class="arrival-profile-value">Newcomer · Trail Runner</span>
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
                width="352"
                height="340"
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

        <div id="radio-log" class="radio-log" aria-live="polite"></div>
        <div id="achievement-toasts" class="achievement-toasts" aria-live="polite"></div>
      </div>
    `;

    this.elements = {
      canvasMount: this.#query(root, '#game-stage'),
      loading: this.#query(root, '#loading'),
      title: this.#query(root, '#title-screen'),
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
      arrivalAchievements: this.#query(root, '#arrival-achievements'),
      arrivalRelay: this.#query(root, '#arrival-route'),
      arrivalWeather: this.#query(root, '#arrival-weather'),
      arrivalSignature: this.#query(root, '#arrival-signature'),
      arrivalDistance: this.#query(root, '#arrival-distance'),
      arrivalProfile: this.#query(root, '#arrival-profile'),
      titleCareer: this.#query(root, '#title-career'),
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
      radioLog: this.#query(root, '#radio-log'),
    };

    const mapContext = this.elements.mapCanvas.getContext('2d');
    if (!mapContext) {
      throw new Error('Unable to create map canvas context.');
    }
    this.#mapContext = mapContext;
    this.#fogCanvas = document.createElement('canvas');
    const fogCtx = this.#fogCanvas.getContext('2d');
    if (!fogCtx) {
      throw new Error('Unable to create fog canvas context.');
    }
    this.#fogContext = fogCtx;
    this.#drawMap(null);
    this.#achievementToastContainer = root.querySelector('#achievement-toasts');
  }

  showAchievementToast(title: string, description: string, icon: string): void {
    const container = this.#achievementToastContainer;
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'achievement-toast';

    const iconEl = document.createElement('div');
    iconEl.className = 'achievement-toast__icon';
    iconEl.textContent = icon;

    const body = document.createElement('div');
    body.className = 'achievement-toast__body';

    const titleEl = document.createElement('div');
    titleEl.className = 'achievement-toast__title';
    titleEl.textContent = title;

    const descEl = document.createElement('div');
    descEl.className = 'achievement-toast__desc';
    descEl.textContent = description;

    body.appendChild(titleEl);
    body.appendChild(descEl);
    toast.appendChild(iconEl);
    toast.appendChild(body);
    container.appendChild(toast);

    // Trigger enter animation next frame
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    // Auto-dismiss after 3.5s
    setTimeout(() => {
      toast.classList.remove('visible');
      toast.classList.add('exiting');
      setTimeout(() => toast.remove(), 400);
    }, 3500);
  }

  showDiscoveryToast(text: string): void {
    const container = this.#achievementToastContainer;
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'discovery-toast';
    toast.textContent = text;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    setTimeout(() => {
      toast.classList.remove('visible');
      toast.classList.add('exiting');
      setTimeout(() => toast.remove(), 400);
    }, 2500);
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

  setTitleCareer(label: string): void {
    this.elements.titleCareer.textContent = label;
  }

  setTitleAudio(label: string): void {
    this.elements.titleAudio.textContent = label;
  }

  updateArrival(snapshot: ArrivalSnapshot): void {
    this.elements.arrivalTime.textContent = snapshot.timeLabel;
    this.elements.arrivalPeak.textContent = snapshot.peakSpeedLabel;
    this.elements.arrivalBoost.textContent = snapshot.boostLabel;
    this.elements.arrivalMapped.textContent = snapshot.mappedLabel;
    this.elements.arrivalAchievements.textContent = snapshot.achievementsLabel;
    this.elements.arrivalSignature.textContent = snapshot.signatureLabel;
    this.elements.arrivalDistance.textContent = snapshot.distanceLabel;
    this.elements.arrivalProfile.textContent = snapshot.profileLabel;
    this.elements.arrivalRelay.textContent = snapshot.relayLabel;
    this.elements.arrivalWeather.textContent = snapshot.weatherLabel;
  }

  configureMap(layout: MapLayoutSnapshot): void {
    this.#mapLayout = layout;
    // Pre-size fog canvas to match discovery grid (avoids realloc every frame)
    this.#fogCanvas.width = layout.discoveryColumns;
    this.#fogCanvas.height = layout.discoveryRows;
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
    const ctx = this.#mapContext;
    const { width, height } = ctx.canvas;
    const pad = 24;
    const uw = width - pad * 2;
    const uh = height - pad * 2;

    // ── Background (parchment fill + subtle paper texture) ──
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = TOPO_BG;
    ctx.fillRect(0, 0, width, height);
    // Subtle paper grain (horizontal lines)
    ctx.fillStyle = 'rgba(160, 140, 110, 0.04)';
    for (let y = 0; y < height; y += 3) {
      ctx.fillRect(0, y, width, 1);
    }

    if (!this.#mapLayout) {
      ctx.strokeStyle = TOPO_BORDER;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(pad, pad, uw, uh);
      return;
    }

    const layout = this.#mapLayout;
    const project = (wx: number, wz: number): [number, number] => [
      pad + ((wx / layout.worldSize) + 0.5) * uw,
      pad + ((wz / layout.worldSize) + 0.5) * uh,
    ];

    // ── 1. Terrain cells with elevation shading ──
    const tg = layout.terrainGrid;
    const cellW = uw / tg.columns;
    const cellH = uh / tg.rows;
    // Find height range for normalization
    let minH = Infinity;
    let maxH = -Infinity;
    for (let i = 0; i < tg.heights.length; i++) {
      const h = tg.heights[i]!;
      if (h < minH) minH = h;
      if (h > maxH) maxH = h;
    }
    const hRange = Math.max(maxH - minH, 1);

    for (let row = 0; row < tg.rows; row++) {
      for (let col = 0; col < tg.columns; col++) {
        const idx = row * tg.columns + col;
        const surface = tg.surfaces[idx]!;
        const h = tg.heights[idx]!;
        // Elevation-based brightness: higher = slightly lighter, lower = slightly darker
        const hNorm = (h - minH) / hRange;
        const brightness = 0.88 + hNorm * 0.12;
        const baseColor = TOPO_SURFACE[surface] ?? TOPO_BG;
        ctx.fillStyle = baseColor;
        const cx = pad + col * cellW;
        const cy = pad + row * cellH;
        const cw = Math.ceil(cellW + 0.5);
        const ch = Math.ceil(cellH + 0.5);
        ctx.fillRect(cx, cy, cw, ch);
        // Darken low areas, lighten high areas
        if (brightness < 0.96) {
          ctx.fillStyle = `rgba(40, 30, 20, ${(1 - brightness) * 0.35})`;
          ctx.fillRect(cx, cy, cw, ch);
        } else if (brightness > 1.0) {
          ctx.fillStyle = `rgba(255, 250, 240, ${(brightness - 1) * 0.5})`;
          ctx.fillRect(cx, cy, cw, ch);
        }
      }
    }

    // ── 2. Contour lines (interpolated positions for organic curves) ──
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Collect contour segments then draw them as connected paths
    for (let row = 0; row < tg.rows - 1; row++) {
      for (let col = 0; col < tg.columns - 1; col++) {
        const i00 = row * tg.columns + col;
        const h00 = tg.heights[i00]!;
        const h10 = tg.heights[i00 + 1]!;
        const h01 = tg.heights[i00 + tg.columns]!;

        // Right edge: interpolate crossing position
        const level00 = Math.floor(h00 / CONTOUR_INTERVAL);
        const level10 = Math.floor(h10 / CONTOUR_INTERVAL);
        if (level00 !== level10) {
          const threshold = Math.max(level00, level10) * CONTOUR_INTERVAL;
          const t = (threshold - h00) / (h10 - h00);
          const major = Math.max(level00, level10) % CONTOUR_MAJOR_EVERY === 0;
          const x1 = pad + (col + t) * cellW;
          const y1 = pad + row * cellH;
          const y2 = pad + (row + 1) * cellH;
          ctx.strokeStyle = major ? TOPO_CONTOUR_MAJOR : TOPO_CONTOUR;
          ctx.lineWidth = major ? 1.8 : 1;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x1, y2);
          ctx.stroke();
        }

        // Bottom edge: interpolate crossing position
        const level01 = Math.floor(h01 / CONTOUR_INTERVAL);
        if (level00 !== level01) {
          const threshold = Math.max(level00, level01) * CONTOUR_INTERVAL;
          const t = (threshold - h00) / (h01 - h00);
          const major = Math.max(level00, level01) % CONTOUR_MAJOR_EVERY === 0;
          const x1 = pad + col * cellW;
          const x2 = pad + (col + 1) * cellW;
          const y1 = pad + (row + t) * cellH;
          ctx.strokeStyle = major ? TOPO_CONTOUR_MAJOR : TOPO_CONTOUR;
          ctx.lineWidth = major ? 1.8 : 1;
          ctx.beginPath();
          ctx.moveTo(x1, y1);
          ctx.lineTo(x2, y1);
          ctx.stroke();
        }
      }
    }

    // ── 2b. Slope hatch marks (hachures on steep terrain) ──
    ctx.strokeStyle = 'rgba(90, 65, 40, 0.14)';
    ctx.lineWidth = 0.8;
    ctx.lineCap = 'round';
    for (let row = 1; row < tg.rows - 1; row++) {
      for (let col = 1; col < tg.columns - 1; col++) {
        const i = row * tg.columns + col;
        // Compute slope from neighbors (central difference)
        const hLeft = tg.heights[i - 1]!;
        const hRight = tg.heights[i + 1]!;
        const hUp = tg.heights[i - tg.columns]!;
        const hDown = tg.heights[i + tg.columns]!;
        const dx = (hRight - hLeft) * 0.5;
        const dz = (hDown - hUp) * 0.5;
        const slopeMag = Math.sqrt(dx * dx + dz * dz);
        // Only draw hachures where slope is steep enough
        if (slopeMag < 3.5) continue;
        // Normalize downhill direction
        const invLen = 1 / slopeMag;
        const ndx = dx * invLen;
        const ndz = dz * invLen;
        // Perpendicular to slope (the tick direction)
        const px = -ndz;
        const pz = ndx;
        const cx = pad + (col + 0.5) * cellW;
        const cy = pad + (row + 0.5) * cellH;
        // Tick length scales with slope steepness
        const tickLen = Math.min(cellW * 0.7, 1.5 + (slopeMag - 3.5) * 0.35);
        // Stagger: skip some cells for visual clarity
        if ((row + col) % 2 !== 0) continue;
        ctx.beginPath();
        ctx.moveTo(cx - px * tickLen, cy - pz * tickLen);
        ctx.lineTo(cx + px * tickLen, cy + pz * tickLen);
        ctx.stroke();
      }
    }

    // ── 3. Water pools ──
    layout.waterPools.forEach((pool) => {
      const [px, py] = project(pool.x, pool.z);
      const r = Math.max(4, (pool.radius / layout.worldSize) * uw);
      // Subtle water depth rings
      ctx.fillStyle = TOPO_WATER;
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
      // Inner deeper ring
      if (r > 6) {
        ctx.fillStyle = TOPO_WATER_EDGE;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        ctx.arc(px, py, r * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
      ctx.strokeStyle = TOPO_WATER_EDGE;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    });

    // ── 4. Roads ──
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // Service roads first (underneath main road)
    for (const sp of layout.servicePaths) {
      this.#drawTopoRoad(ctx, project, sp, 5, TOPO_SERVICE_ROAD, TOPO_SERVICE_EDGE);
    }
    this.#drawTopoRoad(ctx, project, layout.pathPoints, 8, TOPO_ROAD, TOPO_ROAD_EDGE);

    // ── 5. Fog of war (soft-edged desaturation over undiscovered) ──
    const discovery = snapshot?.discoveredCells ?? [];
    if (discovery.length > 0) {
      const dc = layout.discoveryColumns;
      const dr = layout.discoveryRows;
      const fogCtx = this.#fogContext;
      fogCtx.clearRect(0, 0, dc, dr);
      for (let row = 0; row < dr; row++) {
        for (let col = 0; col < dc; col++) {
          if (discovery[row * dc + col] !== 1) {
            fogCtx.fillStyle = '#fff';
            fogCtx.fillRect(col, row, 1, 1);
          }
        }
      }
      // Upscale the tiny fog grid — bilinear interpolation gives soft edges
      ctx.save();
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.globalAlpha = 0.58;
      ctx.drawImage(this.#fogCanvas, pad, pad, uw, uh);
      ctx.restore();
    }

    // ── 6. Icons (always visible over fog — important landmarks) ──
    ctx.globalAlpha = 1;
    const [lx, ly] = project(layout.landmark.x, layout.landmark.z);
    this.#drawTopoMountain(ctx, lx, ly);

    const [ccx, ccy] = project(layout.cityCenter.x, layout.cityCenter.z);
    this.#drawTopoHangar(ctx, ccx, ccy);

    layout.outposts.forEach((outpost, index) => {
      const [ox, oy] = project(outpost.x, outpost.z);
      const pulse = snapshot ? 0.55 + 0.45 * Math.sin(snapshot.pulse * 4.4) : 0.5;
      const state = snapshot?.checkpointStates[index] ?? 'pending';
      this.#drawTopoOutpost(ctx, ox, oy, outpost.objective, state, pulse, index);
    });

    const [objX, objY] = project(layout.objective.x, layout.objective.z);
    const objPulse = snapshot ? 0.55 + 0.45 * Math.sin(snapshot.pulse * 4.4) : 0.5;
    this.#drawTopoObjective(ctx, objX, objY, objPulse);

    // ── 6b. Raider dots (color-coded by behavior) ──
    if (snapshot) {
      for (const r of snapshot.raiders) {
        const [rx, ry] = project(r.x, r.z);
        ctx.fillStyle =
          r.behavior === 'chase' ? '#e83318' :
          r.behavior === 'seek_water' ? '#3088c8' :
          r.behavior === 'explore' ? '#48a848' :
          r.behavior === 'stunned' ? '#884422' :
          '#c83028';
        ctx.beginPath();
        ctx.arc(rx, ry, r.behavior === 'chase' ? 4 : 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // ── 7. Player trail (rendered AFTER fog so it's always visible) ──
    if (snapshot && snapshot.trail.length > 1) {
      ctx.save();
      // Trail shadow for contrast
      ctx.strokeStyle = 'rgba(40, 20, 10, 0.2)';
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i < snapshot.trail.length; i++) {
        const pt = snapshot.trail[i]!;
        const [tx, ty] = project(pt.x, pt.z);
        if (i === 0) ctx.moveTo(tx, ty);
        else ctx.lineTo(tx, ty);
      }
      ctx.stroke();
      // Trail line (dashed)
      ctx.strokeStyle = TOPO_TRAIL;
      ctx.lineWidth = 2.4;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
      // Start marker (small circle at trail origin)
      const startPt = snapshot.trail[0]!;
      const [sx, sy] = project(startPt.x, startPt.z);
      ctx.fillStyle = TOPO_TRAIL;
      ctx.beginPath();
      ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }

    // ── 7b. Trail distance label ──
    if (snapshot && snapshot.trailDistanceMeters > 10) {
      ctx.save();
      const dist = snapshot.trailDistanceMeters;
      const label = dist >= 1000
        ? `${(dist / 1000).toFixed(1)} km`
        : `${Math.round(dist)} m`;
      ctx.font = 'bold 8px sans-serif';
      const textW = ctx.measureText(label).width;
      // Position near the vehicle, offset below-right
      const [vx2, vy2] = project(snapshot.vehicle.x, snapshot.vehicle.z);
      const labelX = vx2 + 16;
      const labelY = vy2 + 18;
      // Background pill
      ctx.fillStyle = 'rgba(240, 232, 216, 0.9)';
      const pillPad = 3;
      const pillH = 11;
      ctx.beginPath();
      ctx.roundRect(
        labelX - pillPad,
        labelY - pillH + 2,
        textW + pillPad * 2,
        pillH + 2,
        3,
      );
      ctx.fill();
      ctx.strokeStyle = 'rgba(138, 122, 104, 0.4)';
      ctx.lineWidth = 0.8;
      ctx.stroke();
      // Text
      ctx.fillStyle = TOPO_ICON;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.fillText(label, labelX, labelY + 1);
      ctx.textBaseline = 'alphabetic';
      ctx.restore();
    }

    // ── 8. Vehicle + weather ──
    if (snapshot) {
      const [vx, vy] = project(snapshot.vehicle.x, snapshot.vehicle.z);
      this.#drawTopoVehicle(ctx, vx, vy, snapshot.vehicle.heading);
      this.#drawTopoWeather(ctx, width - pad - 2, pad + 14, snapshot.weatherCondition);
    }

    // ── 9. Compass rose (top-left of map area, on the margin) ──
    this.#drawCompass(ctx, pad + 14, pad + 14);

    // ── 10. Border + map frame ──
    // Outer shadow
    ctx.strokeStyle = 'rgba(100, 80, 60, 0.15)';
    ctx.lineWidth = 4;
    ctx.strokeRect(pad - 1, pad - 1, uw + 2, uh + 2);
    // Main border
    ctx.strokeStyle = TOPO_BORDER;
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, uw, uh);

    // ── 11. Mini elevation profile (bottom margin) ──
    if (snapshot) {
      this.#drawElevationProfile(
        ctx,
        layout,
        snapshot.vehicle,
        layout.objective,
        pad,
        height - pad + 4,
        uw,
        pad - 6,
      );
    }
  }

  #drawTopoRoad(
    ctx: CanvasRenderingContext2D,
    project: (x: number, z: number) => [number, number],
    path: Array<{ x: number; z: number }>,
    w: number,
    fill: string,
    edge: string,
  ): void {
    if (path.length < 2) return;
    ctx.beginPath();
    for (let i = 0; i < path.length; i++) {
      const seg = path[i]!;
      const [px, py] = project(seg.x, seg.z);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.strokeStyle = edge;
    ctx.lineWidth = w + 2.4;
    ctx.stroke();
    ctx.strokeStyle = fill;
    ctx.lineWidth = w;
    ctx.stroke();
    // Center dashes on main road
    if (w > 6) {
      ctx.setLineDash([8, 10]);
      ctx.strokeStyle = 'rgba(255, 250, 235, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  #drawTopoMountain(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Shadow
    ctx.fillStyle = 'rgba(40, 30, 20, 0.12)';
    ctx.beginPath();
    ctx.moveTo(x - 14, y + 10);
    ctx.lineTo(x + 2, y - 11);
    ctx.lineTo(x + 14, y + 10);
    ctx.closePath();
    ctx.fill();
    // Mountain body
    ctx.fillStyle = TOPO_ICON;
    ctx.beginPath();
    ctx.moveTo(x - 13, y + 9);
    ctx.lineTo(x, y - 12);
    ctx.lineTo(x + 13, y + 9);
    ctx.closePath();
    ctx.fill();
    // Snow cap
    ctx.fillStyle = '#dce8f0';
    ctx.beginPath();
    ctx.moveTo(x - 3.5, y - 5);
    ctx.lineTo(x, y - 12);
    ctx.lineTo(x + 3.5, y - 5);
    ctx.closePath();
    ctx.fill();
    // Label with background
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    const labelW = ctx.measureText('TOWER MT').width + 6;
    ctx.fillStyle = 'rgba(240, 232, 216, 0.85)';
    ctx.fillRect(x - labelW / 2, y + 11, labelW, 12);
    ctx.fillStyle = TOPO_ICON;
    ctx.fillText('TOWER MT', x, y + 21);
  }

  #drawTopoHangar(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.strokeStyle = TOPO_ICON;
    ctx.lineWidth = 2;
    // Quonset roof
    ctx.beginPath();
    ctx.moveTo(x - 10, y + 5);
    ctx.quadraticCurveTo(x, y - 10, x + 10, y + 5);
    ctx.stroke();
    // Walls
    ctx.beginPath();
    ctx.moveTo(x - 11, y + 5);
    ctx.lineTo(x - 11, y + 9);
    ctx.lineTo(x + 11, y + 9);
    ctx.lineTo(x + 11, y + 5);
    ctx.stroke();
    // Door
    ctx.fillStyle = TOPO_ICON_ACCENT;
    ctx.fillRect(x - 4, y + 1, 8, 7);
    // Label
    ctx.font = 'bold 9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = TOPO_ICON;
    ctx.fillText('CAMP', x, y + 21);
  }

  #drawTopoOutpost(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    objective: boolean,
    state: 'pending' | 'current' | 'reached',
    pulse: number,
    index: number,
  ): void {
    const active = state === 'reached' || (state === 'current' && pulse > 0.62);
    ctx.fillStyle = active ? TOPO_ICON : TOPO_ICON_ACCENT;
    ctx.strokeStyle = TOPO_ICON;
    ctx.lineWidth = objective ? 2.5 : 2;
    // Building body
    ctx.fillRect(x - 5, y + 1, 10, 7);
    ctx.strokeRect(x - 6, y - 0.5, 12, 9);
    // Roof
    ctx.beginPath();
    ctx.moveTo(x - 8, y - 0.5);
    ctx.lineTo(x, y - 8);
    ctx.lineTo(x + 8, y - 0.5);
    ctx.closePath();
    ctx.stroke();
    if (active) ctx.fill();
    // Antenna for relay
    if (objective) {
      ctx.beginPath();
      ctx.moveTo(x + 8, y + 1);
      ctx.lineTo(x + 12, y - 9);
      ctx.stroke();
      // Signal arcs
      ctx.lineWidth = 1;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.arc(x + 12, y - 9, 3, -Math.PI * 0.8, -Math.PI * 0.2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    // State indicators
    if (state === 'reached') {
      ctx.strokeStyle = '#2a7a3a';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(x - 4, y + 1);
      ctx.lineTo(x - 1, y + 4);
      ctx.lineTo(x + 5, y - 3);
      ctx.stroke();
    } else if (state === 'current') {
      ctx.strokeStyle = TOPO_TRAIL;
      ctx.lineWidth = 1.6;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(x, y, objective ? 14 : 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    // Label
    ctx.fillStyle = TOPO_ICON;
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(
      objective ? 'RELAY' : `OP-${index + 1}`,
      x,
      y + (objective ? 18 : 16),
    );
  }

  #drawTopoObjective(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    pulse: number,
  ): void {
    // Pulsing outer ring
    ctx.strokeStyle = TOPO_TRAIL;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.3 + pulse * 0.4;
    ctx.beginPath();
    ctx.arc(x, y, 12 + pulse * 2, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Main circle
    ctx.strokeStyle = TOPO_ICON;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.stroke();
    // Antenna mast
    ctx.beginPath();
    ctx.moveTo(x, y - 15);
    ctx.lineTo(x, y - 4);
    ctx.stroke();
    // Transmitter box
    ctx.fillStyle = pulse > 0.72 ? TOPO_ICON : TOPO_ICON_ACCENT;
    ctx.fillRect(x - 3.5, y - 3, 7, 7);
    // Label
    ctx.fillStyle = TOPO_ICON;
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('SUMMIT RELAY', x, y + 20);
  }

  #drawTopoVehicle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    heading: number,
  ): void {
    // Outer glow ring
    ctx.save();
    ctx.strokeStyle = TOPO_TRAIL;
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = 0.25;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Vehicle body (rotated)
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);
    // Shadow
    ctx.fillStyle = 'rgba(40, 20, 10, 0.15)';
    ctx.fillRect(-5, -6, 11, 12);
    // Truck body
    ctx.fillStyle = TOPO_TRAIL;
    ctx.fillRect(-5.5, -7, 11, 11);
    // Cab
    ctx.fillRect(-3, -10, 6, 3.5);
    // Wheels
    ctx.fillStyle = TOPO_ICON;
    ctx.fillRect(-7, -2, 2, 3.5);
    ctx.fillRect(5, -2, 2, 3.5);
    ctx.fillRect(-7, -7, 2, 3.5);
    ctx.fillRect(5, -7, 2, 3.5);
    // Windshield
    ctx.fillStyle = '#e8d8c0';
    ctx.fillRect(-2.5, -5.5, 5, 3);
    // Direction arrow (heading indicator)
    ctx.fillStyle = '#fff';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.lineTo(-2.5, -8);
    ctx.lineTo(2.5, -8);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  #drawTopoWeather(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    condition: 'cloudy' | 'rainy' | 'sunny',
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = TOPO_ICON;
    ctx.fillStyle = TOPO_ICON_ACCENT;
    ctx.lineWidth = 1.8;

    if (condition === 'sunny') {
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (Math.PI * 2 * i) / 8;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
        ctx.lineTo(Math.cos(a) * 10.5, Math.sin(a) * 10.5);
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.arc(-4, 1, 4.5, Math.PI * 0.9, Math.PI * 2);
      ctx.arc(1.5, -1.5, 5.5, Math.PI, Math.PI * 2);
      ctx.arc(7, 1, 4, Math.PI, Math.PI * 2.1);
      ctx.lineTo(11, 6);
      ctx.lineTo(-8.5, 6);
      ctx.closePath();
      ctx.fill();
      if (condition === 'rainy') {
        ctx.lineWidth = 1.4;
        for (const dx of [-4, 1.5, 7]) {
          ctx.beginPath();
          ctx.moveTo(dx, 8);
          ctx.lineTo(dx - 1.5, 12.5);
          ctx.stroke();
        }
      }
    }
    ctx.restore();
  }

  #drawCompass(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.save();
    ctx.globalAlpha = 0.55;
    // Outer ring
    ctx.strokeStyle = TOPO_ICON;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(x, y, 10, 0, Math.PI * 2);
    ctx.stroke();
    // Tick marks for cardinal directions
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * 2 * i) / 8;
      const inner = i % 2 === 0 ? 7.5 : 8.5;
      ctx.beginPath();
      ctx.moveTo(x + Math.cos(a) * inner, y + Math.sin(a) * inner);
      ctx.lineTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
      ctx.stroke();
    }
    // N arrow (red, pointing up)
    ctx.fillStyle = TOPO_TRAIL;
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x - 3, y - 1);
    ctx.lineTo(x, y - 3);
    ctx.closePath();
    ctx.fill();
    // N arrow right half (darker)
    ctx.fillStyle = '#a02a1e';
    ctx.beginPath();
    ctx.moveTo(x, y - 9);
    ctx.lineTo(x + 3, y - 1);
    ctx.lineTo(x, y - 3);
    ctx.closePath();
    ctx.fill();
    // S arrow
    ctx.fillStyle = TOPO_ICON_ACCENT;
    ctx.globalAlpha = 0.35;
    ctx.beginPath();
    ctx.moveTo(x, y + 9);
    ctx.lineTo(x - 3, y + 1);
    ctx.lineTo(x, y + 3);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y + 9);
    ctx.lineTo(x + 3, y + 1);
    ctx.lineTo(x, y + 3);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 0.7;
    // N label
    ctx.fillStyle = TOPO_TRAIL;
    ctx.font = 'bold 8px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('N', x, y - 11);
    ctx.textBaseline = 'alphabetic';
    ctx.restore();
  }

  #drawElevationProfile(
    ctx: CanvasRenderingContext2D,
    layout: MapLayoutSnapshot,
    vehicle: { x: number; z: number },
    objective: { x: number; z: number },
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const tg = layout.terrainGrid;
    const halfWorld = layout.worldSize * 0.5;
    const samples = 48;
    const heights: number[] = [];

    // Sample terrain heights along the line from vehicle to objective
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const wx = vehicle.x + (objective.x - vehicle.x) * t;
      const wz = vehicle.z + (objective.z - vehicle.z) * t;
      // Map world coords to terrain grid coords
      const gc = ((wx + halfWorld) / layout.worldSize) * tg.columns;
      const gr = ((wz + halfWorld) / layout.worldSize) * tg.rows;
      // Bilinear interpolation on the terrain grid
      const c0 = Math.max(0, Math.min(tg.columns - 2, Math.floor(gc)));
      const r0 = Math.max(0, Math.min(tg.rows - 2, Math.floor(gr)));
      const fc = Math.max(0, Math.min(1, gc - c0));
      const fr = Math.max(0, Math.min(1, gr - r0));
      const h00 = tg.heights[r0 * tg.columns + c0]!;
      const h10 = tg.heights[r0 * tg.columns + c0 + 1]!;
      const h01 = tg.heights[(r0 + 1) * tg.columns + c0]!;
      const h11 = tg.heights[(r0 + 1) * tg.columns + c0 + 1]!;
      const hInterp =
        h00 * (1 - fc) * (1 - fr) +
        h10 * fc * (1 - fr) +
        h01 * (1 - fc) * fr +
        h11 * fc * fr;
      heights.push(hInterp);
    }

    // Find min/max for scaling
    let eMin = Infinity;
    let eMax = -Infinity;
    for (const eh of heights) {
      if (eh < eMin) eMin = eh;
      if (eh > eMax) eMax = eh;
    }
    // Add some breathing room
    const eRange = Math.max(eMax - eMin, 5);
    eMin -= eRange * 0.1;
    eMax += eRange * 0.1;
    const eFinalRange = eMax - eMin;

    ctx.save();
    ctx.globalAlpha = 0.6;

    // Filled area chart
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    for (let i = 0; i <= samples; i++) {
      const px = x + (i / samples) * w;
      const py = y + h - ((heights[i]! - eMin) / eFinalRange) * h;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(x + w, y + h);
    ctx.closePath();

    // Gradient fill
    const grad = ctx.createLinearGradient(x, y, x, y + h);
    grad.addColorStop(0, 'rgba(180, 160, 130, 0.5)');
    grad.addColorStop(1, 'rgba(200, 185, 160, 0.15)');
    ctx.fillStyle = grad;
    ctx.fill();

    // Profile outline
    ctx.strokeStyle = TOPO_BORDER;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= samples; i++) {
      const px = x + (i / samples) * w;
      const py = y + h - ((heights[i]! - eMin) / eFinalRange) * h;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Vehicle marker (left side — "you are here")
    const vpy = y + h - ((heights[0]! - eMin) / eFinalRange) * h;
    ctx.fillStyle = TOPO_TRAIL;
    ctx.beginPath();
    ctx.arc(x, vpy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Objective marker (right side)
    const opy = y + h - ((heights[samples]! - eMin) / eFinalRange) * h;
    ctx.fillStyle = TOPO_ICON;
    ctx.beginPath();
    ctx.arc(x + w, opy, 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Labels
    ctx.globalAlpha = 0.5;
    ctx.font = '7px sans-serif';
    ctx.fillStyle = TOPO_ICON;
    ctx.textAlign = 'left';
    ctx.fillText('YOU', x + 1, y + h + 9);
    ctx.textAlign = 'right';
    ctx.fillText('RELAY', x + w - 1, y + h + 9);

    // Baseline
    ctx.strokeStyle = 'rgba(138, 122, 104, 0.3)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y + h);
    ctx.lineTo(x + w, y + h);
    ctx.stroke();

    ctx.restore();
  }
}
