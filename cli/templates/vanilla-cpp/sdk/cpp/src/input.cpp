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
        int p1_a, int p1_b,
        int p2_up, int p2_down, int p2_left, int p2_right,
        int p2_a, int p2_b,
        int sys_one_player, int sys_two_player
    ) {
        if (!g_inputInstance) return;

        PlayerInput p1, p2;
        SystemInput sys;

        p1.DPAD.up = p1_up;
        p1.DPAD.down = p1_down;
        p1.DPAD.left = p1_left;
        p1.DPAD.right = p1_right;
        p1.A = p1_a;
        p1.B = p1_b;

        p2.DPAD.up = p2_up;
        p2.DPAD.down = p2_down;
        p2.DPAD.left = p2_left;
        p2.DPAD.right = p2_right;
        p2.A = p2_a;
        p2.B = p2_b;

        sys.ONE_PLAYER = sys_one_player;
        sys.TWO_PLAYER = sys_two_player;

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
                const channel = await PluginChannel.acquire('@rcade/input-classic', '^1.0.0');

                channel.getPort().onmessage = (event) => {
                    const { type, player, button, pressed } = event.data;

                    // Map button names to match the new API
                    let mappedButton = button;
                    if (button === 'UP' || button === 'DOWN' || button === 'LEFT' || button === 'RIGHT') {
                        mappedButton = button.toLowerCase();
                    }

                    const eventType = pressed ? 'inputStart' : 'inputEnd';

                    Module.rcade_handle_input_event(
                        eventType,
                        mappedButton,
                        pressed ? 1 : 0,
                        type,
                        player || 0
                    );

                    // Also trigger 'press' event on button down
                    if (pressed) {
                        Module.rcade_handle_input_event(
                            'press',
                            mappedButton,
                            1,
                            type,
                            player || 0
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
                // Player 1: WASD for dpad, F/G for A/B
                keys['w'] || keys['W'] ? 1 : 0,
                keys['s'] || keys['S'] ? 1 : 0,
                keys['a'] || keys['A'] ? 1 : 0,
                keys['d'] || keys['D'] ? 1 : 0,
                keys['f'] || keys['F'] ? 1 : 0,
                keys['g'] || keys['G'] ? 1 : 0,

                // Player 2: IJKL for dpad, ;/' for A/B
                keys['i'] || keys['I'] ? 1 : 0,
                keys['k'] || keys['K'] ? 1 : 0,
                keys['j'] || keys['J'] ? 1 : 0,
                keys['l'] || keys['L'] ? 1 : 0,
                keys[';'] ? 1 : 0,
                keys["'"] ? 1 : 0,

                // System: 1 for ONE_PLAYER, 2 for TWO_PLAYER
                keys['1'] ? 1 : 0,
                keys['2'] ? 1 : 0
            );
        };

        const fireEvent = (key, pressed) => {
            let player = 0;
            let button = '';
            let type = 'button';

            // Player 1 controls: WASD for dpad, F/G for A/B
            if (key === 'w' || key === 'W') { player = 1; button = 'up'; }
            else if (key === 's' || key === 'S') { player = 1; button = 'down'; }
            else if (key === 'a' || key === 'A') { player = 1; button = 'left'; }
            else if (key === 'd' || key === 'D') { player = 1; button = 'right'; }
            else if (key === 'f' || key === 'F') { player = 1; button = 'A'; }
            else if (key === 'g' || key === 'G') { player = 1; button = 'B'; }
            // Player 2 controls: IJKL for dpad, ;/' for A/B
            else if (key === 'i' || key === 'I') { player = 2; button = 'up'; }
            else if (key === 'k' || key === 'K') { player = 2; button = 'down'; }
            else if (key === 'j' || key === 'J') { player = 2; button = 'left'; }
            else if (key === 'l' || key === 'L') { player = 2; button = 'right'; }
            else if (key === ';') { player = 2; button = 'A'; }
            else if (key === "'") { player = 2; button = 'B'; }
            // System controls
            else if (key === '1') { player = 0; button = 'ONE_PLAYER'; type = 'system'; }
            else if (key === '2') { player = 0; button = 'TWO_PLAYER'; type = 'system'; }
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
    return player1_.DPAD.up || player1_.DPAD.down || player1_.DPAD.left || player1_.DPAD.right ||
           player1_.A || player1_.B ||
           player2_.DPAD.up || player2_.DPAD.down || player2_.DPAD.left || player2_.DPAD.right ||
           player2_.A || player2_.B ||
           system_.ONE_PLAYER || system_.TWO_PLAYER;
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
            if (btn == "up") p1.DPAD.up = pressed;
            else if (btn == "down") p1.DPAD.down = pressed;
            else if (btn == "left") p1.DPAD.left = pressed;
            else if (btn == "right") p1.DPAD.right = pressed;
            else if (btn == "A") p1.A = pressed;
            else if (btn == "B") p1.B = pressed;
        } else if (player == 2) {
            PlayerInput& p2 = player2_;
            std::string btn(button);
            if (btn == "up") p2.DPAD.up = pressed;
            else if (btn == "down") p2.DPAD.down = pressed;
            else if (btn == "left") p2.DPAD.left = pressed;
            else if (btn == "right") p2.DPAD.right = pressed;
            else if (btn == "A") p2.A = pressed;
            else if (btn == "B") p2.B = pressed;
        }
    } else if (typeStr == "system") {
        std::string btn(button);
        if (btn == "ONE_PLAYER") system_.ONE_PLAYER = pressed;
        else if (btn == "TWO_PLAYER") system_.TWO_PLAYER = pressed;
    }
}


EMSCRIPTEN_BINDINGS(rcade_input) {
    emscripten::function("rcade_update_input", &rcade_update_input);
    emscripten::function("rcade_handle_input_event", &rcade_handle_input_event);
}

} // namespace rcade
