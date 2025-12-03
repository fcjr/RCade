import { type PluginEnvironment, type Plugin } from "@rcade/sdk-plugin";
import type { MessagePortMain } from "electron";

const MAP = {
    "KeyW": { type: "button", player: 1, button: "UP" },
    "KeyS": { type: "button", player: 1, button: "DOWN" },
    "KeyA": { type: "button", player: 1, button: "LEFT" },
    "KeyD": { type: "button", player: 1, button: "RIGHT" },
    "KeyF": { type: "button", player: 1, button: "A" },
    "KeyG": { type: "button", player: 1, button: "B" },

    "KeyI": { type: "button", player: 2, button: "UP" },
    "KeyK": { type: "button", player: 2, button: "DOWN" },
    "KeyJ": { type: "button", player: 2, button: "LEFT" },
    "KeyL": { type: "button", player: 2, button: "RIGHT" },
    "Semicolon": { type: "button", player: 2, button: "A" },
    "Quote": { type: "button", player: 2, button: "B" },

    "Digit1": { type: "system", player: 0, button: "ONE_PLAYER" },
    "Digit2": { type: "system", player: 0, button: "TWO_PLAYER" },
} as const;

export default class InputClassicPlugin implements Plugin {
    private handleInput(port: MessagePortMain, _: Electron.Event, input: Electron.Input) {
        const mapping = MAP[input.code as keyof typeof MAP];

        if (mapping) {
            const message = {
                ...mapping,
                pressed: input.type === "keyDown"
            };

            port.postMessage(message);
        }
    }

    private handler: any;
    private environment?: PluginEnvironment;

    start(environment: PluginEnvironment): void {
        this.environment = environment;
        this.handler = (event: Electron.Event, input: Electron.Input) => {
            this.handleInput(environment.getPort(), event, input);
        }

        environment.getWebContents().on("before-input-event", this.handler);
    }

    stop(): void {
        this.environment?.getWebContents()?.off("before-input-event", this.handler);
        this.handler = undefined;
        this.environment = undefined;
    }
}
