export interface HudSnapshot {
  speedLabel: string;
  tractionLabel: string;
  surfaceLabel: string;
  biomeName: string;
  driveLabel: string;
  landmarkLabel: string;
  boostLabel: string;
  boostLevel: number;
  weatherLabel: string;
  weatherCondition: string;
  routeLabel: string;
  driftTotalLabel: string;
  mappedLabel: string;
  achievementsLabel: string;
  playersLabel: string;
  timerLabel: string;
  heading: number;
  level: number;
  levelProgress: number;
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
  weatherCondition: string;
  vehicle: { x: number; z: number; heading: number };
  trail: Array<{ x: number; z: number }>;
  trailDistanceMeters: number;
}

export type ShellMode = 'title' | 'driving' | 'arrived';

interface AppShellElements {
  canvasMount: HTMLDivElement;
  loading: HTMLDivElement;
  title: HTMLDivElement;
  startButton: HTMLButtonElement;
  playerNameInput: HTMLInputElement;
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
  compassLeft: HTMLSpanElement;
  compassCenter: HTMLSpanElement;
  compassRight: HTMLSpanElement;
  boostFill: HTMLDivElement;
  boostValue: HTMLSpanElement;
  driftValue: HTMLSpanElement;
  surfaceValue: HTMLSpanElement;
  weatherIcon: HTMLSpanElement;
  weatherText: HTMLSpanElement;
  expandedRelay: HTMLSpanElement;
  expandedTimer: HTMLSpanElement;
  expandedMapped: HTMLSpanElement;
  expandedAchievements: HTMLSpanElement;
  expandedPlayers: HTMLSpanElement;
  expandedLevel: HTMLSpanElement;
  hudExpanded: HTMLDivElement;
  mapDevice: HTMLDivElement;
  mapCanvas: HTMLCanvasElement;
  mapStatus: HTMLSpanElement;
  error: HTMLDivElement;
  radioLog: HTMLDivElement;
  driftScorePopup: HTMLDivElement;
  speedoValue: HTMLSpanElement;
  speedoFill: HTMLDivElement;
  speedo: HTMLDivElement;
  xpFill: HTMLDivElement;
  xpLabel: HTMLSpanElement;
  damageVignette: HTMLDivElement;
  settingVolume: HTMLInputElement;
  settingVolumeValue: HTMLSpanElement;
  settingQuality: HTMLDivElement;
  settingCameraShake: HTMLDivElement;
  settingInputSource: HTMLSpanElement;
  settingGamepadRow: HTMLDivElement;
  settingGamepadLabel: HTMLSpanElement;
  settingDeadzoneRow: HTMLDivElement;
  settingDeadzone: HTMLInputElement;
  settingDeadzoneValue: HTMLSpanElement;
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
  readonly #minimapContext: CanvasRenderingContext2D | null;
  #mapLayout: MapLayoutSnapshot | null = null;
  #achievementToastContainer: HTMLDivElement | null = null;
  #crosshairLockHandler: (() => void) | null = null;

