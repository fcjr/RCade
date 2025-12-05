import { PluginChannel } from "@rcade/sdk";

const MAX_DELTA = 1000;

let stepResolution = 64;

class Spinner {
    private _stepDelta = 0;
    private _angle = 0;

    get step_delta() {
        const d = this._stepDelta;
        this._stepDelta = 0;
        return d;
    }

    get step_resolution() {
        return stepResolution;
    }

    get angle() {
        return this._angle;
    }

    reset() {
        this._angle = 0;
    }

    /** @internal */
    _update(delta: number) {
        this._stepDelta = Math.max(-MAX_DELTA, Math.min(MAX_DELTA, this._stepDelta + delta));
        this._angle = Math.atan2(
            Math.sin(this._angle + (delta / stepResolution) * 2 * Math.PI),
            Math.cos(this._angle + (delta / stepResolution) * 2 * Math.PI)
        );
    }
}

const spinner1 = new Spinner();
const spinner2 = new Spinner();

/** Spinner input for Player 1. Read `step_delta` each frame (resets after read). */
export const PLAYER_1 = { SPINNER: spinner1 };

/** Spinner input for Player 2. Read `step_delta` each frame (resets after read). */
export const PLAYER_2 = { SPINNER: spinner2 };

export const STATUS = { connected: false };

(async () => {
    const channel = await PluginChannel.acquire("@rcade/input-spinners", "^1.0.0");

    // Use addEventListener (not onmessage) to not interfere with PluginChannel's request handling
    channel.getPort().addEventListener("message", (event: MessageEvent) => {
        const { type, spinner1_step_delta, spinner2_step_delta } = event.data;
        if (type === "spinners") {
            if (spinner1_step_delta !== 0) spinner1._update(spinner1_step_delta);
            if (spinner2_step_delta !== 0) spinner2._update(spinner2_step_delta);
        }
    });

    const config = await channel.request<{ step_resolution: number }>({ type: "get_config" });
    stepResolution = config.step_resolution;

    STATUS.connected = true;
})();

if (import.meta.hot) {
    import.meta.hot.accept(() => {
        (import.meta.hot as any).invalidate();
    });
}
