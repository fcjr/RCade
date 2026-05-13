extends Node2D

const ROUND_SEC := 10.0

var p1_angle := 0.0
var p2_angle := 0.0
var _label: Label
var _time_left := ROUND_SEC
var _round_done := false
var _p1_steps_total := 0
var _p2_steps_total := 0


func _ready() -> void:
    var bg := ColorRect.new()
    bg.color = Color(0.05, 0.05, 0.1)
    bg.size = Vector2(480, 270)
    # Children draw after the parent's _draw(); without this the rect covers the discs.
    # bg.show_behind_parent = true
    add_child(bg)


func _process(delta: float) -> void:
    var p1_spin := RCadeInput.p1_spinner_delta()
    var p2_spin := RCadeInput.p2_spinner_delta()
    p1_angle += p1_spin * (TAU / 64.0)
    p2_angle += p2_spin * (TAU / 64.0)
    queue_redraw()

    if not _round_done:
        if _time_left > 0.0:
            _p1_steps_total += absi(p1_spin)
            _p2_steps_total += absi(p2_spin)
        _time_left -= delta
        if _time_left <= 0.0:
            _time_left = 0.0
            _round_done = true

    var timer_line := (
        "Time: %.1fs  (spin now)\n" % _time_left if not _round_done else "Time: 0.0s  — done\n"
    )
    var result_line := ""
    if _round_done:
        result_line = (
            "\n--- 10s totals (sum |step delta|) ---\n"
            + (
                "P1 steps: %d  (~%.2f turns @ 64 steps)\n"
                % [
                    _p1_steps_total,
                    _p1_steps_total / 64.0,
                ]
            )
            + (
                "P2 steps: %d  (~%.2f turns @ 64 steps)\n"
                % [
                    _p2_steps_total,
                    _p2_steps_total / 64.0,
                ]
            )
        )


func _draw() -> void:
    _draw_disc(Vector2(150, 195), p1_angle, Color(0.2, 0.3, 0.7), "P1")
    _draw_disc(Vector2(330, 195), p2_angle, Color(0.7, 0.2, 0.2), "P2")


func _draw_disc(center: Vector2, angle: float, color: Color, label: String) -> void:
    draw_circle(center, 45, color.darkened(0.4))
    draw_arc(center, 45, 0, TAU, 48, color, 3)
    # Spoke so rotation is visible
    draw_line(center, center + Vector2(cos(angle), sin(angle)) * 40, Color.WHITE, 3)
    draw_circle(center, 5, Color.WHITE)
    draw_string(
        ThemeDB.fallback_font,
        center + Vector2(-8, 58),
        label,
        HORIZONTAL_ALIGNMENT_LEFT,
        -1,
        13,
        Color.WHITE
    )


func _on(text: String, active: bool) -> String:
    return "[%s]" % text if active else " %s " % text.to_lower()
