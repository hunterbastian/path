class_name PostProcess
extends CanvasLayer

## Full-screen post-processing: vignette, grain, speed desaturation.
## Also configures WorldEnvironment bloom.

var _overlay: ColorRect
var _material: ShaderMaterial

func _ready() -> void:
	layer = 10  # render on top of everything

	_material = ShaderMaterial.new()
	var shader := load("res://assets/shaders/post_process.gdshader") as Shader
	if shader:
		_material.shader = shader
		_material.set_shader_parameter("vignette_intensity", 0.09)
		_material.set_shader_parameter("grain_intensity", 0.03)
		_material.set_shader_parameter("desaturation", 0.0)

	_overlay = ColorRect.new()
	_overlay.material = _material
	_overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	# Full screen
	_overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	add_child(_overlay)

	# Configure bloom on WorldEnvironment
	_setup_bloom()

func _setup_bloom() -> void:
	var world_env := get_node_or_null("/root/Main/GameWorld/WorldEnvironment")
	if not world_env:
		world_env = get_node_or_null("/root/GameWorld/WorldEnvironment")
	if not world_env or not world_env is WorldEnvironment:
		return

	var env: Environment = world_env.environment
	if not env:
		return

	env.glow_enabled = true
	env.glow_intensity = 0.8
	env.glow_strength = 1.0
	env.glow_blend_mode = Environment.GLOW_BLEND_MODE_SOFTLIGHT
	env.glow_bloom = 0.1
	env.glow_hdr_threshold = 1.2

func _process(_delta: float) -> void:
	if not _material:
		return

	var vehicle := get_node_or_null("/root/Main/GameWorld/Vehicle")
	if not vehicle:
		vehicle = get_node_or_null("/root/GameWorld/Vehicle")

	if vehicle and vehicle is RigidBody3D:
		var speed: float = vehicle.linear_velocity.length()
		var max_speed := 45.0

		# Speed desaturation (kicks in above 70% of max speed)
		var desat := clampf((speed - max_speed * 0.7) / (max_speed * 0.3), 0.0, 0.3)
		_material.set_shader_parameter("desaturation", desat)

		# Grain scales slightly with speed
		var grain := 0.03 + clampf(speed / 60.0, 0.0, 1.0) * 0.02
		_material.set_shader_parameter("grain_intensity", grain)
