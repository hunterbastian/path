class_name VehicleInput
extends Node

## Reads raw input and exposes normalized values for the vehicle controller.
## Uses consume pattern for single-frame actions.

# Continuous inputs (0.0 to 1.0)
var throttle: float = 0.0
var brake: float = 0.0
var steer: float = 0.0  # -1.0 (left) to 1.0 (right)

# State inputs
var handbrake: bool = false
var boost: bool = false

# Single-frame consumables
var _pause_pressed: bool = false

func _process(_delta: float) -> void:
	throttle = Input.get_action_strength("accelerate")
	brake = Input.get_action_strength("brake")
	steer = Input.get_action_strength("steer_right") - Input.get_action_strength("steer_left")
	handbrake = Input.is_action_pressed("handbrake")
	boost = Input.is_action_pressed("boost")

func _unhandled_input(event: InputEvent) -> void:
	if event.is_action_pressed("pause"):
		_pause_pressed = true

func consume_pause() -> bool:
	if _pause_pressed:
		_pause_pressed = false
		return true
	return false