  constructor(root: HTMLElement) {
    root.innerHTML = `
      <div class="app-shell">
        <div class="game-stage" id="game-stage"></div>
        <div id="crosshair" class="crosshair" aria-hidden="true"></div>

        <div id="loading" class="screen loading-screen" aria-live="polite">
          <div class="loading-card">
            <div class="loading-title">PATH</div>
            <div class="loading-copy">loading terrain / weather / relay feed</div>
          </div>
        </div>

        <section
          id="title-screen"
          class="screen title-screen"
          aria-hidden="true"
        >
          <div class="title-device">
            <div class="device-header">
              <div class="device-header-left">
                <span class="amber-led" aria-hidden="true"></span>
                <span class="device-header-label">PATH · Navigator Terminal</span>
              </div>
              <span class="device-header-version">SYS 0.4.1</span>
            </div>

            <div class="device-screen">
              <div class="device-screen-phosphor" aria-hidden="true"></div>
              <div class="crt-scanlines" aria-hidden="true"></div>
              <span class="device-screen-status">▸ Terrain preview active</span>
            </div>

            <div class="device-data-row">
              <div class="device-data-cell">
                <span class="device-data-label">Region</span>
                <span class="device-data-value">Patagonia</span>
              </div>
              <div class="device-data-cell">
                <span class="device-data-label">Grid</span>
                <span class="device-data-value">920 × 920</span>
              </div>
              <div class="device-data-cell">
                <span class="device-data-label">Conditions</span>
                <span id="title-weather" class="device-data-value">Clear</span>
              </div>
              <div class="device-data-cell">
                <span class="device-data-label">Relay</span>
                <span id="title-audio" class="device-data-value">Online</span>
              </div>
            </div>

            <div class="device-title-block">
              <div class="device-title">PATH</div>
              <div class="device-subtitle">Open-world driving · autonomous navigation</div>
              <span id="title-career" class="device-career">No runs yet</span>
            </div>

            <div class="device-footer">
              <label for="player-name-input" class="device-footer-label">Callsign</label>
              <input
                id="player-name-input"
                class="player-name-input device-input"
                type="text"
                maxlength="24"
                placeholder="Anonymous"
                autocomplete="off"
                spellcheck="false"
              />
              <button id="start-button" class="start-button device-button" type="button">
                Initialize
              </button>
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
          <div class="pause-device">
            <div class="device-header">
              <div class="device-header-left">
                <span class="amber-led" aria-hidden="true"></span>
                <span class="device-header-label">System</span>
              </div>
              <span class="device-header-version">Esc · close</span>
            </div>

            <div class="device-settings">
              <div class="device-setting-row">
                <span class="device-setting-label">Volume</span>
                <input id="setting-volume" class="device-slider" type="range" min="0" max="100" value="70" />
                <span id="setting-volume-value" class="device-setting-value">70</span>
              </div>
              <div class="device-setting-row">
                <span class="device-setting-label">Graphics</span>
                <div class="device-segmented" id="setting-quality" data-value="medium">
                  <button class="device-segment" data-val="low" type="button">Low</button>
                  <button class="device-segment is-active" data-val="medium" type="button">Med</button>
                  <button class="device-segment" data-val="high" type="button">High</button>
                </div>
              </div>
              <div class="device-setting-row">
                <span class="device-setting-label">Cam Shake</span>
                <div class="device-toggle" id="setting-camera-shake" data-on="true">
                  <div class="device-toggle-knob"></div>
                </div>
                <span class="device-toggle-label">ON</span>
              </div>
              <div class="device-setting-row" id="setting-deadzone-row" hidden>
                <span class="device-setting-label">Deadzone</span>
                <input id="setting-deadzone" class="device-slider" type="range" min="5" max="35" value="16" />
                <span id="setting-deadzone-value" class="device-setting-value">.16</span>
              </div>
              <div class="device-setting-row" id="setting-gamepad-row" hidden>
                <span class="device-setting-label">Gamepad</span>
                <span id="setting-gamepad-label" class="device-setting-value" style="flex:1">--</span>
              </div>
              <span id="setting-input-source" hidden>Keyboard</span>
            </div>

            <div class="device-actions">
              <button id="pause-resume-button" class="device-action device-action--primary" type="button">
                &#9658; Resume
              </button>
              <button id="pause-restart-button" class="device-action" type="button">
                Restart run
              </button>
              <button id="pause-god-mode-button" class="device-action" type="button">
                Free camera
              </button>
            </div>
          </div>
        </section>

        <div id="fps-counter" class="fps-counter">-- fps</div>
        <div class="hud-compass" id="hud-compass">
          <div class="hud-compass-labels">
            <span class="hud-compass-side" id="compass-left"></span>
            <span class="hud-compass-center" id="compass-center">N</span>
            <span class="hud-compass-side" id="compass-right"></span>
          </div>
          <div class="hud-compass-track">
            <div class="hud-compass-marker"></div>
          </div>
        </div>

        <div class="hud-boost" id="hud-boost">
          <span class="hud-boost-label">Boost</span>
          <div class="hud-boost-bar"><div class="hud-boost-fill" id="boost-fill"></div></div>
          <span class="hud-boost-value" id="boost-value">78%</span>
        </div>

        <div class="hud-drift" id="hud-drift">
          <span class="hud-drift-label">Drift</span>
          <span class="hud-drift-value" id="drift-value">0</span>
        </div>

        <div class="hud-surface" id="hud-surface">
          <span id="surface-value">Dirt</span>
        </div>

        <div class="hud-weather" id="hud-weather">
          <span class="hud-weather-icon" id="weather-icon">◌</span>
          <span class="hud-weather-text" id="weather-text">Cloudy</span>
        </div>

        <div class="hud-expanded" id="hud-expanded" hidden>
          <div class="hud-expanded-grid">
            <div class="hud-expanded-cell"><span class="hud-expanded-label">Relay</span><span class="hud-expanded-value" id="expanded-relay">--</span></div>
            <div class="hud-expanded-cell"><span class="hud-expanded-label">Timer</span><span class="hud-expanded-value" id="expanded-timer">0:00</span></div>
            <div class="hud-expanded-cell"><span class="hud-expanded-label">Mapped</span><span class="hud-expanded-value" id="expanded-mapped">0%</span></div>
            <div class="hud-expanded-cell"><span class="hud-expanded-label">Unlocked</span><span class="hud-expanded-value" id="expanded-achievements">0/0</span></div>
            <div class="hud-expanded-cell"><span class="hud-expanded-label">Players</span><span class="hud-expanded-value" id="expanded-players">offline</span></div>
            <div class="hud-expanded-cell"><span class="hud-expanded-label">Level</span><span class="hud-expanded-value" id="expanded-level">1</span></div>
          </div>
        </div>

        <div id="drift-score-popup" class="drift-score-popup" aria-hidden="true"></div>

        <div id="speedo" class="speedo" aria-hidden="true">
          <span id="speedo-value" class="speedo-value">0</span>
          <span class="speedo-unit">km/h</span>
          <div class="speedo-bar">
            <div id="speedo-fill" class="speedo-fill"></div>
          </div>
        </div>

        <div class="hud-xp" id="hud-xp">
          <div class="hud-xp-bar">
            <div class="hud-xp-fill" id="xp-fill"></div>
          </div>
          <span class="hud-xp-label" id="xp-label">Lv 1</span>
        </div>

        <div class="hud-minimap" id="hud-minimap">
          <canvas id="minimap-canvas" width="96" height="96"></canvas>
        </div>

        <div id="damage-vignette" class="damage-vignette" aria-hidden="true"></div>

        <aside id="map-device" class="map-device" aria-hidden="true" hidden>
          <div class="map-shell">
            <div class="map-screen-wrap">
              <canvas
                id="map-canvas"
                class="map-screen"
                width="700"
                height="700"
              ></canvas>
            </div>
            <div class="map-footer">
              <span id="map-status" class="map-status">Summit relay 0 m away</span>
              <span class="map-meta">M to close</span>
            </div>
          </div>
        </aside>

        <div class="error-banner" hidden></div>

        <div id="radio-log" class="radio-log" aria-live="polite"></div>
        <div id="achievement-toasts" class="achievement-toasts" aria-live="polite"></div>

        <div class="level-up-overlay" id="level-up-overlay">
          <div class="level-up-content">
            <div class="level-up-label">System Upgrade</div>
            <div class="level-up-level" id="level-up-level">Level 2</div>
            <div class="level-up-unlocks" id="level-up-unlocks"></div>
          </div>
        </div>
      </div>
    `;

    this.elements = {
      canvasMount: this.#query(root, '#game-stage'),
      loading: this.#query(root, '#loading'),
      title: this.#query(root, '#title-screen'),
      startButton: this.#query(root, '#start-button'),
      playerNameInput: this.#query(root, '#player-name-input'),
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
      compassLeft: this.#query(root, '#compass-left'),
      compassCenter: this.#query(root, '#compass-center'),
      compassRight: this.#query(root, '#compass-right'),
      boostFill: this.#query(root, '#boost-fill'),
      boostValue: this.#query(root, '#boost-value'),
      driftValue: this.#query(root, '#drift-value'),
      surfaceValue: this.#query(root, '#surface-value'),
      weatherIcon: this.#query(root, '#weather-icon'),
      weatherText: this.#query(root, '#weather-text'),
      expandedRelay: this.#query(root, '#expanded-relay'),
      expandedTimer: this.#query(root, '#expanded-timer'),
      expandedMapped: this.#query(root, '#expanded-mapped'),
      expandedAchievements: this.#query(root, '#expanded-achievements'),
      expandedPlayers: this.#query(root, '#expanded-players'),
      expandedLevel: this.#query(root, '#expanded-level'),
      hudExpanded: this.#query(root, '#hud-expanded'),
      mapDevice: this.#query(root, '#map-device'),
      mapCanvas: this.#query(root, '#map-canvas'),
      mapStatus: this.#query(root, '#map-status'),
      error: this.#query(root, '.error-banner'),
      radioLog: this.#query(root, '#radio-log'),
      driftScorePopup: this.#query(root, '#drift-score-popup'),
      speedoValue: this.#query(root, '#speedo-value'),
      speedoFill: this.#query(root, '#speedo-fill'),
      speedo: this.#query(root, '#speedo'),
      xpFill: this.#query(root, '#xp-fill'),
      xpLabel: this.#query(root, '#xp-label'),
      damageVignette: this.#query(root, '#damage-vignette'),
      settingVolume: this.#query(root, '#setting-volume'),
      settingVolumeValue: this.#query(root, '#setting-volume-value'),
      settingQuality: this.#query(root, '#setting-quality'),
      settingCameraShake: this.#query(root, '#setting-camera-shake'),
      settingInputSource: this.#query(root, '#setting-input-source'),
      settingGamepadRow: this.#query(root, '#setting-gamepad-row'),
      settingGamepadLabel: this.#query(root, '#setting-gamepad-label'),
      settingDeadzoneRow: this.#query(root, '#setting-deadzone-row'),
      settingDeadzone: this.#query(root, '#setting-deadzone'),
      settingDeadzoneValue: this.#query(root, '#setting-deadzone-value'),
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
    const minimapCanvas = root.querySelector<HTMLCanvasElement>('#minimap-canvas');
    this.#minimapContext = minimapCanvas?.getContext('2d') ?? null;
    this.#drawMap(null);
    this.#achievementToastContainer = root.querySelector('#achievement-toasts');

    // Settings panel interactivity
    this.elements.settingVolume.addEventListener('input', () => {
      this.elements.settingVolumeValue.textContent = this.elements.settingVolume.value;
    });
    this.elements.settingDeadzone.addEventListener('input', () => {
      const val = Number(this.elements.settingDeadzone.value) / 100;
      this.elements.settingDeadzoneValue.textContent = val.toFixed(2);
    });

    // Segmented toggle: graphics quality
    const qualityContainer = this.elements.settingQuality;
    qualityContainer.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('.device-segment') as HTMLButtonElement | null;
      if (!btn) return;
      qualityContainer.querySelectorAll('.device-segment').forEach((s) => s.classList.remove('is-active'));
      btn.classList.add('is-active');
      qualityContainer.dataset.value = btn.dataset.val ?? 'medium';
    });

