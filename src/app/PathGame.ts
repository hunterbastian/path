import * as THREE from 'three';
import { EngineAudio } from '../audio/EngineAudio';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import {
  AppShell,
  type ArrivalSnapshot,
  type HudSnapshot,
  type MapLayoutSnapshot,
  type MapRuntimeSnapshot,
  type ShellMode,
} from '../core/AppShell';
import { Engine } from '../core/Engine';
import { FixedStepLoop } from '../core/FixedStepLoop';
import { InputManager } from '../core/InputManager';
import { DustEmitter } from '../effects/DustEmitter';
import { DustSystem } from '../effects/DustSystem';
import { SplashEmitter } from '../effects/SplashEmitter';
import { SplashSystem } from '../effects/SplashSystem';
import { WindSystem } from '../effects/WindSystem';
import { Vehicle } from '../vehicle/Vehicle';
import { VehicleController } from '../vehicle/VehicleController';
import { ObjectiveBeacon } from '../world/ObjectiveBeacon';
import { Sky } from '../world/Sky';
import { Terrain } from '../world/Terrain';
import { Water } from '../world/Water';

const PHYSICS_STEP_SECONDS = 1 / 60;
const ARRIVAL_RADIUS = 16;
const MAP_DISCOVERY_COLUMNS = 28;
const MAP_DISCOVERY_ROWS = 24;
const MAP_DISCOVERY_RADIUS = 52;
const MAP_DISCOVERY_START_RADIUS = 72;

export class PathGame {
  readonly #shell: AppShell;
  readonly #engine: Engine;
  readonly #input: InputManager;
  readonly #terrain: Terrain;
  readonly #water: Water;
  readonly #vehicle: Vehicle;
  readonly #controller: VehicleController;
  readonly #camera: ThirdPersonCamera;
  readonly #engineAudio: EngineAudio;
  readonly #dustSystem: DustSystem;
  readonly #dustEmitter: DustEmitter;
  readonly #splashSystem: SplashSystem;
  readonly #splashEmitter: SplashEmitter;
  readonly #windSystem: WindSystem;
  readonly #loop: FixedStepLoop;
  readonly #spawnPosition: THREE.Vector3;
  readonly #objectivePosition: THREE.Vector3;
  readonly #landmarkPosition: THREE.Vector3;
  readonly #objectiveBeacon: ObjectiveBeacon;
  readonly #sky: Sky;
  readonly #mapDiscovery = new Uint8Array(MAP_DISCOVERY_COLUMNS * MAP_DISCOVERY_ROWS);
  #mode: ShellMode = 'title';
  #runElapsedSeconds = 0;
  #peakSpeedKmh = 0;
  #mapVisible = false;
  #uiPulseTime = 0;

  constructor(root: HTMLElement) {
    this.#shell = new AppShell(root);
    this.#engine = new Engine(this.#shell.elements.canvasMount);
    this.#shell.mountCanvas(this.#engine.renderer.domElement);
    this.#input = new InputManager(this.#engine.renderer.domElement);

    this.#sky = new Sky(this.#engine.scene);
    this.#terrain = new Terrain(this.#engine.scene);
    this.#water = new Water(this.#engine.scene, this.#terrain);
    this.#spawnPosition = this.#terrain.getSpawnPosition();
    this.#objectivePosition = this.#terrain.getObjectivePosition();
    this.#landmarkPosition = this.#terrain.getLandmarkPosition();
    this.#objectiveBeacon = new ObjectiveBeacon(
      this.#engine.scene,
      this.#objectivePosition,
    );

