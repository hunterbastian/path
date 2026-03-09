import * as THREE from 'three';
import { createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
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
import { SeededRandom } from '../core/SeededRandom';
import { DebugPanel, type DebugTelemetrySnapshot } from '../debug/DebugPanel';
import { DustEmitter } from '../effects/DustEmitter';
import { DustSystem, type DustConfig } from '../effects/DustSystem';
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
import type { WeatherCondition } from '../config/GameTuning';
import {
  RENDER_DEBUG_VIEWS,
  cycleRenderDebugView,
  getRenderDebugViewLabel,
  isRenderDebugViewId,
  type RenderDebugViewId,
} from '../render/RenderDebugView';
import { TitleAlphaPreviewEmbed } from '../remotion/TitleAlphaPreviewEmbed';
import { Vehicle } from '../vehicle/Vehicle';
import { VehicleController } from '../vehicle/VehicleController';
import { VehicleDamage } from '../vehicle/VehicleDamage';
import { MountainHub } from '../world/MountainHub';
import { ObjectiveBeacon } from '../world/ObjectiveBeacon';
import {
  AmbientTrafficSystem,
  type AmbientTrafficPlayerInteraction,
} from '../world/AmbientTrafficSystem';
import {
  ReactiveWorldPropsSystem,
  type ReactivePropInteraction,
} from '../world/ReactiveWorldPropsSystem';
import { Sky } from '../world/Sky';
import { GrassField } from '../world/GrassField';
import { Terrain } from '../world/Terrain';
import { Water } from '../world/Water';
import { WorldStreamer, type WorldStreamSnapshot } from '../world/WorldStreamer';

const PHYSICS_STEP_SECONDS = 1 / 60;
const SLOPE_SKITTER_DEBRIS: DustConfig = {
  size: 0.18,
  growth: 0.1,
  life: 0.84,
  spread: 0.18,
  lift: 0.08,
  jitter: 0.16,
};
const TRAFFIC_IMPACT_DEBRIS: DustConfig = {
  size: 0.3,
  growth: 0.18,
  life: 0.72,
  spread: 0.34,
  lift: 0.18,
  jitter: 0.42,
};
const SCENARIO_IDS: ScenarioFixtureId[] = [
  'spawn',
  'sand',
  'outpost',
  'slope',
  'drop',
  'objective',
  'drift',
  'water',
];

export class PathGame {
  readonly #shell: AppShell;
  readonly #titlePreviewRoot: Root;
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
  readonly #snowSpraySystem: DustSystem;
  readonly #debrisSystem: DustSystem;
  readonly #dustEmitter: DustEmitter;
  readonly #splashSystem: SplashSystem;
  readonly #mudSplashSystem: SplashSystem;
  readonly #splashEmitter: SplashEmitter;
  readonly #tireTrackSystem: TireTrackSystem;
  readonly #windSystem: WindSystem;
  readonly #loop: FixedStepLoop;
  readonly #spawnPosition: THREE.Vector3;
  readonly #objectivePosition: THREE.Vector3;
  readonly #landmarkPosition: THREE.Vector3;
  readonly #cityCenterPosition: THREE.Vector3;
  readonly #outpostPositions: THREE.Vector3[];
  readonly #routeOutposts: ObjectiveBeacon[];
  readonly #objectiveBeacon: ObjectiveBeacon;
  readonly #mountainHub: MountainHub;
  readonly #ambientTraffic: AmbientTrafficSystem;
  readonly #reactiveProps: ReactiveWorldPropsSystem;
  readonly #sky: Sky;
  readonly #grassField: GrassField;
  readonly #mapDiscovery: MapDiscoverySystem;
  readonly #runSession: RunSession;
  readonly #scenarioFixtures: ScenarioFixtures;
  readonly #worldStreamer: WorldStreamer;
  readonly #weatherState: WeatherState;
  readonly #debugPanel: DebugPanel;
  readonly #debrisRandom = new SeededRandom(0x44454252);
  readonly #debrisProbe = new THREE.Vector3();
  readonly #debrisOrigin = new THREE.Vector3();
  readonly #debrisDownhill = new THREE.Vector3();
  readonly #debrisLateral = new THREE.Vector3();
  readonly #debrisVelocity = new THREE.Vector3();
  readonly #worldUp = new THREE.Vector3(0, 1, 0);
  #mapVisible = false;
  #pauseVisible = false;
  #godModeActive = false;
  #uiPulseTime = 0;
  #checkpointBannerTime = 0;
  #checkpointBannerLabel = '';
  #activeScenario: ScenarioFixtureId = 'spawn';
  #renderDebugView: RenderDebugViewId = 'final';
  #lastWeatherSnapshot: WeatherSnapshot;
  #lastWorldStreamSnapshot: WorldStreamSnapshot;
  #lastTrafficInteraction: AmbientTrafficPlayerInteraction = {
    nearestDistanceMeters: 999,
    nearMiss: false,
    blocking: false,
    collision: false,
    sourceId: null,
    sourcePosition: null,
    correction: new THREE.Vector3(),
    impulse: new THREE.Vector3(),
  };
  #lastPropInteraction: ReactivePropInteraction = {
    nearestDistanceMeters: 999,
    collision: false,
    sourceId: null,
    correction: new THREE.Vector3(),
    impulse: new THREE.Vector3(),
  };
  #slopeDebrisTimer = 0;
  #ambientSkitterStrength = 0;
  #recentTrafficImpactDebris = 0;
  #lastTrafficCollisionSourceId: string | null = null;
  readonly #handleAudioUnlockGesture = (): void => {
    void this.#activateAudio();
  };

  constructor(root: HTMLElement) {
    this.#shell = new AppShell(root);
    this.#titlePreviewRoot = createRoot(this.#shell.elements.titlePreviewMount);
    this.#tuningStore = new GameTuningStore();
    this.#engine = new Engine(this.#shell.elements.canvasMount);
    this.#shell.mountCanvas(this.#engine.renderer.domElement);
    this.#input = new InputManager(this.#engine.renderer.domElement);

    this.#sky = new Sky(this.#engine.scene);
    this.#terrain = new Terrain(this.#engine.scene);
    this.#water = new Water(this.#engine.scene, this.#terrain);
    this.#grassField = new GrassField(this.#engine.scene, this.#terrain);
    this.#spawnPosition = this.#terrain.getSpawnPosition();
    this.#outpostPositions = this.#terrain.getOutpostPositions();
    this.#objectivePosition =
      this.#outpostPositions[this.#outpostPositions.length - 1]?.clone()
      ?? this.#terrain.getObjectivePosition();
    this.#landmarkPosition = this.#terrain.getLandmarkPosition();
    this.#cityCenterPosition = this.#terrain.getCityCenterPosition();
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
    this.#mountainHub = new MountainHub(
      this.#engine.scene,
      this.#cityCenterPosition,
      this.#objectivePosition,
    );
    this.#ambientTraffic = new AmbientTrafficSystem(
      this.#engine.scene,
      this.#terrain,
      this.#outpostPositions,
    );
    this.#reactiveProps = new ReactiveWorldPropsSystem(
      this.#engine.scene,
      this.#terrain,
      this.#outpostPositions,
      this.#cityCenterPosition,
      this.#objectivePosition,
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
    this.#snowSpraySystem = new DustSystem(this.#engine.scene, {
      capacity: 280,
      color: 0xf0f4fb,
      opacity: 0.46,
      gravity: -3.4,
      drag: 0.92,
    });
    this.#debrisSystem = new DustSystem(this.#engine.scene, {
      capacity: 180,
      color: 0x8a755e,
      opacity: 0.28,
      gravity: -9.6,
      drag: 0.88,
      fade: (lifeFraction) => Math.pow(1 - lifeFraction, 1.3),
    });
    this.#dustEmitter = new DustEmitter(this.#dustSystem, {
      terrain: this.#terrain,
      snowSystem: this.#snowSpraySystem,
      debrisSystem: this.#debrisSystem,
    });
    this.#splashSystem = new SplashSystem(this.#engine.scene);
    this.#mudSplashSystem = new SplashSystem(this.#engine.scene, {
      capacity: 180,
      color: 0x66523f,
      opacity: 0.5,
      gravity: -8.8,
      drag: 0.9,
    });
    this.#splashEmitter = new SplashEmitter(this.#splashSystem, {
      terrain: this.#terrain,
      mudSystem: this.#mudSplashSystem,
    });
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
    this.#water.setWeatherState(
      this.#lastWeatherSnapshot.waterLevelOffset,
      this.#lastWeatherSnapshot.waterActivityMultiplier,
    );
    this.#lastWorldStreamSnapshot = this.#worldStreamer.snapshot;

    this.#loop = new FixedStepLoop({
      stepSeconds: PHYSICS_STEP_SECONDS,
      maxSubSteps: 4,
      onStep: (dt) => this.#step(dt),
      onRender: (frameSeconds) => this.#render(frameSeconds),
    });
  }

  async boot(): Promise<void> {
    this.#shell.bindStart(() => this.start());
    this.#shell.bindRestart(() => this.#restartRun());
    this.#shell.bindPauseResume(() => this.#setPauseVisible(false));
    this.#shell.bindPauseGodMode(() => this.#enterGodMode());
    this.#shell.bindPauseRestart(() => this.#restartRun());
    this.#mountTitlePreview();
    this.#installAudioUnlockListeners();
    this.#shell.setLoadingVisible(false);
    this.#shell.setTitleVisible(true);
    this.#shell.setArrivalVisible(false);
    this.#shell.setPauseVisible(false);
    this.#shell.configureMap(this.#buildMapLayoutSnapshot());
    this.#shell.setMapVisible(false);
    this.#shell.setMode(this.#runSession.mode);
    this.#shell.setTitleWeather(this.#buildTitleWeatherLabel());
    this.#shell.setTitleAudio(this.#buildTitleAudioLabel());
    this.#shell.updateHud(this.#buildHudSnapshot());
    this.#shell.updateArrival(this.#buildArrivalSnapshot());
    this.#shell.updateMap(this.#buildMapRuntimeSnapshot());
    this.#debugPanel.updateTelemetry(this.#buildDebugTelemetrySnapshot());
    this.#loop.start();
  }

  dispose(): void {
    this.#loop.stop();
    this.#removeAudioUnlockListeners();
    this.#titlePreviewRoot.unmount();
    this.#input.dispose();
    this.#camera.dispose();
    this.#engineAudio.dispose();
    this.#rainSystem.dispose();
    this.#dustSystem.dispose();
    this.#snowSpraySystem.dispose();
    this.#debrisSystem.dispose();
    this.#splashSystem.dispose();
    this.#mudSplashSystem.dispose();
    this.#tireTrackSystem.dispose();
    this.#grassField.dispose();
    this.#engine.dispose();
  }

  start(): void {
    if (this.#runSession.mode === 'driving') return;
    void this.#activateAudio();
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

  jumpToCityCenter(): void {
    const snapCamera = this.#godModeActive;
    if (snapCamera) {
      this.#godModeActive = false;
      this.#camera.exitGodMode();
    }
    const start = this.#cityCenterPosition.clone().add(new THREE.Vector3(34, 0, -62));
    const heading = Math.atan2(
      this.#cityCenterPosition.x - start.x,
      this.#cityCenterPosition.z - start.z,
    );
    this.#activeScenario = 'spawn';
    this.#controller.teleport(start, heading);
    this.#vehicle.setPose(
      this.#controller.pose.position,
      this.#controller.pose.quaternion,
    );
    this.#runSession.restart();
    this.#enterDrivingPresentation({ snapCamera });
  }

  jumpToProps(): void {
    const encounter = this.#reactiveProps.getEncounterStart();
    if (!encounter) return;
    const snapCamera = this.#godModeActive;
    if (snapCamera) {
      this.#godModeActive = false;
      this.#camera.exitGodMode();
    }

    this.#activeScenario = 'spawn';
    this.#controller.teleport(encounter.position, encounter.heading);
    this.#vehicle.setPose(
      this.#controller.pose.position,
      this.#controller.pose.quaternion,
    );
    this.#runSession.restart();
    this.#enterDrivingPresentation({ snapCamera });
  }

  jumpToTraffic(): void {
    const encounter = this.#ambientTraffic.getEncounterStart();
    if (!encounter) return;
    const snapCamera = this.#godModeActive;
    if (snapCamera) {
      this.#godModeActive = false;
      this.#camera.exitGodMode();
    }

    this.#activeScenario = 'spawn';
    this.#controller.teleport(encounter.position, encounter.heading);
    this.#vehicle.setPose(
      this.#controller.pose.position,
      this.#controller.pose.quaternion,
    );
    this.#runSession.restart();
    this.#enterDrivingPresentation({ snapCamera });
  }

  jumpToFixture(fixtureId: string): void {
    const scenarioId = this.#resolveScenarioId(fixtureId);
    if (!scenarioId) return;
    const snapCamera = this.#godModeActive;
    if (snapCamera) {
      this.#godModeActive = false;
      this.#camera.exitGodMode();
    }

    const fixture = this.#scenarioFixtures.get(scenarioId);
    this.#activeScenario = scenarioId;
    this.#controller.teleport(fixture.position, fixture.heading);
    this.#vehicle.setPose(
      this.#controller.pose.position,
      this.#controller.pose.quaternion,
    );
    this.#runSession.restart();
    this.#enterDrivingPresentation({ snapCamera });
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

  forceWeather(condition: WeatherCondition | null): WeatherSnapshot {
    this.#lastWeatherSnapshot = this.#weatherState.forceCondition(condition);
    this.#water.setWeatherState(
      this.#lastWeatherSnapshot.waterLevelOffset,
      this.#lastWeatherSnapshot.waterActivityMultiplier,
    );
    this.#tireTrackSystem.setWetness(this.#lastWeatherSnapshot.rainDensity);
    this.#syncShell();
    return this.#lastWeatherSnapshot;
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
    const groundNormal = this.#terrain.getNormalAt(position.x, position.z);
    const groundSlopeDegrees = Number(
      THREE.MathUtils.radToDeg(
        Math.acos(THREE.MathUtils.clamp(groundNormal.y, -1, 1)),
      ).toFixed(1),
    );
    const objectiveDistance = this.#getObjectiveDistance();
    const landmarkDistance = Math.hypot(
      position.x - this.#landmarkPosition.x,
      position.z - this.#landmarkPosition.z,
    );
    const runSnapshot = this.#runSession.snapshot;
    const surfaceFeedback = this.#controller.surfaceFeedback;

    return JSON.stringify({
      mode: this.#godModeActive ? 'god' : runSnapshot.mode,
      runMode: runSnapshot.mode,
      godModeActive: this.#godModeActive,
      mapVisible: this.#mapVisible,
      pauseVisible: this.#pauseVisible,
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
        groundSlopeDegrees,
        airborneTimeSeconds: Number(state.airborneTime.toFixed(2)),
        sinkDepthMeters: Number(state.sinkDepth.toFixed(3)),
        surfaceBuildup: Number(state.surfaceBuildup.toFixed(2)),
        grounded: state.isGrounded,
        boosting: state.isBoosting,
        drifting: state.isDrifting,
        headlightsOn: true,
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
        cityCenter: {
          name: 'Mountain Hangar',
          position: this.#roundVector(this.#cityCenterPosition),
          distanceMeters: Number(
            Math.hypot(
              position.x - this.#cityCenterPosition.x,
              position.z - this.#cityCenterPosition.z,
            ).toFixed(1),
          ),
        },
        reactiveProps: this.#reactiveProps.getDebugState(),
        roadPathsCount: 1 + this.#terrain.serviceRoadPaths.length,
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
        weatherCondition: this.#lastWeatherSnapshot.condition,
        secondsUntilWeatherChange: this.#lastWeatherSnapshot.secondsUntilChange,
        rainDensity: this.#lastWeatherSnapshot.rainDensity,
        visibilityScale: this.#lastWeatherSnapshot.visibilityScale,
        weatherGripMultiplier: this.#lastWeatherSnapshot.gripMultiplier,
        weatherDragMultiplier: this.#lastWeatherSnapshot.dragMultiplier,
        waterLevelOffsetMeters: this.#water.levelOffset,
        trafficSpeedMultiplier: this.#lastWeatherSnapshot.trafficSpeedMultiplier,
        fogFar: this.#lastWeatherSnapshot.fogFar,
        tireTracksActive: this.#tireTrackSystem.getActiveCount(),
        surfaceFx: {
          dustParticles: this.#dustSystem.activeCount,
          snowSprayParticles: this.#snowSpraySystem.activeCount,
          debrisParticles: this.#debrisSystem.activeCount,
          splashParticles: this.#splashSystem.activeCount,
          mudSplashParticles: this.#mudSplashSystem.activeCount,
          roadInfluence: Number(surfaceFeedback.roadInfluence.toFixed(2)),
          rutPullStrength: Number(surfaceFeedback.rutPullStrength.toFixed(2)),
          wetTrackStrength: Number(this.#lastWeatherSnapshot.rainDensity.toFixed(2)),
          skitteringDebrisStrength: Number(this.#ambientSkitterStrength.toFixed(2)),
          trafficImpactDebris: Number(this.#recentTrafficImpactDebris.toFixed(2)),
        },
        ambientTrafficCount: this.#ambientTraffic.count,
        ambientTrafficHeadlights: this.#ambientTraffic.count,
        ambientTraffic: this.#ambientTraffic.getSnapshot(position),
        trafficInteraction: {
          nearestDistanceMeters: this.#lastTrafficInteraction.nearestDistanceMeters,
          blocking: this.#lastTrafficInteraction.blocking,
          nearMiss: this.#lastTrafficInteraction.nearMiss,
          collision: this.#lastTrafficInteraction.collision,
          sourceId: this.#lastTrafficInteraction.sourceId,
        },
        propInteraction: {
          nearestDistanceMeters: this.#lastPropInteraction.nearestDistanceMeters,
          collision: this.#lastPropInteraction.collision,
          sourceId: this.#lastPropInteraction.sourceId,
        },
        grass: this.#grassField.getDebugState(),
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
    const canPause = this.#runSession.mode === 'driving';

    if (this.#godModeActive) {
      this.#stepGodMode(dt);
      return;
    }

    if (this.#input.consumePauseToggle() && canPause) {
      this.#setPauseVisible(!this.#pauseVisible);
      this.#syncShell();
      return;
    }

    if (this.#pauseVisible) {
      if (this.#input.consumeReset()) {
        this.#restartRun();
        return;
      }

      this.#engineAudio.update(
        this.#buildPausedDrivingState(),
        'driving',
        this.#buildAmbientAudioSnapshot(),
      );
      this.#syncShell();
      return;
    }

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

    const isDriving = this.#runSession.mode === 'driving';

    if (this.#input.consumeMapToggle() && isDriving) {
      this.#mapVisible = !this.#mapVisible;
    }

    this.#controller.update(
      dt,
      this.#input,
      isDriving,
      this.#lastWeatherSnapshot,
    );
    this.#reactiveProps.update(
      dt,
      this.#controller.position,
      this.#controller.velocity,
    );
    this.#lastPropInteraction = this.#reactiveProps.playerInteraction;
    this.#controller.applyReactiveWorldInteraction(this.#lastPropInteraction);

    if (isDriving) {
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
    this.#ambientTraffic.update(
      dt,
      this.#controller.position,
      this.#controller.velocity,
      this.#lastWeatherSnapshot,
    );
    this.#lastTrafficInteraction = this.#ambientTraffic.playerInteraction;
    this.#controller.applyTrafficInteraction(this.#lastTrafficInteraction);
    this.#vehicle.setPose(pose.position, pose.quaternion);
    this.#vehicle.updateVisuals(dt, this.#controller.state);

    if (this.#controller.state.impactMagnitude > 0) {
      this.#vehicle.damage.applyImpact(
        this.#controller.state.impactMagnitude,
        this.#controller.state.impactDirection,
        this.#controller.position,
        this.#controller.pose.quaternion,
        this.#controller.velocity,
      );
    }
    this.#vehicle.damage.update(dt, this.#controller.position.y - 1.2);

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
      dt,
      this.#lastWorldStreamSnapshot.routeActivity,
    );
    this.#sky.update(
      dt,
      this.#lastWorldStreamSnapshot.routeActivity,
      this.#lastWeatherSnapshot.rainDensity,
    );
    this.#water.setWeatherState(
      this.#lastWeatherSnapshot.waterLevelOffset,
      this.#lastWeatherSnapshot.waterActivityMultiplier,
    );
    this.#updateAmbientDebris(dt);

    this.#dustEmitter.update(dt, this.#controller);
    this.#dustSystem.update(dt);
    this.#snowSpraySystem.update(dt);
    this.#debrisSystem.update(dt);
    this.#splashEmitter.update(dt, this.#controller, this.#water);
    this.#splashSystem.update(dt);
    this.#mudSplashSystem.update(dt);
    this.#tireTrackSystem.setWetness(this.#lastWeatherSnapshot.rainDensity);
    this.#tireTrackSystem.update(dt);
    this.#tireTrackSystem.updateSource({
      id: 'player',
      state: this.#controller.state,
      wheelWorldPositions: this.#controller.wheelWorldPositions,
    }, dt);
    for (const trackSource of this.#ambientTraffic.getTrackSources()) {
      this.#tireTrackSystem.updateSource(trackSource, dt);
    }
    this.#objectiveBeacon.update(dt, this.#runSession.mode === 'arrived');
    for (const outpost of this.#routeOutposts) {
      outpost.update(dt, false);
    }
    this.#mountainHub.update(dt);
    this.#windSystem.update(dt, this.#engine.camera.position);
    this.#rainSystem.update(dt, this.#engine.camera.position);
    this.#water.update(dt, this.#engine.camera.position);
    this.#grassField.update(
      dt,
      this.#engine.camera.position,
      this.#lastWorldStreamSnapshot.windDensity,
      this.#lastWeatherSnapshot.rainDensity,
      this.#lastWeatherSnapshot.condition,
    );
    this.#engineAudio.update(
      this.#controller.state,
      this.#runSession.mode,
      this.#buildAmbientAudioSnapshot(),
    );
    this.#syncShell();
  }

  #stepGodMode(dt: number): void {
    if (this.#input.consumePauseToggle()) {
      this.#exitGodMode();
      this.#syncShell();
      return;
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

    const pausedState = this.#buildPausedDrivingState();
    const pose = this.#controller.pose;
    this.#ambientTraffic.update(
      dt,
      this.#controller.position,
      this.#controller.velocity,
      this.#lastWeatherSnapshot,
    );
    this.#lastTrafficInteraction = this.#ambientTraffic.playerInteraction;
    this.#reactiveProps.update(
      dt,
      this.#controller.position,
      this.#controller.velocity,
    );
    this.#lastPropInteraction = this.#reactiveProps.playerInteraction;
    this.#vehicle.setPose(pose.position, pose.quaternion);
    this.#vehicle.updateVisuals(dt, pausedState);
    this.#camera.updateGodMode(dt, this.#engine.camera, this.#input);

    this.#lastWorldStreamSnapshot = this.#worldStreamer.update(
      this.#engine.camera.position,
    );
    this.#lastWeatherSnapshot = this.#weatherState.update(
      dt,
      this.#lastWorldStreamSnapshot.routeActivity,
    );
    this.#sky.update(
      dt,
      this.#lastWorldStreamSnapshot.routeActivity,
      this.#lastWeatherSnapshot.rainDensity,
    );
    this.#water.setWeatherState(
      this.#lastWeatherSnapshot.waterLevelOffset,
      this.#lastWeatherSnapshot.waterActivityMultiplier,
    );
    this.#updateAmbientDebris(dt);

    this.#dustSystem.update(dt);
    this.#snowSpraySystem.update(dt);
    this.#debrisSystem.update(dt);
    this.#splashSystem.update(dt);
    this.#mudSplashSystem.update(dt);
    this.#tireTrackSystem.setWetness(this.#lastWeatherSnapshot.rainDensity);
    this.#tireTrackSystem.update(dt);
    for (const trackSource of this.#ambientTraffic.getTrackSources()) {
      this.#tireTrackSystem.updateSource(trackSource, dt);
    }
    this.#objectiveBeacon.update(dt, false);
    for (const outpost of this.#routeOutposts) {
      outpost.update(dt, false);
    }
    this.#mountainHub.update(dt);
    this.#windSystem.update(dt, this.#engine.camera.position);
    this.#rainSystem.update(dt, this.#engine.camera.position);
    this.#water.update(dt, this.#engine.camera.position);
    this.#grassField.update(
      dt,
      this.#engine.camera.position,
      this.#lastWorldStreamSnapshot.windDensity,
      this.#lastWeatherSnapshot.rainDensity,
      this.#lastWeatherSnapshot.condition,
    );
    this.#engineAudio.update(pausedState, 'driving', this.#buildAmbientAudioSnapshot());
    this.#syncShell();
  }

  #updateAmbientDebris(dt: number): void {
    this.#recentTrafficImpactDebris = Math.max(0, this.#recentTrafficImpactDebris - dt * 1.6);
    this.#ambientSkitterStrength = Math.max(0, this.#ambientSkitterStrength - dt * 1.25);

    if (
      this.#lastTrafficInteraction.collision
      && this.#lastTrafficInteraction.sourceId
      && this.#lastTrafficInteraction.sourceId !== this.#lastTrafficCollisionSourceId
    ) {
      this.#emitTrafficImpactDebris();
      this.#lastTrafficCollisionSourceId = this.#lastTrafficInteraction.sourceId;
    } else if (!this.#lastTrafficInteraction.collision) {
      this.#lastTrafficCollisionSourceId = null;
    }

    this.#slopeDebrisTimer += dt;
    const spawnInterval = THREE.MathUtils.lerp(
      0.42,
      0.16,
      this.#lastWeatherSnapshot.rainDensity,
    );
    if (this.#slopeDebrisTimer < spawnInterval) {
      return;
    }
    this.#slopeDebrisTimer = 0;

    const listenerPosition = this.#godModeActive
      ? this.#engine.camera.position
      : this.#controller.position;

    for (let attempt = 0; attempt < 4; attempt += 1) {
      const angle = this.#debrisRandom.range(0, Math.PI * 2);
      const distance = this.#debrisRandom.range(5, 16);
      this.#debrisProbe.set(
        listenerPosition.x + Math.sin(angle) * distance,
        0,
        listenerPosition.z + Math.cos(angle) * distance,
      );
      if (!this.#terrain.isWithinBounds(this.#debrisProbe.x, this.#debrisProbe.z)) continue;

      const surface = this.#terrain.getSurfaceAt(this.#debrisProbe.x, this.#debrisProbe.z);
      if (surface === 'sand') continue;

      this.#debrisDownhill.copy(
        this.#terrain.getNormalAt(this.#debrisProbe.x, this.#debrisProbe.z),
      );
      this.#debrisDownhill.set(-this.#debrisDownhill.x, 0, -this.#debrisDownhill.z);
      const downhillStrength = this.#debrisDownhill.length();
      const roadInfluence = this.#terrain.getRoadInfluence(
        this.#debrisProbe.x,
        this.#debrisProbe.z,
      );
      const slopeStrength = THREE.MathUtils.clamp(
        (downhillStrength - 0.18) / 0.38,
        0,
        1,
      );
      if (slopeStrength < 0.22) continue;

      this.#debrisDownhill.normalize();
      this.#debrisLateral.crossVectors(this.#worldUp, this.#debrisDownhill).normalize();
      if (this.#debrisLateral.lengthSq() < 0.0001) {
        this.#debrisLateral.set(1, 0, 0);
      }

      this.#debrisOrigin.set(
        this.#debrisProbe.x,
        this.#terrain.getHeightAt(this.#debrisProbe.x, this.#debrisProbe.z) + 0.08,
        this.#debrisProbe.z,
      );
      const travelSpeed =
        this.#debrisRandom.range(1.6, 3.8)
        * THREE.MathUtils.lerp(0.82, 1.4, slopeStrength)
        * THREE.MathUtils.lerp(1, 1.28, this.#lastWeatherSnapshot.rainDensity);
      this.#debrisVelocity
        .copy(this.#debrisDownhill)
        .multiplyScalar(travelSpeed)
        .addScaledVector(this.#debrisLateral, this.#debrisRandom.signed() * 0.55)
        .setY(this.#debrisRandom.range(0.05, 0.16));

      const count =
        surface === 'rock'
          ? 2
          : roadInfluence > 0.24 || this.#lastWeatherSnapshot.rainDensity > 0.72
            ? 2
            : 1;
      this.#debrisSystem.emit(
        this.#debrisOrigin,
        this.#debrisVelocity,
        SLOPE_SKITTER_DEBRIS,
        count,
      );
      this.#ambientSkitterStrength = Math.max(
        this.#ambientSkitterStrength,
        slopeStrength * travelSpeed,
      );
      break;
    }
  }

  #emitTrafficImpactDebris(): void {
    const sourcePosition = this.#lastTrafficInteraction.sourcePosition;
    if (!sourcePosition) return;

    this.#debrisOrigin
      .copy(this.#controller.position)
      .lerp(sourcePosition, 0.52);
    this.#debrisOrigin.y = Math.max(this.#controller.position.y, sourcePosition.y) + 0.45;

    this.#debrisVelocity.copy(this.#lastTrafficInteraction.impulse).setY(0);
    if (this.#debrisVelocity.lengthSq() < 0.0001) {
      this.#debrisVelocity
        .copy(this.#controller.position)
        .sub(sourcePosition)
        .setY(0);
    }
    if (this.#debrisVelocity.lengthSq() < 0.0001) {
      this.#debrisVelocity.set(1, 0, 0);
    }
    this.#debrisVelocity.normalize();
    this.#debrisLateral
      .crossVectors(this.#worldUp, this.#debrisVelocity)
      .normalize();
    if (this.#debrisLateral.lengthSq() < 0.0001) {
      this.#debrisLateral.set(0, 0, 1);
    }

    const impactStrength = Math.max(1, this.#lastTrafficInteraction.impulse.length());
    const launchSpeed = THREE.MathUtils.clamp(impactStrength * 2.4, 2.6, 5.2);
    this.#debrisVelocity
      .multiplyScalar(launchSpeed)
      .addScaledVector(this.#debrisLateral, this.#debrisRandom.signed() * 1.2)
      .setY(this.#debrisRandom.range(0.18, 0.42));

    this.#debrisSystem.emit(
      this.#debrisOrigin,
      this.#debrisVelocity,
      TRAFFIC_IMPACT_DEBRIS,
      8,
    );
    this.#recentTrafficImpactDebris = 1;
  }

  #render(frameSeconds: number): void {
    this.#engine.render(frameSeconds);
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
    const audioReady = this.#engineAudio.getDebugState().contextState === 'running';
    const routeCore =
      this.#godModeActive
        ? `God mode • ${this.#input.activeSourceLabel} • W/S move • A/D strafe • Space/Shift rise • Esc return`
      : this.#pauseVisible
        ? `Field menu open • ${this.#input.activeSourceLabel}`
      : this.#runSession.mode === 'arrived'
        ? `Relay line secured • ${this.#input.activeSourceLabel}`
      : nextCheckpoint
        ? `CP ${nextCheckpoint.index + 1}/${runSnapshot.checkpointCount} • ${this.#input.activeSourceLabel}`
        : `Route to summit relay • ${this.#input.activeSourceLabel}`;

    return {
      speedLabel: `${Math.round(state.speed * 3.6)} km/h`,
      tractionLabel: this.#godModeActive
        ? 'Detached'
        : state.isGrounded
          ? 'Grounded'
          : 'Airborne',
      surfaceLabel: state.surface.charAt(0).toUpperCase() + state.surface.slice(1),
      driveLabel:
        this.#godModeActive
          ? 'God Mode'
        : this.#pauseVisible
          ? 'Paused'
        : this.#runSession.mode === 'arrived'
          ? 'Arrived'
          : this.#lastTrafficInteraction.collision
            ? 'Traffic Impact'
          : this.#lastPropInteraction.collision
            ? 'Route Impact'
          : this.#lastTrafficInteraction.blocking || this.#lastTrafficInteraction.nearMiss
            ? 'Traffic Near'
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
        this.#godModeActive
          ? 'Observer view'
        : this.#runSession.mode === 'arrived'
          ? 'Reached'
          : nextCheckpoint
            ? `${Math.round(nextCheckpoint.distanceMeters)} m away`
            : `${Math.round(this.#getObjectiveDistance())} m away`,
      boostLabel:
        this.#godModeActive
          ? 'Rise / drop'
        : state.boostLevel > 0.98
          ? 'Ready'
          : `${Math.round(state.boostLevel * 100)}%`,
      weatherLabel: this.#lastWeatherSnapshot.label,
      weatherCondition: this.#lastWeatherSnapshot.condition,
      routeLabel:
        this.#runSession.mode === 'driving' && !audioReady
          ? `${routeCore} • tap or press a key for audio`
          : routeCore,
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
      mode: this.#godModeActive ? 'god' : this.#runSession.mode,
      speedLabel: `${Math.round(this.#controller.state.speed * 3.6)} km/h`,
      surfaceLabel: this.#controller.state.surface,
      mapLabel: `${this.#mapDiscovery.getPercent()}% mapped`,
      weatherLabel:
        `${this.#lastWeatherSnapshot.label} • ` +
        `${this.#formatRunTime(this.#lastWeatherSnapshot.secondsUntilChange)} • ` +
        `grip ${Math.round(this.#lastWeatherSnapshot.gripMultiplier * 100)}% • ` +
        `water ${this.#water.levelOffset.toFixed(2)}m`,
      streamingLabel:
        `route ${this.#lastWorldStreamSnapshot.routeActivity.toFixed(2)} | ` +
        `wind ${this.#lastWorldStreamSnapshot.windDensity.toFixed(2)} | ` +
        `water ${this.#lastWorldStreamSnapshot.waterActivity.toFixed(2)}`,
      renderLabel: getRenderDebugViewLabel(this.#renderDebugView),
    };
  }

  #setPauseVisible(visible: boolean): void {
    const shouldPause =
      visible && this.#runSession.mode === 'driving' && !this.#godModeActive;
    this.#pauseVisible = shouldPause;
    if (shouldPause) {
      this.#mapVisible = false;
    }
    this.#shell.setPauseVisible(shouldPause);
  }

  #syncShell(): void {
    this.#shell.setTitleWeather(this.#buildTitleWeatherLabel());
    this.#shell.setTitleAudio(this.#buildTitleAudioLabel());
    this.#shell.updateHud(this.#buildHudSnapshot());
    this.#shell.setMapVisible(
      this.#mapVisible
        && this.#runSession.mode === 'driving'
        && !this.#pauseVisible
        && !this.#godModeActive,
    );
    this.#shell.updateMap(this.#buildMapRuntimeSnapshot());
    this.#debugPanel.updateTelemetry(this.#buildDebugTelemetrySnapshot());
  }

  #buildPausedDrivingState() {
    return {
      ...this.#controller.state,
      throttle: 0,
      speed: 0,
      forwardSpeed: 0,
      lateralSpeed: 0,
      verticalSpeed: 0,
      isBoosting: false,
      isDrifting: false,
      isBraking: false,
    };
  }

  #enterGodMode(): void {
    if (this.#runSession.mode !== 'driving') return;
    this.#godModeActive = true;
    this.#mapVisible = false;
    this.#setPauseVisible(false);
    this.#controller.halt();
    this.#vehicle.setPose(
      this.#controller.pose.position,
      this.#controller.pose.quaternion,
    );
    this.#camera.enterGodMode(this.#engine.camera);
  }

  #exitGodMode(): void {
    if (!this.#godModeActive) return;
    this.#godModeActive = false;
    this.#camera.exitGodMode();
    this.#camera.snapToDrive(
      this.#engine.camera,
      this.#controller.pose.position,
      this.#controller.pose.quaternion,
      this.#controller.state,
      this.#getNextCheckpointPosition(),
    );
  }

  #restartRun(): void {
    const wasGodMode = this.#godModeActive;
    if (wasGodMode) {
      this.#godModeActive = false;
      this.#camera.exitGodMode();
    }
    this.#controller.reset();
    this.#vehicle.damage.reset();
    this.#vehicle.setPose(
      this.#controller.pose.position,
      this.#controller.pose.quaternion,
    );
    this.#activeScenario = 'spawn';
    this.#runSession.restart();
    this.#enterDrivingPresentation({ snapCamera: wasGodMode });
    this.#shell.updateArrival(this.#buildArrivalSnapshot());
  }

  #completeRun(): void {
    if (this.#godModeActive) {
      this.#godModeActive = false;
      this.#camera.exitGodMode();
    }
    if (this.#runSession.mode !== 'arrived') {
      this.#runSession.complete();
    }
    this.#setPauseVisible(false);
    this.#mapVisible = false;
    this.#controller.halt();
    this.#camera.beginArrivalSequence();
    this.#engineAudio.triggerArrivalCue();
    this.#shell.setMode(this.#runSession.mode);
    this.#shell.setArrivalVisible(true);
    this.#shell.setMapVisible(false);
    this.#shell.updateArrival(this.#buildArrivalSnapshot());
  }

  #enterDrivingPresentation(options?: { snapCamera?: boolean }): void {
    this.#setPauseVisible(false);
    this.#godModeActive = false;
    this.#mapVisible = false;
    this.#checkpointBannerTime = 0;
    this.#checkpointBannerLabel = '';
    this.#lastTrafficInteraction = {
      nearestDistanceMeters: 999,
      nearMiss: false,
      blocking: false,
      collision: false,
      sourceId: null,
      sourcePosition: null,
      correction: new THREE.Vector3(),
      impulse: new THREE.Vector3(),
    };
    this.#lastPropInteraction = {
      nearestDistanceMeters: 999,
      collision: false,
      sourceId: null,
      correction: new THREE.Vector3(),
      impulse: new THREE.Vector3(),
    };
    this.#ambientSkitterStrength = 0;
    this.#recentTrafficImpactDebris = 0;
    this.#lastTrafficCollisionSourceId = null;
    this.#slopeDebrisTimer = 0;
    this.#tireTrackSystem.clear();
    this.#reactiveProps.reset();
    this.#camera.resetDriveMotion();
    this.#camera.resetArrivalSequence();
    if (options?.snapCamera) {
      this.#camera.snapToDrive(
        this.#engine.camera,
        this.#controller.pose.position,
        this.#controller.pose.quaternion,
        this.#controller.state,
        this.#getNextCheckpointPosition(),
      );
    }
    this.#mapDiscovery.reset(
      this.#controller.position.x,
      this.#controller.position.z,
    );
    this.#clearTitlePreview();
    this.#shell.setMode(this.#runSession.mode);
    this.#shell.setTitleVisible(false);
    this.#shell.setArrivalVisible(false);
    this.#shell.setMapVisible(false);
    void this.#activateAudio();
  }

  #mountTitlePreview(): void {
    this.#titlePreviewRoot.render(createElement(TitleAlphaPreviewEmbed));
  }

  #clearTitlePreview(): void {
    this.#titlePreviewRoot.render(null);
  }

  async #activateAudio(): Promise<void> {
    const unlocked = await this.#engineAudio.activate();
    if (unlocked) {
      this.#removeAudioUnlockListeners();
    }
    this.#syncShell();
  }

  #installAudioUnlockListeners(): void {
    window.addEventListener('pointerdown', this.#handleAudioUnlockGesture);
    window.addEventListener('keydown', this.#handleAudioUnlockGesture);
  }

  #removeAudioUnlockListeners(): void {
    window.removeEventListener('pointerdown', this.#handleAudioUnlockGesture);
    window.removeEventListener('keydown', this.#handleAudioUnlockGesture);
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
      servicePaths: this.#terrain.getServiceRoadPaths(),
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
      cityCenter: {
        x: this.#cityCenterPosition.x,
        z: this.#cityCenterPosition.z,
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
      weatherCondition: this.#lastWeatherSnapshot.condition,
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
    const listenerPosition = this.#godModeActive
      ? this.#engine.camera.position
      : this.#controller.position;
    const objectiveDistance = Math.hypot(
      listenerPosition.x - this.#objectivePosition.x,
      listenerPosition.z - this.#objectivePosition.z,
    );
    let relayDistance = Number.POSITIVE_INFINITY;
    for (const outpost of this.#outpostPositions) {
      relayDistance = Math.min(
        relayDistance,
        Math.hypot(
          listenerPosition.x - outpost.x,
          listenerPosition.z - outpost.z,
        ),
      );
    }
    const landmarkDistance = Math.hypot(
      listenerPosition.x - this.#landmarkPosition.x,
      listenerPosition.z - this.#landmarkPosition.z,
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
      weatherWindMix: this.#lastWeatherSnapshot.windAudioMultiplier,
      weatherRelayMix: this.#lastWeatherSnapshot.relayAudioMultiplier,
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

  #buildTitleWeatherLabel(): string {
    const weatherProfiles = this.#tuningStore.values.weather.profiles;
    const nextWeatherLabel =
      weatherProfiles.length > 0
        ? (weatherProfiles[
          (this.#lastWeatherSnapshot.cycleIndex + 1) % weatherProfiles.length
        ]?.label ?? this.#lastWeatherSnapshot.label)
        : this.#lastWeatherSnapshot.label;
    return (
      `${this.#lastWeatherSnapshot.label} now, ` +
      `${nextWeatherLabel.toLowerCase()} next in ${this.#formatRunTime(this.#lastWeatherSnapshot.secondsUntilChange)}`
    );
  }

  #buildTitleAudioLabel(): string {
    const audioDebug = this.#engineAudio.getDebugState();
    if (audioDebug.contextState === 'running') {
      return 'Web Audio live';
    }
    if (audioDebug.contextState === 'unsupported') {
      return 'Audio unsupported in this browser';
    }
    return 'Tap or press a key to enable';
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
