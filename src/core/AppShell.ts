export interface HudSnapshot {
  speedLabel: string;
  tractionLabel: string;
  surfaceLabel: string;
  driveLabel: string;
  landmarkLabel: string;
  boostLabel: string;
}

export interface ArrivalSnapshot {
  timeLabel: string;
  peakSpeedLabel: string;
  boostLabel: string;
}

export interface MapLayoutSnapshot {
  worldSize: number;
  discoveryColumns: number;
  discoveryRows: number;
  pathPoints: Array<{ x: number; z: number }>;
  waterPools: Array<{ x: number; z: number; radius: number }>;
  objective: { x: number; z: number };
  landmark: { x: number; z: number };
}

export interface MapRuntimeSnapshot {
  discoveredCells: number[];
  discoveredRatio: number;
  pulse: number;
  statusLabel: string;
  vehicle: { x: number; z: number; heading: number };
}

export type ShellMode = 'title' | 'driving' | 'arrived';

interface AppShellElements {
  canvasMount: HTMLDivElement;
  loading: HTMLDivElement;
  title: HTMLDivElement;
  startButton: HTMLButtonElement;
  arrival: HTMLDivElement;
  restartButton: HTMLButtonElement;
  arrivalTime: HTMLSpanElement;
  arrivalPeak: HTMLSpanElement;
  arrivalBoost: HTMLSpanElement;
  speed: HTMLSpanElement;
  traction: HTMLSpanElement;
  surface: HTMLSpanElement;
  drive: HTMLSpanElement;
  landmark: HTMLSpanElement;
  boost: HTMLSpanElement;
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
            <div class="loading-title">PATH</div>
            <div class="loading-copy">calibrating valley systems</div>
          </div>
        </div>

        <section
          id="title-screen"
          class="screen title-screen"
          aria-hidden="true"
        >
          <div class="title-card">
            <div class="title-kicker">Dust, water, and momentum</div>
            <div class="title-name">Path</div>
            <div class="title-rule"></div>
            <p class="title-copy">
              Follow the valley seam, hold the chassis together, and aim for the
              white mountain beyond the basin.
            </p>
            <div class="title-actions">
              <button id="start-button" class="start-button" type="button">
                Start Drive
              </button>
              <div class="title-meta">Press Enter to roll out</div>
            </div>
            <div class="title-controls">
              <div>WASD or arrows to steer and drive</div>
              <div>Shift brakes, Space boosts, F toggles fullscreen</div>
              <div>R resets the run, M pulls the field map</div>
              <div>Drag to orbit the camera</div>
            </div>
          </div>
        </section>

        <section
          id="arrival-screen"
          class="screen arrival-screen"
          aria-hidden="true"
        >
          <div class="arrival-card">
            <div class="title-kicker">Signal flare secured</div>
            <div class="title-name arrival-name">Tower Mountain</div>
            <div class="title-rule"></div>
            <p class="title-copy">
              You made the basin marker. Reset the rig, take another line, and
              see if you can bring more speed into the climb.
            </p>
            <div class="arrival-grid">
              <div class="arrival-stat">
                <span class="status-label">Run time</span>
                <span id="arrival-time" class="status-value">0:00</span>
              </div>
              <div class="arrival-stat">
                <span class="status-label">Peak speed</span>
                <span id="arrival-peak" class="status-value">0 km/h</span>
              </div>
              <div class="arrival-stat">
                <span class="status-label">Boost left</span>
                <span id="arrival-boost" class="status-value">0%</span>
              </div>
            </div>
            <div class="title-actions">
              <button id="restart-button" class="start-button" type="button">
                Run Again
              </button>
              <div class="title-meta">Press Enter to reset at spawn</div>
            </div>
          </div>
        </section>

        <aside id="hud" class="hud" aria-live="polite">
          <div class="hud-panel">
            <div class="hud-main">
              <div class="speed-readout">
                <div class="hud-subtitle">Forward speed</div>
                <span id="speed" class="speed-value">0 km/h</span>
              </div>
              <div class="hud-subtitle">Signal flare route</div>
            </div>
            <div class="hud-grid">
              <div class="hud-stack">
                <span class="status-label">Traction</span>
                <span id="status-ground" class="status-value">Settled</span>
              </div>
              <div class="hud-stack">
                <span class="status-label">Surface</span>
                <span id="status-surface" class="status-value">Dirt</span>
              </div>
              <div class="hud-stack">
                <span class="status-label">Drive state</span>
                <span id="status-drive" class="status-value">Holding</span>
              </div>
              <div class="hud-stack">
                <span class="status-label">Objective</span>
                <span id="status-landmark" class="status-value">0 m out</span>
              </div>
              <div class="hud-stack">
                <span class="status-label">Boost</span>
                <span id="status-boost" class="status-value">Ready</span>
              </div>
            </div>
          </div>
        </aside>

