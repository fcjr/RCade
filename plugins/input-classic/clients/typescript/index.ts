import { PluginChannel } from "@rcade/sdk";

export const PLAYER_1 = {
    DPAD: { up: false, down: false, left: false, right: false },
    A: false,
    B: false,
};

export const PLAYER_2 = {
    DPAD: { up: false, down: false, left: false, right: false },
    A: false,
    B: false,
};

export const SYSTEM = {
    ONE_PLAYER: false,
    TWO_PLAYER: false,
};

export const STATUS = { connected: false };

(async () => {
    const channel = await PluginChannel.acquire("@rcade/input-classic", "1.0.0");

    STATUS.connected = true;

    channel.getPort().onmessage = (event) => {
        const { type, player, button, pressed } = event.data;

        if (type === "button") {
            if (player === 1) {
                if (button === "A" || button === "B") {
                    PLAYER_1[button as "A" | "B"] = pressed;
                } else if (button === "UP" || button === "DOWN" || button === "LEFT" || button === "RIGHT") {
                    PLAYER_1.DPAD[button.toLowerCase() as "up" | "down" | "left" | "right"] = pressed;
                }
            } else if (player === 2) {
                if (button === "A" || button === "B") {
                    PLAYER_2[button as "A" | "B"] = pressed;
                } else if (button === "UP" || button === "DOWN" || button === "LEFT" || button === "RIGHT") {
                    PLAYER_2.DPAD[button.toLowerCase() as "up" | "down" | "left" | "right"] = pressed;
                }
            }
        } else if (type === "system") {
            if (button === "ONE_PLAYER") {
                SYSTEM.ONE_PLAYER = pressed;
            } else if (button === "TWO_PLAYER") {
                SYSTEM.TWO_PLAYER = pressed;
            }
        }
    };
})()

if (import.meta.hot) {
    import.meta.hot.accept(() => {
        // Force full reload when SDK changes
        (import.meta.hot as any).invalidate();
    });
}