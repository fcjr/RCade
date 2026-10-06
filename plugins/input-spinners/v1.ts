// @rcade/input-spinners 1.x, for games built on the original client
// (@rcade/plugin-input-spinners 0.2): spinner steps, 64 per turn, now read
// from the T-Knobs. These games never shape the feel, so the knobs stay stock.

import type { Plugin, PluginEnvironment } from "@rcade/sdk-plugin";
import { knobs, whenMoved, type Attachment } from "./knob/index.ts";
import { STEPS_PER_TURN, StepCounter } from "./knob/steps.ts";

const SPINNER_KEY_MAP = {
    "KeyC": { player: 1, delta: -1 },    // P1 spinner left
    "KeyV": { player: 1, delta: 1 },     // P1 spinner right
    "Period": { player: 2, delta: -1 },  // P2 spinner left
    "Slash": { player: 2, delta: 1 },    // P2 spinner right
} as const;

const SPINNER_REPEAT_INTERVAL = 16; // ~60Hz repeat rate

export default class InputSpinnersPlugin implements Plugin {
    private environment?: PluginEnvironment;
    private attachment?: Attachment;
    private keyboardHandler: any;
    private spinnerIntervals: Map<string, NodeJS.Timeout> = new Map();

    private sendSteps(player: number, delta: number) {
        this.environment?.getPort().postMessage({
            type: "spinners",
            spinner1_step_delta: player === 1 ? delta : 0,
            spinner2_step_delta: player === 2 ? delta : 0,
        });
    }

    start(environment: PluginEnvironment): void {
        // The cabinet reuses a plugin when a game asks for its channel again.
        // Attach before letting go of the old channel, so the knobs stay open.
        const previous = this.attachment;
        this.removeKeyboardEmulation();
        this.environment = environment;
        const port = environment.getPort();
        port.on("message", (event) => {
            const { type, _nonce } = event.data ?? {};
            if (type === "get_config" && _nonce) port.postMessage({ _nonce, step_resolution: STEPS_PER_TURN });
        });
        port.start();
        this.setupKeyboardEmulation(environment);

        const counters = [new StepCounter(), new StepCounter()];
        const moved = whenMoved(() => {
            const contents = environment.getWebContents();
            if (!contents.isDestroyed()) contents.send("input-activity");
        });
        this.attachment = knobs().attach(message => {
            if (!("player" in message) || !message.player) return;
            const counter = counters[message.player - 1];
            // A knob that connected or restarted jumped to a new angle without turning.
            if (message.type === "hello") counter.forget();
            if (message.type !== "tick") return;
            moved(message);
            const steps = counter.take(message.global_angle);
            if (steps !== 0) this.sendSteps(message.player, steps);
        });
        void previous?.detach();
    }

    private setupKeyboardEmulation(environment: PluginEnvironment): void {
        this.keyboardHandler = (_: Electron.Event, input: Electron.Input) => {
            const mapping = SPINNER_KEY_MAP[input.code as keyof typeof SPINNER_KEY_MAP];
            if (!mapping) return;

            if (input.type === "keyDown" && !this.spinnerIntervals.has(input.code)) {
                // Send initial step immediately
                this.sendSteps(mapping.player, mapping.delta);

                // Start repeating while held
                const interval = setInterval(() => {
                    this.sendSteps(mapping.player, mapping.delta);
                }, SPINNER_REPEAT_INTERVAL);
                this.spinnerIntervals.set(input.code, interval);
            } else if (input.type === "keyUp") {
                // Stop repeating on key release
                const interval = this.spinnerIntervals.get(input.code);
                if (interval) {
                    clearInterval(interval);
                    this.spinnerIntervals.delete(input.code);
                }
            }
        };

        environment.getWebContents().on("before-input-event", this.keyboardHandler);
    }

    private removeKeyboardEmulation(): void {
        if (this.keyboardHandler) {
            this.environment?.getWebContents()?.off("before-input-event", this.keyboardHandler);
            this.keyboardHandler = undefined;
        }
        for (const interval of this.spinnerIntervals.values()) clearInterval(interval);
        this.spinnerIntervals.clear();
    }

    async stop(): Promise<void> {
        this.removeKeyboardEmulation();
        this.environment = undefined;
        const attachment = this.attachment;
        this.attachment = undefined;
        await attachment?.detach();
    }
}
