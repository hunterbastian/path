import * as THREE from 'three';
import { EngineAudio, type AmbientAudioState } from '../audio/EngineAudio';
import { ThirdPersonCamera } from '../camera/ThirdPersonCamera';
import { GameTuningStore } from '../config/GameTuning';
import {
  AppShell,
  type ArrivalSnapshot,
  type HudSnapshot,
  type MapLayoutSnapshot,
  type MapRuntimeSnapshot,
} from '../core/AppShell';
import { Engine } from '../core/Engine';
import { FixedStepLoop } from '../core/FixedStepLoop';
import { InputManager } from '../core/InputManager';
import { DebugPanel, type DebugTelemetrySnapshot } from '../debug/DebugPanel';
import { DustEmitter } from '../effects/DustEmitter';
import { DustSystem } from '../effects/DustSystem';
import { RainSystem } from '../effects/RainSystem';
import { SplashEmitter } from '../effects/SplashEmitter';
import { SplashSystem } from '../effects/SplashSystem';
import { TireTrackSystem } from '../effects/TireTrackSystem';
import { WindSystem } from '../effects/WindSystem';
import { MapDiscoverySystem } from '../gameplay/MapDiscoverySystem';
import {
  ScenarioFixtures,
  type ScenarioFixtureId,
} from '../gameplay/ScenarioFixtures';
import { RunSession } from '../gameplay/RunSession';
import { WeatherState, type WeatherSnapshot } from '../gameplay/WeatherState';
import {
  RENDER_DEBUG_VIEWS,
  cycleRenderDebugView,
  getRenderDebugViewLabel,
  isRenderDebugViewId,
  type RenderDebugViewId,
} from '../render/RenderDebugView';
import { Vehicle } from '../vehicle/Vehicle';
import { VehicleController } from '../vehicle/VehicleController';
import { ObjectiveBeacon } from '../world/ObjectiveBeacon';
import { AmbientTrafficSystem } from '../world/AmbientTrafficSystem';
import { Sky } from '../world/Sky';
import { Terrain } from '../world/Terrain';
import { Water } from '../world/Water';
import { WorldStreamer, type WorldStreamSnapshot } from '../world/WorldStreamer';

const PHYSICS_STEP_SECONDS = 1 / 60;
const SCENARIO_IDS: ScenarioFixtureId[] = [
  'spawn',
  'sand',
  'outpost',
  'drop',
  'objective',
  'drift',
  'water',
];

export class PathGame {
  readonly #shell: AppShell;
  readonly #tuningStore: GameTuningStore;
  readonly #engine: Engine;
  readonly #input: InputManager;
  readonly #terrain: Terrain;
  readonly #water: Water;
  readonly #vehicle: Vehicle;
  readonly #controller: VehicleController;
  readonly #camera: ThirdPersonCamera;
  readonly #engineAudio: EngineAudio;
  readonly #rainSystem: RainSystem;
  readonly #dustSystem: DustSystem;
  readonly #dustEmitter: DustEmitter;
  readonly #splashSystem: SplashSystem;
  readonly #splashEmitter: SplashEmitter;
  readonly #tireTrackSystem: TireTrackSystem;
  readonly #windSystem: WindSystem;
  readonly #loop: FixedStepLoop;
  readonly #spawnPosition: THREE.Vector3;
  readonly #objectivePosition: THREE.Vector3;
  readonly #landmarkPosition: THREE.Vector3;
  readonly #outpostPositions: THREE.Vector3[];
  readonly #routeOutposts: ObjectiveBeacon[];
  readonly #objectiveBeacon: ObjectiveBeacon;
  readonly #ambientTraffic: AmbientTrafficSystem;
  readonly #sky: Sky;
  readonly #mapDiscovery: MapDiscoverySystem;
  readonly #runSession: RunSession;
  readonly #scenarioFixtures: ScenarioFixtures;
  readonly #worldStreamer: WorldStreamer;
  readonly #weatherState: WeatherState;
  readonly #debugPanel: DebugPanel;
  #mapVisible = false;
  #uiPulseTime = 0;
  #checkpointBannerTime = 0;
  #checkpointBannerLabel = '';
  #activeScenario: ScenarioFixtureId = 'spawn';
  #renderDebugView: RenderDebugViewId = 'final';
  #lastWeatherSnapshot: WeatherSnapshot;
  #lastWorldStreamSnapshot: WorldStreamSnapshot;

