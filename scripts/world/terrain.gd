class_name Terrain
extends Node3D

## Procedural terrain with noise-based heightfield, island falloff,
## center dome, and collision via HeightMapShape3D.

const _BiomeConfig := preload("res://scripts/world/biome_config.gd")

const GRID_SIZE := 256
const WORLD_SIZE := 500.0
const CELL_SIZE: float = WORLD_SIZE / (GRID_SIZE - 1)
const CENTER_HEIGHT := 25.0
const SEA_LEVEL := 0.0
const ISLAND_RADIUS := 220.0

const CACHE_LIMIT := 8000

var _noise: FastNoiseLite
var _height_cache: Dictionary = {}
var _mesh_instance: MeshInstance3D
var _collision_body: StaticBody3D


func _ready() -> void:
	_init_noise()
	var height_data := _build_height_data()
	_build_visual_mesh(height_data)
	_build_collision(height_data)


# ── Noise setup ──────────────────────────────────────────────────────────────

func _init_noise() -> void:
	_noise = FastNoiseLite.new()
	_noise.seed = 42
	_noise.noise_type = FastNoiseLite.TYPE_SIMPLEX_SMOOTH
	_noise.fractal_type = FastNoiseLite.FRACTAL_FBM
	_noise.fractal_octaves = 4
	_noise.frequency = 0.01


# ── Height sampling ──────────────────────────────────────────────────────────

func _sample_height(x: float, z: float) -> float:
	var dist := Vector2(x, z).length()

	# Island falloff — smooth drop to sea level at edges
	var edge_factor: float = ISLAND_RADIUS * 0.7
	var falloff: float
	if dist < edge_factor:
		falloff = 1.0
	elif dist < ISLAND_RADIUS:
		var t: float = (dist - edge_factor) / (ISLAND_RADIUS - edge_factor)
		falloff = 1.0 - t * t * (3.0 - 2.0 * t)  # smoothstep
	else:
		falloff = 0.0

	# Per-biome noise
	var biome_data := _BiomeConfig.sample_biome(x, z)
	var blend: Dictionary = biome_data["blend"]
	var amplitude := 0.0
	var noise_scale := 0.0
	for biome_type in blend:
		var weight: float = float(blend[biome_type])
		var config: Dictionary = _BiomeConfig.get_biome(biome_type)
		amplitude += float(config["noise_amplitude"]) * weight
		noise_scale += float(config["noise_scale"]) * weight

	# Sample noise with blended scale
	var scaled_noise: float = _noise.get_noise_2d(x * noise_scale / 0.01, z * noise_scale / 0.01)
	var height: float = scaled_noise * amplitude

	# Center dome (Alpine Meadows)
	var center_factor: float = 1.0 - clampf(dist / (ISLAND_RADIUS * 0.3), 0.0, 1.0)
	height += CENTER_HEIGHT * center_factor * center_factor

	height *= falloff
	return maxf(height, SEA_LEVEL)


# ── Height data array ────────────────────────────────────────────────────────

func _build_height_data() -> PackedFloat32Array:
	var data := PackedFloat32Array()
	data.resize(GRID_SIZE * GRID_SIZE)
	var half: float = WORLD_SIZE / 2.0

	for gz in range(GRID_SIZE):
		for gx in range(GRID_SIZE):
			var world_x: float = float(gx) * CELL_SIZE - half
			var world_z: float = float(gz) * CELL_SIZE - half
			data[gz * GRID_SIZE + gx] = _sample_height(world_x, world_z)

	return data


# ── Visual mesh ──────────────────────────────────────────────────────────────

func _get_vertex_color(x: float, z: float, height_data: PackedFloat32Array, gx: int, gz: int) -> Color:
	var biome_data := _BiomeConfig.sample_biome(x, z)
	var blend: Dictionary = biome_data["blend"]

	# Compute slope from neighbors
	var normal_y := 1.0
	if gx > 0 and gx < GRID_SIZE - 1 and gz > 0 and gz < GRID_SIZE - 1:
		var hL: float = height_data[gz * GRID_SIZE + gx - 1]
		var hR: float = height_data[gz * GRID_SIZE + gx + 1]
		var hD: float = height_data[(gz - 1) * GRID_SIZE + gx]
		var hU: float = height_data[(gz + 1) * GRID_SIZE + gx]
		var tx := Vector3(CELL_SIZE * 2.0, hR - hL, 0.0)
		var tz := Vector3(0.0, hU - hD, CELL_SIZE * 2.0)
		normal_y = tz.cross(tx).normalized().y

	var slope_factor := 1.0 - clampf((normal_y - 0.5) / 0.2, 0.0, 1.0)  # 0 = flat, 1 = steep

	var color := Color.BLACK
	for biome_type in blend:
		var weight: float = float(blend[biome_type])
		var config: Dictionary = _BiomeConfig.get_biome(biome_type)
		var base_color: Color = config["color_base"]
		var slope_color: Color = config["color_slope"]
		var biome_color := base_color.lerp(slope_color, slope_factor)
		color += biome_color * weight

	return color


