class_name WeatherSystem
extends Node3D

## Per-biome weather cycling. Spawns GPUParticles3D for rain, snow, and dust.
## Events last ~30s with 3-8min clear intervals.

const _BiomeConfig := preload("res://scripts/world/biome_config.gd")

enum WeatherType { CLEAR, RAIN, SNOW, DUST, BLIZZARD }

# Which weather events each biome can have
const BIOME_WEATHER := {
    _BiomeConfig.BiomeType.ALPINE_MEADOWS: [WeatherType.RAIN],
    _BiomeConfig.BiomeType.CANYON: [WeatherType.DUST],
    _BiomeConfig.BiomeType.SALT_FLATS: [],  # always clear
    _BiomeConfig.BiomeType.JAGGED_PEAKS: [WeatherType.SNOW, WeatherType.BLIZZARD],
    _BiomeConfig.BiomeType.COAST: [WeatherType.RAIN],
}

@export var event_duration: float = 30.0
@export var clear_min: float = 180.0   # 3 minutes
@export var clear_max: float = 480.0   # 8 minutes
@export var particle_area: float = 60.0
@export var particle_height: float = 25.0

var current_weather: int = WeatherType.CLEAR
var _timer: float = 0.0
var _next_event_time: float = 0.0
var _is_event_active: bool = false
var _current_biome: int = _BiomeConfig.BiomeType.ALPINE_MEADOWS

var _rain_particles: GPUParticles3D
var _snow_particles: GPUParticles3D
var _dust_particles: GPUParticles3D

var _player: Node3D
var _player_resolved: bool = false

func _ready() -> void:
    _next_event_time = randf_range(clear_min * 0.3, clear_min)  # first event comes sooner
    _setup_rain()
    _setup_snow()
    _setup_dust()
    _hide_all()

func _process(delta: float) -> void:
    _timer += delta

    # Follow player position (resolve once)
    _resolve_player()
    if _player:
        global_position = _player.global_position
        var pos := _player.global_position
        var biome_data := _BiomeConfig.sample_biome(pos.x, pos.z)
        _current_biome = biome_data["biome"]

    if _is_event_active:
        if _timer >= event_duration:
            _end_event()
    else:
        if _timer >= _next_event_time:
            _start_event()

func _resolve_player() -> void:
    if _player_resolved:
        return
    _player = get_node_or_null("/root/Main/GameWorld/Vehicle")
    if not _player:
        _player = get_node_or_null("/root/GameWorld/Vehicle")
    if _player:
        _player_resolved = true

func _start_event() -> void:
    var possible_weather: Array = BIOME_WEATHER.get(_current_biome, [])
    if possible_weather.is_empty():
        # This biome has no weather — reset timer
        _timer = 0.0
        _next_event_time = randf_range(clear_min, clear_max)
        return

    current_weather = possible_weather[randi() % possible_weather.size()]
    _is_event_active = true
    _timer = 0.0

    _hide_all()
    match current_weather:
        WeatherType.RAIN:
            _rain_particles.emitting = true
            _rain_particles.visible = true
        WeatherType.SNOW:
            _snow_particles.emitting = true
            _snow_particles.visible = true
            # Normal snow — moderate amount
        WeatherType.BLIZZARD:
            _snow_particles.emitting = true
            _snow_particles.visible = true
            # Blizzard — increase amount and add lateral drift
        WeatherType.DUST:
            _dust_particles.emitting = true
            _dust_particles.visible = true

func _end_event() -> void:
    current_weather = WeatherType.CLEAR
    _is_event_active = false
    _timer = 0.0
    _next_event_time = randf_range(clear_min, clear_max)
    _hide_all()

func _hide_all() -> void:
    if _rain_particles:
        _rain_particles.emitting = false
        _rain_particles.visible = false
    if _snow_particles:
        _snow_particles.emitting = false
        _snow_particles.visible = false
    if _dust_particles:
        _dust_particles.emitting = false
        _dust_particles.visible = false

# --- Particle setup ---

func _setup_rain() -> void:
    _rain_particles = GPUParticles3D.new()
    _rain_particles.amount = 200
    _rain_particles.lifetime = 1.5
    _rain_particles.visibility_aabb = AABB(Vector3(-particle_area/2, 0, -particle_area/2), Vector3(particle_area, particle_height, particle_area))

    var mat := ParticleProcessMaterial.new()
    mat.direction = Vector3(0, -1, 0)
    mat.spread = 5.0
    mat.initial_velocity_min = 15.0
    mat.initial_velocity_max = 20.0
    mat.gravity = Vector3(0, -15, 0)
    mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
    mat.emission_box_extents = Vector3(particle_area/2, 1.0, particle_area/2)
    mat.scale_min = 0.02
    mat.scale_max = 0.04
    mat.color = Color(0.7, 0.75, 0.85, 0.6)
    _rain_particles.process_material = mat
    _rain_particles.position.y = particle_height

    # Simple mesh for rain drops
    var mesh := SphereMesh.new()
    mesh.radius = 0.05
    mesh.height = 0.3
    _rain_particles.draw_pass_1 = mesh

    add_child(_rain_particles)

func _setup_snow() -> void:
    _snow_particles = GPUParticles3D.new()
    _snow_particles.amount = 150
    _snow_particles.lifetime = 4.0
    _snow_particles.visibility_aabb = AABB(Vector3(-particle_area/2, 0, -particle_area/2), Vector3(particle_area, particle_height, particle_area))

    var mat := ParticleProcessMaterial.new()
    mat.direction = Vector3(0.2, -1, 0.1)  # slight lateral drift
    mat.spread = 15.0
    mat.initial_velocity_min = 3.0
    mat.initial_velocity_max = 5.0
    mat.gravity = Vector3(0, -3, 0)
    mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
    mat.emission_box_extents = Vector3(particle_area/2, 1.0, particle_area/2)
    mat.scale_min = 0.05
    mat.scale_max = 0.12
    mat.color = Color(0.95, 0.95, 1.0, 0.8)
    _snow_particles.process_material = mat
    _snow_particles.position.y = particle_height

    var mesh := SphereMesh.new()
    mesh.radius = 0.08
    mesh.height = 0.08
    _snow_particles.draw_pass_1 = mesh

    add_child(_snow_particles)

func _setup_dust() -> void:
    _dust_particles = GPUParticles3D.new()
    _dust_particles.amount = 80
    _dust_particles.lifetime = 3.0
    _dust_particles.visibility_aabb = AABB(Vector3(-particle_area/2, 0, -particle_area/2), Vector3(particle_area, particle_height * 0.5, particle_area))

    var mat := ParticleProcessMaterial.new()
    mat.direction = Vector3(1.0, 0.2, 0.5).normalized()
    mat.spread = 30.0
    mat.initial_velocity_min = 5.0
    mat.initial_velocity_max = 10.0
    mat.gravity = Vector3(0, -1, 0)
    mat.emission_shape = ParticleProcessMaterial.EMISSION_SHAPE_BOX
    mat.emission_box_extents = Vector3(particle_area/2, 2.0, particle_area/2)
    mat.scale_min = 0.1
    mat.scale_max = 0.3
    mat.color = Color(0.7, 0.55, 0.35, 0.4)
    _dust_particles.process_material = mat
    _dust_particles.position.y = 5.0

    var mesh := SphereMesh.new()
    mesh.radius = 0.15
    mesh.height = 0.1
    _dust_particles.draw_pass_1 = mesh

    add_child(_dust_particles)
