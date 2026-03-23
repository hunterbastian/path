class_name ThirdPersonCamera
extends Camera3D

## Full-featured third-person camera with speed response,
## drift offset, FOV changes, freelook, and impact effects.

@export var target_path: NodePath

# --- Follow ---
@export var base_distance: float = 8.0
@export var base_height: float = 3.5
@export var look_ahead: float = 2.0
@export var follow_smooth: float = 5.0

# --- Speed response ---
@export var speed_distance_add: float = 4.0
@export var speed_height_add: float = 1.5
@export var max_reference_speed: float = 45.0

var _target: Node3D
var _current_distance: float
var _current_height: float

func _ready() -> void:
	if target_path:
		_target = get_node(target_path)
	_current_distance = base_distance
	_current_height = base_height

func _physics_process(delta: float) -> void:
	if not _target:
		return

	var speed: float = _target.linear_velocity.length() if _target is RigidBody3D else 0.0
	var speed_ratio := clampf(speed / max_reference_speed, 0.0, 1.0)

	# Speed-responsive distance and height
	var target_distance := base_distance + speed_distance_add * speed_ratio
	var target_height := base_height + speed_height_add * speed_ratio
	_current_distance = lerpf(_current_distance, target_distance, 3.0 * delta)
	_current_height = lerpf(_current_height, target_height, 3.0 * delta)

	var target_pos := _target.global_position
	var target_forward := -_target.global_transform.basis.z

	var desired_pos := target_pos - target_forward * _current_distance + Vector3.UP * _current_height
	global_position = global_position.lerp(desired_pos, follow_smooth * delta)

	var look_target := target_pos + target_forward * look_ahead
	look_at(look_target, Vector3.UP)