    // Square toggle: camera shake
    const shakeToggle = this.elements.settingCameraShake;
    shakeToggle.addEventListener('click', () => {
      const isOn = shakeToggle.dataset.on === 'true';
      shakeToggle.dataset.on = String(!isOn);
      const label = shakeToggle.nextElementSibling as HTMLElement | null;
      if (label) label.textContent = isOn ? 'OFF' : 'ON';
    });

    // Toggle crosshair visibility based on pointer lock
    const crosshair = root.querySelector('#crosshair');
    if (crosshair) {
      this.#crosshairLockHandler = () => {
        crosshair.classList.toggle('visible', !!document.pointerLockElement);
      };
      document.addEventListener('pointerlockchange', this.#crosshairLockHandler);
    }
  }

  showAchievementToast(title: string, description: string, icon: string): void {
    const container = this.#achievementToastContainer;
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'achievement-toast';

    // Eyebrow label
    const eyebrow = document.createElement('div');
    eyebrow.className = 'achievement-toast__eyebrow';
    eyebrow.textContent = 'Achievement unlocked';

    const main = document.createElement('div');
    main.className = 'achievement-toast__main';

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
    main.appendChild(iconEl);
    main.appendChild(body);

    // Progress bar at bottom
    const progress = document.createElement('div');
    progress.className = 'achievement-toast__progress';
    const progressFill = document.createElement('div');
    progressFill.className = 'achievement-toast__progress-fill';
    progress.appendChild(progressFill);

    toast.appendChild(eyebrow);
    toast.appendChild(main);
    toast.appendChild(progress);
    container.appendChild(toast);

    // Trigger enter animation next frame
    requestAnimationFrame(() => {
      toast.classList.add('visible');
      // Start progress bar countdown
      requestAnimationFrame(() => {
        progressFill.style.width = '0%';
      });
    });

    // Auto-dismiss after 4s
    setTimeout(() => {
      toast.classList.remove('visible');
      toast.classList.add('exiting');
      setTimeout(() => toast.remove(), 500);
    }, 4000);
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

  showLevelUp(level: number, unlocks: string[]): void {
    const overlay = document.getElementById('level-up-overlay');
    const levelEl = document.getElementById('level-up-level');
    const unlocksEl = document.getElementById('level-up-unlocks');
    if (!overlay || !levelEl || !unlocksEl) return;

    levelEl.textContent = `Level ${level}`;
    unlocksEl.textContent = unlocks.length > 0 ? unlocks.join(' / ') : '';

    overlay.classList.add('visible');

    setTimeout(() => {
      overlay.classList.remove('visible');
    }, 2800); // 0.3s fade-in + 2.5s hold, then CSS 0.5s fade-out
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
    // Load saved player name from localStorage
    const savedName = localStorage.getItem('path-player-name') ?? '';
    this.elements.playerNameInput.value = savedName;

    // Save name on change
    this.elements.playerNameInput.addEventListener('input', () => {
      localStorage.setItem('path-player-name', this.elements.playerNameInput.value.trim());
    });

    // Prevent game input capture while typing name
    this.elements.playerNameInput.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') {
        this.elements.playerNameInput.blur();
        handler();
      }
    });

    this.elements.startButton.addEventListener('click', handler);
  }

  updateSettingsPanel(inputSource: string, gamepadConnected: boolean, gamepadLabel: string | null): void {
    this.elements.settingInputSource.textContent = inputSource;
    this.elements.settingGamepadRow.hidden = !gamepadConnected;
    this.elements.settingDeadzoneRow.hidden = !gamepadConnected;
    if (gamepadConnected && gamepadLabel) {
      this.elements.settingGamepadLabel.textContent = gamepadLabel;
    }
  }

  getSettingsValues(): { volume: number; quality: string; cameraShake: boolean; deadzone: number } {
    return {
      volume: Number(this.elements.settingVolume.value) / 100,
      quality: this.elements.settingQuality.dataset.value ?? 'medium',
      cameraShake: this.elements.settingCameraShake.dataset.on === 'true',
      deadzone: Number(this.elements.settingDeadzone.value) / 100,
    };
  }

  flashDamage(intensity: number): void {
    const el = this.elements.damageVignette;
    el.style.opacity = String(Math.min(intensity, 0.7));
    el.classList.add('active');
    // Let CSS transition handle fade-out
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.classList.remove('active'), 400);
    }, 80);
  }

  getPlayerName(): string {
    return this.elements.playerNameInput.value.trim() || 'Anonymous';
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
    const speedKmh = Number.parseInt(snapshot.speedLabel, 10);

    // Bottom speedometer
    this.elements.speedoValue.textContent = String(speedKmh || 0);
    const speedFraction = Math.min(speedKmh / 140, 1);
    this.elements.speedoFill.style.width = `${speedFraction * 100}%`;
    this.elements.speedo.dataset.intensity =
      speedKmh > 100 ? 'red' : speedKmh > 70 ? 'warm' : '';

    // Floating HUD elements
    this.elements.boostFill.style.width = `${Math.round(snapshot.boostLevel * 100)}%`;
    this.elements.boostValue.textContent = snapshot.boostLabel;
    this.elements.driftValue.textContent = snapshot.driftTotalLabel;
    this.elements.surfaceValue.textContent = `${snapshot.biomeName} · ${snapshot.surfaceLabel}`;

    // Surface color
    this.elements.surfaceValue.dataset.surface =
      snapshot.surfaceLabel === 'Water' ? 'water'
        : snapshot.surfaceLabel === 'Snow' ? 'snow'
        : snapshot.surfaceLabel === 'Sand' ? 'sand'
        : snapshot.surfaceLabel === 'Rock' ? 'rock'
        : 'dirt';

    // Weather
    const weatherIcon =
      snapshot.weatherCondition === 'sunny' ? '\u25CB'     // ○
        : snapshot.weatherCondition === 'rainy' ? '\u2261' // ≡
        : snapshot.weatherCondition === 'snowy' ? '\u2726' // ✦
        : snapshot.weatherCondition === 'blizzard' ? '\u2726\u2726' // ✦✦
        : snapshot.weatherCondition === 'dust' ? '\u25CC'  // ◌
        : '\u25CC';                                        // ◌ (cloudy default)
    this.elements.weatherIcon.textContent = weatherIcon;
    this.elements.weatherText.textContent = snapshot.weatherLabel;

    // Compass
    this.updateCompass(snapshot.heading);

    // XP bar
    this.elements.xpFill.style.width = `${Math.round(snapshot.levelProgress * 100)}%`;
    this.elements.xpLabel.textContent = `Lv ${snapshot.level}`;

    // Expanded grid
    this.elements.expandedRelay.textContent = snapshot.landmarkLabel;
    this.elements.expandedTimer.textContent = snapshot.timerLabel;
    this.elements.expandedMapped.textContent = snapshot.mappedLabel;
    this.elements.expandedAchievements.textContent = snapshot.achievementsLabel;
    this.elements.expandedPlayers.textContent = snapshot.playersLabel;
    this.elements.expandedLevel.textContent = `${snapshot.level}`;
  }

  updateCompass(heading: number): void {
    // Normalize to 0-360
    const deg = ((heading % 360) + 360) % 360;

    const cardinals: Array<[string, number]> = [
      ['N', 0], ['NE', 45], ['E', 90], ['SE', 135],
      ['S', 180], ['SW', 225], ['W', 270], ['NW', 315],
    ];

    // Find the closest cardinal
    let closestIdx = 0;
    let closestDist = 360;
    for (let i = 0; i < cardinals.length; i++) {
      let dist = Math.abs(deg - cardinals[i]![1]);
      if (dist > 180) dist = 360 - dist;
      if (dist < closestDist) {
        closestDist = dist;
        closestIdx = i;
      }
    }

    const prevIdx = (closestIdx - 1 + cardinals.length) % cardinals.length;
    const nextIdx = (closestIdx + 1) % cardinals.length;

    this.elements.compassLeft.textContent = cardinals[prevIdx]![0];
    this.elements.compassCenter.textContent = cardinals[closestIdx]![0];
    this.elements.compassRight.textContent = cardinals[nextIdx]![0];
  }

  toggleHudExpanded(): void {
    const el = this.elements.hudExpanded;
    el.hidden = !el.hidden;
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

  #driftScoreTimer = 0;

  /** Show live accumulating points during an active drift. */
  updateActiveDrift(points: number): void {
    const el = this.elements.driftScorePopup;
    el.textContent = `drift ${points}`;
    el.classList.remove('drift-score-popup--fade');
    el.classList.add('drift-score-popup--active');
    el.hidden = false;
    el.ariaHidden = 'false';
    clearTimeout(this.#driftScoreTimer);
  }

  /** Flash the final scored drift and fade out. */
  showDriftScore(points: number, duration: number): void {
    const el = this.elements.driftScorePopup;
    const label = duration > 2.5 ? 'DRIFT' : 'drift';
    el.textContent = `${label} +${points}`;
    el.classList.remove('drift-score-popup--active');
    el.classList.remove('drift-score-popup--fade');
    el.hidden = false;
    el.ariaHidden = 'false';
    // Force reflow so the transition restarts
    void el.offsetWidth;
    this.#driftScoreTimer = window.setTimeout(() => {
      el.classList.add('drift-score-popup--fade');
      window.setTimeout(() => {
        el.hidden = true;
        el.ariaHidden = 'true';
      }, 600);
    }, 1200);
  }

  /** Hide any active drift display immediately. */
  clearDriftScore(): void {
    clearTimeout(this.#driftScoreTimer);
    const el = this.elements.driftScorePopup;
    el.hidden = true;
    el.ariaHidden = 'true';
    el.classList.remove('drift-score-popup--active');
    el.classList.remove('drift-score-popup--fade');
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

  updateMinimap(
    cells: Uint8Array,
    columns: number,
    rows: number,
    playerX: number,
    playerZ: number,
    worldSize: number,
  ): void {
    const ctx = this.#minimapContext;
    if (!ctx) return;
    const w = 96, h = 96;
    ctx.clearRect(0, 0, w, h);

    // Draw fog grid
    const cellW = w / columns;
    const cellH = h / rows;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const discovered = (cells[r * columns + c] ?? 0) > 0;
        ctx.fillStyle = discovered
          ? 'rgba(212, 167, 74, 0.08)'
          : 'rgba(10, 12, 16, 0.6)';
        ctx.fillRect(c * cellW, r * cellH, cellW, cellH);
      }
    }

    // Player dot (amber with glow)
    const half = worldSize * 0.5;
    const px = ((playerX + half) / worldSize) * w;
    const pz = ((playerZ + half) / worldSize) * h;
    ctx.fillStyle = 'rgba(212, 167, 74, 0.9)';
    ctx.shadowColor = 'rgba(212, 167, 74, 0.4)';
    ctx.shadowBlur = 6;
    ctx.fillRect(px - 2, pz - 2, 4, 4);
    ctx.shadowBlur = 0;
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
    condition: string,
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
