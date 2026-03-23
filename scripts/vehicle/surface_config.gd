class_name SurfaceConfig
extends RefCounted

## Per-surface driving parameters. Each surface type modifies
## how the car accelerates, grips, drags, steers, and slides.

enum SurfaceType { DIRT, SAND, GRASS, ROCK, SNOW, WATER }

# Tuning values per surface
const CONFIGS := {
	SurfaceType.DIRT:  { "accel": 1.0, "grip": 1.0, "drag": 1.0, "turn": 1.0, "max_speed": 1.0, "steer_response": 1.0, "slip": 1.0, "yaw_damp": 1.0, "counter_steer": 1.0 },
	SurfaceType.SAND:  { "accel": 0.6, "grip": 0.7, "drag": 1.5, "turn": 0.8, "max_speed": 0.7, "steer_response": 0.7, "slip": 1.4, "yaw_damp": 0.8, "counter_steer": 0.8 },
	SurfaceType.GRASS: { "accel": 0.9, "grip": 0.85, "drag": 1.1, "turn": 0.95, "max_speed": 0.9, "steer_response": 0.9, "slip": 1.1, "yaw_damp": 0.95, "counter_steer": 0.95 },
	SurfaceType.ROCK:  { "accel": 0.8, "grip": 1.2, "drag": 0.8, "turn": 0.9, "max_speed": 0.95, "steer_response": 1.1, "slip": 0.7, "yaw_damp": 1.1, "counter_steer": 1.1 },
	SurfaceType.SNOW:  { "accel": 0.7, "grip": 0.5, "drag": 1.2, "turn": 0.7, "max_speed": 0.8, "steer_response": 0.6, "slip": 1.6, "yaw_damp": 0.7, "counter_steer": 0.7 },
	SurfaceType.WATER: { "accel": 0.3, "grip": 0.3, "drag": 2.5, "turn": 0.5, "max_speed": 0.4, "steer_response": 0.4, "slip": 2.0, "yaw_damp": 0.5, "counter_steer": 0.5 },
}

static func get_config(surface: SurfaceType) -> Dictionary:
	return CONFIGS[surface]

static func get_default() -> Dictionary:
	return CONFIGS[SurfaceType.DIRT]
