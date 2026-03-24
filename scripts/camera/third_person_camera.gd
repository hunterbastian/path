class_name ThirdPersonCamera
extends Camera3D

## Third-person chase camera using the Bastiaan Olij pattern.
## top_level = true decouples from car physics jitter.
## Smoothed position AND look-at target for cinematic feel.

@export var target_path: NodePath

# --- Follow ---
@export var base_distance: float = 7.0
@export var base_height: float = 3.0
@export var follow_speed: float = 18.0   # snappy chase (15-20 is driving game standard)

# --- Speed response ---
@export var speed_distance_add: float = 4.0
@export var speed_height_add: float = 1.5
@export var max_reference_speed: float = 60.0

# --- FOV ---
@export var base_fov: float = 75.0
@export var speed_fov_add: float = 10.0
@export var boost_fov_add: float = 8.0
@export var fov_smooth: float = 6.0

var _target: Node3D
var _vehicle_input: Node
var _last_lookat: Vector3  # smoothed look target

func _ready() -> void:
	top_level = true  # critical — decouples from car's physics transforms
	if target_path:
		_target = get_node(target_path)
	if _target:
		_vehicle_input = _target.get_node_or_null("VehicleInput")
		_last_lookat = _target.global_position
		global_position = _target.global_position + Vector3(0, base_height, base_distance)
	make_current()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED

func _physics_process(delta: float) -> void:
	if not _target:
		return

	var speed: float = 0.0
	if _target is RigidBody3D:
		speed = _target.linear_velocity.length()
	var speed_ratio := clampf(speed / max_reference_speed, 0.0, 1.0)

	# Speed-responsive distance and height
	var target_distance := base_distance + speed_distance_add * speed_ratio
	var target_height := base_height + speed_height_add * speed_ratio

	# Desired position behind vehicle
	var target_pos := _target.global_position
	var target_forward := -_target.global_transform.basis.z

	# Camera stays behind car using distance vector clamping (Bastiaan Olij pattern)
	var delta_v := global_position - target_pos
	delta_v.y = 0.0
	if delta_v.length() > 0.01:
		delta_v = delta_v.normalized() * target_distance
	else:
		delta_v = -target_forward * target_distance
	delta_v.y = target_height

	var desired_pos := target_pos + delta_v
	global_position = global_position.lerp(desired_pos, follow_speed * delta)

	# Smooth look-at target (prevents snap when car spins)
	var look_target := target_pos + Vector3.UP * 0.8
	_last_lookat = _last_lookat.lerp(look_target, follow_speed * delta)
	look_at(_last_lookat, Vector3.UP)

	# Dynamic FOV
	var target_fov := base_fov + speed_fov_add * speed_ratio
	if _vehicle_input and bool(_vehicle_input.get("boost")):
		target_fov += boost_fov_add
	fov = lerpf(fov, target_fov, fov_smooth * delta)
