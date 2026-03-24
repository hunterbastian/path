extends Control

## Animated amber terminal title screen with glow and blur backdrop.

signal start_game

const AMBER := Color("#d4a033")
const BRIGHT_AMBER := Color("#f0c040")
const DIM_AMBER := Color("#8a6a20")
const GLOW_AMBER := Color("#f0c040")
const BG_COLOR := Color(0.04, 0.04, 0.03, 0.85)  # semi-transparent to show game behind

var _title_label: Label
var _data_label: Label
var _init_btn: Button
var _hints: Array[Label] = []
var _glow_panel: PanelContainer
var _blur_rect: ColorRect
var _scanline_rect: ColorRect

# Animation state
var _boot_phase: int = 0
var _boot_timer: float = 0.0
var _glow_time: float = 0.0

func _ready() -> void:
	_build_ui()
	_start_boot_sequence()

func _process(delta: float) -> void:
	_glow_time += delta

	# Pulsing glow on the panel border
	if _glow_panel:
		var pulse := 0.6 + sin(_glow_time * 2.0) * 0.4
		_glow_panel.modulate = Color(1.0, 1.0, 1.0, 0.8 + pulse * 0.2)

	# Button text glow pulse
	if _init_btn:
		var btn_pulse := 0.7 + sin(_glow_time * 3.0) * 0.3
		_init_btn.add_theme_color_override("font_color", BRIGHT_AMBER * btn_pulse + AMBER * (1.0 - btn_pulse))

	# Boot sequence typing
	_update_boot(delta)

func _build_ui() -> void:
	# --- Blur backdrop ---
	_blur_rect = ColorRect.new()
	_blur_rect.color = BG_COLOR
	_blur_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
	_blur_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_blur_rect)

	# --- Center panel ---
	var center := CenterContainer.new()
	center.set_anchors_preset(Control.PRESET_FULL_RECT)
	center.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(center)

	_glow_panel = PanelContainer.new()
	_glow_panel.custom_minimum_size = Vector2(480, 0)
	var panel_style := StyleBoxFlat.new()
	panel_style.bg_color = Color(0.05, 0.05, 0.04, 0.95)
	panel_style.border_color = DIM_AMBER
	panel_style.border_width_top = 1
	panel_style.border_width_bottom = 1
	panel_style.border_width_left = 1
	panel_style.border_width_right = 1
	panel_style.corner_radius_top_left = 0
	panel_style.corner_radius_top_right = 0
	panel_style.corner_radius_bottom_left = 0
	panel_style.corner_radius_bottom_right = 0
	panel_style.content_margin_left = 35.0
	panel_style.content_margin_top = 30.0
	panel_style.content_margin_right = 35.0
	panel_style.content_margin_bottom = 30.0
	panel_style.shadow_color = Color(GLOW_AMBER.r, GLOW_AMBER.g, GLOW_AMBER.b, 0.15)
	panel_style.shadow_size = 12
	_glow_panel.add_theme_stylebox_override("panel", panel_style)
	center.add_child(_glow_panel)

	var vbox := VBoxContainer.new()
	vbox.add_theme_constant_override("separation", 14)
	_glow_panel.add_child(vbox)

	# --- Title ---
	_title_label = _make_label("", 32)
	_title_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title_label.modulate.a = 0.0  # hidden until boot
	vbox.add_child(_title_label)

	# Separator
	vbox.add_child(_make_sep())

	# --- Data row ---
	_data_label = _make_label("", 13)
	_data_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_data_label.add_theme_color_override("font_color", DIM_AMBER)
	_data_label.modulate.a = 0.0
	vbox.add_child(_data_label)

	vbox.add_child(_make_sep())

	# --- Initialize button ---
	_init_btn = Button.new()
	_init_btn.text = "INITIALIZE ▸"
	_init_btn.custom_minimum_size = Vector2(0, 50)
	_init_btn.unique_name_in_owner = true
	_init_btn.add_theme_color_override("font_color", BRIGHT_AMBER)
	_init_btn.add_theme_color_override("font_hover_color", BRIGHT_AMBER)
	_init_btn.add_theme_color_override("font_pressed_color", AMBER)
	_init_btn.add_theme_color_override("font_focus_color", BRIGHT_AMBER)
	_init_btn.add_theme_font_size_override("font_size", 18)

	for state_name in ["normal", "hover", "pressed", "focus"]:
		var btn_style := StyleBoxFlat.new()
		btn_style.corner_radius_top_left = 0
		btn_style.corner_radius_top_right = 0
		btn_style.corner_radius_bottom_left = 0
		btn_style.corner_radius_bottom_right = 0
		btn_style.border_color = AMBER
		btn_style.border_width_top = 1
		btn_style.border_width_bottom = 1
		btn_style.border_width_left = 1
		btn_style.border_width_right = 1
		match state_name:
			"normal": btn_style.bg_color = Color(0.08, 0.08, 0.06, 0.9)
			"hover": btn_style.bg_color = Color(0.14, 0.12, 0.06, 0.95)
			"pressed": btn_style.bg_color = Color(0.2, 0.17, 0.05, 1.0)
			"focus":
				btn_style.bg_color = Color(0.08, 0.08, 0.06, 0.9)
				btn_style.border_width_top = 2
				btn_style.border_width_bottom = 2
				btn_style.border_width_left = 2
				btn_style.border_width_right = 2
				btn_style.border_color = BRIGHT_AMBER
		_init_btn.add_theme_stylebox_override(state_name, btn_style)

	_init_btn.pressed.connect(_on_initialize)
	_init_btn.modulate.a = 0.0
	vbox.add_child(_init_btn)

	# Spacer
	var spacer := Control.new()
	spacer.custom_minimum_size = Vector2(0, 10)
	vbox.add_child(spacer)

	# --- Control hints ---
	var hint_texts := ["WASD · DRIVE", "SPACE · DRIFT", "SHIFT · BOOST", "G · GOD MODE", "ESC · RESPAWN"]
	for hint_text in hint_texts:
		var hint := _make_label(hint_text, 11)
		hint.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
		hint.add_theme_color_override("font_color", DIM_AMBER)
		hint.modulate.a = 0.0
		vbox.add_child(hint)
		_hints.append(hint)

	# --- Scanline overlay ---
	var scanline_shader := load("res://assets/shaders/scanlines.gdshader") as Shader
	if scanline_shader:
		_scanline_rect = ColorRect.new()
		_scanline_rect.color = Color(0, 0, 0, 0)
		_scanline_rect.set_anchors_preset(Control.PRESET_FULL_RECT)
		_scanline_rect.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var mat := ShaderMaterial.new()
		mat.shader = scanline_shader
		mat.set_shader_parameter("line_count", 300.0)
		mat.set_shader_parameter("line_opacity", 0.06)
		mat.set_shader_parameter("flicker_speed", 1.5)
		mat.set_shader_parameter("flicker_intensity", 0.015)
		_scanline_rect.material = mat
		add_child(_scanline_rect)

