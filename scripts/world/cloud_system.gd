class_name CloudSystem
extends Node3D

## Instanced billboard cumulus clouds with wind drift.

@export var cloud_count: int = 80
@export var cloud_area: float = 450.0  # spread area
@export var cloud_min_height: float = 60.0
@export var cloud_max_height: float = 90.0
@export var cloud_min_scale: float = 15.0
@export var cloud_max_scale: float = 40.0
@export var wind_speed: float = 3.0
@export var wind_direction: Vector3 = Vector3(1.0, 0.0, 0.3).normalized()

var _multimesh: MultiMeshInstance3D
var _base_transforms: Array[Transform3D] = []
var _time: float = 0.0
var _cloud_material: ShaderMaterial

func _ready() -> void:
	_setup_multimesh()

func _setup_multimesh() -> void:
	# Create quad mesh for clouds
	var quad := QuadMesh.new()
	quad.size = Vector2(1.0, 0.6)  # wider than tall

	# Cloud shader material
	_cloud_material = ShaderMaterial.new()
	var shader := load("res://assets/shaders/cloud_billboard.gdshader") as Shader
	if shader:
		_cloud_material.shader = shader
		_cloud_material.set_shader_parameter("cloud_color", Color(1.0, 0.98, 0.95, 0.7))
		_cloud_material.set_shader_parameter("softness", 0.45)

	quad.material = _cloud_material

	# MultiMesh for instancing
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.instance_count = cloud_count
	mm.mesh = quad

	# Generate random cloud positions
	for i in range(cloud_count):
		var pos := Vector3(
			randf_range(-cloud_area * 0.5, cloud_area * 0.5),
			randf_range(cloud_min_height, cloud_max_height),
			randf_range(-cloud_area * 0.5, cloud_area * 0.5)
		)
		var s: float = randf_range(cloud_min_scale, cloud_max_scale)
		var t := Transform3D.IDENTITY
		t = t.scaled(Vector3(s, s * 0.6, s))
		t.origin = pos
		mm.set_instance_transform(i, t)
		_base_transforms.append(t)

	_multimesh = MultiMeshInstance3D.new()
	_multimesh.multimesh = mm
	add_child(_multimesh)

func _process(delta: float) -> void:
	_time += delta
	if not _multimesh or not _multimesh.multimesh:
		return

	var mm := _multimesh.multimesh
	var drift := wind_direction * wind_speed * _time

	for i in range(cloud_count):
		var base_t := _base_transforms[i]
		var t := base_t
		# Wind drift with wrapping
		var new_pos := base_t.origin + drift
		new_pos.x = fposmod(new_pos.x + cloud_area * 0.5, cloud_area) - cloud_area * 0.5
		new_pos.z = fposmod(new_pos.z + cloud_area * 0.5, cloud_area) - cloud_area * 0.5
		t.origin = new_pos
		mm.set_instance_transform(i, t)

func update_time_of_day(time: float) -> void:
	if not _cloud_material:
		return
	# Clouds dim at night, brighten at day, warm at golden hour
	var brightness: float
	if time < 0.2 or time > 0.8:
		brightness = 0.3  # night
	elif time < 0.3:
		brightness = lerpf(0.3, 1.0, (time - 0.2) / 0.1)  # dawn
	elif time > 0.7:
		brightness = lerpf(1.0, 0.3, (time - 0.7) / 0.1)  # dusk
	else:
		brightness = 1.0  # day

	var warm := 0.0
	if time > 0.2 and time < 0.3:
		warm = 1.0 - absf(time - 0.25) / 0.05  # dawn warmth
	elif time > 0.7 and time < 0.8:
		warm = 1.0 - absf(time - 0.75) / 0.05  # dusk warmth
	warm = clampf(warm, 0.0, 1.0)

	var base_color := Color(1.0, 0.98, 0.95)
	var warm_color := Color(1.0, 0.75, 0.5)
	var final_color := base_color.lerp(warm_color, warm) * brightness
	_cloud_material.set_shader_parameter("cloud_color", Color(final_color.r, final_color.g, final_color.b, 0.7))
