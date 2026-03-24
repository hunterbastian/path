class_name VehicleController
extends RigidBody3D

## Raycast vehicle with custom arcade physics.
## All forces applied in _integrate_forces().

const _SurfaceConfig := preload("res://scripts/vehicle/surface_config.gd")

# --- Suspension ---
@export var spring_strength: float = 80.0   # stiff — car doesn't bounce, it LANDS
@export var spring_damping: float = 8.0     # kills bounce instantly
@export var ray_length: float = 1.5          # long enough to always reach ground

# --- Drive ---
@export var max_engine_force: float = 70.0  # violent acceleration
@export var max_speed: float = 60.0         # ~216 km/h — fury road speed
@export var custom_gravity: float = 25.0    # heavy but not glued — cars catch air off bumps

# --- Steering ---
@export var max_steer_angle: float = 0.4    # tight at speed, commit to your line

# --- Grip ---
@export var lateral_grip: float = 7.0       # lower grip = more slide, more mad max
@export var handbrake_grip_factor: float = 0.08  # handbrake = instant chaos
@export var yaw_damping: float = 2.0        # car rotates freely, big sweeping slides
@export var countersteer_grip_bonus: float = 1.5  # skilled drivers recover from slides

# --- Boost ---
@export var boost_force: float = 55.0       # nitro hit — feels like a kick in the back
@export var boost_max_speed: float = 80.0   # insane boost top speed

# --- Downforce ---
@export var downforce_coefficient: float = 0.03  # planted at speed, loose at low speed

# --- Weight transfer ---
@export var roll_intensity: float = 0.03  # visual lean in turns

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

func _physics_process(delta: float) -> void:
	if drift_score and input:
		var lateral_speed := linear_velocity.dot(global_transform.basis.x)
		var forward_speed := -linear_velocity.dot(global_transform.basis.z)
		drift_score.update_drift(lateral_speed, forward_speed, bool(input.handbrake), delta)

	# Surface detection from terrain
	var terrain_node := get_node_or_null("/root/Main/GameWorld/Terrain")
	if not terrain_node:
		terrain_node = get_node_or_null("/root/GameWorld/Terrain")
	if terrain_node and terrain_node.has_method("get_surface_at"):
		var pos := global_position
		var surface: int = terrain_node.get_surface_at(pos.x, pos.z)
		if surface != current_surface:
			set_surface(surface)

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
	var terrain := get_node_or_null("/root/Main/GameWorld/Terrain")
	if not terrain:
		terrain = get_node_or_null("/root/GameWorld/Terrain")
	if terrain and terrain.has_method("get_height_at"):
		var h: float = terrain.get_height_at(global_position.x, global_position.z)
		global_position.y = h + 3.0  # spawn 3m above terrain

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
			var drive: float = float(input.throttle) * max_engine_force * float(surface_config["accel"]) * speed_factor
			var brake_force: float = float(input.brake) * max_engine_force * 0.6
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
		var drag: float = 0.4 * float(surface_config["drag"])
		if input and float(input.throttle) < 0.1 and float(input.brake) < 0.1:
			drag += 0.8  # extra drag when coasting (engine braking)
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
		var air_drive: float = float(input.throttle) * max_engine_force * 0.3
		state.apply_central_force(air_forward * air_drive)
		# Air steering
		var air_steer: float = float(input.steer) * 3.0
		state.apply_torque(Vector3.UP * -air_steer * mass)
