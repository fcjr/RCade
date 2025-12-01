#include "input.h"
#include <emscripten/bind.h>

namespace rcade {

// Global instance for C callback bridge
Input* g_inputInstance = nullptr;

// C-style callbacks for Emscripten bindings
extern "C" {
    EMSCRIPTEN_KEEPALIVE
    void rcade_update_input(
        int p1_up, int p1_down, int p1_left, int p1_right,
        int p1_a, int p1_b, int p1_c, int p1_d, int p1_e, int p1_f,
        int p2_up, int p2_down, int p2_left, int p2_right,
        int p2_a, int p2_b, int p2_c, int p2_d, int p2_e, int p2_f,
        int sys_pause, int sys_settings
    ) {
        if (!g_inputInstance) return;

        PlayerInput p1, p2;
        SystemInput sys;

        p1.UP = p1_up;
        p1.DOWN = p1_down;
        p1.LEFT = p1_left;
        p1.RIGHT = p1_right;
        p1.A = p1_a;
        p1.B = p1_b;
        p1.C = p1_c;
        p1.D = p1_d;
        p1.E = p1_e;
        p1.F = p1_f;

        p2.UP = p2_up;
        p2.DOWN = p2_down;
        p2.LEFT = p2_left;
        p2.RIGHT = p2_right;
        p2.A = p2_a;
        p2.B = p2_b;
        p2.C = p2_c;
        p2.D = p2_d;
        p2.E = p2_e;
        p2.F = p2_f;

        sys.PAUSE = sys_pause;
        sys.SETTINGS = sys_settings;

        g_inputInstance->updateState(p1, p2, sys);
    }

    EMSCRIPTEN_KEEPALIVE
    void rcade_handle_input_event(
        std::string eventTypeStr,
        std::string button,
        int pressed,
        std::string type,
        int player
    ) {
        if (!g_inputInstance) return;
        g_inputInstance->handleInputEvent(eventTypeStr.c_str(), button.c_str(), pressed != 0, type.c_str(), player);
    }
}

Input::Input(bool keyboardFallback)
    : keyboardFallback_(keyboardFallback) {
    g_inputInstance = this;
    setupPlugin();
}

void Input::setupPlugin() {
    EM_ASM({
        // Setup input handling with RCade input-classic plugin
        (async function() {
            try {
                const { PluginChannel } = await import('/build/main.js');
                const channel = await PluginChannel.acquire('@rcade/input-classic', '1.0.0');

                channel.port.onmessage = (event) => {
                    const data = event.data;

                    // Handle new event-based messages
                    if (data.type && data.button !== undefined && data.pressed !== undefined) {
                        // This is an event message
                        const eventType = data.pressed ? 'inputStart' : 'inputEnd';
                        const player = data.player || 0;

                        Module.rcade_handle_input_event(
                            eventType,
                            data.button,
                            data.pressed ? 1 : 0,
                            data.type,
                            player
                        );

                        // Also trigger 'press' event on button down
                        if (data.pressed) {
                            Module.rcade_handle_input_event(
                                'press',
                                data.button,
                                1,
                                data.type,
                                player
                            );
                        }
                    }
                    // Legacy state-based message support
                    else if (data.PLAYER_1 || data.PLAYER_2 || data.SYSTEM) {
                        const { PLAYER_1, PLAYER_2, SYSTEM } = data;

                        Module.rcade_update_input(
                            PLAYER_1.UP ? 1 : 0,
                            PLAYER_1.DOWN ? 1 : 0,
                            PLAYER_1.LEFT ? 1 : 0,
                            PLAYER_1.RIGHT ? 1 : 0,
                            PLAYER_1.A ? 1 : 0,
                            PLAYER_1.B ? 1 : 0,
                            PLAYER_1.C ? 1 : 0,
                            PLAYER_1.D ? 1 : 0,
                            PLAYER_1.E ? 1 : 0,
                            PLAYER_1.F ? 1 : 0,

                            PLAYER_2.UP ? 1 : 0,
                            PLAYER_2.DOWN ? 1 : 0,
                            PLAYER_2.LEFT ? 1 : 0,
                            PLAYER_2.RIGHT ? 1 : 0,
                            PLAYER_2.A ? 1 : 0,
                            PLAYER_2.B ? 1 : 0,
                            PLAYER_2.C ? 1 : 0,
                            PLAYER_2.D ? 1 : 0,
                            PLAYER_2.E ? 1 : 0,
                            PLAYER_2.F ? 1 : 0,

                            SYSTEM.PAUSE ? 1 : 0,
                            SYSTEM.SETTINGS ? 1 : 0
                        );
                    }
                };
            } catch (e) {
                if ($0) {
                    console.warn('Plugin not available, using keyboard fallback');
                } else {
                    console.error('Failed to connect to input plugin:', e);
                }
            }
        })();
    }, keyboardFallback_ ? 1 : 0);

    if (keyboardFallback_) {
        setupKeyboardFallback();
    }
}

void Input::setupKeyboardFallback() {
    EM_ASM({
        if (window.rcadeKeyboardSetup) return;
        window.rcadeKeyboardSetup = true;

        const keys = {};

        const updateInput = () => {
            Module.rcade_update_input(
                keys['w'] || keys['W'] ? 1 : 0,
                keys['s'] || keys['S'] ? 1 : 0,
                keys['a'] || keys['A'] ? 1 : 0,
                keys['d'] || keys['D'] ? 1 : 0,
                keys['i'] || keys['I'] ? 1 : 0,
                keys['j'] || keys['J'] ? 1 : 0,
                keys['k'] || keys['K'] ? 1 : 0,
                keys['l'] || keys['L'] ? 1 : 0,
                0, 0,

                keys['ArrowUp'] ? 1 : 0,
                keys['ArrowDown'] ? 1 : 0,
                keys['ArrowLeft'] ? 1 : 0,
                keys['ArrowRight'] ? 1 : 0,
                keys['4'] ? 1 : 0,
                keys['5'] ? 1 : 0,
                keys['6'] ? 1 : 0,
                keys['1'] ? 1 : 0,
                0, 0,

                keys['Escape'] ? 1 : 0,
                keys['Enter'] ? 1 : 0
            );
        };

        const fireEvent = (key, pressed) => {
            let player = 0;
            let button = '';
            let type = 'button';

            if (key === 'w' || key === 'W') { player = 1; button = 'UP'; }
            else if (key === 's' || key === 'S') { player = 1; button = 'DOWN'; }
            else if (key === 'a' || key === 'A') { player = 1; button = 'LEFT'; }
            else if (key === 'd' || key === 'D') { player = 1; button = 'RIGHT'; }
            else if (key === 'i' || key === 'I') { player = 1; button = 'A'; }
            else if (key === 'j' || key === 'J') { player = 1; button = 'B'; }
            else if (key === 'k' || key === 'K') { player = 1; button = 'C'; }
            else if (key === 'l' || key === 'L') { player = 1; button = 'D'; }
            else if (key === 'ArrowUp') { player = 2; button = 'UP'; }
            else if (key === 'ArrowDown') { player = 2; button = 'DOWN'; }
            else if (key === 'ArrowLeft') { player = 2; button = 'LEFT'; }
            else if (key === 'ArrowRight') { player = 2; button = 'RIGHT'; }
            else if (key === '4') { player = 2; button = 'A'; }
            else if (key === '5') { player = 2; button = 'B'; }
            else if (key === '6') { player = 2; button = 'C'; }
            else if (key === '1') { player = 2; button = 'D'; }
            else if (key === 'Escape') { player = 0; button = 'PAUSE'; type = 'system'; }
            else if (key === 'Enter') { player = 0; button = 'SETTINGS'; type = 'system'; }
            else return;

            const eventType = pressed ? 'inputStart' : 'inputEnd';
            Module.rcade_handle_input_event(eventType, button, pressed ? 1 : 0, type, player);
            if (pressed) {
                Module.rcade_handle_input_event('press', button, 1, type, player);
            }
        };

        window.addEventListener('keydown', (e) => {
            if (keys[e.key]) return;
            keys[e.key] = true;
            updateInput();
            fireEvent(e.key, true);
        });

        window.addEventListener('keyup', (e) => {
            keys[e.key] = false;
            updateInput();
            fireEvent(e.key, false);
        });
    });
}

void Input::updateState(const PlayerInput& p1, const PlayerInput& p2, const SystemInput& sys) {
    player1_ = p1;
    player2_ = p2;
    system_ = sys;

    if (inputCallback_) {
        inputCallback_();
    }
}

bool Input::anyButtonPressed() const {
    return player1_.UP || player1_.DOWN || player1_.LEFT || player1_.RIGHT ||
           player1_.A || player1_.B || player1_.C || player1_.D ||
           player1_.E || player1_.F ||
           player2_.UP || player2_.DOWN || player2_.LEFT || player2_.RIGHT ||
           player2_.A || player2_.B || player2_.C || player2_.D ||
           player2_.E || player2_.F ||
           system_.PAUSE || system_.SETTINGS;
}

void Input::onInputEvent(InputEventType eventType, std::function<void(const InputEvent&)> callback) {
    eventCallbacks_[eventType].push_back(callback);
}

void Input::clearEventCallbacks(InputEventType eventType) {
    eventCallbacks_[eventType].clear();
}

void Input::handleInputEvent(const char* eventTypeStr, const char* button, bool pressed,
                             const char* type, int player) {
    // Determine event type
    InputEventType eventType;
    std::string eventStr(eventTypeStr);
    if (eventStr == "press") {
        eventType = InputEventType::PRESS;
    } else if (eventStr == "inputStart") {
        eventType = InputEventType::INPUT_START;
    } else if (eventStr == "inputEnd") {
        eventType = InputEventType::INPUT_END;
    } else {
        return; // Unknown event type
    }

    // Create event data
    InputEvent event{
        eventType,
        std::string(button),
        pressed,
        std::string(type),
        player
    };

    // Trigger callbacks for this event type
    auto it = eventCallbacks_.find(eventType);
    if (it != eventCallbacks_.end()) {
        for (auto& callback : it->second) {
            callback(event);
        }
    }

    // Also update the state for backward compatibility
    std::string typeStr(type);
    if (typeStr == "button") {
        if (player == 1) {
            PlayerInput& p1 = player1_;
            std::string btn(button);
            if (btn == "UP") p1.UP = pressed;
            else if (btn == "DOWN") p1.DOWN = pressed;
            else if (btn == "LEFT") p1.LEFT = pressed;
            else if (btn == "RIGHT") p1.RIGHT = pressed;
            else if (btn == "A") p1.A = pressed;
            else if (btn == "B") p1.B = pressed;
            else if (btn == "C") p1.C = pressed;
            else if (btn == "D") p1.D = pressed;
            else if (btn == "E") p1.E = pressed;
            else if (btn == "F") p1.F = pressed;
        } else if (player == 2) {
            PlayerInput& p2 = player2_;
            std::string btn(button);
            if (btn == "UP") p2.UP = pressed;
            else if (btn == "DOWN") p2.DOWN = pressed;
            else if (btn == "LEFT") p2.LEFT = pressed;
            else if (btn == "RIGHT") p2.RIGHT = pressed;
            else if (btn == "A") p2.A = pressed;
            else if (btn == "B") p2.B = pressed;
            else if (btn == "C") p2.C = pressed;
            else if (btn == "D") p2.D = pressed;
            else if (btn == "E") p2.E = pressed;
            else if (btn == "F") p2.F = pressed;
        }
    } else if (typeStr == "system") {
        std::string btn(button);
        if (btn == "ONE_PLAYER") system_.PAUSE = pressed;  // Map to available system buttons
        else if (btn == "TWO_PLAYER") system_.SETTINGS = pressed;
    }
}


EMSCRIPTEN_BINDINGS(rcade_input) {
    emscripten::function("rcade_update_input", &rcade_update_input);
    emscripten::function("rcade_handle_input_event", &rcade_handle_input_event);
}

} // namespace rcade
