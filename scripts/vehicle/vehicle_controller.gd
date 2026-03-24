class_name VehicleController
extends RigidBody3D

## Raycast vehicle with custom arcade physics.
## All forces applied in _integrate_forces().

const _SurfaceConfig := preload("res://scripts/vehicle/surface_config.gd")

# --- Suspension ---
@export var spring_strength: float = 45.0   # soft — car rocks over bumps like MudRunner
@export var spring_damping: float = 5.0     # some bounce — feels like real weight
@export var ray_length: float = 1.5         # long travel for rough terrain

# --- Drive ---
@export var max_engine_force: float = 18.0  # low power — fighting terrain, not racing
@export var max_speed: float = 22.0         # ~80 km/h max — slow and heavy
@export var custom_gravity: float = 12.0    # moderate extra gravity (total ~22 with Godot's 9.8)

# --- Steering ---
@export var max_steer_angle: float = 0.45   # decent turn radius

# --- Grip ---
@export var lateral_grip: float = 12.0      # high grip — car doesn't slide easily
@export var handbrake_grip_factor: float = 0.2   # handbrake loosens but doesn't go crazy
@export var yaw_damping: float = 4.0        # resists spinning — heavy vehicle
@export var countersteer_grip_bonus: float = 1.2  # mild counter-steer help

# --- Boost ---
@export var boost_force: float = 15.0       # mild push, not rocket
@export var boost_max_speed: float = 30.0   # ~108 km/h boost cap

# --- Downforce ---
@export var downforce_coefficient: float = 0.02  # light downforce

# --- Weight transfer ---
@export var roll_intensity: float = 0.06    # more body roll — feels heavy

# --- Drag ---
@export var forward_drag: float = 1.2       # high drag — car slows naturally

# --- Surface ---
var current_surface: int = _SurfaceConfig.SurfaceType.DIRT
var surface_config: Dictionary = _SurfaceConfig.get_default()

func set_surface(surface: int) -> void:
	current_surface = surface
	surface_config = _SurfaceConfig.get_config(surface)

# --- References ---
@onready var input: Node = $VehicleInput
@onready var drift_score: Node = $DriftScore
@onready var body_mesh: Node3D = $MeshInstance3D
@export var car_model_path: String = "res://assets/models/porsche.glb"
@onready var wheels: Array[RayCast3D] = [
	$WheelFL, $WheelFR, $WheelRL, $WheelRR
]

# Wheel indices
const FRONT := [0, 1]
const REAR := [2, 3]

# Cached node refs (resolved once)
var _terrain_node: Node
var _terrain_resolved: bool = false

func _resolve_terrain() -> void:
	if _terrain_resolved:
		return
	_terrain_node = get_node_or_null("/root/Main/GameWorld/Terrain")
	if not _terrain_node:
		_terrain_node = get_node_or_null("/root/GameWorld/Terrain")
	_terrain_resolved = true

func _physics_process(delta: float) -> void:
	if drift_score and input:
		var lateral_speed := linear_velocity.dot(global_transform.basis.x)
		var forward_speed := -linear_velocity.dot(global_transform.basis.z)
		drift_score.update_drift(lateral_speed, forward_speed, bool(input.handbrake), delta)

	# Surface detection from terrain (cached ref)
	_resolve_terrain()
	if _terrain_node and _terrain_node.has_method("get_surface_at"):
		var pos := global_position
		var surface: int = _terrain_node.get_surface_at(pos.x, pos.z)
		if surface != current_surface:
			set_surface(surface)

	# Auto-respawn if fallen off map
	if global_position.y < -20.0:
		respawn()

var _freecam: Node
var _game_camera: Camera3D
var _god_mode: bool = false

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		respawn()
	if event is InputEventKey and event.pressed and event.keycode == KEY_G:
		_toggle_god_mode()

