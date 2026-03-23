extends SceneTree

const DriftScore := preload("res://scripts/gameplay/drift_score.gd")

func _init() -> void:
	var scorer := DriftScore.new()

	# Not drifting — low lateral speed
	scorer.update_drift(1.0, 10.0, true, 0.016)
	assert(not scorer.is_drifting, "Should not drift with low lateral speed")

	# Not drifting — no handbrake
	scorer.update_drift(5.0, 10.0, false, 0.016)
	assert(not scorer.is_drifting, "Should not drift without handbrake")

	# Start drifting
	scorer.update_drift(5.0, 10.0, true, 0.016)
	assert(scorer.is_drifting, "Should be drifting now")

	# Accumulate score
	scorer.update_drift(5.0, 10.0, true, 0.016)
	assert(scorer.current_drift_score > 0.0, "Score should accumulate")

	# End drift
	scorer.update_drift(1.0, 10.0, false, 0.016)
	assert(not scorer.is_drifting, "Drift should end")
	assert(scorer.session_drift_total > 0.0, "Session total should increase")

	# Consume pattern
	var final := scorer.consume_scored_drift()
	assert(final > 0.0, "Should return scored drift")
	var second := scorer.consume_scored_drift()
	assert(second == 0.0, "Second consume should return 0")

	print("All drift score tests passed.")
	quit()