func _make_label(text: String, size: int) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_color_override("font_color", AMBER)
	label.add_theme_font_size_override("font_size", size)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label

func _make_sep() -> HSeparator:
	var sep := HSeparator.new()
	var sep_style := StyleBoxFlat.new()
	sep_style.bg_color = Color(DIM_AMBER.r, DIM_AMBER.g, DIM_AMBER.b, 0.3)
	sep_style.content_margin_top = 1.0
	sep_style.content_margin_bottom = 1.0
	sep.add_theme_stylebox_override("separator", sep_style)
	return sep

# --- Boot sequence (typing animation) ---

const BOOT_LINES := [
	{ "target": "title", "text": "P · A · T · H", "delay": 0.4, "type_speed": 0.06 },
	{ "target": "data", "text": "SYS:OK  VER:0.1  BIOMES:5  ENGINE:GODOT", "delay": 0.3, "type_speed": 0.02 },
	{ "target": "button", "text": "", "delay": 0.4, "type_speed": 0.0 },
	{ "target": "hints", "text": "", "delay": 0.1, "type_speed": 0.0 },
]

var _typing_text: String = ""
var _typing_index: int = 0
var _typing_target: String = ""
var _char_timer: float = 0.0
var _type_speed: float = 0.0

func _start_boot_sequence() -> void:
	_boot_phase = 0
	_boot_timer = BOOT_LINES[0]["delay"]

func _update_boot(delta: float) -> void:
	if _boot_phase >= BOOT_LINES.size():
		return

	# Wait for delay
	if _boot_timer > 0.0:
		_boot_timer -= delta
		return

	var line: Dictionary = BOOT_LINES[_boot_phase]

	# Handle typing
	if line["target"] == "title" or line["target"] == "data":
		if _typing_text == "":
			_typing_text = line["text"]
			_typing_index = 0
			_type_speed = float(line["type_speed"])
			_typing_target = line["target"]
			# Fade in the label
			var label: Label = _title_label if _typing_target == "title" else _data_label
			var tween := create_tween()
			tween.tween_property(label, "modulate:a", 1.0, 0.2)

		_char_timer += delta
		if _char_timer >= _type_speed and _typing_index < _typing_text.length():
			_char_timer = 0.0
			_typing_index += 1
			var label: Label = _title_label if _typing_target == "title" else _data_label
			label.text = _typing_text.substr(0, _typing_index)

		if _typing_index >= _typing_text.length():
			_typing_text = ""
			_boot_phase += 1
			if _boot_phase < BOOT_LINES.size():
				_boot_timer = BOOT_LINES[_boot_phase]["delay"]

	elif line["target"] == "button":
		# Fade in button
		var tween := create_tween()
		tween.tween_property(_init_btn, "modulate:a", 1.0, 0.4)
		tween.tween_callback(_init_btn.grab_focus)
		_boot_phase += 1
		if _boot_phase < BOOT_LINES.size():
			_boot_timer = BOOT_LINES[_boot_phase]["delay"]

	elif line["target"] == "hints":
		# Stagger fade in hints
		for i in _hints.size():
			var tween := create_tween()
			tween.tween_interval(float(i) * 0.12)
			tween.tween_property(_hints[i], "modulate:a", 1.0, 0.3)
		_boot_phase += 1

func _on_initialize() -> void:
	start_game.emit()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("accelerate") or event.is_action_pressed("handbrake"):
		# Skip boot sequence if still running
		if _boot_phase < BOOT_LINES.size():
			_skip_boot()
		else:
			_on_initialize()

func _skip_boot() -> void:
	_boot_phase = BOOT_LINES.size()
	_title_label.text = "P · A · T · H"
	_title_label.modulate.a = 1.0
	_data_label.text = "SYS:OK  VER:0.1  BIOMES:5  ENGINE:GODOT"
	_data_label.modulate.a = 1.0
	_init_btn.modulate.a = 1.0
	_init_btn.grab_focus()
	for hint in _hints:
		hint.modulate.a = 1.0
