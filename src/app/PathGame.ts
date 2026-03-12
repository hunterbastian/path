import * as THREE from 'three';
import { EngineAudio } from '../audio/EngineAudio';
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
import { AchievementSystem } from '../gameplay/AchievementSystem';
import { DriverProfile } from '../gameplay/DriverProfile';
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
import { DamageHud } from '../ui/DamageHud';
import { RadioLog } from '../ui/RadioLog';
import { Vehicle } from '../vehicle/Vehicle';
import { VehicleController } from '../vehicle/VehicleController';
import { MountainHub } from '../world/MountainHub';
import { RaiderSystem } from '../world/RaiderSystem';
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
import { EnvironmentalClutter } from '../world/EnvironmentalClutter';
import { WorldStreamer, type WorldStreamSnapshot } from '../world/WorldStreamer';
import { AudioManager } from './AudioManager';
import { EffectsCoordinator } from './EffectsCoordinator';
import { ValleyFog } from '../world/ValleyFog';

const PHYSICS_STEP_SECONDS = 1 / 60;
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
  readonly #tuningStore: GameTuningStore;
  readonly #engine: Engine;
  readonly #input: InputManager;
  readonly #terrain: Terrain;
  readonly #water: Water;
  readonly #vehicle: Vehicle;
  readonly #controller: VehicleController;
  readonly #camera: ThirdPersonCamera;
  readonly #audio: AudioManager;
  readonly #effects: EffectsCoordinator;
  readonly #damageHud: DamageHud;
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
  readonly #raiders: RaiderSystem;
  readonly #reactiveProps: ReactiveWorldPropsSystem;
  readonly #sky: Sky;
  readonly #valleyFog: ValleyFog;
  readonly #grassField: GrassField;
  readonly #clutter: EnvironmentalClutter;
  readonly #mapDiscovery: MapDiscoverySystem;
  readonly #runSession: RunSession;
  readonly #scenarioFixtures: ScenarioFixtures;
  readonly #worldStreamer: WorldStreamer;
  readonly #weatherState: WeatherState;
  readonly #achievements: AchievementSystem;
  readonly #driverProfile: DriverProfile;
  readonly #debugPanel: DebugPanel;
  readonly #radioLog: RadioLog;
  #damageFlash = 0;
  #mapVisible = false;
  #pauseVisible = false;
  #godModeActive = false;
  #uiPulseTime = 0;
  #checkpointBannerTime = 0;
  #checkpointBannerLabel = '';
  #activeScenario: ScenarioFixtureId = 'spawn';
  #renderDebugView: RenderDebugViewId = 'final';
  #prevWeatherCondition: string = '';
  #prevDamageHealth = 1;
  #discoveredSurfaces = new Set<string>();
  #seenRaiders = false;
  #foundRoad = false;
  #prevDiscoveryPercent = 0;
  #trail: Array<{ x: number; z: number }> = [];
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

  constructor(root: HTMLElement) {
    this.#shell = new AppShell(root);
    this.#tuningStore = new GameTuningStore();
    this.#engine = new Engine(this.#shell.elements.canvasMount);
    this.#shell.mountCanvas(this.#engine.renderer.domElement);
    this.#input = new InputManager(this.#engine.renderer.domElement);

    this.#sky = new Sky(this.#engine.scene);
    this.#terrain = new Terrain(this.#engine.scene);
    this.#valleyFog = new ValleyFog(this.#engine.scene, this.#terrain);
    this.#water = new Water(this.#engine.scene, this.#terrain);
    this.#grassField = new GrassField(this.#engine.scene, this.#terrain);
    this.#clutter = new EnvironmentalClutter(this.#engine.scene, this.#terrain);
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
    this.#raiders = new RaiderSystem(
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
    Vehicle.loadModel('/models/textured.glb').then((modelScene) => {
      this.#vehicle.replaceBody(modelScene);
    });
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

    // Audio manager
    this.#audio = new AudioManager({
      getListenerPosition: () =>
        this.#godModeActive
          ? this.#engine.camera.position
          : this.#controller.position,
      getControllerState: () => this.#controller.state,
      getObjectivePosition: () => this.#objectivePosition,
      getLandmarkPosition: () => this.#landmarkPosition,
      getOutpostPositions: () => this.#outpostPositions,
      getRainDensity: () => this.#lastWeatherSnapshot.rainDensity,
      getRouteActivity: () => this.#lastWorldStreamSnapshot.routeActivity,
      getWindAudioMultiplier: () => this.#lastWeatherSnapshot.windAudioMultiplier,
      getRelayAudioMultiplier: () => this.#lastWeatherSnapshot.relayAudioMultiplier,
      isArrived: () => this.#runSession.mode === 'arrived',
    });

    // Effects coordinator
    this.#effects = new EffectsCoordinator(
      this.#engine.scene,
      this.#terrain,
      this.#water,
    );

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
      this.#effects.windSystem,
      this.#routeOutposts,
      this.#outpostPositions.slice(0, -1),
      this.#objectiveBeacon,
      this.#objectivePosition,
    );
    this.#weatherState = new WeatherState(
      this.#tuningStore.values,
      this.#sky,
      this.#effects.rainSystem,
    );
    this.#lastWeatherSnapshot = this.#weatherState.snapshot;
    this.#water.setWeatherState(
      this.#lastWeatherSnapshot.waterLevelOffset,
      this.#lastWeatherSnapshot.waterActivityMultiplier,
    );
    this.#lastWorldStreamSnapshot = this.#worldStreamer.snapshot;

    this.#achievements = new AchievementSystem();
    this.#achievements.onUnlock((def) => {
      this.#shell.showAchievementToast(def.title, def.description, def.icon);
    });

    this.#driverProfile = new DriverProfile();
    this.#shell.setTitleCareer(
      this.#driverProfile.hasHistory
        ? this.#driverProfile.fullLabel
        : 'First run',
    );

    this.#damageHud = new DamageHud();
    const hudPanel = this.#shell.elements.speed.closest('.hud-panel');
    if (hudPanel) {
      hudPanel.appendChild(this.#damageHud.element);
    }

    this.#radioLog = new RadioLog(this.#shell.elements.radioLog);

    this.#loop = new FixedStepLoop({
      stepSeconds: PHYSICS_STEP_SECONDS,
      maxSubSteps: 4,
      onStep: (dt) => this.#step(dt),
      onRender: (frameSeconds) => this.#render(frameSeconds),
    });
  }

  async boot(): Promise<void> {
    await this.#engine.init();
    this.#shell.bindStart(() => this.start());
    this.#shell.bindRestart(() => { this.#audio.uiAudio?.playConfirm(); this.#restartRun(); });
    this.#shell.bindPauseResume(() => { this.#audio.uiAudio?.playClose(); this.#setPauseVisible(false); });
    this.#shell.bindPauseGodMode(() => { this.#audio.uiAudio?.playTick(); this.#enterGodMode(); });
    this.#shell.bindPauseRestart(() => { this.#audio.uiAudio?.playConfirm(); this.#restartRun(); });
    this.#audio.installUnlockListeners();
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
    this.#input.dispose();
    this.#camera.dispose();
    this.#audio.dispose();
    this.#effects.dispose();
    this.#grassField.dispose();
    this.#clutter.dispose();
    this.#engine.dispose();
  }

  start(): void {
    if (this.#runSession.mode === 'driving') return;
    void this.#audio.activate();
    this.#audio.uiAudio?.playConfirm();
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
    this.#jumpToEncounter(encounter.position, encounter.heading);
  }

  jumpToTraffic(): void {
    const encounter = this.#ambientTraffic.getEncounterStart();
    if (!encounter) return;
    this.#jumpToEncounter(encounter.position, encounter.heading);
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
    return this.#audio.engineAudio.getDebugState();
  }

  forceWeather(condition: WeatherCondition | null): WeatherSnapshot {
    this.#lastWeatherSnapshot = this.#weatherState.forceCondition(condition);
    this.#water.setWeatherState(
      this.#lastWeatherSnapshot.waterLevelOffset,
      this.#lastWeatherSnapshot.waterActivityMultiplier,
    );
    this.#effects.tireTrackSystem.setWetness(this.#lastWeatherSnapshot.rainDensity);
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
    const effectCounts = this.#effects.getDebugCounts();

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
        tireTracksActive: this.#effects.tireTrackSystem.getActiveCount(),
        surfaceFx: {
          dustParticles: effectCounts.dust,
          snowSprayParticles: effectCounts.snowSpray,
          debrisParticles: effectCounts.debris,
          splashParticles: effectCounts.splash,
          mudSplashParticles: effectCounts.mudSplash,
          roadInfluence: Number(surfaceFeedback.roadInfluence.toFixed(2)),
          rutPullStrength: Number(surfaceFeedback.rutPullStrength.toFixed(2)),
          wetTrackStrength: Number(this.#lastWeatherSnapshot.rainDensity.toFixed(2)),
          skitteringDebrisStrength: Number(this.#effects.ambientSkitterStrength.toFixed(2)),
          trafficImpactDebris: Number(this.#effects.recentTrafficImpactDebris.toFixed(2)),
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
        audio: this.#audio.engineAudio.getDebugState(),
        camera: this.#camera.getDriveDebugState(),
        input: this.#input.getDebugState(),
        renderDebug: this.getRenderDebugState(),
        tuning: this.getTuningDebug(),
        streaming: this.#lastWorldStreamSnapshot,
      },
    });
  }

  // ─── Game Loop ──────────────────────────────────────────────

  #step(dt: number): void {
    this.#terrain.flushHeightCache();
    this.#input.update();
    this.#uiPulseTime += dt;
    this.#checkpointBannerTime = Math.max(0, this.#checkpointBannerTime - dt);
    const canPause = this.#runSession.mode === 'driving';

    if (this.#godModeActive) {
      this.#stepGodMode(dt);
      return;
    }

    if (this.#input.consumePauseToggle() && canPause) {
      const willPause = !this.#pauseVisible;
      this.#setPauseVisible(willPause);
      if (this.#audio.uiAudio) {
        if (willPause) this.#audio.uiAudio.playOpen();
        else this.#audio.uiAudio.playClose();
      }
      this.#syncShell();
      return;
    }

    if (this.#pauseVisible) {
      if (this.#input.consumeReset()) {
        this.#restartRun();
        return;
      }
      this.#audio.updatePaused(this.#buildPausedDrivingState());
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

    if (this.#input.consumeCameraToggle() && this.#runSession.mode === 'driving') {
      this.#camera.toggleView();
      this.#vehicle.mesh.visible = this.#camera.view !== 'cockpit';
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
      if (this.#audio.uiAudio) {
        if (this.#mapVisible) this.#audio.uiAudio.playOpen();
        else this.#audio.uiAudio.playClose();
      }
    }

    // Physics
    this.#controller.update(dt, this.#input, isDriving, this.#lastWeatherSnapshot);
    this.#reactiveProps.update(dt, this.#controller.position, this.#controller.velocity);
    this.#lastPropInteraction = this.#reactiveProps.playerInteraction;
    this.#controller.applyReactiveWorldInteraction(this.#lastPropInteraction);

    // Static clutter collision (wrecks, signs, debris)
    this.#clutter.update(this.#controller.position, this.#controller.velocity);
    const clutterInteraction = this.#clutter.playerInteraction;
    if (clutterInteraction.collision) {
      this.#controller.applyReactiveWorldInteraction(clutterInteraction);
      this.#effects.emitCollisionSparks(
        this.#controller.position,
        this.#controller.velocity,
        clutterInteraction.correction,
      );
    }

    if (isDriving) {
      this.#mapDiscovery.reveal(this.#controller.position.x, this.#controller.position.z);
      // Accumulate trail breadcrumbs (every ~5 m of travel)
      const pos = this.#controller.position;
      const lastTrail = this.#trail[this.#trail.length - 1];
      if (!lastTrail || Math.hypot(pos.x - lastTrail.x, pos.z - lastTrail.z) > 5) {
        this.#trail.push({ x: pos.x, z: pos.z });
      }
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

    // Traffic + raiders
    const pose = this.#controller.pose;
    this.#ambientTraffic.update(
      dt,
      this.#controller.position,
      this.#controller.velocity,
      this.#lastWeatherSnapshot,
    );
    this.#lastTrafficInteraction = this.#ambientTraffic.playerInteraction;
    this.#controller.applyTrafficInteraction(this.#lastTrafficInteraction);
    this.#raiders.update(dt, this.#controller.position, this.#controller.velocity);
    const raiderInteraction = this.#raiders.playerInteraction;
    if (raiderInteraction.collision) {
      this.#controller.applyTrafficInteraction({
        collision: true,
        correction: raiderInteraction.correction,
        impulse: raiderInteraction.impulse,
      });
      this.#effects.emitCollisionSparks(
        this.#controller.position,
        this.#controller.velocity,
        raiderInteraction.correction,
      );
    }

    // Vehicle visuals + damage
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
    this.#damageHud.update(this.#vehicle.damage);
    this.#effects.emitEngineSmoke(
      dt,
      this.#controller.position,
      this.#controller.velocity,
      this.#vehicle.damage.totalHealth,
    );

    this.#controller.setWheelAttached([
      this.#vehicle.damage.isPartAttached('wheelFL'),
      this.#vehicle.damage.isPartAttached('wheelFR'),
      this.#vehicle.damage.isPartAttached('wheelRL'),
      this.#vehicle.damage.isPartAttached('wheelRR'),
    ]);

    let aeroPenalty = 1;
    if (!this.#vehicle.damage.isPartAttached('hood')) aeroPenalty += 0.18;
    if (!this.#vehicle.damage.isPartAttached('windshield')) aeroPenalty += 0.14;
    if (!this.#vehicle.damage.isPartAttached('doorLeft')) aeroPenalty += 0.08;
    if (!this.#vehicle.damage.isPartAttached('doorRight')) aeroPenalty += 0.08;
    this.#controller.setAeroDragPenalty(aeroPenalty);

    // Audio
    const nearestHonkDistance = this.#ambientTraffic.getNearestHonkDistance(
      this.#controller.position,
    );
    this.#audio.updateDriving(
      dt,
      this.#runSession.mode,
      this.#controller.state,
      this.#vehicle.damage.totalHealth,
      nearestHonkDistance,
    );

    // Landing burst (audio already handles landing sound)
    if (this.#controller.state.wasAirborne) {
      this.#effects.emitLandingBurst(this.#controller, this.#controller.state.impactMagnitude);
    }

    // Radio breadcrumbs
    this.#updateRadioBreadcrumbs(dt);

    // Screen effects
    if (this.#controller.state.impactMagnitude > 2) {
      this.#damageFlash = Math.min(this.#controller.state.impactMagnitude / 8, 1);
    }
    this.#damageFlash *= Math.exp(-6 * dt);
    if (this.#damageFlash < 0.01) this.#damageFlash = 0;
    this.#engine.postProcess.setDamageFlash(this.#damageFlash);
    const speedNorm = Math.min(this.#controller.state.speed / 34, 1);
    this.#engine.postProcess.setSpeedIntensity(speedNorm);
    this.#engine.postProcess.setMotionBlurStrength(speedNorm * 0.6);

    // Camera
    if (this.#runSession.mode === 'driving') {
      if (this.#camera.view === 'cockpit') {
        this.#camera.updateCockpit(
          dt,
          this.#engine.camera,
          pose.position,
          pose.quaternion,
          this.#controller.state,
        );
      } else {
        this.#camera.updateDrive(
          dt,
          this.#engine.camera,
          pose.position,
          pose.quaternion,
          this.#controller.state,
          this.#getNextCheckpointPosition(),
        );
      }
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

    // World systems
    this.#lastWorldStreamSnapshot = this.#worldStreamer.update(this.#engine.camera.position);
    this.#lastWeatherSnapshot = this.#weatherState.update(
      dt,
      this.#lastWorldStreamSnapshot.routeActivity,
    );
    this.#sky.update(
      dt,
      this.#lastWorldStreamSnapshot.routeActivity,
      this.#lastWeatherSnapshot.rainDensity,
      this.#controller.position,
    );
    this.#valleyFog.setDayTime(this.#sky.dayTime);
    this.#valleyFog.setWeather(this.#lastWeatherSnapshot.condition);
    this.#valleyFog.update(dt, this.#engine.camera.position);
    this.#sky.setValleyFogPush(this.#valleyFog.fogNearPush);
    this.#water.setWeatherState(
      this.#lastWeatherSnapshot.waterLevelOffset,
      this.#lastWeatherSnapshot.waterActivityMultiplier,
    );

    // Effects
    this.#effects.update(
      dt,
      this.#controller,
      this.#water,
      this.#lastWeatherSnapshot,
      this.#engine.camera.position,
      this.#lastTrafficInteraction,
      this.#ambientTraffic,
      false,
    );

    // World visuals
    this.#objectiveBeacon.update(dt, this.#runSession.mode === 'arrived');
    for (const outpost of this.#routeOutposts) {
      outpost.update(dt, false);
    }
    this.#mountainHub.update(dt);
    this.#water.update(dt, this.#engine.camera.position);
    this.#grassField.update(
      dt,
      this.#engine.camera.position,
      this.#lastWorldStreamSnapshot.windDensity,
      this.#lastWeatherSnapshot.rainDensity,
      this.#lastWeatherSnapshot.condition,
    );

    // Trample grass/dirt under wheels
    const driveSurface = this.#controller.state.surface;
    if (
      this.#controller.state.isGrounded
      && (driveSurface === 'grass' || driveSurface === 'dirt')
      && this.#controller.state.speed > 0.8
    ) {
      const pos = this.#controller.position;
      const yaw = this.#vehicle.mesh.rotation.y;
      const radius = driveSurface === 'dirt' ? 2.8 : 3.4;
      const strength = THREE.MathUtils.clamp(this.#controller.state.speed * 0.04, 0.02, 0.18);
      this.#grassField.trample(pos.x, pos.z, radius, strength, yaw);
    }

    // Achievements + profile
    if (this.#runSession.mode === 'driving') {
      this.#achievements.update(
        dt,
        this.#controller.state,
        this.#runSession.snapshot,
        this.#vehicle.damage.totalHealth,
        this.#vehicle.damage.detachedCount,
        this.#mapDiscovery.getPercent(),
        this.#lastWeatherSnapshot.rainDensity,
        this.#sky.dayTime,
        this.#camera.view,
      );
      this.#driverProfile.update(
        dt,
        this.#controller.state.speed,
        this.#controller.state.speed * 3.6,
        this.#controller.state.isDrifting,
        this.#controller.state.isGrounded,
        this.#controller.state.airborneTime,
        this.#vehicle.damage.detachedCount,
        this.#controller.state.impactMagnitude,
        this.#controller.state.surface,
      );
    }

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
    this.#reactiveProps.update(dt, this.#controller.position, this.#controller.velocity);
    this.#lastPropInteraction = this.#reactiveProps.playerInteraction;
    this.#raiders.update(dt, this.#controller.position, this.#controller.velocity);
    this.#vehicle.setPose(pose.position, pose.quaternion);
    this.#vehicle.updateVisuals(dt, pausedState);
    this.#camera.updateGodMode(dt, this.#engine.camera, this.#input);

    this.#lastWorldStreamSnapshot = this.#worldStreamer.update(this.#engine.camera.position);
    this.#lastWeatherSnapshot = this.#weatherState.update(
      dt,
      this.#lastWorldStreamSnapshot.routeActivity,
    );
    this.#sky.update(
      dt,
      this.#lastWorldStreamSnapshot.routeActivity,
      this.#lastWeatherSnapshot.rainDensity,
    );
    this.#valleyFog.setDayTime(this.#sky.dayTime);
    this.#valleyFog.setWeather(this.#lastWeatherSnapshot.condition);
    this.#valleyFog.update(dt, this.#engine.camera.position);
    this.#sky.setValleyFogPush(this.#valleyFog.fogNearPush);
    this.#water.setWeatherState(
      this.#lastWeatherSnapshot.waterLevelOffset,
      this.#lastWeatherSnapshot.waterActivityMultiplier,
    );

    this.#effects.updateGodMode(
      dt,
      this.#lastWeatherSnapshot,
      this.#engine.camera.position,
      this.#lastTrafficInteraction,
      this.#ambientTraffic,
    );

    this.#objectiveBeacon.update(dt, false);
    for (const outpost of this.#routeOutposts) {
      outpost.update(dt, false);
    }
    this.#mountainHub.update(dt);
    this.#water.update(dt, this.#engine.camera.position);
    this.#grassField.update(
      dt,
      this.#engine.camera.position,
      this.#lastWorldStreamSnapshot.windDensity,
      this.#lastWeatherSnapshot.rainDensity,
      this.#lastWeatherSnapshot.condition,
    );
    this.#audio.updatePaused(pausedState);
    this.#syncShell();
  }

  #render(frameSeconds: number): void {
    this.#engine.render(frameSeconds);
  }

  // ─── State Transitions ─────────────────────────────────────

  #jumpToEncounter(position: THREE.Vector3, heading: number): void {
    const snapCamera = this.#godModeActive;
    if (snapCamera) {
      this.#godModeActive = false;
      this.#camera.exitGodMode();
    }
    this.#activeScenario = 'spawn';
    this.#controller.teleport(position, heading);
    this.#vehicle.setPose(
      this.#controller.pose.position,
      this.#controller.pose.quaternion,
    );
    this.#runSession.restart();
    this.#enterDrivingPresentation({ snapCamera });
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
    this.#effects.resetDebris();
    this.#effects.clearTracks();
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
    this.#shell.setMode(this.#runSession.mode);
    this.#shell.setTitleVisible(false);
    this.#shell.setArrivalVisible(false);
    this.#shell.setMapVisible(false);
    void this.#audio.activate();
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
    if (this.#camera.view === 'cockpit') {
      this.#camera.toggleView();
      this.#vehicle.mesh.visible = true;
    }
    this.#controller.reset();
    this.#vehicle.damage.reset();
    this.#audio.resetDamageTracking();
    this.#achievements.resetTracking();
    this.#driverProfile.resetTracking();
    this.#driverProfile.save();
    this.#shell.setTitleCareer(
      this.#driverProfile.hasHistory
        ? this.#driverProfile.fullLabel
        : 'First run',
    );
    this.#vehicle.setPose(
      this.#controller.pose.position,
      this.#controller.pose.quaternion,
    );
    this.#activeScenario = 'spawn';
    this.#radioLog.clear();
    this.#prevWeatherCondition = '';
    this.#prevDamageHealth = 1;
    this.#discoveredSurfaces.clear();
    this.#seenRaiders = false;
    this.#foundRoad = false;
    this.#prevDiscoveryPercent = 0;
    this.#trail = [];
    this.#runSession.restart();
    this.#enterDrivingPresentation({ snapCamera: wasGodMode });
    this.#shell.updateArrival(this.#buildArrivalSnapshot());
  }

  #completeRun(): void {
    if (this.#godModeActive) {
      this.#godModeActive = false;
      this.#camera.exitGodMode();
    }
    if (this.#camera.view === 'cockpit') {
      this.#camera.toggleView();
      this.#vehicle.mesh.visible = true;
    }
    if (this.#runSession.mode !== 'arrived') {
      this.#runSession.complete();
    }
    this.#setPauseVisible(false);
    this.#mapVisible = false;
    this.#controller.halt();
    this.#achievements.onRunComplete(this.#runSession.snapshot);
    this.#driverProfile.onRunComplete(this.#runSession.snapshot.elapsedSeconds);
    this.#camera.beginArrivalSequence();
    this.#audio.engineAudio.triggerArrivalCue();
    this.#shell.setMode(this.#runSession.mode);
    this.#shell.setArrivalVisible(true);
    this.#shell.setMapVisible(false);
    this.#shell.updateArrival(this.#buildArrivalSnapshot());
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

  // ─── UI Snapshots ──────────────────────────────────────────

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

  #buildHudSnapshot(): HudSnapshot {
    const state = this.#controller.state;
    const runSnapshot = this.#runSession.snapshot;
    const nextCheckpoint = this.#getCheckpointTarget(runSnapshot.nextCheckpointIndex);
    const audioReady = this.#audio.engineAudio.getDebugState().contextState === 'running';
    const routeCore =
      this.#godModeActive
        ? `God mode • ${this.#input.activeSourceLabel} • W/S move • A/D strafe • Space/Shift rise • Esc return`
      : this.#pauseVisible
        ? `Field menu open • ${this.#input.activeSourceLabel}`
      : this.#runSession.mode === 'arrived'
        ? `Relay line secured • ${this.#input.activeSourceLabel}`
      : nextCheckpoint
        ? `CP ${nextCheckpoint.index + 1}/${runSnapshot.checkpointCount} • ${this.#input.activeSourceLabel}`
        : `${this.#getContextualRouteHint()} • ${this.#input.activeSourceLabel}`;

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
      achievementsLabel: `${this.#achievements.unlockedCount} / ${this.#achievements.totalCount}`,
      profileLabel: this.#driverProfile.fullLabel,
      signatureLabel: this.#driverProfile.arrivalLabel,
      distanceLabel: `${this.#driverProfile.distanceLabel} driven`,
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

  #buildMapLayoutSnapshot(): MapLayoutSnapshot {
    const halfSize = this.#terrain.size * 0.5;
    const pathPoints: Array<{ x: number; z: number }> = [];
    for (let z = -halfSize; z <= halfSize; z += 12) {
      pathPoints.push({
        x: this.#terrain.getPathCenterX(z),
        z,
      });
    }

    // Sample terrain grid for topo map rendering (high-res for 352×320 canvas)
    const topoColumns = 96;
    const topoRows = 86;
    const terrainHeights: number[] = [];
    const terrainSurfaces: string[] = [];
    for (let row = 0; row < topoRows; row++) {
      for (let col = 0; col < topoColumns; col++) {
        const wx = -halfSize + (col + 0.5) * (this.#terrain.size / topoColumns);
        const wz = -halfSize + (row + 0.5) * (this.#terrain.size / topoRows);
        terrainHeights.push(this.#terrain.getHeightAt(wx, wz));
        terrainSurfaces.push(this.#terrain.getSurfaceAt(wx, wz));
      }
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
      terrainGrid: {
        columns: topoColumns,
        rows: topoRows,
        heights: terrainHeights,
        surfaces: terrainSurfaces,
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
      trail: this.#trail,
      trailDistanceMeters: this.#computeTrailDistance(),
      raiders: this.#seenRaiders ? this.#raiders.getPositions() : [],
    };
  }

  // ─── Helpers ───────────────────────────────────────────────

  #computeTrailDistance(): number {
    let dist = 0;
    for (let i = 1; i < this.#trail.length; i++) {
      const a = this.#trail[i - 1]!;
      const b = this.#trail[i]!;
      dist += Math.hypot(b.x - a.x, b.z - a.z);
    }
    return dist;
  }

  #getObjectiveDistance(): number {
    const position = this.#controller.position;
    return Math.hypot(
      position.x - this.#objectivePosition.x,
      position.z - this.#objectivePosition.z,
    );
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
    const audioDebug = this.#audio.engineAudio.getDebugState();
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

  // ─── Radio Breadcrumbs ────────────────────────────────────

  #updateRadioBreadcrumbs(dt: number): void {
    const isDriving = this.#runSession.mode === 'driving';
    this.#radioLog.setVisible(isDriving && !this.#pauseVisible && !this.#godModeActive);
    this.#radioLog.update(dt);

    if (!isDriving || this.#pauseVisible) return;

    const pos = this.#controller.position;
    const state = this.#controller.state;
    const speed = state.speed * 3.6; // km/h

    // Proximity: outposts
    for (let i = 0; i < this.#outpostPositions.length - 1; i += 1) {
      const op = this.#outpostPositions[i];
      if (!op) continue;
      const dist = Math.hypot(pos.x - op.x, pos.z - op.z);
      if (dist < 80) {
        const msgs = [
          'relay echo — outpost signal, weak',
          'structure ahead — watch for raiders',
          'outpost ping — proceed with caution',
        ];
        this.#radioLog.push(msgs[i % msgs.length] ?? msgs[0]!, 'outpost');
        break;
      }
    }

    // Proximity: objective
    const objDist = this.#getObjectiveDistance();
    if (objDist < 150) {
      const msg = objDist < 60
        ? 'ridge beacon hot — almost there'
        : 'signal spike — summit relay close';
      this.#radioLog.push(msg, 'objective', 'alert');
    }

    // Proximity: raiders
    const raiderDist = this.#raiders.getNearestDistance(pos);
    if (raiderDist < 60) {
      const msg = raiderDist < 25
        ? 'hostile contact — evade'
        : 'movement on the road — not friendly';
      this.#radioLog.push(msg, 'raider', 'alert');
      // Discovery: first raider sighting
      if (!this.#seenRaiders) {
        this.#seenRaiders = true;
        this.#shell.showDiscoveryToast('Hostile contact');
      }
    }

    // Water entry
    if (state.surface === 'water' && !this.#discoveredSurfaces.has('water')) {
      this.#radioLog.push('water crossing — hold steady', 'water');
    }

    // Weather change
    const currentCondition = this.#lastWeatherSnapshot.condition;
    if (this.#prevWeatherCondition && currentCondition !== this.#prevWeatherCondition) {
      const msg = currentCondition === 'rainy'
        ? 'front moving in — grip will drop'
        : currentCondition === 'sunny'
          ? 'skies clearing'
          : 'weather shifting';
      this.#radioLog.push(msg, 'weather');
    }
    this.#prevWeatherCondition = currentCondition;

    // Speed warning
    if (speed > 100) {
      this.#radioLog.push('running hot', 'speed');
    }

    // Damage taken
    const currentHealth = this.#vehicle.damage.totalHealth;
    if (currentHealth < this.#prevDamageHealth - 0.08) {
      const msg = currentHealth < 0.4
        ? 'vehicle critical — slow down'
        : currentHealth < 0.7
          ? 'panel loose — taking hits'
          : 'took a hit';
      this.#radioLog.push(msg, 'damage', currentHealth < 0.4 ? 'alert' : 'info');
    }
    this.#prevDamageHealth = currentHealth;

    // Checkpoint reached
    if (this.#checkpointBannerTime > 2.0) {
      this.#radioLog.push('relay banked — keep moving', 'checkpoint', 'alert');
    }

    // Discovery: new surface
    if (state.isGrounded && state.surface !== 'dirt') {
      if (!this.#discoveredSurfaces.has(state.surface)) {
        this.#discoveredSurfaces.add(state.surface);
        const surfaceName = state.surface.charAt(0).toUpperCase() + state.surface.slice(1);
        this.#shell.showDiscoveryToast(`New surface: ${surfaceName}`);
        this.#radioLog.push(`terrain change — ${state.surface}`, 'discovery');
      }
    }

    // Discovery: map milestones
    const discoveryPercent = this.#mapDiscovery.getPercent();
    if (
      discoveryPercent >= 25
      && this.#prevDiscoveryPercent < 25
    ) {
      this.#radioLog.push('new terrain mapped — 25% scanned', 'discovery', 'alert');
      this.#shell.showDiscoveryToast('25% mapped');
    } else if (
      discoveryPercent >= 50
      && this.#prevDiscoveryPercent < 50
    ) {
      this.#radioLog.push('sector halfway scanned', 'discovery', 'alert');
      this.#shell.showDiscoveryToast('50% mapped');
    } else if (
      discoveryPercent >= 75
      && this.#prevDiscoveryPercent < 75
    ) {
      this.#radioLog.push('most of the basin mapped', 'discovery', 'alert');
      this.#shell.showDiscoveryToast('75% mapped');
    }
    this.#prevDiscoveryPercent = discoveryPercent;

    // Discovery: found the road
    if (!this.#foundRoad && this.#controller.surfaceFeedback.roadInfluence > 0.5) {
      this.#foundRoad = true;
      this.#shell.showDiscoveryToast('Route found');
      this.#radioLog.push('road surface detected', 'discovery');
    }

    // Idle chatter
    if (this.#radioLog.idleTime > 25) {
      const idleMsgs = [
        'static...',
        'signal lost',
        '...',
        'interference — keep moving',
        'nothing on the wire',
        'frequency dead',
      ];
      const pick = idleMsgs[Math.floor(Math.random() * idleMsgs.length)] ?? 'static...';
      this.#radioLog.push(pick, 'idle', 'ambient');
    }
  }

  #getContextualRouteHint(): string {
    const pos = this.#controller.position;
    const objDist = this.#getObjectiveDistance();

    // Near objective
    if (objDist < 120) {
      return `Summit relay — ${Math.round(objDist)}m`;
    }

    // Near outpost
    for (let i = 0; i < this.#outpostPositions.length - 1; i += 1) {
      const op = this.#outpostPositions[i];
      if (!op) continue;
      const dist = Math.hypot(pos.x - op.x, pos.z - op.z);
      if (dist < 70) {
        return `Outpost ahead — ${Math.round(dist)}m`;
      }
    }

    // Near raiders
    const raiderDist = this.#raiders.getNearestDistance(pos);
    if (raiderDist < 50) {
      return `Hostile patrol — ${Math.round(raiderDist)}m`;
    }

    // On road
    if (this.#controller.surfaceFeedback.roadInfluence > 0.4) {
      return 'On route';
    }

    // Default
    if (this.#controller.state.surface === 'water') {
      return 'Water crossing';
    }

    return objDist < 300
      ? `Summit relay — ${Math.round(objDist)}m`
      : 'Open terrain';
  }
}
