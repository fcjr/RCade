# RCade C++ SDK

## Quick Start

### Basic Example

```cpp
#include <rcade/rcade.h>
#include <emscripten.h>

rcade::Canvas* canvas;
rcade::Input* input;

void gameLoop() {
    // Clear screen
    canvas->clear("#1a1a2e");

    // Get input state
    const auto& p1 = input->getPlayer1();
    const auto& p2 = input->getPlayer2();

    // Draw based on input
    if (p1.UP) {
        canvas->fillRect(100, 100, 50, 50, "#ff0000");
    }

    // Draw text
    canvas->fillText("Hello RCade!", 168, 131, "24px monospace", "#fff", "center");
}

int main() {
    canvas = new rcade::Canvas(336, 262);
    input = new rcade::Input();

    emscripten_set_main_loop(gameLoop, 60, 1);
    return 0;
}
```

### Building

Add to your `Makefile`:

```makefile
EMCC = emcc
SRC = src/main.cpp sdk/cpp/src/canvas.cpp sdk/cpp/src/input.cpp
OUTPUT = build/main.js

EMCC_FLAGS = -s WASM=1 \
             -s EXPORTED_RUNTIME_METHODS='["cwrap","ccall"]' \
             -s MODULARIZE=1 \
             -s EXPORT_NAME='createModule' \
             -s ALLOW_MEMORY_GROWTH=1 \
             -Isdk/cpp/include \
             --bind

build:
	$(EMCC) $(SRC) $(EMCC_FLAGS) -O3 -o $(OUTPUT)
```

Then run:
```bash
make build
```

## API Reference

### Canvas Class

#### Constructor
```cpp
rcade::Canvas(int width = 336, int height = 262, const char* canvasId = "gameCanvas")
```
Creates a canvas element and initializes the 2D rendering context.

#### Methods

**Basic Drawing**
- `void clear(const char* color = "#1a1a2e")` - Clear canvas with color
- `void fillRect(float x, float y, float w, float h, const char* color = "#eee")` - Draw filled rectangle
- `void strokeRect(float x, float y, float w, float h, const char* color = "#eee")` - Draw rectangle outline

**Text**
- `void fillText(const char* text, float x, float y, const char* font = "16px monospace", const char* color = "#eee", const char* align = "left")` - Draw text

**Paths**
- `void beginPath()` - Begin new path
- `void moveTo(float x, float y)` - Move to point
- `void lineTo(float x, float y)` - Draw line to point
- `void stroke(const char* color = "#eee", float lineWidth = 1.0f)` - Stroke current path
- `void setLineDash(float dash, float gap)` - Set dashed line pattern
- `void clearLineDash()` - Reset to solid line

**Getters**
- `int getWidth()` - Get canvas width
- `int getHeight()` - Get canvas height

### Input Class

#### Constructor
```cpp
rcade::Input(bool keyboardFallback = true)
```
Initializes input system and connects to RCade plugin (or keyboard fallback).

#### Methods

**Input State**
- `const PlayerInput& getPlayer1()` - Get player 1 input state
- `const PlayerInput& getPlayer2()` - Get player 2 input state
- `const SystemInput& getSystem()` - Get system button state
- `bool anyButtonPressed()` - Check if any button is pressed

**Callbacks**
- `void setInputCallback(std::function<void()> callback)` - Set callback for input changes
- `void onInputEvent(InputEventType eventType, std::function<void(const InputEvent&)> callback)` - Register event handler for specific input events
- `void clearEventCallbacks(InputEventType eventType)` - Remove all callbacks for an event type

#### Event Types

**InputEventType**
```cpp
enum class InputEventType {
    PRESS,       // Any button press (fires once on key down)
    INPUT_START, // Button press started (key down)
    INPUT_END    // Button press ended (key up)
};
```

**InputEvent**
```cpp
struct InputEvent {
    InputEventType eventType;  // Type of event
    std::string button;        // Button name (e.g., "UP", "A", "PAUSE")
    bool pressed;              // True if pressed, false if released
    std::string type;          // "button" or "system"
    int player;                // 1 or 2 for buttons, 0 for system
};
```

#### Structs

**PlayerInput**
```cpp
struct PlayerInput {
    bool UP, DOWN, LEFT, RIGHT;
    bool A, B, C, D, E, F;
};
```

**SystemInput**
```cpp
struct SystemInput {
    bool PAUSE;
    bool SETTINGS;
};
```

### Keyboard Fallback

When the RCade plugin is unavailable (local development), keyboard controls are:

**Player 1:**
- Movement: W/A/S/D
- Buttons: I/J/K/L (A/B/C/D)

**Player 2:**
- Movement: Arrow Keys
- Buttons: 4/5/6/1 (A/B/C/D)

**System:**
- Pause: Escape
- Settings: Enter

## Advanced Examples

### Pong Game (Simplified)

