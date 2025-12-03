import { type PluginEnvironment, type Plugin } from "@rcade/sdk-plugin";
import type { MessagePortMain } from "electron";
import HID from "node-hid";

const VID = 0x1209;
const PID = 0x0001;

export default class InputSpinnersPlugin implements Plugin {
    private environment?: PluginEnvironment;
    private hidDevice?: HID.HID;

    start(environment: PluginEnvironment): void {
        this.environment = environment;
        this.tryOpenHidDevice(environment.getPort());
    }

    private tryOpenHidDevice(port: MessagePortMain): void {
        try {
            this.hidDevice = new HID.HID(VID, PID);

            this.hidDevice.on("data", (data: Buffer) => {
                // HID report format (8 bytes):
                // Byte 0-1: Player 1 Spinner step_delta (signed int16, little-endian)
                // Byte 2-3: Player 2 Spinner step_delta (signed int16, little-endian)
                // Byte 4-7: Reserved (buttons handled by input-classic)

                const spinner1_step_delta = data.readInt16LE(0);
                const spinner2_step_delta = data.readInt16LE(2);

                if (spinner1_step_delta !== 0 || spinner2_step_delta !== 0) {
                    port.postMessage({
                        type: "spinners",
                        spinner1_step_delta,
                        spinner2_step_delta,
                        step_resolution: 1024,
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
        this.environment = undefined;

        if (this.hidDevice) {
            this.hidDevice.close();
            this.hidDevice = undefined;
        }
    }
}
