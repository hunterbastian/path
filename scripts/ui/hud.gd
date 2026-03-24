class_name HUD
extends CanvasLayer

## Amber terminal HUD. Reads vehicle state each frame.

var _speed_label: Label
var _compass_label: Label
var _boost_bar: ProgressBar
var _drift_label: Label
var _surface_label: Label
var _minimap_rect: ColorRect  # placeholder for now

var _vehicle: Node
var _drift_node: Node

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
	_update_drift()
	_update_surface()


func _find_vehicle() -> void:
	if _vehicle:
		return
	_vehicle = get_node_or_null("/root/Main/GameWorld/Vehicle")
	if not _vehicle:
		_vehicle = get_node_or_null("/root/GameWorld/Vehicle")
	if _vehicle:
		_drift_node = _vehicle.get_node_or_null("DriftScore")


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

	# --- Minimap placeholder (bottom right) ---
	_minimap_rect = ColorRect.new()
	_minimap_rect.color = Color("#0f0f0c")
	_minimap_rect.custom_minimum_size = Vector2(96, 96)
	_minimap_rect.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_minimap_rect.position = Vector2(-116, -116)
	# Minimap label
	var minimap_label := Label.new()
	minimap_label.text = "MAP"
	minimap_label.add_theme_color_override("font_color", DIM_AMBER)
	minimap_label.add_theme_font_size_override("font_size", 10)
	minimap_label.position = Vector2(2, 2)
	_minimap_rect.add_child(minimap_label)
	root.add_child(_minimap_rect)


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
