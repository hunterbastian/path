extends Control

## Minimal title screen. Game world visible behind.
## Title fades in, then "press any key" pulses.

signal start_game

const AMBER := Color("#d4a033")
const BRIGHT_AMBER := Color("#f0c040")
const DIM_AMBER := Color("#8a6a20")

var _title: Label
var _prompt: Label
var _ready_for_input: bool = false
var _time: float = 0.0

func _ready() -> void:
	# Dark overlay — game world shows through
	var overlay := ColorRect.new()
	overlay.color = Color(0.02, 0.02, 0.015, 0.7)
	overlay.set_anchors_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(overlay)

	# Title — lower third, not dead center
	_title = Label.new()
	_title.text = "PATH"
	_title.add_theme_color_override("font_color", AMBER)
	_title.add_theme_font_size_override("font_size", 48)
	_title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_title.set_anchors_preset(Control.PRESET_CENTER)
	_title.position = Vector2(-100, -30)
	_title.custom_minimum_size = Vector2(200, 60)
	_title.modulate.a = 0.0
	_title.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_title)

	# Prompt — below title
	_prompt = Label.new()
	_prompt.text = "PRESS ANY KEY"
	_prompt.add_theme_color_override("font_color", DIM_AMBER)
	_prompt.add_theme_font_size_override("font_size", 12)
	_prompt.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_prompt.set_anchors_preset(Control.PRESET_CENTER)
	_prompt.position = Vector2(-100, 30)
	_prompt.custom_minimum_size = Vector2(200, 20)
	_prompt.modulate.a = 0.0
	_prompt.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_prompt)

	# Animate in
	var tween := create_tween()
	tween.tween_interval(0.5)
	tween.tween_property(_title, "modulate:a", 1.0, 0.8).set_ease(Tween.EASE_OUT)
	tween.tween_interval(0.3)
	tween.tween_property(_prompt, "modulate:a", 1.0, 0.5)
	tween.tween_callback(func(): _ready_for_input = true)

func _process(delta: float) -> void:
	if not _ready_for_input:
		return
	_time += delta
	# Gentle pulse on prompt
	_prompt.modulate.a = 0.5 + sin(_time * 2.5) * 0.5

func _input(event: InputEvent) -> void:
	if not _ready_for_input:
		return
	if event is InputEventKey and event.pressed:
		start_game.emit()
	elif event is InputEventMouseButton and event.pressed:
		start_game.emit()
	elif event is InputEventJoypadButton and event.pressed:
		start_game.emit()