func _toggle_god_mode() -> void:
	_god_mode = not _god_mode
	if _god_mode:
		# Find or create freecam
		if not _game_camera:
			_game_camera = get_viewport().get_camera_3d()
		if not _freecam:
			var FreecamScript := load("res://scripts/camera/freecam.gd")
			_freecam = Camera3D.new()
			_freecam.set_script(FreecamScript)
			get_tree().current_scene.add_child(_freecam)
		_freecam.activate(self, _game_camera)
	else:
		if _freecam:
			_freecam.deactivate()

func respawn() -> void:
	_resolve_terrain()
	# Reset to center of island
	linear_velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO
	rotation = Vector3.ZERO
	var spawn_height := 30.0
	if _terrain_node and _terrain_node.has_method("get_height_at"):
		spawn_height = _terrain_node.get_height_at(0.0, 0.0) + 3.0
	global_position = Vector3(0.0, spawn_height, 0.0)

func _process(delta: float) -> void:
	if not body_mesh:
		return
	# Visual roll from lateral velocity
	var lateral := linear_velocity.dot(global_transform.basis.x)
	var target_roll := -lateral * roll_intensity
	body_mesh.rotation.z = lerpf(body_mesh.rotation.z, target_roll, 10.0 * delta)

func _ready() -> void:
	# Ensure raycasts are enabled and pointing down in local space
	for wheel in wheels:
		wheel.enabled = true
		wheel.target_position = Vector3.DOWN * ray_length

	# Load car model, replace placeholder box
	_load_car_model()

	# Snap to terrain so we always spawn on land
	await get_tree().process_frame
	_snap_to_terrain()

func _snap_to_terrain() -> void:
	# Spawn at center (0, 0) on the flat green pad
	_resolve_terrain()
	var spawn_h := 35.0  # safe default above most terrain
	if _terrain_node and _terrain_node.has_method("get_height_at"):
		spawn_h = _terrain_node.get_height_at(0.0, 0.0) + 2.0
	global_position = Vector3(0.0, spawn_h, 0.0)
	linear_velocity = Vector3.ZERO
	angular_velocity = Vector3.ZERO

func _load_car_model() -> void:
	if not ResourceLoader.exists(car_model_path):
		return
	var scene: PackedScene = load(car_model_path)
	if not scene:
		return
	var model := scene.instantiate()

	# Remove placeholder mesh
	if body_mesh:
		body_mesh.queue_free()

	# Add model as child, assign as body_mesh for visual roll
	model.name = "CarModel"
	model.rotation.y = PI  # GLB faces +Z, Godot forward is -Z — flip 180°
	add_child(model)
	body_mesh = model

