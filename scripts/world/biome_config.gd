class_name BiomeConfig
extends RefCounted

enum BiomeType { ALPINE_MEADOWS, CANYON, SALT_FLATS, JAGGED_PEAKS, COAST }

# Per-biome definitions
const BIOMES := {
    BiomeType.ALPINE_MEADOWS: {
        "name": "Alpine Meadows",
        "surface": 2,  # GRASS
        "color_base": Color(0.35, 0.55, 0.25),
        "color_slope": Color(0.45, 0.4, 0.3),
        "noise_scale": 0.008,
        "noise_amplitude": 12.0,
        "grass_density": 1.0,
    },
    BiomeType.CANYON: {
        "name": "Canyon",
        "surface": 0,  # DIRT
        "color_base": Color(0.6, 0.35, 0.2),
        "color_slope": Color(0.5, 0.3, 0.15),
        "noise_scale": 0.015,
        "noise_amplitude": 25.0,
        "grass_density": 0.2,
    },
    BiomeType.SALT_FLATS: {
        "name": "Salt Flats",
        "surface": 3,  # ROCK
        "color_base": Color(0.85, 0.82, 0.75),
        "color_slope": Color(0.7, 0.65, 0.55),
        "noise_scale": 0.003,
        "noise_amplitude": 3.0,
        "grass_density": 0.0,
    },
    BiomeType.JAGGED_PEAKS: {
        "name": "Jagged Peaks",
        "surface": 3,  # ROCK
        "color_base": Color(0.5, 0.5, 0.55),
        "color_slope": Color(0.9, 0.92, 0.95),
        "noise_scale": 0.02,
        "noise_amplitude": 35.0,
        "grass_density": 0.1,
    },
    BiomeType.COAST: {
        "name": "Coast",
        "surface": 1,  # SAND
        "color_base": Color(0.75, 0.7, 0.5),
        "color_slope": Color(0.4, 0.5, 0.3),
        "noise_scale": 0.01,
        "noise_amplitude": 8.0,
        "grass_density": 0.6,
    },
}

# Angular sectors (radians, measured from +X axis)
# Biomes arranged around center: Canyon (N-NE), Jagged Peaks (E-SE), Salt Flats (NW-W), Coast (S-SW)
const BIOME_SECTORS := {
    BiomeType.CANYON: { "angle_start": 0.4, "angle_end": 1.8 },
    BiomeType.JAGGED_PEAKS: { "angle_start": 1.8, "angle_end": 3.2 },
    BiomeType.SALT_FLATS: { "angle_start": 3.2, "angle_end": 4.6 },
    BiomeType.COAST: { "angle_start": 4.6, "angle_end": 6.68 },  # wraps past TAU
}

const MEADOW_RADIUS := 80.0
const BLEND_WIDTH := 30.0

static func sample_biome(x: float, z: float) -> Dictionary:
    var dist := Vector2(x, z).length()
    var angle := fposmod(atan2(z, x), TAU)

    # Center = Alpine Meadows
    if dist < MEADOW_RADIUS:
        return { "biome": BiomeType.ALPINE_MEADOWS, "blend": { BiomeType.ALPINE_MEADOWS: 1.0 } }

    # Transition zone from meadows to sector biome
    var meadow_weight := 1.0 - clampf((dist - MEADOW_RADIUS) / BLEND_WIDTH, 0.0, 1.0)

    # Find sector biome by angle
    var sector_biome: int = BiomeType.COAST  # default fallback
    for biome_type in BIOME_SECTORS:
        var sector: Dictionary = BIOME_SECTORS[biome_type]
        var start: float = float(sector["angle_start"])
        var end_val: float = float(sector["angle_end"])
        if end_val > TAU:
            if angle >= start or angle < end_val - TAU:
                sector_biome = biome_type
                break
        elif angle >= start and angle < end_val:
            sector_biome = biome_type
            break

    if meadow_weight > 0.0:
        return {
            "biome": BiomeType.ALPINE_MEADOWS if meadow_weight > 0.5 else sector_biome,
            "blend": { BiomeType.ALPINE_MEADOWS: meadow_weight, sector_biome: 1.0 - meadow_weight }
        }

    return { "biome": sector_biome, "blend": { sector_biome: 1.0 } }

static func get_biome(biome_type: int) -> Dictionary:
    return BIOMES[biome_type]

static func get_surface_type(biome_type: int) -> int:
    return BIOMES[biome_type]["surface"]
