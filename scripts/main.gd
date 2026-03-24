extends Node

@onready var title_screen: Control = $TitleScreen

var game_world: Node3D

func _ready() -> void:
	title_screen.start_game.connect(_on_start_game)
	Input.mouse_mode = Input.MOUSE_MODE_VISIBLE

	# Load game world behind the title screen (visible but blurred)
	var game_scene := preload("res://scenes/game_world.tscn")
	game_world = game_scene.instantiate()
	add_child(game_world)
	# Move title screen on top
	move_child(title_screen, -1)

	# Disable vehicle input while on title
	var vehicle := game_world.get_node_or_null("Vehicle")
	if vehicle:
		vehicle.set_physics_process(false)
		vehicle.set_process(false)
		if vehicle is RigidBody3D:
			vehicle.freeze = true

func _on_start_game() -> void:
	# Unfreeze vehicle
	var vehicle := game_world.get_node_or_null("Vehicle")
	if vehicle:
		vehicle.set_physics_process(true)
		vehicle.set_process(true)
		if vehicle is RigidBody3D:
			vehicle.freeze = false

	# Animate title screen out
	var tween := create_tween()
	tween.tween_property(title_screen, "modulate:a", 0.0, 0.6).set_ease(Tween.EASE_IN)
	tween.tween_callback(title_screen.queue_free)
	tween.tween_callback(func(): Input.mouse_mode = Input.MOUSE_MODE_CAPTURED)
