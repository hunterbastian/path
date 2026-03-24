class_name ThirdPersonCamera
extends Camera3D

## Third-person chase camera. Follows behind the vehicle with
## speed-responsive distance and smooth interpolation.

@export var target_path: NodePath

# --- Follow ---
@export var base_distance: float = 10.0
@export var base_height: float = 4.0
@export var look_ahead: float = 3.0
@export var follow_smooth: float = 5.0

# --- Speed response ---
@export var speed_distance_add: float = 5.0
@export var speed_height_add: float = 2.0
@export var max_reference_speed: float = 60.0

# --- FOV ---
@export var base_fov: float = 75.0
@export var speed_fov_add: float = 10.0
@export var boost_fov_add: float = 8.0
@export var fov_smooth: float = 6.0

var _target: Node3D
var _current_distance: float
var _current_height: float

func _ready() -> void:
	if target_path:
		_target = get_node(target_path)
	_current_distance = base_distance
	_current_height = base_height
	make_current()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _physics_process(delta: float) -> void:
	if not _target:
		return

	# Read speed
	var speed: float = 0.0
	if _target is RigidBody3D:
		speed = _target.linear_velocity.length()
	var speed_ratio := clampf(speed / max_reference_speed, 0.0, 1.0)

	# Speed-responsive distance and height
	var target_distance := base_distance + speed_distance_add * speed_ratio
	var target_height := base_height + speed_height_add * speed_ratio
	_current_distance = lerpf(_current_distance, target_distance, follow_smooth * delta)
	_current_height = lerpf(_current_height, target_height, follow_smooth * delta)

	# Position behind vehicle
	var target_pos := _target.global_position
	var target_forward := -_target.global_transform.basis.z

	var desired_pos := target_pos - target_forward * _current_distance + Vector3.UP * _current_height
	global_position = global_position.lerp(desired_pos, follow_smooth * delta)

	# Look at point ahead of vehicle
	var look_target := target_pos + target_forward * look_ahead + Vector3.UP * 1.0
	look_at(look_target, Vector3.UP)

	# Dynamic FOV
	var target_fov := base_fov + speed_fov_add * speed_ratio
	var vehicle_input: Node = _target.get_node_or_null("VehicleInput")
	if vehicle_input and bool(vehicle_input.get("boost")):
		target_fov += boost_fov_add
	fov = lerpf(fov, target_fov, fov_smooth * delta)
