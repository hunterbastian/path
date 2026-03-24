class_name DirtRoads
extends Node3D

## Terrain-hugging road strips connecting biomes.

const _BiomeConfig := preload("res://scripts/world/biome_config.gd")

const ROAD_OFFSET := 0.05  # height above terrain to prevent z-fighting
const SEGMENT_LENGTH := 4.0  # distance between road mesh samples

# Per-biome road styles: width and color
const ROAD_STYLES := {
	_BiomeConfig.BiomeType.ALPINE_MEADOWS: { "width": 4.0, "color": Color(0.45, 0.35, 0.25) },
	_BiomeConfig.BiomeType.CANYON: { "width": 3.0, "color": Color(0.55, 0.3, 0.18) },
	_BiomeConfig.BiomeType.SALT_FLATS: { "width": 6.0, "color": Color(0.78, 0.75, 0.68) },
	_BiomeConfig.BiomeType.JAGGED_PEAKS: { "width": 3.5, "color": Color(0.5, 0.48, 0.45) },
	_BiomeConfig.BiomeType.COAST: { "width": 4.0, "color": Color(0.65, 0.58, 0.42) },
}

var _terrain: Node

# Road paths: arrays of Vector2 (XZ waypoints)
var _road_paths: Array[PackedVector2Array] = []


func _ready() -> void:
	# Wait one frame for terrain to generate
	await get_tree().process_frame
	_terrain = get_node_or_null("../Terrain")
	if not _terrain:
		return
	_define_road_network()
	_build_all_roads()


func _define_road_network() -> void:
	# Radial roads from center to each biome sector
	# Canyon sector center angle: ~1.1 rad
	# Jagged Peaks: ~2.5 rad
	# Salt Flats: ~3.9 rad
	# Coast: ~5.6 rad

	var biome_angles := [1.1, 2.5, 3.9, 5.6]
	var road_length := 190.0  # extend from center to near island edge

	for angle in biome_angles:
		var path := PackedVector2Array()
		var steps := int(road_length / SEGMENT_LENGTH)
		for i in range(steps + 1):
			var dist: float = float(i) * SEGMENT_LENGTH
			# Slight curve: add sinusoidal wobble for organic feel
			var wobble: float = sin(dist * 0.02 + angle * 3.0) * 8.0
			var a: float = angle + wobble * 0.002
			path.append(Vector2(cos(a) * dist, sin(a) * dist))
		_road_paths.append(path)

	# Ring road at ~150m radius
	var ring := PackedVector2Array()
	var ring_radius := 150.0
	var ring_steps := 80
	for i in range(ring_steps + 1):
		var a: float = float(i) / float(ring_steps) * TAU
		var wobble: float = sin(a * 5.0) * 5.0
		var r: float = ring_radius + wobble
		ring.append(Vector2(cos(a) * r, sin(a) * r))
	_road_paths.append(ring)


func _build_all_roads() -> void:
	var material := StandardMaterial3D.new()
	material.vertex_color_use_as_albedo = true
	material.cull_mode = BaseMaterial3D.CULL_DISABLED

	for path in _road_paths:
		var mesh := _build_road_mesh(path)
		if mesh:
			var mesh_instance := MeshInstance3D.new()
			mesh_instance.mesh = mesh
			mesh_instance.material_override = material
			mesh_instance.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
			add_child(mesh_instance)


func _build_road_mesh(path: PackedVector2Array) -> ArrayMesh:
	if path.size() < 2:
		return null

	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)

	for i in range(path.size() - 1):
		var p0 := path[i]
		var p1 := path[i + 1]

		# Direction and perpendicular
		var dir := (p1 - p0).normalized()
		var perp := Vector2(-dir.y, dir.x)

		# Get road style from biome at midpoint
		var mid := (p0 + p1) * 0.5
		var biome_data := _BiomeConfig.sample_biome(mid.x, mid.y)
		var biome_type: int = biome_data["biome"]
		var style: Dictionary = ROAD_STYLES.get(biome_type, ROAD_STYLES[_BiomeConfig.BiomeType.ALPINE_MEADOWS])
		var half_width: float = float(style["width"]) * 0.5
		var road_color: Color = style["color"]

		# 4 corner positions
		var left0 := p0 + perp * half_width
		var right0 := p0 - perp * half_width
		var left1 := p1 + perp * half_width
		var right1 := p1 - perp * half_width

		# Sample terrain heights
		var h_l0: float = _get_terrain_height(left0.x, left0.y) + ROAD_OFFSET
		var h_r0: float = _get_terrain_height(right0.x, right0.y) + ROAD_OFFSET
		var h_l1: float = _get_terrain_height(left1.x, left1.y) + ROAD_OFFSET
		var h_r1: float = _get_terrain_height(right1.x, right1.y) + ROAD_OFFSET

		# 3D vertices
		var v_l0 := Vector3(left0.x, h_l0, left0.y)
		var v_r0 := Vector3(right0.x, h_r0, right0.y)
		var v_l1 := Vector3(left1.x, h_l1, left1.y)
		var v_r1 := Vector3(right1.x, h_r1, right1.y)

		# Triangle 1: left0, left1, right0
		st.set_color(road_color)
		st.add_vertex(v_l0)
		st.set_color(road_color)
		st.add_vertex(v_l1)
		st.set_color(road_color)
		st.add_vertex(v_r0)

		# Triangle 2: right0, left1, right1
		st.set_color(road_color)
		st.add_vertex(v_r0)
		st.set_color(road_color)
		st.add_vertex(v_l1)
		st.set_color(road_color)
		st.add_vertex(v_r1)

	st.generate_normals()
	return st.commit()


func _get_terrain_height(x: float, z: float) -> float:
	if _terrain and _terrain.has_method("get_height_at"):
		return _terrain.get_height_at(x, z)
	return 0.0
