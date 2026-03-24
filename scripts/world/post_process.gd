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

	# Post-process overlay disabled — CanvasLayer can't read screen texture.
	# TODO: Re-implement with BackBufferCopy or SubViewport approach.
	# Bloom still works via WorldEnvironment glow settings below.

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

# TODO: Re-add _process for vignette/grain when overlay is reimplemented
