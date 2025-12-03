import { PluginChannel } from "@rcade/sdk";

export const PLAYER_1 = {
    DPAD: { up: false, down: false, left: false, right: false },
    A: false,
    B: false,
    SPINNER: { delta: 0, position: 0 }
};

export const PLAYER_2 = {
    DPAD: { up: false, down: false, left: false, right: false },
    A: false,
    B: false,
    SPINNER: { delta: 0, position: 0 },
};

export const SYSTEM = {
    ONE_PLAYER: false,
    TWO_PLAYER: false,
};

export const STATUS = { connected: false };

type EventType = "press" | "inputStart" | "inputEnd" | "spin";
type ButtonEventData = {
    player?: 1 | 2;
    button: string;
    pressed?: boolean;
    type: "button" | "system";
};
type SpinEventData = {
    player: 1 | 2;
    delta: number;
    position: number;
    type: "spinner";
};
type EventData = ButtonEventData | SpinEventData;
type EventCallback = (data: EventData) => void;

const eventListeners: Record<EventType, EventCallback[]> = {
    press: [],
    inputStart: [],
    inputEnd: [],
    spin: [],
};

export function on(event: EventType, callback: EventCallback): () => void {
    eventListeners[event].push(callback);
    // Return unsubscribe function
    return () => {
        const idx = eventListeners[event].indexOf(callback);
        if (idx !== -1) eventListeners[event].splice(idx, 1);
    };
}

export function off(event: EventType, callback: EventCallback): void {
    const idx = eventListeners[event].indexOf(callback);
    if (idx !== -1) eventListeners[event].splice(idx, 1);
}

type OnceFilter = {
    key?: string;
    player?: 1 | 2;
    type?: "button" | "system" | "spinner";
};

// Overload: once(event, callback)
export function once(event: EventType, callback: EventCallback): () => void;
// Overload: once(event, filter, callback)
export function once(event: EventType, filter: OnceFilter, callback: EventCallback): () => void;
// Overload: once(event) returns Promise
export function once(event: EventType): Promise<Parameters<EventCallback>[0]>;
// Overload: once(event, filter) returns Promise
export function once(event: EventType, filter: OnceFilter): Promise<Parameters<EventCallback>[0]>;

export function once(
    event: EventType,
    filterOrCallback?: OnceFilter | EventCallback,
    maybeCallback?: EventCallback
): (() => void) | Promise<Parameters<EventCallback>[0]> {
    // Parse arguments
    let filter: OnceFilter | undefined;
    let callback: EventCallback | undefined;

    if (typeof filterOrCallback === "function") {
        callback = filterOrCallback;
    } else if (filterOrCallback) {
        filter = filterOrCallback;
        callback = maybeCallback;
    }

    // If no callback, return a Promise
    if (!callback) {
        return new Promise((resolve) => {
            const handler: EventCallback = (data) => {
                if (filter) {
                    const keyMatch = !filter.key || ("button" in data && data.button === filter.key);
                    const playerMatch = !filter.player || data.player === filter.player;
                    const typeMatch = !filter.type || data.type === filter.type;
                    if (keyMatch && playerMatch && typeMatch) {
                        off(event, handler);
                        resolve(data);
                    }
                } else {
                    off(event, handler);
                    resolve(data);
                }
            };
            on(event, handler);
        });
    }

    // If callback provided, set up one-time listener
    const handler: EventCallback = (data) => {
        if (filter) {
            const keyMatch = !filter.key || ("button" in data && data.button === filter.key);
            const playerMatch = !filter.player || data.player === filter.player;
            const typeMatch = !filter.type || data.type === filter.type;
            if (keyMatch && playerMatch && typeMatch) {
                off(event, handler);
                callback(data);
            }
        } else {
            off(event, handler);
            callback(data);
        }
    };

    on(event, handler);
    return () => off(event, handler);
}

function emit(event: EventType, data: Parameters<EventCallback>[0]) {
    eventListeners[event].forEach(cb => cb(data));
}

(async () => {
    const channel = await PluginChannel.acquire("@rcade/input-classic", "^1.0.0");

    STATUS.connected = true;

    type InputMessage =
        | { type: "button" | "system"; player: 1 | 2; button: string; pressed: boolean }
        | { type: "spinner"; player: 1 | 2; delta: number };

    channel.getPort().onmessage = (event: MessageEvent<InputMessage>) => {
        const { type, player } = event.data;

        if (type === "button") {
            const { button, pressed } = event.data as { button: string; pressed: boolean };
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

            // Emit events
            if (pressed) {
                emit("inputStart", { player, button, pressed, type });
                emit("press", { player, button, pressed, type });
            } else {
                emit("inputEnd", { player, button, pressed, type });
            }
        } else if (type === "system") {
            const { button, pressed } = event.data as { button: string; pressed: boolean };
            if (button === "ONE_PLAYER") {
                SYSTEM.ONE_PLAYER = pressed;
            } else if (button === "TWO_PLAYER") {
                SYSTEM.TWO_PLAYER = pressed;
            }

            // Emit events for system buttons
            if (pressed) {
                emit("inputStart", { button, pressed, type });
                emit("press", { button, pressed, type });
            } else {
                emit("inputEnd", { button, pressed, type });
            }
        } else if (type === "spinner") {
            const { delta } = event.data as { delta: number };
            const spinner = player === 1 ? PLAYER_1.SPINNER : PLAYER_2.SPINNER;
            spinner.delta = delta;
            spinner.position += delta;

            emit("spin", { player, delta, position: spinner.position, type: "spinner" });
        }
    };
})()

if (import.meta.hot) {
    import.meta.hot.accept(() => {
        // Force full reload when SDK changes
        (import.meta.hot as any).invalidate();
    });
}