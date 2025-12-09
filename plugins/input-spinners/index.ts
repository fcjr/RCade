import { type PluginEnvironment, type Plugin } from "@rcade/sdk-plugin";
import type { MessagePortMain } from "electron";
import HID from "node-hid";

const VID = 0x1209;
const PID = 0x0001;
const STEP_RESOLUTION = 64;

const SPINNER_KEY_MAP = {
    "KeyC": { player: 1, delta: -1 },    // P1 spinner left
    "KeyV": { player: 1, delta: 1 },     // P1 spinner right
    "Period": { player: 2, delta: -1 },  // P2 spinner left
    "Slash": { player: 2, delta: 1 },    // P2 spinner right
} as const;

const SPINNER_REPEAT_INTERVAL = 16; // ~60Hz repeat rate

export default class InputSpinnersPlugin implements Plugin {
    private environment?: PluginEnvironment;
    private hidDevice?: HID.HID;
    private keyboardHandler: any;
    private spinnerIntervals: Map<string, NodeJS.Timeout> = new Map();

    private sendSpinnerMessage(port: MessagePortMain, player: number, delta: number) {
        port.postMessage({
            type: "spinners",
            spinner1_step_delta: player === 1 ? delta : 0,
            spinner2_step_delta: player === 2 ? delta : 0,
        });
    }

    start(environment: PluginEnvironment): void {
        this.environment = environment;
        const port = environment.getPort();

        this.setupKeyboardEmulation(environment, port);
        this.tryOpenHidDevice(environment, port);
    }

    private setupKeyboardEmulation(environment: PluginEnvironment, port: MessagePortMain): void {
        this.keyboardHandler = (_: Electron.Event, input: Electron.Input) => {
            const mapping = SPINNER_KEY_MAP[input.code as keyof typeof SPINNER_KEY_MAP];
            if (!mapping) return;

            if (input.type === "keyDown" && !this.spinnerIntervals.has(input.code)) {
                // Send initial step immediately
                this.sendSpinnerMessage(port, mapping.player, mapping.delta);

                // Start repeating while held
                const interval = setInterval(() => {
                    this.sendSpinnerMessage(port, mapping.player, mapping.delta);
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

    private tryOpenHidDevice(environment: PluginEnvironment, port: MessagePortMain): void {
        // Handle requests from client
        port.on("message", (event) => {
            const { type, _nonce } = event.data ?? {};
            if (type === "get_config" && _nonce) {
                port.postMessage({
                    _nonce,
                    step_resolution: STEP_RESOLUTION,
                });
            }
        });
        port.start();

        try {
            this.hidDevice = new HID.HID(VID, PID);

            this.hidDevice.on("data", (data: Buffer) => {
                // HID report format (4 bytes):
                // Byte 0-1: Player 1 Spinner step_delta (signed int16, little-endian)
                // Byte 2-3: Player 2 Spinner step_delta (signed int16, little-endian)

                if (data.length < 4) {
                    return;
                }

                const spinner1_step_delta = data.readInt16LE(0);
                const spinner2_step_delta = data.readInt16LE(2);

                if (spinner1_step_delta !== 0 || spinner2_step_delta !== 0) {
                    environment.getWebContents().send("input-activity");
                    port.postMessage({
                        type: "spinners",
                        spinner1_step_delta,
                        spinner2_step_delta,
                    });
                }
            });

            this.hidDevice.on("error", (err: Error) => {
                console.error("[input-spinners] HID device error:", err);
                this.hidDevice = undefined;
            });
        } catch (err) {
            console.log("[input-spinners] USB HID device not found");
        }
    }

    stop(): void {
        // Clean up keyboard handler
        if (this.keyboardHandler) {
            this.environment?.getWebContents()?.off("before-input-event", this.keyboardHandler);
            this.keyboardHandler = undefined;
        }

        // Clean up spinner intervals
        for (const interval of this.spinnerIntervals.values()) {
            clearInterval(interval);
        }
        this.spinnerIntervals.clear();

        this.environment = undefined;

        if (this.hidDevice) {
            this.hidDevice.close();
            this.hidDevice = undefined;
        }
    }
}