    this.#vehicle = new Vehicle(this.#engine.scene);
    this.#controller = new VehicleController(
      this.#terrain,
      this.#water,
      this.#spawnPosition,
    );
    this.#camera = new ThirdPersonCamera(this.#engine.renderer.domElement);
    this.#engineAudio = new EngineAudio();

    this.#dustSystem = new DustSystem(this.#engine.scene);
    this.#dustEmitter = new DustEmitter(this.#dustSystem);
    this.#splashSystem = new SplashSystem(this.#engine.scene);
    this.#splashEmitter = new SplashEmitter(this.#splashSystem);
    this.#windSystem = new WindSystem(this.#engine.scene);

    this.#loop = new FixedStepLoop({
      stepSeconds: PHYSICS_STEP_SECONDS,
      onStep: (dt) => this.#step(dt),
      onRender: () => this.#render(),
    });
  }

  async boot(): Promise<void> {
    this.#shell.bindStart(() => this.start());
    this.#shell.bindRestart(() => this.#restartRun());
    window.addEventListener('keydown', this.#handleGlobalKeydown);
    this.#shell.setLoadingVisible(false);
    this.#shell.setTitleVisible(true);
    this.#shell.setArrivalVisible(false);
    this.#shell.configureMap(this.#buildMapLayoutSnapshot());
    this.#shell.setMapVisible(false);
    this.#shell.setMode(this.#mode);
    this.#shell.updateHud(this.#buildHudSnapshot());
    this.#shell.updateArrival(this.#buildArrivalSnapshot());
    this.#shell.updateMap(this.#buildMapRuntimeSnapshot());
    this.#loop.start();
  }

  dispose(): void {
    window.removeEventListener('keydown', this.#handleGlobalKeydown);
    this.#loop.stop();
    this.#input.dispose();
    this.#camera.dispose();
    this.#engineAudio.dispose();
    this.#engine.dispose();
  }

  start(): void {
    if (this.#mode === 'driving') return;
    this.#runElapsedSeconds = 0;
    this.#peakSpeedKmh = 0;
    this.#mapVisible = false;
    this.#resetMapDiscovery(
      this.#controller.position.x,
      this.#controller.position.z,
      MAP_DISCOVERY_START_RADIUS,
    );
    this.#mode = 'driving';
    this.#shell.setMode(this.#mode);
    this.#shell.setTitleVisible(false);
    this.#shell.setArrivalVisible(false);
    this.#shell.setMapVisible(this.#mapVisible);
    void this.#engineAudio.activate();
  }

  advanceTime(milliseconds: number): void {
    this.#loop.advance(milliseconds);
  }

  jumpToObjective(): void {
    const start = this.#objectivePosition.clone().add(new THREE.Vector3(-5, 0, -9));
    const clearance =
      this.#spawnPosition.y -
      this.#terrain.getHeightAt(this.#spawnPosition.x, this.#spawnPosition.z);
    start.y = this.#terrain.getHeightAt(start.x, start.z) + clearance;
    const heading = Math.atan2(
      this.#objectivePosition.x - start.x,
      this.#objectivePosition.z - start.z,
    );
    this.#controller.teleport(start, heading);
    this.#vehicle.setPose(this.#controller.pose.position, this.#controller.pose.quaternion);
    this.start();
  }

  renderGameToText(): string {
    const state = this.#controller.state;
    const position = this.#controller.position;
    const velocity = this.#controller.velocity;
    const objectiveDistance = this.#getObjectiveDistance();
    const landmarkDistance = Math.hypot(
      position.x - this.#landmarkPosition.x,
      position.z - this.#landmarkPosition.z,
    );

    return JSON.stringify({
      mode: this.#mode,
      mapVisible: this.#mapVisible,
      note: 'Coordinates use meters with origin at world center; +x east/right, +z forward/south, +y up.',
      titleVisible: this.#shell.elements.title.classList.contains('visible'),
      arrivalVisible: this.#shell.elements.arrival.classList.contains('visible'),
      loadingVisible: !this.#shell.elements.loading.hidden,
      vehicle: {
        position: this.#roundVector(position),
        velocity: this.#roundVector(velocity),
        headingDegrees: Number(THREE.MathUtils.radToDeg(this.#controller.heading).toFixed(1)),
        speedKmh: Math.round(state.speed * 3.6),
        forwardSpeedKmh: Math.round(state.forwardSpeed * 3.6),
        lateralSpeedKmh: Math.round(state.lateralSpeed * 3.6),
        grounded: state.isGrounded,
        boosting: state.isBoosting,
        drifting: state.isDrifting,
        surface: state.surface,
      },
      world: {
        waterPools: this.#water.pools.length,
        discoveredPercent: this.#getMapDiscoveryPercent(),
        objective: {
          name: 'Signal Flare',
          position: this.#roundVector(this.#objectivePosition),
          distanceMeters: Number(objectiveDistance.toFixed(1)),
          reached: this.#mode === 'arrived',
        },
        landmark: {
          name: 'Tower Mountain',
          position: this.#roundVector(this.#landmarkPosition),
          distanceMeters: Number(landmarkDistance.toFixed(1)),
        },
      },
      run: {
        elapsedSeconds: Number(this.#runElapsedSeconds.toFixed(1)),
        peakSpeedKmh: this.#peakSpeedKmh,
      },
    });
  }

  getAudioDebug(): ReturnType<EngineAudio['getDebugState']> {
    return this.#engineAudio.getDebugState();
  }

  #handleGlobalKeydown = (event: KeyboardEvent): void => {
    if (event.code === 'Enter') {
      event.preventDefault();
      if (this.#mode === 'arrived') {
        this.#restartRun();
        return;
      }
      this.start();
    }
  };

  #step(dt: number): void {
    this.#uiPulseTime += dt;

    if (this.#input.consumeFullscreenToggle()) {
      void this.#toggleFullscreen();
    }

    if (this.#input.consumeReset()) {
      this.#restartRun();
      return;
    }

    if (this.#input.consumeMapToggle() && this.#mode === 'driving') {
      this.#mapVisible = !this.#mapVisible;
    }

    this.#controller.update(dt, this.#input, this.#mode === 'driving');

    if (this.#mode === 'driving') {
      this.#runElapsedSeconds += dt;
      this.#revealMapAt(
        this.#controller.position.x,
        this.#controller.position.z,
        MAP_DISCOVERY_RADIUS,
      );
      this.#peakSpeedKmh = Math.max(
        this.#peakSpeedKmh,
        Math.round(this.#controller.state.speed * 3.6),
      );

      if (this.#getObjectiveDistance() <= ARRIVAL_RADIUS) {
        this.#completeRun();
      }
    }

    const pose = this.#controller.pose;
    this.#vehicle.setPose(pose.position, pose.quaternion);
    this.#vehicle.updateVisuals(dt, this.#controller.state);

    this.#dustEmitter.update(dt, this.#controller);
    this.#dustSystem.update(dt);

    this.#splashEmitter.update(dt, this.#controller, this.#water);
    this.#splashSystem.update(dt);

    this.#objectiveBeacon.update(dt, this.#mode === 'arrived');
    this.#windSystem.update(dt, this.#engine.camera.position);
    this.#water.update(dt, this.#engine.camera.position);
    this.#engineAudio.update(this.#controller.state, this.#mode);
    this.#shell.updateHud(this.#buildHudSnapshot());
    this.#shell.setMapVisible(this.#mapVisible && this.#mode === 'driving');
    this.#shell.updateMap(this.#buildMapRuntimeSnapshot());

    if (this.#mode === 'driving') {
      this.#camera.updateDrive(
        dt,
        this.#engine.camera,
        pose.position,
        pose.quaternion,
        this.#controller.state.speed,
      );
    } else if (this.#mode === 'arrived') {
      this.#camera.updateArrival(
        dt,
        this.#engine.camera,
        pose.position,
        this.#objectivePosition,
        this.#landmarkPosition,
      );
    } else {
      this.#camera.updateTitle(
        dt,
        this.#engine.camera,
        pose.position,
        this.#landmarkPosition,
      );
    }
  }

  #render(): void {
    this.#engine.render();
  }

  async #toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      await this.#shell.elements.canvasMount.requestFullscreen();
    } catch (error) {
      console.error('Fullscreen toggle failed.', error);
    }
  }

  #buildHudSnapshot(): HudSnapshot {
    const state = this.#controller.state;
    const distance = this.#getObjectiveDistance();

    return {
      speedLabel: `${Math.round(state.speed * 3.6)} km/h`,
      tractionLabel: state.isGrounded ? 'Settled' : 'Airborne',
      surfaceLabel: state.surface.charAt(0).toUpperCase() + state.surface.slice(1),
      driveLabel: this.#mode === 'arrived'
        ? 'Arrived'
        : state.isBoosting
          ? 'Boosting'
          : state.isDrifting
            ? 'Drifting'
            : state.isBraking
              ? 'Braking'
              : 'Holding',
      landmarkLabel: this.#mode === 'arrived'
        ? 'Reached'
        : `${Math.round(distance)} m out`,
      boostLabel: state.boostLevel > 0.98
        ? 'Ready'
        : `${Math.round(state.boostLevel * 100)}%`,
    };
  }

  #buildArrivalSnapshot(): ArrivalSnapshot {
    return {
      timeLabel: this.#formatRunTime(this.#runElapsedSeconds),
      peakSpeedLabel: `${this.#peakSpeedKmh} km/h`,
      boostLabel: this.#controller.state.boostLevel > 0.98
        ? 'Ready'
        : `${Math.round(this.#controller.state.boostLevel * 100)}%`,
    };
  }

  #restartRun(): void {
    this.#controller.reset();
    this.#vehicle.setPose(this.#controller.pose.position, this.#controller.pose.quaternion);
    this.#mode = 'driving';
    this.#runElapsedSeconds = 0;
    this.#peakSpeedKmh = 0;
    this.#mapVisible = false;
    this.#resetMapDiscovery(
      this.#controller.position.x,
      this.#controller.position.z,
      MAP_DISCOVERY_START_RADIUS,
    );
    this.#shell.setMode(this.#mode);
    this.#shell.setTitleVisible(false);
    this.#shell.setArrivalVisible(false);
    this.#shell.setMapVisible(false);
    this.#shell.updateArrival(this.#buildArrivalSnapshot());
  }

  #completeRun(): void {
    if (this.#mode !== 'driving') return;
    this.#mode = 'arrived';
    this.#mapVisible = false;
    this.#controller.halt();
    this.#shell.setMode(this.#mode);
    this.#shell.setArrivalVisible(true);
    this.#shell.setMapVisible(false);
    this.#shell.updateArrival(this.#buildArrivalSnapshot());
  }

  #buildMapLayoutSnapshot(): MapLayoutSnapshot {
    const halfSize = this.#terrain.size * 0.5;
    const pathPoints: Array<{ x: number; z: number }> = [];
    for (let z = -halfSize; z <= halfSize; z += 12) {
      pathPoints.push({
        x: this.#terrain.getPathCenterX(z),
        z,
      });
    }

    return {
      worldSize: this.#terrain.size,
      discoveryColumns: MAP_DISCOVERY_COLUMNS,
      discoveryRows: MAP_DISCOVERY_ROWS,
      pathPoints,
      waterPools: this.#water.pools.map((pool) => ({
        x: pool.center.x,
        z: pool.center.y,
        radius: pool.radius,
      })),
      objective: {
        x: this.#objectivePosition.x,
        z: this.#objectivePosition.z,
      },
      landmark: {
        x: this.#landmarkPosition.x,
        z: this.#landmarkPosition.z,
      },
    };
  }

  #buildMapRuntimeSnapshot(): MapRuntimeSnapshot {
    const distance = Math.round(this.#getObjectiveDistance());
    const discoveredPercent = this.#getMapDiscoveryPercent();
    return {
      discoveredCells: Array.from(this.#mapDiscovery),
      discoveredRatio: this.#getMapDiscoveryRatio(),
      pulse: this.#uiPulseTime,
      statusLabel: this.#mode === 'arrived'
        ? `Flare secured | ${discoveredPercent}% charted`
        : `Signal flare ${distance} m | ${discoveredPercent}% charted`,
      vehicle: {
        x: this.#controller.position.x,
        z: this.#controller.position.z,
        heading: this.#controller.heading,
      },
    };
  }

  #resetMapDiscovery(x: number, z: number, radius: number): void {
    this.#mapDiscovery.fill(0);
    this.#revealMapAt(x, z, radius);
  }

  #revealMapAt(x: number, z: number, radius: number): void {
    const worldSize = this.#terrain.size;
    const halfWorld = worldSize * 0.5;
    const cellWidth = worldSize / MAP_DISCOVERY_COLUMNS;
    const cellHeight = worldSize / MAP_DISCOVERY_ROWS;
    const minColumn = Math.max(
      0,
      Math.floor(((x - radius) + halfWorld) / cellWidth),
    );
    const maxColumn = Math.min(
      MAP_DISCOVERY_COLUMNS - 1,
      Math.ceil(((x + radius) + halfWorld) / cellWidth),
    );
    const minRow = Math.max(
      0,
      Math.floor(((z - radius) + halfWorld) / cellHeight),
    );
    const maxRow = Math.min(
      MAP_DISCOVERY_ROWS - 1,
      Math.ceil(((z + radius) + halfWorld) / cellHeight),
    );

    for (let row = minRow; row <= maxRow; row += 1) {
      for (let column = minColumn; column <= maxColumn; column += 1) {
        const cellCenterX = -halfWorld + (column + 0.5) * cellWidth;
        const cellCenterZ = -halfWorld + (row + 0.5) * cellHeight;
        const distance = Math.hypot(cellCenterX - x, cellCenterZ - z);
        if (distance <= radius) {
          this.#mapDiscovery[row * MAP_DISCOVERY_COLUMNS + column] = 1;
        }
      }
    }
  }

  #getMapDiscoveryRatio(): number {
    let discovered = 0;
    for (const value of this.#mapDiscovery) {
      discovered += value;
    }
    return discovered / this.#mapDiscovery.length;
  }

  #getMapDiscoveryPercent(): number {
    return Number((this.#getMapDiscoveryRatio() * 100).toFixed(1));
  }

  #getObjectiveDistance(): number {
    const position = this.#controller.position;
    return Math.hypot(
      position.x - this.#objectivePosition.x,
      position.z - this.#objectivePosition.z,
    );
  }

  #formatRunTime(seconds: number): string {
    const totalSeconds = Math.max(0, Math.round(seconds));
    const minutes = Math.floor(totalSeconds / 60);
    const remainder = totalSeconds % 60;
    return `${minutes}:${String(remainder).padStart(2, '0')}`;
  }

  #roundVector(vector: THREE.Vector3): { x: number; y: number; z: number } {
    return {
      x: Number(vector.x.toFixed(2)),
      y: Number(vector.y.toFixed(2)),
      z: Number(vector.z.toFixed(2)),
    };
  }
}
