class_name HUD
extends CanvasLayer

## Amber terminal HUD. Reads vehicle state each frame.

var _speed_label: Label
var _compass_label: Label
var _boost_bar: ProgressBar
var _health_bar: ProgressBar
var _health_label: Label
var _drift_label: Label
var _surface_label: Label
var _minimap: Control
var _minimap_canvas: Control  # custom draw for island + car dot

var _vehicle: Node
var _drift_node: Node
var _damage_node: Node

const AMBER := Color("#d4a033")
const BRIGHT_AMBER := Color("#f0c040")
const DIM_AMBER := Color("#8a6a20")
const PANEL_BG := Color("#0f0f0c")

const COMPASS_DIRS := ["N", "NE", "E", "SE", "S", "SW", "W", "NW"]
const SURFACE_NAMES := ["DIRT", "SAND", "GRASS", "ROCK", "SNOW", "WATER"]


func _ready() -> void:
	layer = 5
	_build_ui()


func _process(_delta: float) -> void:
	_find_vehicle()
	if not _vehicle:
		return
	_update_speed()
	_update_compass()
	_update_boost()
	_update_health()
	_update_drift()
	_update_surface()
	_update_minimap()


func _find_vehicle() -> void:
	if _vehicle:
		return
	_vehicle = get_node_or_null("/root/Main/GameWorld/Vehicle")
	if not _vehicle:
		_vehicle = get_node_or_null("/root/GameWorld/Vehicle")
	if _vehicle:
		_drift_node = _vehicle.get_node_or_null("DriftScore")
		_damage_node = _vehicle.get_node_or_null("DamageSystem")


