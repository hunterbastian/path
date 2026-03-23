class_name DriftScore
extends Node

## Detects drift state from vehicle lateral velocity and accumulates score.
## Emits signals for HUD integration.

signal drift_started
signal drift_scoring(current_score: float)
signal drift_ended(final_score: float)

@export var lateral_threshold: float = 3.0  # m/s lateral speed to count as drifting
@export var min_forward_speed: float = 5.0  # must be moving forward to drift

var is_drifting: bool = false
var current_drift_score: float = 0.0
var session_drift_total: float = 0.0

# Consumable — returns the completed drift score once, then clears
var _scored_drift: float = 0.0

func update_drift(lateral_speed: float, forward_speed: float, handbrake: bool, delta: float) -> void:
	var drifting_now := absf(lateral_speed) > lateral_threshold and forward_speed > min_forward_speed and handbrake

	if drifting_now and not is_drifting:
		# Drift started
		is_drifting = true
		current_drift_score = 0.0
		drift_started.emit()

	elif drifting_now and is_drifting:
		# Drift continuing — accumulate score
		var score_tick := absf(lateral_speed) * forward_speed * delta
		current_drift_score += score_tick
		drift_scoring.emit(current_drift_score)

	elif not drifting_now and is_drifting:
		# Drift ended
		is_drifting = false
		_scored_drift = current_drift_score
		session_drift_total += current_drift_score
		drift_ended.emit(current_drift_score)
		current_drift_score = 0.0

func consume_scored_drift() -> float:
	var score := _scored_drift
	_scored_drift = 0.0
	return score
