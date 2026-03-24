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

# --- FOV ---
@export var base_fov: float = 75.0
@export var speed_fov_add: float = 8.0
@export var boost_fov_add: float = 6.0
@export var airborne_fov_add: float = 4.0
@export var landing_fov_kick: float = -8.0
@export var fov_smooth: float = 6.0
@export var landing_kick_decay: float = 8.0

# --- Drift offset ---
@export var drift_offset_amount: float = 2.5
@export var drift_offset_smooth: float = 3.0

# --- Freelook ---
@export var mouse_sensitivity: float = 0.003
@export var freelook_return_delay: float = 1.0
@export var freelook_return_speed: float = 3.0
@export var min_pitch: float = -0.5
@export var max_pitch: float = 0.8

# --- Heave & shake ---
@export var heave_intensity: float = 0.15
@export var shake_intensity: float = 0.02
@export var shake_speed: float = 20.0

# Follow state
var _target: Node3D
var _current_distance: float
var _current_height: float

# FOV state
var _fov_kick: float = 0.0
var _was_airborne: bool = false

# Drift state
var _current_drift_offset: float = 0.0

# Freelook state
var _orbit_yaw: float = 0.0
var _orbit_pitch: float = 0.0
var _freelook_timer: float = 0.0
var _is_freelooking: bool = false

# Heave & shake state
var _shake_offset: Vector3 = Vector3.ZERO
var _heave_offset: float = 0.0


func _ready() -> void:
	if target_path:
		_target = get_node(target_path)
	_current_distance = base_distance
	_current_height = base_height
	make_current()
	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED


func _input(event: InputEvent) -> void:
	if event is InputEventMouseMotion:
		_orbit_yaw -= event.relative.x * mouse_sensitivity
		_orbit_pitch -= event.relative.y * mouse_sensitivity
		_orbit_pitch = clampf(_orbit_pitch, min_pitch, max_pitch)
		_freelook_timer = 0.0
		_is_freelooking = true


func _physics_process(delta: float) -> void:
	if not _target:
		return

	# ── 1. Read vehicle state ──────────────────────────────────────────────────

	var speed: float = 0.0
	if _target is RigidBody3D:
		speed = _target.linear_velocity.length()

	var speed_ratio := clampf(speed / max_reference_speed, 0.0, 1.0)

	var lateral_vel: float = 0.0
	if _target is RigidBody3D:
		lateral_vel = _target.linear_velocity.dot(_target.global_transform.basis.x)

	# Boost check via VehicleInput child
	var vehicle_input: Node = _target.get_node_or_null("VehicleInput")
	var is_boosting: bool = false
	if vehicle_input:
		is_boosting = bool(vehicle_input.get("boost"))

	# Airborne check — any child RayCast3D not colliding means airborne
	var is_airborne: bool = true
	for child in _target.get_children():
		if child is RayCast3D:
			if child.is_colliding():
				is_airborne = false
				break

	# ── 2. Speed-responsive distance and height ────────────────────────────────

	var target_distance := base_distance + speed_distance_add * speed_ratio
	var target_height := base_height + speed_height_add * speed_ratio
	_current_distance = lerpf(_current_distance, target_distance, 3.0 * delta)
	_current_height = lerpf(_current_height, target_height, 3.0 * delta)

	# ── 3. Freelook auto-return ────────────────────────────────────────────────

	if _is_freelooking:
		_freelook_timer += delta
		if _freelook_timer >= freelook_return_delay:
			_orbit_yaw = lerpf(_orbit_yaw, 0.0, freelook_return_speed * delta)
			_orbit_pitch = lerpf(_orbit_pitch, 0.0, freelook_return_speed * delta)
			if absf(_orbit_yaw) < 0.001 and absf(_orbit_pitch) < 0.001:
				_orbit_yaw = 0.0
				_orbit_pitch = 0.0
				_is_freelooking = false

	# ── 4. Build desired position ──────────────────────────────────────────────

	var target_pos := _target.global_position
	var target_forward := -_target.global_transform.basis.z
	var target_right := _target.global_transform.basis.x

	# Apply orbit yaw: rotate target_forward around world UP
	var orbit_basis := Basis(Vector3.UP, _orbit_yaw)
	var orbit_forward := orbit_basis * target_forward

	# Camera position behind the vehicle in orbit direction
	var desired_pos := target_pos - orbit_forward * _current_distance + Vector3.UP * _current_height

	# Apply pitch offset to height
	desired_pos.y += _orbit_pitch * _current_distance

	# Drift lateral offset
	var target_drift_offset: float = 0.0
	if absf(lateral_vel) > 3.0 and speed > 5.0:
		target_drift_offset = signf(lateral_vel) * drift_offset_amount
	_current_drift_offset = lerpf(_current_drift_offset, target_drift_offset, drift_offset_smooth * delta)
	desired_pos += target_right * _current_drift_offset

	# Heave: read vehicle roll (rotation.z) as suspension lean
	var roll_angle: float = _target.rotation.z
	_heave_offset = lerpf(_heave_offset, roll_angle * heave_intensity, 8.0 * delta)
	desired_pos.y += _heave_offset

	# Roughness shake
	if speed > 2.0:
		var time := float(Time.get_ticks_msec()) * 0.001
		var shake_scale := speed_ratio * shake_intensity
		_shake_offset = Vector3(
			sin(time * shake_speed * 1.1) * shake_scale,
			sin(time * shake_speed) * shake_scale,
			0.0
		)
	else:
		_shake_offset = _shake_offset.lerp(Vector3.ZERO, 8.0 * delta)
	desired_pos += _shake_offset

	# ── 5. Terrain clearance ──────────────────────────────────────────────────

	var space_state := get_world_3d().direct_space_state
	if space_state:
		var query := PhysicsRayQueryParameters3D.create(target_pos + Vector3.UP * 0.5, desired_pos)
		query.exclude = [_target.get_rid()] if _target is CollisionObject3D else []
		var result := space_state.intersect_ray(query)
		if result:
			desired_pos = result.position + result.normal * 0.3

	# ── 6. Apply position ─────────────────────────────────────────────────────

	global_position = global_position.lerp(desired_pos, follow_smooth * delta)

	# ── 7. Build look target ──────────────────────────────────────────────────

	var look_target := target_pos + target_forward * look_ahead
	# Add a fraction of drift offset to look target
	look_target += target_right * _current_drift_offset * 0.3

	# ── 8. Apply look_at ──────────────────────────────────────────────────────

	look_at(look_target, Vector3.UP)

	# ── 9. Update FOV ─────────────────────────────────────────────────────────

	# Landing kick: was airborne last frame, now grounded
	if _was_airborne and not is_airborne:
		_fov_kick = landing_fov_kick

	_was_airborne = is_airborne

	# Decay kick toward 0
	_fov_kick = lerpf(_fov_kick, 0.0, landing_kick_decay * delta)

	# Build target FOV from contributions
	var target_fov := base_fov
	target_fov += speed_fov_add * speed_ratio
	if is_boosting:
		target_fov += boost_fov_add
	if is_airborne:
		target_fov += airborne_fov_add

	fov = lerpf(fov, target_fov + _fov_kick, fov_smooth * delta)
