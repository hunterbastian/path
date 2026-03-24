class_name PostProcess
extends CanvasLayer

## Bloom configuration. Pixelation is handled via project settings viewport stretch.

func _ready() -> void:
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
