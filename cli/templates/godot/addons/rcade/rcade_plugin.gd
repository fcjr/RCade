@tool
extends EditorPlugin

const AUTOLOAD_NAME = "RCadeInput"

func _enable_plugin():
	add_autoload_singleton(AUTOLOAD_NAME, "res://addons/rcade/rcade_input.gd")


func _disable_plugin():
	remove_autoload_singleton(AUTOLOAD_NAME)
