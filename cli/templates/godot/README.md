# {{display_name}}

{{description}}

## About RCade

This game is built for [RCade](https://rcade.recurse.com), a custom arcade cabinet at The Recurse Center. Learn more about the project at [github.com/fcjr/RCade](https://github.com/fcjr/RCade).

## Getting Started

Download the Godot game engine here: https://godotengine.org/download/

Make sure you enable the controls plugin:

```
RCadeInput.enable_classic_controls()
```

## Arcade Controls

You can read the classic controls using the pre-configured actions in the InputMap:

```
# Player 1
Input.is_action_pressed("p1_up")
Input.is_action_pressed("p1_down")
Input.is_action_pressed("p1_left")
Input.is_action_pressed("p1_right")
Input.is_action_pressed("p1_a")
Input.is_action_pressed("p1_b")

# Player 2
Input.is_action_pressed("p2_up")
Input.is_action_pressed("p2_down")
Input.is_action_pressed("p2_left")
Input.is_action_pressed("p2_right")
Input.is_action_pressed("p2_a")
Input.is_action_pressed("p2_b")
```

### Development Keyboard Controls

When developing locally, keyboard inputs are mapped to arcade controls:

**Classic Controls (`@rcade/plugin-input-classic`)**

| Player   | Action           | Key |
|----------|------------------|-----|
| Player 1 | UP               | W   |
| Player 1 | DOWN             | S   |
| Player 1 | LEFT             | A   |
| Player 1 | RIGHT            | D   |
| Player 1 | A Button         | F   |
| Player 1 | B Button         | G   |
| Player 2 | UP               | I   |
| Player 2 | DOWN             | K   |
| Player 2 | LEFT             | J   |
| Player 2 | RIGHT            | L   |
| Player 2 | A Button         | ;   |
| Player 2 | B Button         | '   |
| System   | One Player Start | 1   |
| System   | Two Player Start | 2   |


### Spinner Support

To add spinner support, add `@rcade/plugin-input-spinners` to your manifest dependencies.

Make sure you enable the spinners plugin:

```
RCadeInput.enable_spinners()
```

Then you can read the spinners like this:

```
RCadeInput.get_spinner_speed(1)
RCadeInput.get_spinner_speed(2)

RCadeInput.get_spinner_angle(1) # radians
RCadeInput.get_spinner_angle(2)
```
