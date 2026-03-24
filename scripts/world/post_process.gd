class_name PostProcess
extends CanvasLayer

## Pixelation shader + bloom configuration.

@export var pixel_size: float = 3.0  # chunky retro look (1=off, 4=very pixelated)

var _pixel_material: ShaderMaterial

func _ready() -> void:
	layer = 10
	_setup_pixelation()
	_setup_bloom()

func _setup_pixelation() -> void:
	var shader := load("res://assets/shaders/pixelate.gdshader") as Shader
	if not shader:
		return

	_pixel_material = ShaderMaterial.new()
	_pixel_material.shader = shader
	_pixel_material.set_shader_parameter("pixel_size", pixel_size)

	var overlay := ColorRect.new()
	overlay.color = Color(0, 0, 0, 0)
	overlay.material = _pixel_material
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(overlay)

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
