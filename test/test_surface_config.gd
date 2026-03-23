extends SceneTree

const SurfaceConfig := preload("res://scripts/vehicle/surface_config.gd")

func _init() -> void:
	# Test all surface types exist and have valid values
	for surface_type in SurfaceConfig.SurfaceType.values():
		var config := SurfaceConfig.get_config(surface_type)
		assert(config.has("grip"), "Missing grip for surface %s" % surface_type)
		assert(config["grip"] > 0.0, "Grip must be positive for surface %s" % surface_type)
		assert(config["accel"] > 0.0, "Accel must be positive for surface %s" % surface_type)

	# Test default is dirt
	var default_config := SurfaceConfig.get_default()
	assert(default_config["grip"] == 1.0, "Default grip should be 1.0")

	print("All surface config tests passed.")
	quit()
