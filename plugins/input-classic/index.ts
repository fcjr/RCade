import { type PluginEnvironment, type Plugin } from "@rcade/sdk-plugin";
import type { MessagePortMain } from "electron";
import HID from "node-hid";

const VID = 0x1209;
const PID = 0x0001;

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
    private hidDevice?: HID.HID;

    start(environment: PluginEnvironment): void {
        this.environment = environment;
        this.handler = (event: Electron.Event, input: Electron.Input) => {
            this.handleInput(environment.getPort(), event, input);
        }

        environment.getWebContents().on("before-input-event", this.handler);

        // Try to open the USB HID device for spinner input
        this.tryOpenHidDevice(environment.getPort());
    }

    private tryOpenHidDevice(port: MessagePortMain): void {
        try {
            this.hidDevice = new HID.HID(VID, PID);

            this.hidDevice.on("data", (data: Buffer) => {
                // HID report format (8 bytes):
                // Byte 0-1: Player 1 Spinner  delta (signed int16, little-endian)
                // Byte 2-3: Player 2 Spinner  delta (signed int16, little-endian)
                // Byte 4:   Player 1 inputs (bitfield)
                // Byte 5:   Player 2 inputs (bitfield)
                // Byte 6:   System inputs (bitfield)
                // Byte 7:   Reserved

                const player1SpinnerDelta = data.readInt16LE(0);
                const player2spinnerDelta = data.readInt16LE(2);

                if (player1SpinnerDelta !== 0) {
                  port.postMessage({
                    type: "spinner",
                    player: 1,
                    delta: player1SpinnerDelta,
                  });
                }

                if (player2spinnerDelta !== 0) {
                  port.postMessage({
                    type: "spinner",
                    player: 2,
                    delta: player2spinnerDelta,
                  });
                }
            });

            this.hidDevice.on("error", (err: Error) => {
                console.error("[input-classic] HID device error:", err);
                this.hidDevice = undefined;
            });
        } catch (err) {
            // Device not found or can't be opened - this is normal if hardware isn't connected
            console.log("[input-classic] USB HID device not found, using keyboard emulation only");
        }
    }

    stop(): void {
        this.environment?.getWebContents()?.off("before-input-event", this.handler);
        this.handler = undefined;
        this.environment = undefined;

        if (this.hidDevice) {
            this.hidDevice.close();
            this.hidDevice = undefined;
        }
    }
}