func _integrate_forces(state: PhysicsDirectBodyState3D) -> void:
	# Custom gravity (stronger than default for planted feel)
	state.apply_central_force(Vector3.DOWN * custom_gravity * mass)

	for i in wheels.size():
		var wheel := wheels[i]
		if not wheel.is_colliding():
			continue

		var wheel_local := wheel.position
		var contact_point := wheel.get_collision_point()
		var contact_normal := wheel.get_collision_normal()

		# --- Suspension force ---
		var wheel_world := wheel.global_position
		var distance := wheel_world.distance_to(contact_point)
		var compression := 1.0 - (distance / ray_length)
		if compression <= 0.0:
			continue

		# Velocity at wheel contact (offset must be in world space for cross product)
		var wheel_offset := global_transform.basis * wheel_local
		var vel_at_wheel := state.linear_velocity + state.angular_velocity.cross(wheel_offset)
		var spring_vel := vel_at_wheel.dot(contact_normal)
		var force_mag := (compression * spring_strength - spring_vel * spring_damping) * mass
		state.apply_force(contact_normal * maxf(force_mag, 0.0), wheel_local)

		# --- Drive force (rear wheels only) ---
		if i in REAR and input:
			var car_forward := -global_transform.basis.z
			var speed := linear_velocity.length()
			var speed_factor := 1.0 - clampf(speed / (max_speed * float(surface_config["max_speed"])), 0.0, 1.0)
			var drive: float = float(input.throttle) * max_engine_force * float(surface_config["accel"]) * speed_factor * mass
			var brake_force: float = float(input.brake) * max_engine_force * 0.6 * mass
			state.apply_force(car_forward * (drive - brake_force), wheel_local)

		# --- Wheel orientation ---
		var wheel_forward := -global_transform.basis.z
		var wheel_right := global_transform.basis.x

		# Steer front wheels
		if i in FRONT and input:
			var steer_angle: float = float(input.steer) * max_steer_angle * float(surface_config["steer_response"])
			wheel_forward = wheel_forward.rotated(Vector3.UP, steer_angle)
			wheel_right = wheel_right.rotated(Vector3.UP, steer_angle)

		# Project velocity onto ground plane
		var ground_vel := vel_at_wheel - contact_normal * vel_at_wheel.dot(contact_normal)
		var forward_vel := ground_vel.dot(wheel_forward)
		var lateral_vel := ground_vel.dot(wheel_right)

		# --- Slip angle (Pacejka-like curve) ---
		# Grip peaks at 0.3 slip angle, drops after 0.5
		var slip_angle := 0.0
		if absf(forward_vel) > 0.5:
			slip_angle = atan2(absf(lateral_vel), absf(forward_vel))
		var peak_angle := 0.3
		var drop_angle := 0.5
		var slip_grip: float
		if slip_angle < peak_angle:
			slip_grip = slip_angle / peak_angle  # ramp up to peak
		elif slip_angle < drop_angle:
			slip_grip = 1.0  # peak grip zone
		else:
			slip_grip = maxf(0.3, 1.0 - (slip_angle - drop_angle) * 1.5)  # falloff

		# --- Lateral grip force ---
		var grip: float = lateral_grip * slip_grip * float(surface_config["grip"])
		if input and bool(input.handbrake) and i in REAR:
			grip *= handbrake_grip_factor

		# Counter-steer bonus: if steering into the slide, boost grip slightly
		if input and signf(float(input.steer)) != signf(lateral_vel) and absf(float(input.steer)) > 0.1:
			grip *= countersteer_grip_bonus * float(surface_config["counter_steer"])

		var lateral_force: float = -lateral_vel * grip * mass
		state.apply_force(wheel_right * lateral_force, wheel_local)

		# --- Forward friction / rolling drag ---
		var drag: float = forward_drag * float(surface_config["drag"])
		if input and float(input.throttle) < 0.1 and float(input.brake) < 0.1:
			drag += 2.0  # heavy engine braking — car decelerates fast when you let off gas
		state.apply_force(wheel_forward * -forward_vel * drag * mass * 0.25, wheel_local)

	# --- Yaw damping (prevents infinite spinning) ---
	var yaw_damp: float = -state.angular_velocity.y * yaw_damping * float(surface_config["yaw_damp"]) * mass
	state.apply_torque(Vector3.UP * yaw_damp)

	# --- Boost ---
	if input and bool(input.boost):
		var speed := linear_velocity.length()
		if speed < boost_max_speed:
			var boost_dir := -global_transform.basis.z
			state.apply_central_force(boost_dir * boost_force * mass)

	# --- Aerodynamic downforce (keeps car planted at high speed) ---
	var speed_sq := linear_velocity.length_squared()
	state.apply_central_force(Vector3.DOWN * downforce_coefficient * speed_sq * mass)

	# --- Airborne drive (reduced force when no wheels touching) ---
	var any_wheel_grounded := false
	for w in wheels:
		if w.is_colliding():
			any_wheel_grounded = true
			break
	if not any_wheel_grounded and input:
		var air_forward := -global_transform.basis.z
		var air_drive: float = float(input.throttle) * max_engine_force * 0.1 * mass
		state.apply_central_force(air_forward * air_drive)
		# Air steering
		var air_steer: float = float(input.steer) * 3.0
		state.apply_torque(Vector3.UP * -air_steer * mass)