func _build_ui() -> void:
	var root := Control.new()
	root.set_anchors_preset(Control.PRESET_FULL_RECT)
	root.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(root)

	# --- Speed (bottom center) ---
	_speed_label = _make_label("000 km/h", 24)
	_speed_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_speed_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_speed_label.position.y = -80
	_speed_label.position.x = -100
	_speed_label.custom_minimum_size = Vector2(200, 30)
	root.add_child(_speed_label)

	# --- Health bar (above speed) ---
	_health_label = _make_label("DMG: 100%", 12)
	_health_label.add_theme_color_override("font_color", DIM_AMBER)
	_health_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_health_label.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_health_label.position.y = -110
	_health_label.position.x = -100
	_health_label.custom_minimum_size = Vector2(200, 20)
	root.add_child(_health_label)

	_health_bar = ProgressBar.new()
	_health_bar.max_value = 100
	_health_bar.value = 100
	_health_bar.show_percentage = false
	_health_bar.custom_minimum_size = Vector2(200, 6)
	_health_bar.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_health_bar.position.y = -95
	_health_bar.position.x = -100
	var health_bg := StyleBoxFlat.new()
	health_bg.bg_color = Color("#1a1a15")
	health_bg.border_color = DIM_AMBER
	health_bg.border_width_top = 1
	health_bg.border_width_bottom = 1
	health_bg.border_width_left = 1
	health_bg.border_width_right = 1
	health_bg.corner_radius_top_left = 0
	health_bg.corner_radius_top_right = 0
	health_bg.corner_radius_bottom_left = 0
	health_bg.corner_radius_bottom_right = 0
	_health_bar.add_theme_stylebox_override("background", health_bg)
	var health_fill := StyleBoxFlat.new()
	health_fill.bg_color = AMBER
	health_fill.corner_radius_top_left = 0
	health_fill.corner_radius_top_right = 0
	health_fill.corner_radius_bottom_left = 0
	health_fill.corner_radius_bottom_right = 0
	_health_bar.add_theme_stylebox_override("fill", health_fill)
	root.add_child(_health_bar)

	# --- Boost bar (below speed) ---
	_boost_bar = ProgressBar.new()
	_boost_bar.max_value = 100
	_boost_bar.value = 100
	_boost_bar.show_percentage = false
	_boost_bar.custom_minimum_size = Vector2(200, 8)
	_boost_bar.set_anchors_preset(Control.PRESET_CENTER_BOTTOM)
	_boost_bar.position.y = -50
	_boost_bar.position.x = -100
	# Style the boost bar amber
	var bar_bg := StyleBoxFlat.new()
	bar_bg.bg_color = Color("#1a1a15")
	bar_bg.border_color = DIM_AMBER
	bar_bg.border_width_top = 1
	bar_bg.border_width_bottom = 1
	bar_bg.border_width_left = 1
	bar_bg.border_width_right = 1
	bar_bg.corner_radius_top_left = 0
	bar_bg.corner_radius_top_right = 0
	bar_bg.corner_radius_bottom_left = 0
	bar_bg.corner_radius_bottom_right = 0
	_boost_bar.add_theme_stylebox_override("background", bar_bg)
	var bar_fill := StyleBoxFlat.new()
	bar_fill.bg_color = AMBER
	bar_fill.corner_radius_top_left = 0
	bar_fill.corner_radius_top_right = 0
	bar_fill.corner_radius_bottom_left = 0
	bar_fill.corner_radius_bottom_right = 0
	_boost_bar.add_theme_stylebox_override("fill", bar_fill)
	root.add_child(_boost_bar)

	# --- Compass (top center) ---
	_compass_label = _make_label("N", 16)
	_compass_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_compass_label.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_compass_label.position.y = 20
	_compass_label.position.x = -50
	_compass_label.custom_minimum_size = Vector2(100, 25)
	root.add_child(_compass_label)

	# --- Drift counter (bottom left) ---
	_drift_label = _make_label("DRIFT: 0", 14)
	_drift_label.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_drift_label.position = Vector2(20, -100)
	root.add_child(_drift_label)

	# --- Surface indicator (left side) ---
	_surface_label = _make_label("SURFACE: DIRT", 12)
	_surface_label.add_theme_color_override("font_color", DIM_AMBER)
	_surface_label.set_anchors_preset(Control.PRESET_BOTTOM_LEFT)
	_surface_label.position = Vector2(20, -130)
	root.add_child(_surface_label)

	# --- Minimap (bottom right) ---
	_minimap = Control.new()
	_minimap.custom_minimum_size = Vector2(120, 120)
	_minimap.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_minimap.position = Vector2(-140, -140)
	_minimap.mouse_filter = Control.MOUSE_FILTER_IGNORE

	# Background
	var minimap_bg := ColorRect.new()
	minimap_bg.color = Color("#0a0a08")
	minimap_bg.set_anchors_preset(Control.PRESET_FULL_RECT)
	minimap_bg.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_minimap.add_child(minimap_bg)

	# Custom draw canvas for island + car
	_minimap_canvas = MinimapDraw.new()
	_minimap_canvas.set_anchors_preset(Control.PRESET_FULL_RECT)
	_minimap_canvas.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_minimap.add_child(_minimap_canvas)

	# Border
	var minimap_border := ColorRect.new()
	minimap_border.color = Color(0, 0, 0, 0)
	minimap_border.set_anchors_preset(Control.PRESET_FULL_RECT)
	minimap_border.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_minimap.add_child(minimap_border)

	root.add_child(_minimap)


func _make_label(text: String, size: int) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_color_override("font_color", AMBER)
	label.add_theme_font_size_override("font_size", size)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label


# --- Update functions ---

func _update_speed() -> void:
	if _vehicle is RigidBody3D:
		var speed_ms: float = _vehicle.linear_velocity.length()
		var speed_kmh: int = roundi(speed_ms * 3.6)
		_speed_label.text = "%03d km/h" % speed_kmh


func _update_compass() -> void:
	var forward: Vector3 = -_vehicle.global_transform.basis.z
	var angle: float = atan2(forward.x, forward.z)
	var idx := roundi(fposmod(angle, TAU) / (TAU / 8.0)) % 8
	_compass_label.text = COMPASS_DIRS[idx]


