class_name VehicleInput
extends Node

## Reads raw input and exposes smoothed values for the vehicle controller.
## Steering is rate-limited for natural feel. Input read in _physics_process.

# Continuous inputs
var throttle: float = 0.0
var brake: float = 0.0
var steer: float = 0.0  # -1.0 (left) to 1.0 (right), smoothed

# State inputs
var handbrake: bool = false
var boost: bool = false

# Steering tuning
@export var steer_speed: float = 4.0        # how fast steering turns
@export var countersteer_speed: float = 10.0 # how fast steering returns to center
@export var steering_exponent: float = 1.5   # deadzone curve (>1 = less sensitive near center)

# Single-frame consumables
var _pause_pressed: bool = false

# Internal
var _raw_steer: float = 0.0

func _physics_process(delta: float) -> void:
	throttle = Input.get_action_strength("accelerate")
	brake = Input.get_action_strength("brake")
	handbrake = Input.is_action_pressed("handbrake")
	boost = Input.is_action_pressed("boost")

	# Raw steer input with exponent curve for deadzone feel
	_raw_steer = Input.get_action_strength("steer_right") - Input.get_action_strength("steer_left")
	var target_steer := signf(_raw_steer) * pow(absf(_raw_steer), steering_exponent)

	# Rate-limited steering (counter-steer is faster than turning)
	if absf(target_steer) < absf(steer) or signf(target_steer) != signf(steer):
		# Returning to center or counter-steering — fast
		steer = move_toward(steer, target_steer, countersteer_speed * delta)
	else:
		# Turning — slower, more deliberate
		steer = move_toward(steer, target_steer, steer_speed * delta)

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		_pause_pressed = true

func consume_pause() -> bool:
	if _pause_pressed:
		_pause_pressed = false
		return true
	return false
