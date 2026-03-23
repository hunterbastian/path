extends SceneTree

const _BiomeConfig := preload("res://scripts/world/biome_config.gd")

func _init() -> void:
    # Center should be Alpine Meadows
    var center := _BiomeConfig.sample_biome(0.0, 0.0)
    assert(center["biome"] == _BiomeConfig.BiomeType.ALPINE_MEADOWS, "Center should be Alpine Meadows")

    # Far from center in Canyon sector (angle ~1.0 rad, distance 150)
    var canyon_x := cos(1.0) * 150.0
    var canyon_z := sin(1.0) * 150.0
    var canyon := _BiomeConfig.sample_biome(canyon_x, canyon_z)
    assert(canyon["biome"] == _BiomeConfig.BiomeType.CANYON, "Should be Canyon at angle ~1.0 rad")

    # All biome configs have required keys
    for bt in _BiomeConfig.BiomeType.values():
        var config := _BiomeConfig.get_biome(bt)
        assert(config.has("color_base"), "Missing color_base for biome %s" % bt)
        assert(config.has("surface"), "Missing surface for biome %s" % bt)
        assert(config.has("noise_scale"), "Missing noise_scale for biome %s" % bt)

    # Surface types are valid integers
    for bt in _BiomeConfig.BiomeType.values():
        var surface: int = _BiomeConfig.get_surface_type(bt)
        assert(surface >= 0 and surface <= 5, "Invalid surface type for biome %s" % bt)

    print("All biome config tests passed.")
    quit()