func _update_boost() -> void:
	# Boost is always available in current design -- show as full
	# Later: connect to an actual boost meter
	_boost_bar.value = 100


func _update_health() -> void:
	if not _damage_node:
		return
	if _damage_node.has_method("get_health_percent"):
		var pct: float = float(_damage_node.get_health_percent()) * 100.0
		_health_bar.value = pct
		_health_label.text = "DMG: %d%%" % roundi(pct)
		# Color shifts from amber to red as health drops
		if pct < 30.0:
			_health_label.add_theme_color_override("font_color", Color("#cc3333"))
		elif pct < 60.0:
			_health_label.add_theme_color_override("font_color", AMBER)
		else:
			_health_label.add_theme_color_override("font_color", DIM_AMBER)


func _update_drift() -> void:
	if not _drift_node:
		return
	if bool(_drift_node.is_drifting):
		var score: int = roundi(float(_drift_node.current_drift_score))
		_drift_label.text = "DRIFT: %d" % score
		_drift_label.add_theme_color_override("font_color", BRIGHT_AMBER)
	else:
		var total: int = roundi(float(_drift_node.session_drift_total))
		_drift_label.text = "TOTAL: %d" % total
		_drift_label.add_theme_color_override("font_color", AMBER)


func _update_surface() -> void:
	if "current_surface" in _vehicle:
		var idx: int = int(_vehicle.current_surface)
		if idx >= 0 and idx < SURFACE_NAMES.size():
			_surface_label.text = "SURFACE: %s" % SURFACE_NAMES[idx]

func _update_minimap() -> void:
	if _minimap_canvas and _minimap_canvas is MinimapDraw:
		var pos: Vector3 = _vehicle.global_position
		var forward: Vector3 = -_vehicle.global_transform.basis.z
		_minimap_canvas.car_x = pos.x
		_minimap_canvas.car_z = pos.z
		_minimap_canvas.car_angle = atan2(forward.x, forward.z)
		_minimap_canvas.queue_redraw()


## Inner class for minimap custom drawing
class MinimapDraw extends Control:
	const ISLAND_RADIUS := 220.0
	const MAP_WORLD_RANGE := 260.0  # world units visible on minimap

	var car_x: float = 0.0
	var car_z: float = 0.0
	var car_angle: float = 0.0

	func _draw() -> void:
		var s := size
		var cx := s.x * 0.5
		var cy := s.y * 0.5
		var scale_factor := s.x / (MAP_WORLD_RANGE * 2.0)

		# Draw island circle
		var island_r := ISLAND_RADIUS * scale_factor
		draw_arc(Vector2(cx, cy), island_r, 0.0, TAU, 48, Color("#2a2518"), 1.0)

		# Draw biome sector lines
		var biome_angles := [0.4, 1.8, 3.2, 4.6]
		for a in biome_angles:
			var end := Vector2(cx + cos(a) * island_r, cy + sin(a) * island_r)
			draw_line(Vector2(cx, cy), end, Color("#1a1510"), 1.0)

		# Draw center meadow circle
		var meadow_r := 80.0 * scale_factor
		draw_arc(Vector2(cx, cy), meadow_r, 0.0, TAU, 32, Color("#2a3518"), 1.0)

		# Draw car position
		var car_px := cx + car_x * scale_factor
		var car_py := cy + car_z * scale_factor
		var car_pos := Vector2(car_px, car_py)

		# Car dot
		draw_circle(car_pos, 3.0, Color("#f0c040"))

		# Direction indicator (small line showing heading)
		var dir := Vector2(sin(car_angle), cos(car_angle)) * 6.0
		draw_line(car_pos, car_pos + dir, Color("#f0c040"), 2.0)

		# Border
		draw_rect(Rect2(Vector2.ZERO, s), Color("#8a6a20"), false, 1.0)
