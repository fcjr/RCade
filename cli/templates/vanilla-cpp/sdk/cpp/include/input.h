#ifndef RCADE_INPUT_H
#define RCADE_INPUT_H

#include <emscripten.h>
#include <functional>
#include <map>
#include <string>
#include <vector>

namespace rcade {

/**
 * Button state for a single player
 */
struct PlayerInput {
    bool UP = false;
    bool DOWN = false;
    bool LEFT = false;
    bool RIGHT = false;
    bool A = false;
    bool B = false;
    bool C = false;
    bool D = false;
    bool E = false;
    bool F = false;
};

/**
 * System button state
 */
struct SystemInput {
    bool PAUSE = false;
    bool SETTINGS = false;
};

/**
 * Input event types from the input-classic plugin
 */
enum class InputEventType {
    PRESS,       // Any button press (fires on key down)
    INPUT_START, // Button press started (key down)
    INPUT_END    // Button press ended (key up)
};

/**
 * Input event data
 */
struct InputEvent {
    InputEventType eventType;
    std::string button;      // Button name (e.g., "UP", "A", "ONE_PLAYER")
    bool pressed;            // True if pressed, false if released
    std::string type;        // "button" or "system"
    int player;              // 1 or 2 for button events, 0 for system events
};

/**
 * RCadeInput - Manages input from the RCade input-classic plugin
 *
 * This class handles connection to the RCade input plugin and provides
 * a fallback to keyboard input for local development. It automatically
 * sets up the plugin channel and manages input state.
 */
class Input {
public:
    /**
     * Creates and initializes the input system
     *
     * This will attempt to connect to the RCade input-classic plugin.
     * If the plugin is not available (e.g., during local development),
     * it will automatically fall back to keyboard controls.
     *
     * @param keyboardFallback Enable keyboard fallback (default: true)
     */
    Input(bool keyboardFallback = true);

    /**
     * Get player 1 input state
     */
    const PlayerInput& getPlayer1() const { return player1_; }

    /**
     * Get player 2 input state
     */
    const PlayerInput& getPlayer2() const { return player2_; }

    /**
     * Get system input state
     */
    const SystemInput& getSystem() const { return system_; }

    /**
     * Check if any button is pressed (useful for "press any button" prompts)
     */
    bool anyButtonPressed() const;

    /**
     * Update input state (called internally via JavaScript callback)
     * Do not call this manually unless you're implementing custom input handling
     */
    void updateState(const PlayerInput& p1, const PlayerInput& p2, const SystemInput& sys);

    /**
     * Set a callback to be called whenever input state changes
     *
     * @param callback Function to call on input change
     */
    void setInputCallback(std::function<void()> callback) {
        inputCallback_ = callback;
    }

    /**
     * Set a callback for input events (press, inputStart, inputEnd)
     *
     * @param eventType The type of event to listen for
     * @param callback Function to call when the event occurs
     */
    void onInputEvent(InputEventType eventType, std::function<void(const InputEvent&)> callback);

    /**
     * Remove all event callbacks for a specific event type
     *
     * @param eventType The type of event to clear callbacks for
     */
    void clearEventCallbacks(InputEventType eventType);

    /**
     * Handle input event (called internally via JavaScript callback)
     * Do not call this manually unless you're implementing custom input handling
     */
    void handleInputEvent(const char* eventTypeStr, const char* button, bool pressed,
                         const char* type, int player);

private:
    PlayerInput player1_;
    PlayerInput player2_;
    SystemInput system_;
    bool keyboardFallback_;
    std::function<void()> inputCallback_;
    std::map<InputEventType, std::vector<std::function<void(const InputEvent&)>>> eventCallbacks_;

    void setupPlugin();
    void setupKeyboardFallback();
};

// Global input instance pointer (for C callback bridge)
extern Input* g_inputInstance;

} // namespace rcade

#endif // RCADE_INPUT_H