func _build_visual_mesh(height_data: PackedFloat32Array) -> void:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	var half: float = WORLD_SIZE / 2.0

	for gz in range(GRID_SIZE - 1):
		for gx in range(GRID_SIZE - 1):
			# Four corner indices
			var i00: int = gz * GRID_SIZE + gx
			var i10: int = gz * GRID_SIZE + gx + 1
			var i01: int = (gz + 1) * GRID_SIZE + gx
			var i11: int = (gz + 1) * GRID_SIZE + gx + 1

			# World positions
			var x0: float = float(gx) * CELL_SIZE - half
			var x1: float = float(gx + 1) * CELL_SIZE - half
			var z0: float = float(gz) * CELL_SIZE - half
			var z1: float = float(gz + 1) * CELL_SIZE - half

			var v00 := Vector3(x0, height_data[i00], z0)
			var v10 := Vector3(x1, height_data[i10], z0)
			var v01 := Vector3(x0, height_data[i01], z1)
			var v11 := Vector3(x1, height_data[i11], z1)

			# Triangle 1: v00, v01, v10
			st.set_color(_get_vertex_color(x0, z0, height_data, gx, gz))
			st.add_vertex(v00)
			st.set_color(_get_vertex_color(x0, z1, height_data, gx, gz + 1))
			st.add_vertex(v01)
			st.set_color(_get_vertex_color(x1, z0, height_data, gx + 1, gz))
			st.add_vertex(v10)

			# Triangle 2: v10, v01, v11
			st.set_color(_get_vertex_color(x1, z0, height_data, gx + 1, gz))
			st.add_vertex(v10)
			st.set_color(_get_vertex_color(x0, z1, height_data, gx, gz + 1))
			st.add_vertex(v01)
			st.set_color(_get_vertex_color(x1, z1, height_data, gx + 1, gz + 1))
			st.add_vertex(v11)

	st.generate_normals()
	var mesh := st.commit()

	_mesh_instance = MeshInstance3D.new()
	_mesh_instance.mesh = mesh
	var material := StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	_mesh_instance.material_override = material
	add_child(_mesh_instance)


# ── Collision ────────────────────────────────────────────────────────────────

func _build_collision(_height_data: PackedFloat32Array) -> void:
	# Let Godot create trimesh collision as a child of the mesh instance
	if _mesh_instance and _mesh_instance.mesh:
		_mesh_instance.create_trimesh_collision()

	# Always add a flat floor as absolute fallback (at y = -5)
	_collision_body = StaticBody3D.new()
	var boundary := WorldBoundaryShape3D.new()
	var col_shape := CollisionShape3D.new()
	col_shape.shape = boundary
	_collision_body.add_child(col_shape)
	_collision_body.position.y = -5.0
	add_child(_collision_body)


# ── Public API ───────────────────────────────────────────────────────────────

func get_height_at(x: float, z: float) -> float:
	var key := Vector2i(roundi(x * 10.0), roundi(z * 10.0))
	if _height_cache.has(key):
		return _height_cache[key]

	var h: float = _sample_height(x, z)

	if _height_cache.size() >= CACHE_LIMIT:
		_height_cache.clear()
	_height_cache[key] = h

	return h


func get_normal_at(x: float, z: float) -> Vector3:
	var hL: float = _sample_height(x - CELL_SIZE, z)
	var hR: float = _sample_height(x + CELL_SIZE, z)
	var hD: float = _sample_height(x, z - CELL_SIZE)
	var hU: float = _sample_height(x, z + CELL_SIZE)

	# Finite differences: tangent vectors in x and z, cross product gives normal
	var tangent_x := Vector3(CELL_SIZE * 2.0, hR - hL, 0.0)
	var tangent_z := Vector3(0.0, hU - hD, CELL_SIZE * 2.0)
	return tangent_z.cross(tangent_x).normalized()


func get_surface_at(x: float, z: float) -> int:
	var biome_data := _BiomeConfig.sample_biome(x, z)
	return _BiomeConfig.get_surface_type(biome_data["biome"])