```cpp
#include <rcade/rcade.h>
#include <emscripten.h>

const float PADDLE_SPEED = 3.0f;
float paddle1Y = 111, paddle2Y = 111;

rcade::Canvas* canvas;
rcade::Input* input;
bool gameStarted = false;

void gameLoop() {
    const auto& p1 = input->getPlayer1();
    const auto& p2 = input->getPlayer2();

    // Start on any input
    if (!gameStarted && input->anyButtonPressed()) {
        gameStarted = true;
    }

    if (gameStarted) {
        // Update paddles
        if (p1.UP && paddle1Y > 0) paddle1Y -= PADDLE_SPEED;
        if (p1.DOWN && paddle1Y < 222) paddle1Y += PADDLE_SPEED;
        if (p2.UP && paddle2Y > 0) paddle2Y -= PADDLE_SPEED;
        if (p2.DOWN && paddle2Y < 222) paddle2Y += PADDLE_SPEED;
    }

    // Render
    canvas->clear("#1a1a2e");

    // Center line
    canvas->setLineDash(5, 5);
    canvas->beginPath();
    canvas->moveTo(168, 0);
    canvas->lineTo(168, 262);
    canvas->stroke("#444");
    canvas->clearLineDash();

    // Paddles
    canvas->fillRect(0, paddle1Y, 8, 40);
    canvas->fillRect(328, paddle2Y, 8, 40);

    if (!gameStarted) {
        canvas->fillText("Press any button", 168, 131, "16px monospace", "#eee", "center");
    }
}

int main() {
    canvas = new rcade::Canvas(336, 262);
    input = new rcade::Input();
    emscripten_set_main_loop(gameLoop, 60, 1);
    return 0;
}
```

### Custom Drawing

```cpp
void drawCircle(rcade::Canvas& canvas, float x, float y, float radius) {
    // Approximate circle with line segments
    const int segments = 32;
    const float angleStep = 6.28318f / segments; // 2*PI

    canvas.beginPath();
    for (int i = 0; i <= segments; i++) {
        float angle = i * angleStep;
        float px = x + radius * cos(angle);
        float py = y + radius * sin(angle);

        if (i == 0) {
            canvas.moveTo(px, py);
        } else {
            canvas.lineTo(px, py);
        }
    }
    canvas.stroke("#fff", 2.0f);
}

void gameLoop() {
    canvas->clear("#000");
    drawCircle(*canvas, 168, 131, 50);
}
```

### Input Callbacks (State-Based)

```cpp
rcade::Input* input;
bool jumpPressed = false;

void onInputChange() {
    const auto& p1 = input->getPlayer1();

    // Detect button press (not held)
    if (p1.A && !jumpPressed) {
        jumpPressed = true;
        // Trigger jump
    } else if (!p1.A) {
        jumpPressed = false;
    }
}

int main() {
    input = new rcade::Input();
    input->setInputCallback(onInputChange);

    // ...
}
```

### Event-Based Input Handling

The SDK supports event-based input handling for more precise control over button presses and releases. This is ideal for games that need smooth, continuous movement or precise timing.

#### Basic Event Handling Example

```cpp
#include <rcade/rcade.h>
#include <emscripten.h>

rcade::Canvas* canvas;
rcade::Input* input;
bool gameStarted = false;

void handleInputEvent(const rcade::InputEvent& event) {
    // Start game on any button press
    if (!gameStarted && event.eventType == rcade::InputEventType::INPUT_START) {
        gameStarted = true;
        return;
    }

    // Handle player actions
    if (event.type == "button" && event.player == 1) {
        if (event.button == "A" && event.pressed) {
            // Player 1 pressed A button
            // Do something (jump, shoot, etc.)
        }
    }
}

int main() {
    canvas = new rcade::Canvas(336, 262);
    input = new rcade::Input();

    // Register event handlers
    input->onInputEvent(rcade::InputEventType::INPUT_START, handleInputEvent);
    input->onInputEvent(rcade::InputEventType::INPUT_END, handleInputEvent);

    emscripten_set_main_loop(gameLoop, 60, 1);
    return 0;
}
```

#### Pong with Event-Based Movement

This example shows how to use event-based input for smooth paddle movement:

