class_name Freecam
extends Camera3D

## God mode / freecam. Toggle with G key.
## WASD to fly, mouse to look, Shift for speed boost, Space up, Ctrl down.

@export var fly_speed: float = 30.0
@export var fast_multiplier: float = 3.0
@export var mouse_sensitivity: float = 0.002

var _yaw: float = 0.0
var _pitch: float = 0.0
var _active: bool = false

var _vehicle: Node
var _game_camera: Camera3D

func _ready() -> void:
	set_process(false)
	set_physics_process(false)

func activate(vehicle: Node, game_cam: Camera3D) -> void:
	_vehicle = vehicle
	_game_camera = game_cam
	_active = true

	# Snapshot current camera position
	global_transform = game_cam.global_transform
	_yaw = rotation.y
	_pitch = rotation.x

	# Freeze vehicle physics
	if _vehicle is RigidBody3D:
		_vehicle.freeze = true

	make_current()
	set_process(true)
	set_physics_process(true)

func deactivate() -> void:
	_active = false
	set_process(false)
	set_physics_process(false)

	# Unfreeze vehicle
	if _vehicle and _vehicle is RigidBody3D:
		_vehicle.freeze = false

	# Return to game camera
	if _game_camera:
		_game_camera.make_current()

func _input(event: InputEvent) -> void:
	if not _active:
		return
	if event is InputEventMouseMotion:
		_yaw -= event.relative.x * mouse_sensitivity
		_pitch -= event.relative.y * mouse_sensitivity
		_pitch = clampf(_pitch, -PI * 0.45, PI * 0.45)
		rotation = Vector3(_pitch, _yaw, 0.0)

func _physics_process(delta: float) -> void:
	if not _active:
		return

	var dir := Vector3.ZERO

	if Input.is_action_pressed("accelerate"):
		dir -= transform.basis.z  # forward
	if Input.is_action_pressed("brake"):
		dir += transform.basis.z  # backward
	if Input.is_action_pressed("steer_left"):
		dir -= transform.basis.x  # left
	if Input.is_action_pressed("steer_right"):
		dir += transform.basis.x  # right
	if Input.is_action_pressed("handbrake"):
		dir += Vector3.UP  # up (space)
	if Input.is_key_pressed(KEY_CTRL):
		dir -= Vector3.UP  # down

	var speed := fly_speed
	if Input.is_action_pressed("boost"):
		speed *= fast_multiplier

	if dir.length() > 0.0:
		dir = dir.normalized()
	global_position += dir * speed * delta
