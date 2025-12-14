import type { LogLevel, RawLogObject } from "./types";

export class LogEntry {
    public readonly level: LogLevel;
    public readonly modules: readonly string[];
    public readonly content: any[];
    public readonly time: Date;
    public readonly id: string;
    public readonly cause?: LogEntry;

    private constructor(
        level: LogLevel,
        modules: readonly string[],
        content: any[],
        time: Date,
        id: string,
        cause?: LogEntry
    ) {
        this.level = level;
        this.modules = modules;
        this.content = content;
        this.time = time;
        this.id = id;
        this.cause = cause;
    }

    /**
     * Creates a new LogEntry with an auto-generated ID and current timestamp.
     * * Usage: LogEntry.create("INFO", ["auth"], "User logged in", userId);
     */
    public static create(level: LogLevel, modules: string[], ...content: any[]): LogEntry {
        return new LogEntry(
            level,
            modules,
            content,
            new Date(),
            crypto.randomUUID(),
            undefined
        );
    }

    /**
     * Creates a LogEntry from a JavaScript Error object.
     * Automatically sets level to "ERROR" and extracts error details.
     * If the error has a cause property, it will be recursively converted to a LogEntry.
     * Use with chaining to customize: LogEntry.fromError(error).withModules(["db"]).withLevel("WARN")
     */
    public static fromError(error: Error): LogEntry {
        const content = [
            error.message,
            { name: error.name, stack: error.stack }
        ];

        let causeEntry: LogEntry | undefined;
        if (error.cause != undefined) {
            // If the cause is also an Error, recursively convert it
            if (Error.isError(error.cause)) {
                causeEntry = LogEntry.fromError(error.cause);
            } else {
                // If cause is not an Error, create a log entry with the cause as content
                causeEntry = LogEntry.create("ERROR", [], "Error cause:", error.cause);
            }
        }

        return new LogEntry(
            "ERROR",
            [],
            content,
            new Date(),
            crypto.randomUUID(),
            causeEntry
        );
    }

    /**
     * Creates a new LogEntry that is caused by another LogEntry.
     * Useful for error chaining or tracing causality.
     * * Usage: LogEntry.createCausedBy(dbErrorEntry, "ERROR", ["api"], "Failed to fetch user");
     */
    public static createCausedBy(cause: LogEntry, level: LogLevel, modules: string[], ...content: any[]): LogEntry {
        return new LogEntry(
            level,
            modules,
            content,
            new Date(),
            crypto.randomUUID(),
            cause
        );
    }

    /**
     * Creates a LogEntry from a JavaScript Error object with an explicit cause.
     * Recursively builds the error's cause chain, then attaches the provided cause at the end.
     * Use with chaining to customize: LogEntry.fromErrorWithCause(error, contextEntry).withModules(["db"])
     */
    public static fromErrorWithCause(providedCause: LogEntry, error: Error): LogEntry {
        const content = [
            error.message,
            { name: error.name, stack: error.stack }
        ];

        let causeEntry: LogEntry | undefined;

        if (error.cause) {
            // Recursively build the error.cause chain with the provided cause at the end
            if (error.cause instanceof Error) {
                causeEntry = LogEntry.fromErrorWithCause(providedCause, error.cause);
            } else {
                // If cause is not an Error, create a log entry with the providedCause as its cause
                causeEntry = LogEntry.createCausedBy(providedCause, "ERROR", [], "Error cause:", error.cause);
            }
        } else {
            // No error.cause, so the provided cause becomes the immediate cause
            causeEntry = providedCause;
        }

        return new LogEntry(
            "ERROR",
            [],
            content,
            new Date(),
            crypto.randomUUID(),
            causeEntry
        );
    }

    /**
     * Static factory method to create a LogEntry instance from a raw log object.
     */
    public static fromLogObject(logObject: RawLogObject): LogEntry {
        if (!logObject || typeof logObject !== 'object') {
            throw new Error('Invalid log object: must be a non-null object.');
        }

        const { level, modules, content, time, id, cause } = logObject;

        // Basic validation for all fields
        if (typeof level !== 'string' || level.length === 0) {
            throw new Error('Invalid log object: "level" must be a non-empty string.');
        }
        if (!Array.isArray(modules) || modules.some(m => typeof m !== 'string')) {
            throw new Error('Invalid log object: "modules" must be an array of strings.');
        }
        if (!Array.isArray(content)) {
            throw new Error('Invalid log object: "content" must be an array.');
        }
        if (typeof time !== 'number' || isNaN(time)) {
            throw new Error('Invalid log object: "time" must be a valid timestamp number.');
        }
        if (typeof id !== 'string' || id.length === 0) {
            throw new Error('Invalid log object: "id" must be a non-empty string.');
        }

        const logTime = new Date(time);

        let causeEntry: LogEntry | undefined;
        if (cause) {
            causeEntry = LogEntry.fromLogObject(cause);
        }

        return new LogEntry(level, modules, content, logTime, id, causeEntry);
    }

    /**
     * Converts the LogEntry instance back into the plain JavaScript object.
     */
    public toLogObject(): RawLogObject {
        return {
            level: this.level,
            modules: Array.from(this.modules),
            content: this.content,
            time: this.time.getTime(),
            id: this.id,
            cause: this.cause ? this.cause.toLogObject() : undefined,
        };
    }


    /**
     * Returns a new LogEntry with the specified log level.
     * * Usage: entry.withLevel("WARN")
     */
    public withLevel(level: LogLevel): LogEntry {
        return new LogEntry(
            level,
            this.modules as string[],
            this.content,
            this.time,
            this.id,
            this.cause
        );
    }

    /**
     * Returns a new LogEntry with additional modules appended.
     * * Usage: entry.addModules("cache", "redis")
     */
    public withModules(...modules: string[]): LogEntry {
        return new LogEntry(
            this.level,
            [...this.modules, ...modules],
            this.content,
            this.time,
            this.id,
            this.cause
        );
    }

    /**
     * Returns a new LogEntry with the specified content.
     * * Usage: entry.withContent("New message", additionalData)
     */
    public withContent(...content: any[]): LogEntry {
        return new LogEntry(
            this.level,
            this.modules as string[],
            [...this.content, ...content],
            this.time,
            this.id,
            this.cause
        );
    }
}