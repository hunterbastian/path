class_name ValleyFog
extends Node3D

## Volumetric fog that fills low-lying areas.
## Density peaks at dawn/dusk, minimal at noon.

@export var base_density: float = 0.03
@export var dawn_dusk_multiplier: float = 3.0
@export var fog_height: float = 8.0
@export var fog_color: Color = Color(0.8, 0.75, 0.65, 1.0)

var _fog_volume: FogVolume
var _fog_material: FogMaterial

func _ready() -> void:
	_fog_material = FogMaterial.new()
	_fog_material.density = base_density
	_fog_material.albedo = fog_color

	_fog_volume = FogVolume.new()
	_fog_volume.size = Vector3(500.0, fog_height, 500.0)  # covers terrain
	_fog_volume.position.y = fog_height * 0.3  # sit low in valleys
	_fog_volume.material = _fog_material
	add_child(_fog_volume)

func update_fog(time_of_day: float) -> void:
	if not _fog_material:
		return

	# Dawn/dusk density peaks
	# Dawn ~0.25, Dusk ~0.75 — peak fog near these times
	var dawn_dist := absf(time_of_day - 0.25)
	var dusk_dist := absf(time_of_day - 0.75)
	var closest_event := minf(dawn_dist, dusk_dist)

	# Peak within 0.05 of dawn/dusk, fade over 0.1
	var event_factor := 1.0 - clampf(closest_event / 0.1, 0.0, 1.0)
	var density_mult := 1.0 + (dawn_dusk_multiplier - 1.0) * event_factor

	# Night has moderate fog
	var is_night := time_of_day < 0.2 or time_of_day > 0.8
	if is_night:
		density_mult = maxf(density_mult, 1.5)

	_fog_material.density = base_density * density_mult

	# Tint fog toward warm during golden hours
	var warmth := event_factor * 0.3
	_fog_material.albedo = fog_color.lerp(Color(1.0, 0.7, 0.4), warmth)

# Fog updates are driven by DayNightCycle calling update_fog() directly.
# No _process needed here.
