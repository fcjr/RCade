// @rcade/input-spinners 2.x: the T-Knobs' own protocol, for games built on
// @rcade/plugin-input-spinners 0.3. Every message carries its player.

import type { Plugin, PluginEnvironment } from "@rcade/sdk-plugin";
import type { MessagePortMain } from "electron";
import { knobs, whenMoved, type Attachment } from "./knob/index.ts";
import { gameCommand } from "./knob/protocol.ts";

export default class InputSpinnersV2Plugin implements Plugin {
    private attachment?: Attachment;
    private port?: MessagePortMain;

    async start(environment: PluginEnvironment): Promise<void> {
        // The cabinet reuses a plugin when a game asks for its channel again.
        // Attach before letting go of the old channel, so the knobs stay open.
        const previous = { attachment: this.attachment, port: this.port };
        const port = environment.getPort();
        this.port = port;
        const moved = whenMoved(() => {
            const contents = environment.getWebContents();
            if (!contents.isDestroyed()) contents.send("input-activity");
        });
        const attachment = knobs().attach(message => {
            moved(message);
            try {
                port.postMessage(message);
            } catch {
                if (this.attachment === attachment) void this.stop();
            }
        });
        this.attachment = attachment;
        port.on("message", ({ data }) => {
            if (this.attachment !== attachment) return;
            const command = gameCommand(data);
            if (command) return attachment.send(command);
            const id = (data as { id?: unknown })?.id;
            port.postMessage({
                type: "error", ...(typeof id === "number" ? { id } : {}),
                message: "Games may only send hello, config, tare, reset, brake or rumble, for player 1 or 2",
            });
        });
        port.on("close", () => { if (this.attachment === attachment) void this.stop(); });
        port.start();
        previous.port?.close();
        await previous.attachment?.detach();
    }

    async stop(): Promise<void> {
        const { attachment, port } = this;
        this.attachment = undefined;
        this.port = undefined;
        port?.close();
        await attachment?.detach();
    }
}