  constructor(root: HTMLElement) {
    this.#shell = new AppShell(root);
    this.#tuningStore = new GameTuningStore();
    this.#engine = new Engine(this.#shell.elements.canvasMount);
    this.#shell.mountCanvas(this.#engine.renderer.domElement);
    this.#input = new InputManager(this.#engine.renderer.domElement);

    this.#sky = new Sky(this.#engine.scene);
    this.#terrain = new Terrain(this.#engine.scene);
    this.#water = new Water(this.#engine.scene, this.#terrain);
    this.#spawnPosition = this.#terrain.getSpawnPosition();
    this.#outpostPositions = this.#terrain.getOutpostPositions();
    this.#objectivePosition =
      this.#outpostPositions[this.#outpostPositions.length - 1]?.clone()
      ?? this.#terrain.getObjectivePosition();
    this.#landmarkPosition = this.#terrain.getLandmarkPosition();
    this.#routeOutposts = this.#outpostPositions
      .slice(0, -1)
      .map(
        (position, index) =>
          new ObjectiveBeacon(this.#engine.scene, position, {
            accentColor: index === 0 ? 0xe9c98b : 0xffad74,
          }),
      );
    this.#objectiveBeacon = new ObjectiveBeacon(
      this.#engine.scene,
      this.#objectivePosition,
      { objective: true },
    );
    this.#ambientTraffic = new AmbientTrafficSystem(
      this.#engine.scene,
      this.#terrain,
      this.#outpostPositions,
    );

    this.#vehicle = new Vehicle(this.#engine.scene);
    this.#controller = new VehicleController(
      this.#terrain,
      this.#water,
      this.#tuningStore.values,
      this.#spawnPosition,
    );
    this.#camera = new ThirdPersonCamera(
      this.#tuningStore.values,
      this.#terrain,
      this.#engine.renderer.domElement,
    );
    this.#engineAudio = new EngineAudio();
    this.#rainSystem = new RainSystem(this.#engine.scene, this.#terrain);
    this.#dustSystem = new DustSystem(this.#engine.scene);
    this.#dustEmitter = new DustEmitter(this.#dustSystem);
    this.#splashSystem = new SplashSystem(this.#engine.scene);
    this.#splashEmitter = new SplashEmitter(this.#splashSystem);
    this.#tireTrackSystem = new TireTrackSystem(this.#engine.scene, this.#terrain);
    this.#windSystem = new WindSystem(this.#engine.scene);

    this.#mapDiscovery = new MapDiscoverySystem({
      worldSize: this.#terrain.size,
      columns: this.#tuningStore.values.map.discoveryColumns,
      rows: this.#tuningStore.values.map.discoveryRows,
      revealRadius: this.#tuningStore.values.map.revealRadius,
      startRevealRadius: this.#tuningStore.values.map.startRevealRadius,
    });
    this.#runSession = new RunSession(
      this.#tuningStore.values.run.arrivalRadius,
      this.#outpostPositions.length,
    );
    this.#scenarioFixtures = new ScenarioFixtures(
      this.#terrain,
      this.#water,
      this.#spawnPosition,
      this.#objectivePosition,
      this.#outpostPositions,
    );
    this.#debugPanel = new DebugPanel(
      root,
      this.#tuningStore,
      this.#scenarioFixtures.list(),
      [...RENDER_DEBUG_VIEWS],
      (fixtureId) => this.jumpToFixture(fixtureId),
      (viewId) => {
        this.setRenderDebugView(viewId);
      },
    );
    this.#engine.postProcess.setWaterDebugPools(this.#water.pools);
    this.setRenderDebugView('final');
    this.#worldStreamer = new WorldStreamer(
      this.#tuningStore.values,
      this.#terrain,
      this.#water,
      this.#windSystem,
      this.#routeOutposts,
      this.#outpostPositions.slice(0, -1),
      this.#objectiveBeacon,
      this.#objectivePosition,
    );
    this.#weatherState = new WeatherState(
      this.#tuningStore.values,
      this.#sky,
      this.#rainSystem,
    );
    this.#lastWeatherSnapshot = this.#weatherState.snapshot;
    this.#lastWorldStreamSnapshot = this.#worldStreamer.snapshot;

    this.#loop = new FixedStepLoop({
      stepSeconds: PHYSICS_STEP_SECONDS,
      onStep: (dt) => this.#step(dt),
      onRender: () => this.#render(),
    });
  }

  async boot(): Promise<void> {
    this.#shell.bindStart(() => this.start());
    this.#shell.bindRestart(() => this.#restartRun());
    this.#shell.setLoadingVisible(false);
    this.#shell.setTitleVisible(true);
    this.#shell.setArrivalVisible(false);
    this.#shell.configureMap(this.#buildMapLayoutSnapshot());
    this.#shell.setMapVisible(false);
    this.#shell.setMode(this.#runSession.mode);
    this.#shell.updateHud(this.#buildHudSnapshot());
    this.#shell.updateArrival(this.#buildArrivalSnapshot());
    this.#shell.updateMap(this.#buildMapRuntimeSnapshot());
    this.#debugPanel.updateTelemetry(this.#buildDebugTelemetrySnapshot());
    this.#loop.start();
  }

  dispose(): void {
    this.#loop.stop();
    this.#input.dispose();
    this.#camera.dispose();
    this.#engineAudio.dispose();
    this.#rainSystem.dispose();
    this.#tireTrackSystem.dispose();
    this.#engine.dispose();
  }

  start(): void {
    if (this.#runSession.mode === 'driving') return;
    this.#activeScenario = 'spawn';
    this.#runSession.start();
    this.#enterDrivingPresentation();
  }

  advanceTime(milliseconds: number): void {
    this.#loop.advance(milliseconds);
  }

  jumpToObjective(): void {
    this.jumpToFixture('objective');
  }

  jumpToSand(): void {
    this.jumpToFixture('sand');
  }

  jumpToFixture(fixtureId: string): void {
    const scenarioId = this.#resolveScenarioId(fixtureId);
    if (!scenarioId) return;

    const fixture = this.#scenarioFixtures.get(scenarioId);
    this.#activeScenario = scenarioId;
    this.#controller.teleport(fixture.position, fixture.heading);
    this.#vehicle.setPose(
      this.#controller.pose.position,
      this.#controller.pose.quaternion,
    );
    this.#runSession.restart();
    this.#enterDrivingPresentation();
  }

  toggleDebugPanel(): boolean {
    return this.#debugPanel.toggle();
  }

  setRenderDebugView(viewId: string): RenderDebugViewId {
    if (isRenderDebugViewId(viewId)) {
      this.#renderDebugView = viewId;
      this.#engine.postProcess.setDebugView(viewId);
      this.#debugPanel.setRenderView(viewId);
    }
    return this.#renderDebugView;
  }

  getRenderDebugState(): {
    activeView: RenderDebugViewId;
    label: string;
    availableViews: Array<{ id: RenderDebugViewId; label: string }>;
  } {
    return {
      activeView: this.#renderDebugView,
      label: getRenderDebugViewLabel(this.#renderDebugView),
      availableViews: [...RENDER_DEBUG_VIEWS],
    };
  }

  getAudioDebug(): ReturnType<EngineAudio['getDebugState']> {
    return this.#engineAudio.getDebugState();
  }

  getTuningDebug(): {
    vehicle: {
      speedMultiplier: number;
      accelerationMultiplier: number;
      gripMultiplier: number;
      yawDampingMultiplier: number;
      sinkDepthMultiplier: number;
    };
    weather: {
      rainDensity: number;
      fogDistanceMultiplier: number;
    };
    camera: {
      distanceOffset: number;
      heightOffset: number;
    };
    activeScenario: ScenarioFixtureId;
    renderDebugView: RenderDebugViewId;
    debugVisible: boolean;
  } {
    return {
      vehicle: {
        speedMultiplier: this.#tuningStore.values.vehicle.speedMultiplier,
        accelerationMultiplier:
          this.#tuningStore.values.vehicle.accelerationMultiplier,
        gripMultiplier: this.#tuningStore.values.vehicle.gripMultiplier,
        yawDampingMultiplier:
          this.#tuningStore.values.vehicle.yawDampingMultiplier,
        sinkDepthMultiplier:
          this.#tuningStore.values.vehicle.sinkDepthMultiplier,
      },
      weather: {
        rainDensity: this.#tuningStore.values.weather.rainDensity,
        fogDistanceMultiplier:
          this.#tuningStore.values.weather.fogDistanceMultiplier,
      },
      camera: {
        distanceOffset: this.#tuningStore.values.camera.drive.distanceOffset,
        heightOffset: this.#tuningStore.values.camera.drive.heightOffset,
      },
      activeScenario: this.#activeScenario,
      renderDebugView: this.#renderDebugView,
      debugVisible: this.#debugPanel.visible,
    };
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
    const runSnapshot = this.#runSession.snapshot;

    return JSON.stringify({
      mode: runSnapshot.mode,
      mapVisible: this.#mapVisible,
      note: 'Coordinates use meters with origin at world center; +x east/right, +z forward/south, +y up.',
      titleVisible: this.#shell.elements.title.classList.contains('visible'),
      arrivalVisible: this.#shell.elements.arrival.classList.contains('visible'),
      loadingVisible: !this.#shell.elements.loading.hidden,
      vehicle: {
        position: this.#roundVector(position),
        velocity: this.#roundVector(velocity),
        headingDegrees: Number(
          THREE.MathUtils.radToDeg(this.#controller.heading).toFixed(1),
        ),
        speedKmh: Math.round(state.speed * 3.6),
        forwardSpeedKmh: Math.round(state.forwardSpeed * 3.6),
        lateralSpeedKmh: Math.round(state.lateralSpeed * 3.6),
        verticalSpeedKmh: Math.round(state.verticalSpeed * 3.6),
        airborneTimeSeconds: Number(state.airborneTime.toFixed(2)),
        sinkDepthMeters: Number(state.sinkDepth.toFixed(3)),
        surfaceBuildup: Number(state.surfaceBuildup.toFixed(2)),
        grounded: state.isGrounded,
        boosting: state.isBoosting,
        drifting: state.isDrifting,
        surface: state.surface,
      },
      world: {
        waterPools: this.#water.pools.length,
        discoveredPercent: this.#mapDiscovery.getPercent(),
        nextCheckpoint: this.#buildCheckpointDebug(runSnapshot.nextCheckpointIndex),
        objective: {
          name: 'Summit Relay Outpost',
          position: this.#roundVector(this.#objectivePosition),
          distanceMeters: Number(objectiveDistance.toFixed(1)),
          reached: runSnapshot.mode === 'arrived',
        },
        landmark: {
          name: 'Tower Mountain',
          position: this.#roundVector(this.#landmarkPosition),
          distanceMeters: Number(landmarkDistance.toFixed(1)),
        },
        outposts: this.#outpostPositions.map((outpost, index) => ({
          name:
            index === this.#outpostPositions.length - 1
              ? 'Summit Relay'
              : `Basin Outpost ${index + 1}`,
          position: this.#roundVector(outpost),
          distanceMeters: Number(
            Math.hypot(position.x - outpost.x, position.z - outpost.z).toFixed(1),
          ),
          reached: index < runSnapshot.checkpointsReached,
          next: index === runSnapshot.nextCheckpointIndex,
          objective: index === this.#outpostPositions.length - 1,
        })),
        weather: this.#lastWeatherSnapshot.label,
        rainDensity: this.#lastWeatherSnapshot.rainDensity,
        fogFar: this.#lastWeatherSnapshot.fogFar,
        tireTracksActive: this.#tireTrackSystem.getActiveCount(),
        ambientTrafficCount: this.#ambientTraffic.count,
        ambientTraffic: this.#ambientTraffic.getSnapshot(position),
      },
      run: {
        elapsedSeconds: Number(runSnapshot.elapsedSeconds.toFixed(1)),
        peakSpeedKmh: runSnapshot.peakSpeedKmh,
        checkpointsReached: runSnapshot.checkpointsReached,
        checkpointCount: runSnapshot.checkpointCount,
        nextCheckpointIndex: runSnapshot.nextCheckpointIndex,
        splitSeconds: runSnapshot.splitSeconds.map((seconds) =>
          Number(seconds.toFixed(2))),
      },
      debug: {
        panelVisible: this.#debugPanel.visible,
        activeScenario: this.#activeScenario,
        audio: this.#engineAudio.getDebugState(),
        camera: this.#camera.getDriveDebugState(),
        input: this.#input.getDebugState(),
        renderDebug: this.getRenderDebugState(),
        tuning: this.getTuningDebug(),
        streaming: this.#lastWorldStreamSnapshot,
      },
    });
  }

  #step(dt: number): void {
    this.#input.update();
    this.#uiPulseTime += dt;
    this.#checkpointBannerTime = Math.max(0, this.#checkpointBannerTime - dt);

    if (this.#input.consumeStartAction()) {
      if (this.#runSession.mode === 'arrived') {
        this.#restartRun();
        return;
      }
      if (this.#runSession.mode !== 'driving') {
        this.start();
      }
    }

    if (this.#input.consumeFullscreenToggle()) {
      void this.#toggleFullscreen();
    }

    if (this.#input.consumeDebugToggle()) {
      this.#debugPanel.toggle();
    }

    if (this.#debugPanel.visible) {
      if (this.#input.consumeRenderDebugPrevious()) {
        this.setRenderDebugView(cycleRenderDebugView(this.#renderDebugView, -1));
      }

      if (this.#input.consumeRenderDebugNext()) {
        this.setRenderDebugView(cycleRenderDebugView(this.#renderDebugView, 1));
      }
    }

    if (this.#input.consumeReset()) {
      this.#restartRun();
      return;
    }

    if (this.#input.consumeMapToggle() && this.#runSession.mode === 'driving') {
      this.#mapVisible = !this.#mapVisible;
    }

    this.#controller.update(dt, this.#input, this.#runSession.mode === 'driving');

    if (this.#runSession.mode === 'driving') {
      this.#mapDiscovery.reveal(
        this.#controller.position.x,
        this.#controller.position.z,
      );
      const nextCheckpointDistance =
        this.#getCheckpointDistance(this.#runSession.snapshot.nextCheckpointIndex);
      const runUpdate = this.#runSession.update(
        dt,
        this.#controller.state.speed * 3.6,
        nextCheckpointDistance,
        this.#getObjectiveDistance(),
      );
      if (runUpdate.checkpointReached && runUpdate.reachedCheckpointIndex !== null) {
        const checkpointNumber = runUpdate.reachedCheckpointIndex + 1;
        const checkpointCount = this.#runSession.snapshot.checkpointCount;
        this.#checkpointBannerTime = 2.2;
        this.#checkpointBannerLabel = `Checkpoint ${checkpointNumber}/${checkpointCount}`;
      }
      if (runUpdate.completed) {
        this.#completeRun();
      }
    }

    const pose = this.#controller.pose;
    this.#vehicle.setPose(pose.position, pose.quaternion);
    this.#vehicle.updateVisuals(dt, this.#controller.state);
    this.#ambientTraffic.update(dt, this.#controller.position);

    if (this.#runSession.mode === 'driving') {
      this.#camera.updateDrive(
        dt,
        this.#engine.camera,
        pose.position,
        pose.quaternion,
        this.#controller.state,
        this.#getNextCheckpointPosition(),
      );
    } else if (this.#runSession.mode === 'arrived') {
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

    this.#lastWorldStreamSnapshot = this.#worldStreamer.update(
      this.#engine.camera.position,
    );
    this.#lastWeatherSnapshot = this.#weatherState.update(
      this.#lastWorldStreamSnapshot.routeActivity,
    );

    this.#dustEmitter.update(dt, this.#controller);
    this.#dustSystem.update(dt);
    this.#splashEmitter.update(dt, this.#controller, this.#water);
    this.#splashSystem.update(dt);
    this.#tireTrackSystem.update(dt, this.#controller);
    this.#objectiveBeacon.update(dt, this.#runSession.mode === 'arrived');
    for (const outpost of this.#routeOutposts) {
      outpost.update(dt, false);
    }
    this.#windSystem.update(dt, this.#engine.camera.position);
    this.#rainSystem.update(dt, this.#engine.camera.position);
    this.#water.update(dt, this.#engine.camera.position);
    this.#engineAudio.update(
      this.#controller.state,
      this.#runSession.mode,
      this.#buildAmbientAudioSnapshot(),
    );

    this.#shell.updateHud(this.#buildHudSnapshot());
    this.#shell.setMapVisible(this.#mapVisible && this.#runSession.mode === 'driving');
    this.#shell.updateMap(this.#buildMapRuntimeSnapshot());
    this.#debugPanel.updateTelemetry(this.#buildDebugTelemetrySnapshot());
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
    const runSnapshot = this.#runSession.snapshot;
    const nextCheckpoint = this.#getCheckpointTarget(runSnapshot.nextCheckpointIndex);

    return {
      speedLabel: `${Math.round(state.speed * 3.6)} km/h`,
      tractionLabel: state.isGrounded ? 'Grounded' : 'Airborne',
      surfaceLabel: state.surface.charAt(0).toUpperCase() + state.surface.slice(1),
      driveLabel:
        this.#runSession.mode === 'arrived'
          ? 'Arrived'
          : this.#checkpointBannerTime > 0
            ? this.#checkpointBannerLabel
          : !state.isGrounded
            ? 'Airborne'
          : state.isBoosting
            ? 'Boosting'
          : state.isDrifting
              ? 'Drifting'
            : state.isBraking
                ? 'Braking'
                : 'Cruising',
      landmarkLabel:
        this.#runSession.mode === 'arrived'
          ? 'Reached'
          : nextCheckpoint
            ? `${Math.round(nextCheckpoint.distanceMeters)} m away`
            : `${Math.round(this.#getObjectiveDistance())} m away`,
      boostLabel:
        state.boostLevel > 0.98
          ? 'Ready'
          : `${Math.round(state.boostLevel * 100)}%`,
      routeLabel:
        this.#runSession.mode === 'arrived'
          ? `Relay line secured • ${this.#input.activeSourceLabel}`
          : nextCheckpoint
            ? `CP ${nextCheckpoint.index + 1}/${runSnapshot.checkpointCount} • ${this.#input.activeSourceLabel}`
            : `Route to summit relay • ${this.#input.activeSourceLabel}`,
    };
  }

  #buildArrivalSnapshot(): ArrivalSnapshot {
    const runSnapshot = this.#runSession.snapshot;
    const mappedPercent = this.#mapDiscovery.getPercent();
    return {
      timeLabel: this.#formatRunTime(runSnapshot.elapsedSeconds),
      peakSpeedLabel: `${runSnapshot.peakSpeedKmh} km/h`,
      boostLabel:
        this.#controller.state.boostLevel > 0.98
          ? 'Ready'
          : `${Math.round(this.#controller.state.boostLevel * 100)}%`,
      mappedLabel: `${mappedPercent}%`,
      relayLabel: `${runSnapshot.checkpointsReached}/${runSnapshot.checkpointCount} relay splits banked`,
      weatherLabel: `${this.#lastWeatherSnapshot.label}, ridge beacon hot`,
    };
  }

  #buildDebugTelemetrySnapshot(): DebugTelemetrySnapshot {
    return {
      mode: this.#runSession.mode,
      speedLabel: `${Math.round(this.#controller.state.speed * 3.6)} km/h`,
      surfaceLabel: this.#controller.state.surface,
      mapLabel: `${this.#mapDiscovery.getPercent()}% mapped`,
      weatherLabel: `${this.#lastWeatherSnapshot.label} | rain ${this.#lastWeatherSnapshot.rainDensity.toFixed(2)}x`,
      streamingLabel:
        `route ${this.#lastWorldStreamSnapshot.routeActivity.toFixed(2)} | ` +
        `wind ${this.#lastWorldStreamSnapshot.windDensity.toFixed(2)} | ` +
        `water ${this.#lastWorldStreamSnapshot.waterActivity.toFixed(2)}`,
      renderLabel: getRenderDebugViewLabel(this.#renderDebugView),
    };
  }

  #restartRun(): void {
    this.#controller.reset();
    this.#vehicle.setPose(
      this.#controller.pose.position,
      this.#controller.pose.quaternion,
    );
    this.#activeScenario = 'spawn';
    this.#runSession.restart();
    this.#enterDrivingPresentation();
    this.#shell.updateArrival(this.#buildArrivalSnapshot());
  }

  #completeRun(): void {
    if (this.#runSession.mode !== 'arrived') {
      this.#runSession.complete();
    }
    this.#mapVisible = false;
    this.#controller.halt();
    this.#camera.beginArrivalSequence();
    this.#engineAudio.triggerArrivalCue();
    this.#shell.setMode(this.#runSession.mode);
    this.#shell.setArrivalVisible(true);
    this.#shell.setMapVisible(false);
    this.#shell.updateArrival(this.#buildArrivalSnapshot());
  }

  #enterDrivingPresentation(): void {
    this.#mapVisible = false;
    this.#checkpointBannerTime = 0;
    this.#checkpointBannerLabel = '';
    this.#tireTrackSystem.clear();
    this.#camera.resetDriveMotion();
    this.#camera.resetArrivalSequence();
    this.#mapDiscovery.reset(
      this.#controller.position.x,
      this.#controller.position.z,
    );
    this.#shell.setMode(this.#runSession.mode);
    this.#shell.setTitleVisible(false);
    this.#shell.setArrivalVisible(false);
    this.#shell.setMapVisible(false);
    void this.#engineAudio.activate();
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
      discoveryColumns: this.#mapDiscovery.columns,
      discoveryRows: this.#mapDiscovery.rows,
      pathPoints,
      waterPools: this.#water.pools.map((pool) => ({
        x: pool.center.x,
        z: pool.center.y,
        radius: pool.radius,
      })),
      outposts: this.#outpostPositions.slice(0, -1).map((outpost) => ({
        x: outpost.x,
        z: outpost.z,
        objective: false,
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
    const runSnapshot = this.#runSession.snapshot;
    const nextCheckpoint = this.#getCheckpointTarget(runSnapshot.nextCheckpointIndex);
    const discoveredPercent = this.#mapDiscovery.getPercent();
    return {
      discoveredCells: Array.from(this.#mapDiscovery.cells),
      discoveredRatio: this.#mapDiscovery.getRatio(),
      checkpointStates: this.#outpostPositions.slice(0, -1).map((_, index) =>
        index < runSnapshot.checkpointsReached
          ? 'reached'
          : index === runSnapshot.nextCheckpointIndex
            ? 'current'
            : 'pending'),
      pulse: this.#uiPulseTime,
      statusLabel:
        this.#runSession.mode === 'arrived'
          ? `Summit relay secure | ${runSnapshot.checkpointsReached}/${runSnapshot.checkpointCount} relays`
          : nextCheckpoint
            ? `${nextCheckpoint.objective ? 'Summit relay' : `Relay ${nextCheckpoint.index + 1}`} ${Math.round(nextCheckpoint.distanceMeters)} m | ${runSnapshot.checkpointsReached}/${runSnapshot.checkpointCount} cleared`
            : `Summit relay ${Math.round(this.#getObjectiveDistance())} m away | ${discoveredPercent}% mapped`,
      vehicle: {
        x: this.#controller.position.x,
        z: this.#controller.position.z,
        heading: this.#controller.heading,
      },
    };
  }

  #getObjectiveDistance(): number {
    const position = this.#controller.position;
    return Math.hypot(
      position.x - this.#objectivePosition.x,
      position.z - this.#objectivePosition.z,
    );
  }

  #getNearestRelayDistance(): number {
    const position = this.#controller.position;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const outpost of this.#outpostPositions) {
      const distance = Math.hypot(
        position.x - outpost.x,
        position.z - outpost.z,
      );
      nearestDistance = Math.min(nearestDistance, distance);
    }
    return nearestDistance;
  }

  #getCheckpointDistance(index: number | null): number | null {
    if (index === null) return null;
    const target = this.#outpostPositions[index];
    if (!target) return null;
    const position = this.#controller.position;
    return Math.hypot(
      position.x - target.x,
      position.z - target.z,
    );
  }

  #getNextCheckpointPosition(): THREE.Vector3 | null {
    const index = this.#runSession.snapshot.nextCheckpointIndex;
    if (index === null) return null;
    return this.#outpostPositions[index] ?? null;
  }

  #getCheckpointTarget(index: number | null): {
    index: number;
    name: string;
    distanceMeters: number;
    objective: boolean;
  } | null {
    if (index === null) return null;
    const target = this.#outpostPositions[index];
    if (!target) return null;
    return {
      index,
      name:
        index === this.#outpostPositions.length - 1
          ? 'Summit Relay'
          : `Basin Outpost ${index + 1}`,
      distanceMeters: Number(this.#getCheckpointDistance(index)?.toFixed(1) ?? 0),
      objective: index === this.#outpostPositions.length - 1,
    };
  }

  #buildCheckpointDebug(index: number | null): {
    index: number;
    name: string;
    distanceMeters: number;
    objective: boolean;
  } | null {
    return this.#getCheckpointTarget(index);
  }

  #buildAmbientAudioSnapshot(): AmbientAudioState {
    const objectiveDistance = this.#getObjectiveDistance();
    const relayDistance = this.#getNearestRelayDistance();
    const landmarkDistance = Math.hypot(
      this.#controller.position.x - this.#landmarkPosition.x,
      this.#controller.position.z - this.#landmarkPosition.z,
    );
    const mountainProximity = THREE.MathUtils.clamp(
      1 - landmarkDistance / 320,
      0,
      1,
    );
    const relayProximity = THREE.MathUtils.clamp(
      1 - relayDistance / 92,
      0,
      1,
    );
    const summitProximity = THREE.MathUtils.clamp(
      1 - objectiveDistance / 120,
      0,
      1,
    );
    const windExposure = THREE.MathUtils.clamp(
      0.22
      + mountainProximity * 0.72
      + Math.abs(this.#controller.state.verticalSpeed) * 0.08
      + Math.min(this.#controller.state.speed / 26, 1) * 0.12,
      0,
      1.35,
    );

    return {
      rainDensity: this.#lastWeatherSnapshot.rainDensity,
      routeActivity: this.#lastWorldStreamSnapshot.routeActivity,
      windExposure,
      relayProximity,
      summitProximity,
      arrivalPulse: this.#runSession.mode === 'arrived' ? 1 : 0,
    };
  }

  #resolveScenarioId(fixtureId: string): ScenarioFixtureId | null {
    return SCENARIO_IDS.includes(fixtureId as ScenarioFixtureId)
      ? (fixtureId as ScenarioFixtureId)
      : null;
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
