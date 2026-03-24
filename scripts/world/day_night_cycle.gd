class_name DayNightCycle
extends Node3D

## 20-minute day/night cycle. Controls sun direction, light color,
## sky colors, ambient light, and fog color.

@export var cycle_duration: float = 1200.0  # 20 minutes in seconds
@export var start_time: float = 0.3  # start at late morning (0-1, 0=midnight, 0.5=noon)

var time_of_day: float = 0.3  # 0-1 normalized

@onready var sun: DirectionalLight3D = $"../DirectionalLight3D"
@onready var world_env: WorldEnvironment = $"../WorldEnvironment"

# Color gradients for time of day
# Midnight(0) → Dawn(0.22) → Sunrise(0.27) → Day(0.35-0.65) → Sunset(0.73) → Dusk(0.78) → Night(1.0)

const SUN_COLORS := {
	0.0: Color(0.1, 0.1, 0.2),       # midnight blue
	0.22: Color(0.4, 0.2, 0.3),      # pre-dawn purple
	0.27: Color(1.0, 0.6, 0.3),      # sunrise orange
	0.35: Color(1.0, 0.95, 0.85),    # morning warm white
	0.5: Color(1.0, 0.98, 0.92),     # noon
	0.65: Color(1.0, 0.95, 0.85),    # afternoon warm white
	0.73: Color(1.0, 0.55, 0.25),    # sunset orange
	0.78: Color(0.4, 0.2, 0.3),      # dusk purple
	1.0: Color(0.1, 0.1, 0.2),       # midnight
}

const SUN_ENERGIES := {
	0.0: 0.05,    # night
	0.22: 0.1,    # pre-dawn
	0.27: 0.8,    # sunrise
	0.35: 1.2,    # morning
	0.5: 1.4,     # noon peak
	0.65: 1.2,    # afternoon
	0.73: 0.8,    # sunset
	0.78: 0.1,    # dusk
	1.0: 0.05,    # night
}

const SKY_TOP_COLORS := {
	0.0: Color(0.05, 0.05, 0.15),
	0.25: Color(0.2, 0.15, 0.3),
	0.35: Color(0.35, 0.55, 0.82),
	0.5: Color(0.4, 0.6, 0.9),
	0.65: Color(0.35, 0.55, 0.82),
	0.75: Color(0.3, 0.15, 0.25),
	1.0: Color(0.05, 0.05, 0.15),
}

const SKY_HORIZON_COLORS := {
	0.0: Color(0.1, 0.08, 0.15),
	0.25: Color(0.6, 0.35, 0.3),
	0.35: Color(0.72, 0.75, 0.82),
	0.5: Color(0.75, 0.78, 0.85),
	0.65: Color(0.72, 0.75, 0.82),
	0.75: Color(0.7, 0.35, 0.25),
	1.0: Color(0.1, 0.08, 0.15),
}

var _clouds: Node
var _fog: Node
var _linked_resolved: bool = false

func _ready() -> void:
	time_of_day = start_time

func _process(delta: float) -> void:
	time_of_day += delta / cycle_duration
	time_of_day = fposmod(time_of_day, 1.0)
	_update_sun()
	_update_sky()
	_update_linked_systems()

func _update_sun() -> void:
	if not sun:
		return

	# Sun rotation — full 360° over the cycle
	# At time 0.5 (noon), sun is directly overhead
	# At time 0/1 (midnight), sun is below horizon
	var sun_angle: float = (time_of_day - 0.25) * TAU  # offset so sunrise is at ~0.25
	sun.rotation.x = sun_angle

	# Color and energy
	sun.light_color = _sample_gradient(SUN_COLORS, time_of_day)
	sun.light_energy = _sample_gradient_float(SUN_ENERGIES, time_of_day)

	# Disable shadows at night for performance
	sun.shadow_enabled = sun.light_energy > 0.15

func _update_sky() -> void:
	if not world_env or not world_env.environment:
		return
	var env := world_env.environment
	var sky_mat := env.sky.sky_material as ProceduralSkyMaterial
	if not sky_mat:
		return

	sky_mat.sky_top_color = _sample_gradient(SKY_TOP_COLORS, time_of_day)
	sky_mat.sky_horizon_color = _sample_gradient(SKY_HORIZON_COLORS, time_of_day)
	sky_mat.ground_horizon_color = _sample_gradient(SKY_HORIZON_COLORS, time_of_day)

	# Ambient light scales with sun
	env.ambient_light_energy = clampf(_sample_gradient_float(SUN_ENERGIES, time_of_day) * 0.4, 0.05, 0.6)

	# Fog color follows horizon
	env.fog_light_color = _sample_gradient(SKY_HORIZON_COLORS, time_of_day)

# --- Gradient helpers ---
# Pre-sorted key arrays (avoids sorting every frame)
var _sorted_keys_cache: Dictionary = {}

func _get_sorted_keys(gradient: Dictionary) -> Array:
	var id := gradient.hash()
	if _sorted_keys_cache.has(id):
		return _sorted_keys_cache[id]
	var keys := gradient.keys()
	keys.sort()
	_sorted_keys_cache[id] = keys
	return keys

func _sample_gradient(gradient: Dictionary, t: float) -> Color:
	var keys := _get_sorted_keys(gradient)

	if t <= keys[0]:
		return gradient[keys[0]]
	if t >= keys[-1]:
		return gradient[keys[-1]]

	for i in range(keys.size() - 1):
		if t >= keys[i] and t < keys[i + 1]:
			var local_t: float = (t - keys[i]) / (keys[i + 1] - keys[i])
			var color_a: Color = gradient[keys[i]]
			var color_b: Color = gradient[keys[i + 1]]
			return color_a.lerp(color_b, local_t)

	return gradient[keys[0]]

func _sample_gradient_float(gradient: Dictionary, t: float) -> float:
	var keys := _get_sorted_keys(gradient)

	if t <= keys[0]:
		return float(gradient[keys[0]])
	if t >= keys[-1]:
		return float(gradient[keys[-1]])

	for i in range(keys.size() - 1):
		if t >= keys[i] and t < keys[i + 1]:
			var local_t: float = (t - keys[i]) / (keys[i + 1] - keys[i])
			var a: float = float(gradient[keys[i]])
			var b: float = float(gradient[keys[i + 1]])
			return lerpf(a, b, local_t)

	return float(gradient[keys[0]])

# --- Linked systems ---

func _resolve_linked() -> void:
	if _linked_resolved:
		return
	_clouds = get_node_or_null("../CloudSystem")
	_fog = get_node_or_null("../ValleyFog")
	_linked_resolved = true

func _update_linked_systems() -> void:
	_resolve_linked()
	if _clouds and _clouds.has_method("update_time_of_day"):
		_clouds.update_time_of_day(time_of_day)
	if _fog and _fog.has_method("update_fog"):
		_fog.update_fog(time_of_day)
