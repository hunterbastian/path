extends Node

@onready var title_screen: Control = $TitleScreen

var game_world: Node3D

func _ready() -> void:
	title_screen.start_game.connect(_on_start_game)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

func _on_start_game() -> void:
	title_screen.queue_free()

	var game_scene := preload("res://scenes/game_world.tscn")
	game_world = game_scene.instantiate()
	add_child(game_world)

	Input.mouse_mode = Input.MOUSE_MODE_CAPTURED
