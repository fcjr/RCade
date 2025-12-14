import { LogEntry } from "./entry";
import { BrowserLogRenderer } from "./render";
import { LOG_HANDLER, type LogHandler } from "./types";

interface PendingLog {
    entry: LogEntry;
    timeoutId: ReturnType<typeof setTimeout>;
}

export class LogForwarder {
    private target: LogHandler | undefined;
    private pendingQueue: Map<string, PendingLog> = new Map();

    private constructor(
        private readonly timeoutMs: number
    ) { }

    static withTimeout(timeoutMs: number) {
        return new LogForwarder(timeoutMs);
    }

    public [LOG_HANDLER](entry: LogEntry): void {
        if (this.target)
            this.send(entry);
        else
            this.enqueue(entry);
    }

    /**
     * Updates the target. If a target is provided, it flushes the queue immediately.
     */
    public setTarget(newTarget: LogHandler | undefined): void {
        this.target = newTarget;
        if (this.target) {
            this.flush();
        }
    }

    private send(entry: LogEntry): void {
        if (LOG_HANDLER in this.target!)
            this.target![LOG_HANDLER](entry)
        else
            this.target!(entry)
    }

    private enqueue(entry: LogEntry): void {
        if (this.pendingQueue.has(entry.id)) return;

        this.pendingQueue.set(entry.id, {
            entry,
            timeoutId: setTimeout(() => {
                this.handleTimeout(entry.id);
            }, this.timeoutMs)
        });
    }

    private flush(): void {
        for (const [id, pending] of this.pendingQueue.entries()) {
            clearTimeout(pending.timeoutId);
            this.send(pending.entry);
        }

        this.pendingQueue.clear();
    }

    private handleTimeout(id: string): void {
        const pending = this.pendingQueue.get(id);
        if (!pending) return;

        // Remove from queue so we don't try to flush it later
        this.pendingQueue.delete(id);

        BrowserLogRenderer.render(
            LogEntry.createCausedBy(pending.entry, "ERROR", ["LogForwarder"], "Log forwarding timed out - Target unavailable")
        );
    }
}