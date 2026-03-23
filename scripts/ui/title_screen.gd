extends Control

signal start_game

@onready var initialize_btn: Button = %InitializeButton

func _ready() -> void:
	initialize_btn.pressed.connect(_on_initialize)
	initialize_btn.grab_focus()

func _on_initialize() -> void:
	start_game.emit()

func _input(event: InputEvent) -> void:
	if event.is_action_pressed("accelerate") or event.is_action_pressed("handbrake"):
		_on_initialize()
