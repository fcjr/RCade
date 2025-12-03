import { PluginChannel } from "@rcade/sdk";

let player1StepDelta = 0;
let player2StepDelta = 0;
let currentStepResolution = 0;
const MAX_DELTA = 1000;

/**
 * Spinner input for Player 1.
 *
 * Two usage patterns (pick one, don't mix):
 *
 * 1. Polling (recommended): Read `PLAYER_1.SPINNER.step_delta` each frame.
 *    Returns accumulated movement since last read, then resets to 0.
 *    Also read `PLAYER_1.SPINNER.step_resolution` to get the encoder resolution.
 *
 * 2. Events: Use `on("spin", callback)` to react to each spin event.
 *    The callback receives the step_delta and step_resolution for that specific event.
 */
export const PLAYER_1 = {
    SPINNER: {
        get step_delta() {
            const d = player1StepDelta;
            player1StepDelta = 0;
            return d;
        },
        get step_resolution() {
            return currentStepResolution;
        }
    }
};

/** Spinner input for Player 2. See {@link PLAYER_1} for usage. */
export const PLAYER_2 = {
    SPINNER: {
        get step_delta() {
            const d = player2StepDelta;
            player2StepDelta = 0;
            return d;
        },
        get step_resolution() {
            return currentStepResolution;
        }
    },
};

export const STATUS = { connected: false };

type SpinEventData = {
    player: 1 | 2;
    step_delta: number;
    step_resolution: number;
};
type EventCallback = (data: SpinEventData) => void;

const spinListeners: EventCallback[] = [];

export function on(event: "spin", callback: EventCallback): () => void {
    spinListeners.push(callback);
    return () => {
        const idx = spinListeners.indexOf(callback);
        if (idx !== -1) spinListeners.splice(idx, 1);
    };
}

export function off(event: "spin", callback: EventCallback): void {
    const idx = spinListeners.indexOf(callback);
    if (idx !== -1) spinListeners.splice(idx, 1);
}

type OnceFilter = {
    player?: 1 | 2;
};

export function once(event: "spin", callback: EventCallback): () => void;
export function once(event: "spin", filter: OnceFilter, callback: EventCallback): () => void;
export function once(event: "spin"): Promise<SpinEventData>;
export function once(event: "spin", filter: OnceFilter): Promise<SpinEventData>;

export function once(
    event: "spin",
    filterOrCallback?: OnceFilter | EventCallback,
    maybeCallback?: EventCallback
): (() => void) | Promise<SpinEventData> {
    let filter: OnceFilter | undefined;
    let callback: EventCallback | undefined;

    if (typeof filterOrCallback === "function") {
        callback = filterOrCallback;
    } else if (filterOrCallback) {
        filter = filterOrCallback;
        callback = maybeCallback;
    }

    if (!callback) {
        return new Promise((resolve) => {
            const handler: EventCallback = (data) => {
                if (filter) {
                    if (!filter.player || data.player === filter.player) {
                        off("spin", handler);
                        resolve(data);
                    }
                } else {
                    off("spin", handler);
                    resolve(data);
                }
            };
            on("spin", handler);
        });
    }

    const handler: EventCallback = (data) => {
        if (filter) {
            if (!filter.player || data.player === filter.player) {
                off("spin", handler);
                callback(data);
            }
        } else {
            off("spin", handler);
            callback(data);
        }
    };

    on("spin", handler);
    return () => off("spin", handler);
}

function emit(data: SpinEventData) {
    spinListeners.forEach(cb => cb(data));
}

(async () => {
    const channel = await PluginChannel.acquire("@rcade/input-spinners", "^1.0.0");

    STATUS.connected = true;

    type InputMessage = { type: "spinners"; spinner1_step_delta: number; spinner2_step_delta: number; step_resolution: number };

    channel.getPort().onmessage = (event: MessageEvent<InputMessage>) => {
        const { type } = event.data;

        if (type === "spinners") {
            const { spinner1_step_delta, spinner2_step_delta, step_resolution } = event.data;

            currentStepResolution = step_resolution;

            if (spinner1_step_delta !== 0) {
                player1StepDelta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, player1StepDelta + spinner1_step_delta));
                emit({ player: 1, step_delta: spinner1_step_delta, step_resolution });
            }

            if (spinner2_step_delta !== 0) {
                player2StepDelta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, player2StepDelta + spinner2_step_delta));
                emit({ player: 2, step_delta: spinner2_step_delta, step_resolution });
            }
        }
    };
})()

if (import.meta.hot) {
    import.meta.hot.accept(() => {
        (import.meta.hot as any).invalidate();
    });
}
