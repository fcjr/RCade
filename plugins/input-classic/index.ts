import { type PluginEnvironment, type Plugin } from "@rcade/sdk-plugin";
import type { MessagePortMain } from "electron";

const MAP = {
    "ArrowUp": { type: "button", player: 1, button: "UP" },
    "ArrowDown": { type: "button", player: 1, button: "DOWN" },
    "ArrowLeft": { type: "button", player: 1, button: "LEFT" },
    "ArrowRight": { type: "button", player: 1, button: "RIGHT" },
    "ControlLeft": { type: "button", player: 1, button: "A" },
    "AltLeft": { type: "button", player: 1, button: "B" },

    "KeyR": { type: "button", player: 2, button: "UP" },
    "KeyF": { type: "button", player: 2, button: "DOWN" },
    "KeyD": { type: "button", player: 2, button: "LEFT" },
    "KeyG": { type: "button", player: 2, button: "RIGHT" },
    "KeyA": { type: "button", player: 2, button: "A" },
    "KeyS": { type: "button", player: 2, button: "B" },

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