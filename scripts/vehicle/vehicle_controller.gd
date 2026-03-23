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

# --- References ---
@onready var input: Node = $VehicleInput
@onready var wheels: Array[RayCast3D] = [
	$WheelFL, $WheelFR, $WheelRL, $WheelRR
]

# Wheel indices
const FRONT := [0, 1]
const REAR := [2, 3]

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
			var speed_factor := 1.0 - clampf(speed / max_speed, 0.0, 1.0)
			var drive: float = float(input.throttle) * max_engine_force * speed_factor
			var brake_force: float = float(input.brake) * max_engine_force * 0.6
			state.apply_force(car_forward * (drive - brake_force), wheel_local)