        <aside id="map-device" class="map-device" aria-hidden="true" hidden>
          <div class="map-shell">
            <div class="map-topline">
              <div class="map-led"></div>
              <div class="map-brand">Path Field Nav</div>
              <div class="map-brand map-brand-right">DMG-TRK</div>
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
              <span id="map-status" class="map-status">Signal flare 0 m</span>
              <span class="map-meta">M to stow</span>
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
      startButton: this.#query(root, '#start-button'),
      arrival: this.#query(root, '#arrival-screen'),
      restartButton: this.#query(root, '#restart-button'),
      arrivalTime: this.#query(root, '#arrival-time'),
      arrivalPeak: this.#query(root, '#arrival-peak'),
      arrivalBoost: this.#query(root, '#arrival-boost'),
      speed: this.#query(root, '#speed'),
      traction: this.#query(root, '#status-ground'),
      surface: this.#query(root, '#status-surface'),
      drive: this.#query(root, '#status-drive'),
      landmark: this.#query(root, '#status-landmark'),
      boost: this.#query(root, '#status-boost'),
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

  updateHud(snapshot: HudSnapshot): void {
    this.elements.speed.textContent = snapshot.speedLabel;
    this.elements.traction.textContent = snapshot.tractionLabel;
    this.elements.surface.textContent = snapshot.surfaceLabel;
    this.elements.drive.textContent = snapshot.driveLabel;
    this.elements.landmark.textContent = snapshot.landmarkLabel;
    this.elements.boost.textContent = snapshot.boostLabel;
  }

  updateArrival(snapshot: ArrivalSnapshot): void {
    this.elements.arrivalTime.textContent = snapshot.timeLabel;
    this.elements.arrivalPeak.textContent = snapshot.peakSpeedLabel;
    this.elements.arrivalBoost.textContent = snapshot.boostLabel;
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
    context.lineWidth = 12;
    context.beginPath();
    this.#mapLayout.pathPoints.forEach((point, index) => {
      const [x, y] = project(point.x, point.z);
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();

    context.strokeStyle = '#0f380f';
    context.lineWidth = 4;
    context.stroke();

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
    context.fillStyle = '#0f380f';
    context.beginPath();
    context.moveTo(landmarkX, landmarkY - 9);
    context.lineTo(landmarkX - 7, landmarkY + 7);
    context.lineTo(landmarkX + 7, landmarkY + 7);
    context.closePath();
    context.fill();

    const [objectiveX, objectiveY] = project(
      this.#mapLayout.objective.x,
      this.#mapLayout.objective.z,
    );
    const pulse = snapshot ? 0.55 + 0.45 * Math.sin(snapshot.pulse * 4.4) : 0.5;
    context.globalAlpha = this.#getDiscoveryAlpha(
      this.#mapLayout.objective.x,
      this.#mapLayout.objective.z,
      discovery,
    );
    context.strokeStyle = '#0f380f';
    context.lineWidth = 2;
    context.strokeRect(objectiveX - 5, objectiveY - 5, 10, 10);
    context.fillStyle = pulse > 0.72 ? '#0f380f' : '#306230';
    context.fillRect(objectiveX - 3, objectiveY - 3, 6, 6);
    context.globalAlpha = 1;

    if (snapshot) {
      const [vehicleX, vehicleY] = project(snapshot.vehicle.x, snapshot.vehicle.z);
      context.save();
      context.translate(vehicleX, vehicleY);
      context.rotate(snapshot.vehicle.heading);
      context.fillStyle = '#0f380f';
      context.beginPath();
      context.moveTo(0, -7);
      context.lineTo(-4.5, 5);
      context.lineTo(0, 2.5);
      context.lineTo(4.5, 5);
      context.closePath();
      context.fill();
      context.restore();
    }

    context.strokeStyle = '#0f380f';
    context.lineWidth = 3;
    context.strokeRect(4, 4, width - 8, height - 8);
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