```cpp
#include <rcade/rcade.h>
#include <emscripten.h>

const int CANVAS_WIDTH = 336;
const int CANVAS_HEIGHT = 262;
const float PADDLE_SPEED = 3.0f;

struct GameState {
    float paddle1Y;
    float paddle2Y;
    bool gameStarted;

    // Movement state flags
    bool paddle1MovingUp;
    bool paddle1MovingDown;
    bool paddle2MovingUp;
    bool paddle2MovingDown;
} game;

rcade::Canvas* canvas;
rcade::Input* input;

void handleInputEvent(const rcade::InputEvent& event) {
    // Start game on button press
    if (!game.gameStarted && event.eventType == rcade::InputEventType::INPUT_START) {
        game.gameStarted = true;
        return;
    }

    // Only process INPUT_START and INPUT_END for movement
    if (event.eventType != rcade::InputEventType::INPUT_START &&
        event.eventType != rcade::InputEventType::INPUT_END) {
        return;
    }

    // Update movement flags based on button events
    if (event.type == "button") {
        bool pressed = event.pressed;

        if (event.player == 1) {
            if (event.button == "UP") {
                game.paddle1MovingUp = pressed;
            } else if (event.button == "DOWN") {
                game.paddle1MovingDown = pressed;
            }
        } else if (event.player == 2) {
            if (event.button == "UP") {
                game.paddle2MovingUp = pressed;
            } else if (event.button == "DOWN") {
                game.paddle2MovingDown = pressed;
            }
        }
    }
}

void updateGame() {
    if (!game.gameStarted) return;

    // Update paddle 1 based on movement flags
    if (game.paddle1MovingUp && game.paddle1Y > 0) {
        game.paddle1Y -= PADDLE_SPEED;
    }
    if (game.paddle1MovingDown && game.paddle1Y < CANVAS_HEIGHT - 40) {
        game.paddle1Y += PADDLE_SPEED;
    }

    // Update paddle 2 based on movement flags
    if (game.paddle2MovingUp && game.paddle2Y > 0) {
        game.paddle2Y -= PADDLE_SPEED;
    }
    if (game.paddle2MovingDown && game.paddle2Y < CANVAS_HEIGHT - 40) {
        game.paddle2Y += PADDLE_SPEED;
    }
}

void renderGame() {
    canvas->clear("#1a1a2e");

    // Draw paddles
    canvas->fillRect(0, game.paddle1Y, 8, 40, "#eee");
    canvas->fillRect(CANVAS_WIDTH - 8, game.paddle2Y, 8, 40, "#eee");

    if (!game.gameStarted) {
        canvas->fillText("Press any button to start", CANVAS_WIDTH / 2, 131,
                        "12px monospace", "#eee", "center");
    }
}

void gameLoop() {
    updateGame();
    renderGame();
}

int main() {
    // Initialize game state
    game.paddle1Y = CANVAS_HEIGHT / 2 - 20;
    game.paddle2Y = CANVAS_HEIGHT / 2 - 20;
    game.gameStarted = false;
    game.paddle1MovingUp = false;
    game.paddle1MovingDown = false;
    game.paddle2MovingUp = false;
    game.paddle2MovingDown = false;

    canvas = new rcade::Canvas(CANVAS_WIDTH, CANVAS_HEIGHT);
    input = new rcade::Input();

    // Register event handlers
    input->onInputEvent(rcade::InputEventType::INPUT_START, handleInputEvent);
    input->onInputEvent(rcade::InputEventType::INPUT_END, handleInputEvent);

    emscripten_set_main_loop(gameLoop, 60, 1);
    return 0;
}
```

#### Using PRESS Events for Single Actions

The `PRESS` event fires once when a button is first pressed, making it ideal for single-action inputs like jumping or shooting:

```cpp
void handlePressEvent(const rcade::InputEvent& event) {
    if (event.type == "button" && event.player == 1) {
        if (event.button == "A") {
            // Fire weapon (happens once per press)
            fireWeapon();
        } else if (event.button == "B") {
            // Jump (happens once per press)
            playerJump();
        }
    }
}

int main() {
    input = new rcade::Input();

    // Only register for PRESS events
    input->onInputEvent(rcade::InputEventType::PRESS, handlePressEvent);

    // ...
}
```

#### Combining Event Types

You can register different handlers for different event types:

```cpp
void handlePress(const rcade::InputEvent& event) {
    // Single-action responses (jump, shoot, menu selection)
    if (event.button == "A") {
        jump();
    }
}

void handleInputChange(const rcade::InputEvent& event) {
    // Continuous movement tracking
    if (event.button == "UP") {
        movingUp = event.pressed;
    }
}

int main() {
    input = new rcade::Input();

    // Register different handlers for different needs
    input->onInputEvent(rcade::InputEventType::PRESS, handlePress);
    input->onInputEvent(rcade::InputEventType::INPUT_START, handleInputChange);
    input->onInputEvent(rcade::InputEventType::INPUT_END, handleInputChange);

    // ...
}
```

#### When to Use Event-Based vs State-Based Input

**Use Event-Based Input when:**
- You need precise button press/release timing
- Implementing smooth, continuous movement (like Pong paddles)
- Building a fighting game with complex input sequences
- You want to avoid polling input every frame

**Use State-Based Input when:**
- Simple input checking is sufficient
- You're polling input once per frame anyway
- Code simplicity is more important than precision

**You can mix both approaches:**
```cpp
void gameLoop() {
    // State-based for simple checks
    if (input->getPlayer1().A) {
        // Fire weapon while held
        fireWeapon();
    }
}

void handleEvent(const rcade::InputEvent& event) {
    // Event-based for precise movement
    if (event.button == "UP") {
        movingUp = event.pressed;
    }
}

int main() {
    input = new rcade::Input();
    input->onInputEvent(rcade::InputEventType::INPUT_START, handleEvent);
    input->onInputEvent(rcade::InputEventType::INPUT_END, handleEvent);
    // ...
}
```

## Architecture

The SDK provides a thin wrapper around Emscripten's JavaScript interop:

1. **Canvas**: Uses `EM_ASM` to call HTML5 Canvas API methods
2. **Input**: Connects to RCade's MessagePort-based plugin system
3. **Keyboard Fallback**: Automatically sets up keyboard listeners when plugin unavailable

## License

MIT License - see repository root for details
