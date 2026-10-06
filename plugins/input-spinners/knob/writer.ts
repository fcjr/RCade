import { logTraffic } from "./log.ts";
import { MAX_FRAME_BYTES, type DeviceCommand } from "./protocol.ts";

export interface SerialOutput {
    write(data: string, callback: (error?: Error | null) => void): unknown;
    drain(callback: (error?: Error | null) => void): unknown;
}

interface PendingWrite {
    command: DeviceCommand;
    addedAt: number;
}

/** One in-flight frame, one latest config, and a small bounded command queue. */
export class CommandWriter {
    private queue: PendingWrite[] = [];
    private busy = false;
    private closed = false;
    private timeout?: ReturnType<typeof setTimeout>;
    private idleCallbacks: (() => void)[] = [];

    constructor(
        private output: SerialOutput,
        private failed: (error: Error) => void,
        private now = Date.now,
    ) {}

    send(command: DeviceCommand): boolean {
        if (this.closed) return false;
        if (Buffer.byteLength(JSON.stringify(command)) > MAX_FRAME_BYTES) return false;
        if (command.type === "reset") {
            // A reset discards the curves, so any still-queued config is moot.
            this.queue = [];
        } else if (command.type === "config" || command.type === "lease") {
            const previous = this.queue.findIndex((item) => item.command.type === command.type);
            if (previous !== -1) {
                // Only the newest config or lease matters. The client takes a
                // config's ack as the answer to every config before it.
                this.queue[previous] = { command, addedAt: this.now() };
                return true;
            }
        }
        if (this.queue.length >= 8) return false;
        this.queue.push({ command, addedAt: this.now() });
        this.pump();
        return true;
    }

    whenIdle(callback: () => void): void {
        if (!this.busy && this.queue.length === 0) callback();
        else this.idleCallbacks.push(callback);
    }

    close(): void {
        this.closed = true;
        this.queue = [];
        this.idleCallbacks = [];
        clearTimeout(this.timeout);
    }

    private pump(): void {
        if (this.closed || this.busy) return;
        const next = this.queue.shift();
        if (!next) {
            for (const callback of this.idleCallbacks.splice(0)) callback();
            return;
        }
        // A lease delayed by backpressure would overstate how recently the cabinet was alive.
        if (next.command.type === "lease" && this.now() - next.addedAt > 200) {
            this.pump();
            return;
        }
        this.busy = true;
        logTraffic("out", next.command);
        const fail = (error: Error) => {
            if (this.closed) return;
            this.close();
            this.failed(error);
        };
        this.timeout = setTimeout(() => fail(new Error("T-Knob serial write timed out")), 200);
        try {
            this.output.write(JSON.stringify(next.command) + "\n", (error) => {
                if (this.closed) return;
                if (error) return fail(error);
                this.output.drain((drainError) => {
                    if (this.closed) return;
                    if (drainError) return fail(drainError);
                    clearTimeout(this.timeout);
                    this.busy = false;
                    this.pump();
                });
            });
        } catch (error) {
            fail(error instanceof Error ? error : new Error(String(error)));
        }
    }
}
