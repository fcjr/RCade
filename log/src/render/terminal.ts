// terminal.ts
import type { LogEntry } from "../entry";
import { LOG_HANDLER } from "../types";

const ANSI = {
    RESET: '\x1b[0m',
    BOLD: '\x1b[1m',
    DIM: '\x1b[2m',
    GRAY: '\x1b[90m',

    // Foreground Colors
    INFO: '\x1b[36m',  // Cyan
    WARN: '\x1b[33m',  // Yellow
    ERROR: '\x1b[31m', // Red
    DEBUG: '\x1b[32m', // Green
    DEFAULT: '\x1b[37m' // White
};

const LEVEL_CONFIG = {
    INFO: { color: ANSI.INFO, icon: 'ℹ' },
    WARN: { color: ANSI.WARN, icon: '⚠' },
    ERROR: { color: ANSI.ERROR, icon: '✖' },
    DEBUG: { color: ANSI.DEBUG, icon: '⚙' },
    DEFAULT: { color: ANSI.DEFAULT, icon: '•' }
} as const;

export class TerminalLogRenderer {
    static [LOG_HANDLER](entry: LogEntry) {
        this.render(entry);
    }

    [LOG_HANDLER](entry: LogEntry) {
        TerminalLogRenderer.render(entry);
    }

    /**
     * Renders a LogEntry to the terminal using ANSI escape codes.
     * Handles cause chains by listing them linearly with relative time deltas.
     */
    public static render(entry: LogEntry): void {
        const prefix = this.formatPrefix(entry);

        // 1. Print the root log
        if (!entry.cause) {
            console.log(prefix, ...entry.content);
            return;
        }

        // If causes exist, we print the root, then visually indent the chain
        console.log(prefix, ...entry.content);

        // 2. Iterate through the chain
        let currentCause: LogEntry | undefined = entry.cause;

        while (currentCause) {
            // Calculate diff relative to the ROOT entry time
            const causePrefix = this.formatPrefix(currentCause, entry.time);

            // \u21B3 is '↳'
            const connector = `${ANSI.GRAY}  \u21B3 Caused by:${ANSI.RESET}`;

            console.log(
                `${connector} ${causePrefix}`,
                ...currentCause.content
            );

            currentCause = currentCause.cause;
        }
    }

    /**
     * Generates the styled prefix string (Time | Level | Modules).
     * @param entry The log entry
     * @param relativeTo If provided, formats time as a delta (+/- ms/s)
     */
    private static formatPrefix(entry: LogEntry, relativeTo?: Date): string {
        const config = LEVEL_CONFIG[entry.level.toUpperCase() as keyof typeof LEVEL_CONFIG] || LEVEL_CONFIG.DEFAULT;

        // 1. Time
        let timeStr: string;
        if (relativeTo) {
            const diff = entry.time.getTime() - relativeTo.getTime();
            timeStr = this.formatTimeDelta(diff);
        } else {
            // Absolute Time (HH:mm:ss.ms) to match browser
            timeStr = entry.time.toISOString().substring(11, 23);
        }

        // Pad time to keep alignment neat between absolute and relative logs
        const timestamp = `${ANSI.GRAY}${timeStr}${ANSI.RESET}`;

        // 2. Level Badge (Icon + Text)
        const level = `${ANSI.BOLD}${config.color}${config.icon} ${entry.level.toUpperCase()}${ANSI.RESET}`;

        // 3. Modules
        let modules = '';
        if (entry.modules.length > 0) {
            const modStr = entry.modules.join(`${ANSI.GRAY}/${ANSI.RESET}${ANSI.DIM}`); // Join with gray slashes
            // Add leading spacing and brackets or just color
            modules = ` ${ANSI.DIM}[${modStr}]${ANSI.RESET}`;
        }

        return `${timestamp} ${level}${modules}`;
    }

    /**
     * Converts milliseconds to a short, human-readable delta string.
     * Matches BrowserLogRenderer logic.
     */
    private static formatTimeDelta(ms: number): string {
        const abs = Math.abs(ms);
        const sign = ms > 0 ? '+' : '-';

        if (abs < 1000) {
            return `${sign}${abs}ms`;
        } else if (abs < 60 * 1000) {
            return `${sign}${(abs / 1000).toFixed(2)}s`;
        } else if (abs < 60 * 60 * 1000) {
            return `${sign}${(abs / (60 * 1000)).toFixed(1)}m`;
        } else {
            return `${sign}${(abs / (60 * 60 * 1000)).toFixed(1)}h`;
        }
    }
}