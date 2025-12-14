import { LogEntry } from "./entry";
import { type LogLevel, type LogHandler, LOG_HANDLER } from "./types";

export class Logger {
    private readonly modules: readonly string[];
    private readonly handlers: readonly LogHandler[];
    private readonly minLevel: LogLevel;
    private readonly cause?: LogEntry;

    private static readonly LEVEL_PRIORITY: Record<LogLevel, number> = {
        'DEBUG': 0,
        'INFO': 1,
        'WARN': 2,
        'ERROR': 3
    };

    private constructor(
        modules: readonly string[],
        handlers: readonly LogHandler[],
        minLevel: LogLevel,
        cause?: LogEntry
    ) {
        this.modules = modules;
        this.handlers = handlers;
        this.minLevel = minLevel;
        this.cause = cause;
    }

    public static create(): Logger {
        return new Logger([], [], 'INFO', undefined);
    }

    public withModule(moduleName: string): Logger {
        return new Logger(
            [...this.modules, moduleName],
            this.handlers,
            this.minLevel,
            this.cause // Preserve current cause if one exists
        );
    }

    public withHandler(handler: LogHandler): Logger {
        return new Logger(
            this.modules,
            [...this.handlers, handler],
            this.minLevel,
            this.cause
        );
    }

    public withMinimumLevel(level: LogLevel): Logger {
        return new Logger(
            this.modules,
            this.handlers,
            level,
            this.cause
        );
    }

    /**
     * Attaches a causal LogEntry to the logger context.
     * Returns a NEW Logger instance.
     * * Usage: logger.because(dbErrorEntry).error("Failed to save user");
     */
    public because(cause: LogEntry): Logger {
        return new Logger(
            this.modules,
            this.handlers,
            this.minLevel,
            cause
        );
    }

    private buildAndDispatch(level: LogLevel, content: any[]): LogEntry {
        return this.dispatch(this.cause
            ? LogEntry.createCausedBy(
                this.cause,
                level,
                [],
                ...content
            )
            : LogEntry.create(
                level,
                [],
                ...content
            )
        )
    }

    // --- Public Logging Interface ---

    public dispatch(entryIn: LogEntry): LogEntry {
        //@ts-expect-error
        let entry: LogEntry = new LogEntry(
            entryIn.level,
            [...this.modules, ...entryIn.modules],
            entryIn.content,
            entryIn.time,
            entryIn.id,
            entryIn.cause,
        );

        if (Logger.LEVEL_PRIORITY[entry.level] < Logger.LEVEL_PRIORITY[this.minLevel])
            return entry;

        for (const handler of this.handlers)
            if (LOG_HANDLER in handler)
                handler[LOG_HANDLER](entry);
            else
                handler(entry);

        return entry;
    }

    public debug(...args: any[]): LogEntry {
        return this.buildAndDispatch('DEBUG', args);
    }

    public info(...args: any[]): LogEntry {
        return this.buildAndDispatch('INFO', args);
    }

    public warn(...args: any[]): LogEntry {
        return this.buildAndDispatch('WARN', args);
    }

    public error(...args: any[]): LogEntry {
        return this.buildAndDispatch('ERROR', args);
    }
}