import { logTraffic } from "./log.ts";
import { deviceMessage, isDeviceMessageType, JsonLines, type DeviceCommand, type DeviceMessage, type Hello } from "./protocol.ts";
import { CommandWriter, type SerialOutput } from "./writer.ts";

export interface SerialConnection extends SerialOutput {
    isOpen: boolean;
    on(event: "data", callback: (data: Buffer) => void): unknown;
    on(event: "error", callback: (error: Error) => void): unknown;
    on(event: "close", callback: () => void): unknown;
    close(callback: (error?: Error | null) => void): unknown;
}

export interface KnobEvents {
    message(message: DeviceMessage): void;
    /** The link broke; the knob is already closing. */
    lost(error: Error): void;
}

/** The firmware resets to stock curves if it hears nothing for 500 ms. */
const LEASE_INTERVAL_MS = 200;
/** How long a knob has to say who it is. */
const HANDSHAKE_MS = 750;

/** One T-Knob on a serial port. Nothing that changes how it feels is sent
 *  until it has said who it is. */
export class TKnob {
    identity?: Hello;
    /** Resolves when the knob has said hello; rejects if it doesn't. */
    readonly ready: Promise<Hello>;
    private readonly writer: CommandWriter;
    private lease?: ReturnType<typeof setInterval>;
    private events?: KnobEvents;
    private closing?: Promise<void>;
    private mismatched = false;

    constructor(readonly path: string, private readonly connection: SerialConnection) {
        let settle!: { resolve: (hello: Hello) => void; reject: (error: Error) => void };
        this.ready = new Promise((resolve, reject) => { settle = { resolve, reject }; });
        // Nobody may be waiting yet; a failed handshake must not be unhandled.
        this.ready.catch(() => {});
        const fail = (error: Error) => {
            clearTimeout(timeout);
            if (this.closing) return;
            void this.close(false);
            if (this.identity) this.events?.lost(error);
            else settle.reject(error);
        };
        const timeout = setTimeout(() => fail(new Error("T-Knob identity handshake timed out")), HANDSHAKE_MS);
        this.writer = new CommandWriter(connection, fail);
        const parser = new JsonLines((raw) => {
            logTraffic("in", raw);
            if (this.closing) return;
            const message = deviceMessage(raw);
            if (!message) {
                if (isDeviceMessageType(raw) && !this.mismatched) {
                    this.mismatched = true;
                    console.warn(`[input-spinners] The knob on ${path} sent a message this cabinet can't read; reflash it to match: ${JSON.stringify(raw).slice(0, 200)}`);
                }
                return;
            }
            if (!this.identity) {
                if (message.type !== "hello") return;
                clearTimeout(timeout);
                this.identity = message;
                this.lease = setInterval(() => this.writer.send({ type: "lease" }), LEASE_INTERVAL_MS);
                this.writer.send({ type: "lease" });
                settle.resolve(message);
                return;
            }
            // A hello on an open link: the knob restarted, with stock curves.
            if (message.type === "hello") this.identity = message;
            this.events?.message(message);
        }, () => {
            if (this.identity && !this.closing) this.events?.message({ type: "error", message: "Invalid T-Knob serial frame" });
        });
        connection.on("data", (data) => parser.push(data));
        connection.on("error", fail);
        connection.on("close", () => fail(new Error("T-Knob disconnected")));
        this.writer.send({ type: "hello" });
    }

    listen(events: KnobEvents): void {
        this.events = events;
    }

    /** False if the queue is full or the command too big. */
    send(command: DeviceCommand): boolean {
        return this.writer.send(command);
    }

    /** Close the link. `orderly`: drop the game's curves and stop the knob first. */
    close(orderly: boolean): Promise<void> {
        this.closing ??= (async () => {
            clearInterval(this.lease);
            const { connection, writer } = this;
            if (orderly && this.identity && connection.isOpen) {
                writer.send({ type: "reset" });
                writer.send({ type: "brake" });
                await new Promise<void>((resolve) => {
                    const timeout = setTimeout(resolve, 250);
                    writer.whenIdle(() => { clearTimeout(timeout); resolve(); });
                });
            }
            writer.close();
            if (!connection.isOpen) return;
            await new Promise<void>((resolve) => {
                // A stuck native close must not keep game switching pending forever.
                const timeout = setTimeout(resolve, 500);
                connection.close(() => { clearTimeout(timeout); resolve(); });
            });
        })();
        return this.closing;
    }
}
