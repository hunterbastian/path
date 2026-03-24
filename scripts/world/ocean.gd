class_name Ocean
extends Node3D

## Ocean plane at sea level with animated wave shader.

@export var ocean_size: float = 600.0  # larger than terrain (500)
@export var ocean_subdivisions: int = 128
@export var sea_level: float = 0.0

func _ready() -> void:
	var mesh := PlaneMesh.new()
	mesh.size = Vector2(ocean_size, ocean_size)
	mesh.subdivide_width = ocean_subdivisions
	mesh.subdivide_depth = ocean_subdivisions

	var shader := load("res://assets/shaders/ocean.gdshader") as Shader
	var material := ShaderMaterial.new()
	if shader:
		material.shader = shader
		material.set_shader_parameter("deep_color", Color(0.08, 0.22, 0.42, 0.85))
		material.set_shader_parameter("shallow_color", Color(0.18, 0.48, 0.55, 0.6))
		material.set_shader_parameter("foam_color", Color(0.9, 0.95, 1.0, 1.0))
		material.set_shader_parameter("wave_speed", 0.8)
		material.set_shader_parameter("wave_height", 0.6)
		material.set_shader_parameter("wave_frequency", 1.5)
		material.set_shader_parameter("reflectivity", 0.4)

	mesh.material = material

	var mesh_instance := MeshInstance3D.new()
	mesh_instance.mesh = mesh
	mesh_instance.position.y = sea_level
	mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mesh_instance)
