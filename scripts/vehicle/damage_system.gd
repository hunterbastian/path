class_name DamageSystem
extends Node

## Tracks vehicle damage from collisions.
## Parts break off at damage thresholds.
## Affects handling when damaged.

signal part_detached(part_name: String)
signal vehicle_destroyed

@export var max_health: float = 100.0
@export var collision_damage_scale: float = 0.02  # damage per unit of collision impulse

var health: float = 100.0
var _vehicle: RigidBody3D
var _detached_parts: Array[String] = []
var _prev_velocity: Vector3 = Vector3.ZERO

# Damage thresholds for part detachment
const PART_THRESHOLDS := {
	"bumper_front": 30.0,   # first to go
	"bumper_rear": 40.0,
	"hood": 55.0,
	"door_left": 60.0,
	"door_right": 60.0,
	"wheel_fl": 75.0,       # wheels last
	"wheel_fr": 75.0,
	"wheel_rl": 80.0,
	"wheel_rr": 80.0,
}

# How each detached part affects driving
const PART_PENALTIES := {
	"bumper_front": { "drag": 1.1 },
	"bumper_rear": { "drag": 1.1 },
	"hood": { "max_speed": 0.9 },
	"door_left": { "drag": 1.05 },
	"door_right": { "drag": 1.05 },
	"wheel_fl": { "steer": 0.6, "grip": 0.7 },
	"wheel_fr": { "steer": 0.6, "grip": 0.7 },
	"wheel_rl": { "accel": 0.5, "grip": 0.7 },
	"wheel_rr": { "accel": 0.5, "grip": 0.7 },
}

func _ready() -> void:
	health = max_health

func setup(vehicle: RigidBody3D) -> void:
	_vehicle = vehicle

func _physics_process(_delta: float) -> void:
	if not _vehicle:
		return

	# Detect collision impact from velocity change
	var current_vel := _vehicle.linear_velocity
	var delta_v := (current_vel - _prev_velocity).length()
	_prev_velocity = current_vel

	# Significant impact (sudden deceleration > threshold)
	if delta_v > 5.0:
		var damage := delta_v * collision_damage_scale
		take_damage(damage)

func take_damage(amount: float) -> void:
	health -= amount
	health = maxf(health, 0.0)

	# Check for part detachment
	var damage_taken := max_health - health
	for part_name in PART_THRESHOLDS:
		if part_name in _detached_parts:
			continue
		if damage_taken >= PART_THRESHOLDS[part_name]:
			_detach_part(part_name)

	if health <= 0.0:
		vehicle_destroyed.emit()

func _detach_part(part_name: String) -> void:
	_detached_parts.append(part_name)
	part_detached.emit(part_name)

	# Spawn a flying debris piece
	if _vehicle:
		_spawn_debris(part_name)

func _spawn_debris(part_name: String) -> void:
	# Create a small box mesh that flies off
	var debris := RigidBody3D.new()
	debris.mass = 20.0

	var mesh := MeshInstance3D.new()
	var box := BoxMesh.new()

	# Size depends on part type
	match part_name:
		"bumper_front", "bumper_rear":
			box.size = Vector3(1.8, 0.2, 0.3)
		"hood":
			box.size = Vector3(1.6, 0.05, 1.2)
		"door_left", "door_right":
			box.size = Vector3(0.1, 0.5, 1.0)
		_:  # wheels
			box.size = Vector3(0.3, 0.3, 0.3)

	var mat := StandardMaterial3D.new()
	mat.albedo_color = Color(0.3, 0.3, 0.3)
	mesh.mesh = box
	mesh.material_override = mat
	debris.add_child(mesh)

	var col := CollisionShape3D.new()
	var col_box := BoxShape3D.new()
	col_box.size = box.size
	col.shape = col_box
	debris.add_child(col)

	# Position at vehicle + random offset
	var offset := Vector3(randf_range(-1.0, 1.0), 0.5, randf_range(-1.0, 1.0))
	if "left" in part_name:
		offset.x = -1.2
	elif "right" in part_name:
		offset.x = 1.2
	elif "front" in part_name:
		offset.z = 2.0
	elif "rear" in part_name:
		offset.z = -2.0

	debris.global_position = _vehicle.global_position + offset

	# Launch it with force
	var launch_dir := offset.normalized() + Vector3.UP * 0.5
	debris.linear_velocity = _vehicle.linear_velocity + launch_dir * randf_range(5.0, 12.0)
	debris.angular_velocity = Vector3(randf_range(-5, 5), randf_range(-5, 5), randf_range(-5, 5))

	# Add to scene, auto-cleanup after 8 seconds
	_vehicle.get_tree().current_scene.add_child(debris)
	var timer := get_tree().create_timer(8.0)
	timer.timeout.connect(debris.queue_free)

# --- Penalty calculation ---

func get_penalty(stat: String) -> float:
	"""Returns the multiplier for a given stat based on detached parts."""
	var multiplier := 1.0
	for part_name in _detached_parts:
		var penalties: Dictionary = PART_PENALTIES.get(part_name, {})
		if penalties.has(stat):
			multiplier *= float(penalties[stat])
	return multiplier

func get_health_percent() -> float:
	return health / max_health

func reset() -> void:
	health = max_health
	_detached_parts.clear()
	_prev_velocity = Vector3.ZERO
