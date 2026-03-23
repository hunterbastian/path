class_name BasicFollowCamera
extends Camera3D

## Minimal follow camera for Phase 1 playtesting.
## Follows a target node with smooth interpolation.

@export var target_path: NodePath
@export var follow_distance: float = 8.0
@export var follow_height: float = 3.5
@export var look_ahead: float = 2.0
@export var smooth_speed: float = 5.0

var _target: Node3D

func _ready() -> void:
	if target_path:
		_target = get_node(target_path)

func _physics_process(delta: float) -> void:
	if not _target:
		return

	var target_pos := _target.global_position
	var target_forward := -_target.global_transform.basis.z

	# Camera position: behind and above the car
	var desired_pos := target_pos - target_forward * follow_distance + Vector3.UP * follow_height

	# Smooth follow
	global_position = global_position.lerp(desired_pos, smooth_speed * delta)

	# Look at point ahead of the car
	var look_target := target_pos + target_forward * look_ahead
	look_at(look_target, Vector3.UP)
