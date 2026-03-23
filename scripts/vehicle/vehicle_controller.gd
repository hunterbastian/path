class_name VehicleController
extends RigidBody3D

## Raycast vehicle with custom arcade physics.
## All forces applied in _integrate_forces().

# --- Suspension ---
@export var spring_strength: float = 55.0
@export var spring_damping: float = 5.0
@export var ray_length: float = 0.6

# --- Drive ---
@export var max_engine_force: float = 45.0
@export var max_speed: float = 45.0  # m/s (~162 km/h)
@export var custom_gravity: float = 28.0

# --- Steering ---
@export var max_steer_angle: float = 0.45  # radians (~26 degrees)

# --- Grip ---
@export var lateral_grip: float = 8.0
@export var handbrake_grip_factor: float = 0.15  # grip multiplier when drifting
@export var yaw_damping: float = 2.5
@export var countersteer_grip_bonus: float = 1.3

# --- Boost ---
@export var boost_force: float = 35.0
@export var boost_max_speed: float = 60.0  # m/s — higher cap when boosting

# --- Downforce ---
@export var downforce_coefficient: float = 0.02  # scales with speed squared

# --- Weight transfer ---
@export var roll_intensity: float = 0.03  # visual lean in turns

# --- Surface ---
var current_surface: int = SurfaceConfig.SurfaceType.DIRT
var surface_config: Dictionary = SurfaceConfig.get_default()

func set_surface(surface: int) -> void:
	current_surface = surface
	surface_config = SurfaceConfig.get_config(surface)

# --- References ---
@onready var input: Node = $VehicleInput
@onready var body_mesh: MeshInstance3D = $MeshInstance3D
@onready var wheels: Array[RayCast3D] = [
	$WheelFL, $WheelFR, $WheelRL, $WheelRR
]

# Wheel indices
const FRONT := [0, 1]
const REAR := [2, 3]

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
			var speed_factor := 1.0 - clampf(speed / (max_speed * surface_config["max_speed"]), 0.0, 1.0)
			var drive: float = float(input.throttle) * max_engine_force * surface_config["accel"] * speed_factor
			var brake_force: float = float(input.brake) * max_engine_force * 0.6
			state.apply_force(car_forward * (drive - brake_force), wheel_local)

		# --- Wheel orientation ---
		var wheel_forward := -global_transform.basis.z
		var wheel_right := global_transform.basis.x

		# Steer front wheels
		if i in FRONT and input:
			var steer_angle: float = float(input.steer) * max_steer_angle * surface_config["steer_response"]
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
		var grip := lateral_grip * slip_grip * surface_config["grip"]
		if input and bool(input.handbrake) and i in REAR:
			grip *= handbrake_grip_factor

		# Counter-steer bonus: if steering into the slide, boost grip slightly
		if input and signf(float(input.steer)) != signf(lateral_vel) and absf(float(input.steer)) > 0.1:
			grip *= countersteer_grip_bonus * surface_config["counter_steer"]

		var lateral_force := -lateral_vel * grip * mass
		state.apply_force(wheel_right * lateral_force, wheel_local)

	# --- Yaw damping (prevents infinite spinning) ---
	var yaw_damp := -state.angular_velocity.y * yaw_damping * surface_config["yaw_damp"] * mass
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
