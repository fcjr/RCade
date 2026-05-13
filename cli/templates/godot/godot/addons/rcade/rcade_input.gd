## RCade input bridge. Add this script as an Autoload named "RCadeInput".
##
## On the cabinet all input comes through the RCade plugin system — direct
## keyboard/DOM events are blocked. This singleton reads from the JS plugin
## clients (window.RCadeInput) via JavaScriptBridge and exposes clean methods.
## On desktop/local dev it falls back to keyboard so you can test without the
## cabinet. The fallback keys match RCade's own dev keyboard mapping.
extends Node

var _js: JavaScriptObject = null

func _ready() -> void:
    if OS.has_feature("web"):
        # PluginChannel.acquire() is async; wait one frame for the JS to run.
        await get_tree().process_frame
        _js = JavaScriptBridge.get_interface("RCadeInput")
        if _js == null:
            push_warning("RCadeInput: window.RCadeInput not found. " +
                "Make sure rcade-input.js is injected into index.html.")


# ---------------------------------------------------------------------------
# Classic controls — Player 1
# ---------------------------------------------------------------------------

func p1_up() -> bool:
    if _js: return bool(_js.classic.p1.DPAD.up)
    return Input.is_key_pressed(KEY_W)

func p1_down() -> bool:
    if _js: return bool(_js.classic.p1.DPAD.down)
    return Input.is_key_pressed(KEY_S)

func p1_left() -> bool:
    if _js: return bool(_js.classic.p1.DPAD.left)
    return Input.is_key_pressed(KEY_A)

func p1_right() -> bool:
    if _js: return bool(_js.classic.p1.DPAD.right)
    return Input.is_key_pressed(KEY_D)

func p1_a() -> bool:
    if _js: return bool(_js.classic.p1.A)
    return Input.is_key_pressed(KEY_F)

func p1_b() -> bool:
    if _js: return bool(_js.classic.p1.B)
    return Input.is_key_pressed(KEY_G)


# ---------------------------------------------------------------------------
# Classic controls — Player 2
# ---------------------------------------------------------------------------

func p2_up() -> bool:
    if _js: return bool(_js.classic.p2.DPAD.up)
    return Input.is_key_pressed(KEY_I)

func p2_down() -> bool:
    if _js: return bool(_js.classic.p2.DPAD.down)
    return Input.is_key_pressed(KEY_K)

func p2_left() -> bool:
    if _js: return bool(_js.classic.p2.DPAD.left)
    return Input.is_key_pressed(KEY_J)

func p2_right() -> bool:
    if _js: return bool(_js.classic.p2.DPAD.right)
    return Input.is_key_pressed(KEY_L)

func p2_a() -> bool:
    if _js: return bool(_js.classic.p2.A)
    return Input.is_key_pressed(KEY_SEMICOLON)

func p2_b() -> bool:
    if _js: return bool(_js.classic.p2.B)
    return Input.is_key_pressed(KEY_APOSTROPHE)


# ---------------------------------------------------------------------------
# System buttons
# ---------------------------------------------------------------------------

func start_1p() -> bool:
    if _js: return bool(_js.classic.system.ONE_PLAYER)
    return Input.is_key_pressed(KEY_1)

func start_2p() -> bool:
    if _js: return bool(_js.classic.system.TWO_PLAYER)
    return Input.is_key_pressed(KEY_2)


# ---------------------------------------------------------------------------
# Spinners — call once per frame; resets the accumulator each read.
#
# Positive delta = clockwise, negative = counter-clockwise.
# step_resolution is typically 64 steps per full rotation.
# ---------------------------------------------------------------------------

func p1_spinner_delta() -> int:
    if _js: return int(_js.spinners.p1.SPINNER.consume_step_delta())
    # Local dev: C = left (−1), V = right (+1), matches RCade key mapping.
    var d := 0
    if Input.is_key_pressed(KEY_C): d -= 1
    if Input.is_key_pressed(KEY_V): d += 1
    return d

func p2_spinner_delta() -> int:
    if _js: return int(_js.spinners.p2.SPINNER.consume_step_delta())
    var d := 0
    if Input.is_key_pressed(KEY_PERIOD): d -= 1
    if Input.is_key_pressed(KEY_SLASH):  d += 1
    return d

## Cumulative spinner angle in radians (automatically maintained by plugin).
## Useful for knob/dial visuals. Call reset_p1_spinner() to zero it.
func p1_spinner_angle() -> float:
    if _js: return float(_js.spinners.p1.SPINNER.angle)
    return 0.0

func p2_spinner_angle() -> float:
    if _js: return float(_js.spinners.p2.SPINNER.angle)
    return 0.0

func reset_p1_spinner() -> void:
    if _js: _js.spinners.p1.SPINNER.reset()

func reset_p2_spinner() -> void:
    if _js: _js.spinners.p2.SPINNER.reset()
