// browser.ts
import type { LogEntry } from "../entry";
import { LOG_HANDLER } from "../types";

// 1. Updated Palette
const PALETTE = {
    INFO: { bg: '#0ea5e9', border: '#0284c7', text: '#ffffff', icon: 'ℹ' },
    WARN: { bg: '#f59e0b', border: '#d97706', text: '#ffffff', icon: '⚠' },
    ERROR: { bg: '#ef4444', border: '#dc2626', text: '#ffffff', icon: '✖' },
    DEBUG: { bg: '#10b981', border: '#059669', text: '#ffffff', icon: '⚙' },
    DEFAULT: { bg: '#64748b', border: '#475569', text: '#ffffff', icon: '•' }
} as const;

export class BrowserLogRenderer {
    static [LOG_HANDLER](entry: LogEntry) {
        this.render(entry);
    }

    [LOG_HANDLER](entry: LogEntry) {
        BrowserLogRenderer.render(entry);
    }

    /**
     * Renders a LogEntry to the browser console.
     * If causes exist, creates a SINGLE dropdown group and lists the cause chain linearly.
     */
    public static render(entry: LogEntry): void {
        const { format, args } = this.formatLogArgs(entry);

        // If no cause, print a standard log
        if (!entry.cause) {
            console.log(format, ...args, ...entry.content);
            return;
        }

        // If cause exists, start a SINGLE collapsed group for the root error
        console.groupCollapsed(format, ...args, ...entry.content);

        // Iterate through the chain (Linked List -> Flat List)
        let currentCause: LogEntry | undefined = entry.cause;
        let depth = 1;

        while (currentCause) {
            // PASS THE ROOT ENTRY TIME to calculate relative diff
            const causeStyle = this.formatLogArgs(currentCause, entry.time);

            // We prepend a visual arrow and depth indicator to the cause
            // \u21B3 is the '↳' symbol
            const prefixFormat = `%c\u21B3 Caused by:`;
            const prefixStyle = 'color: #94a3b8; font-family: monospace; margin-right: 4px;';

            console.log(
                prefixFormat + " " + causeStyle.format,
                prefixStyle,
                ...causeStyle.args,
                ...currentCause.content
            );

            currentCause = currentCause.cause;
            depth++;
        }

        // Close the single group
        console.groupEnd();
    }

    /**
     * Helper to generate the format string and style arguments for a single entry.
     * @param entry The log entry to format
     * @param relativeTo If provided, formats time as a delta (+/- ms/s) relative to this date
     */
    private static formatLogArgs(entry: LogEntry, relativeTo?: Date): { format: string, args: string[] } {
        const config = PALETTE[entry.level as keyof typeof PALETTE] || PALETTE.DEFAULT;

        // CHANGE: Determine Time String (Absolute vs Relative)
        let timeStr: string;

        if (relativeTo) {
            // Calculate Delta
            const diff = entry.time.getTime() - relativeTo.getTime();
            timeStr = this.formatTimeDelta(diff);
        } else {
            // Default: Absolute Time (HH:mm:ss.ms)
            timeStr = entry.time.toISOString().substring(11, 23);
        }

        // CSS Definitions
        const fontBase = 'font-family: ui-monospace, Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", "Roboto Mono", "Oxygen Mono", "Ubuntu Monospace", "Source Code Pro", "Fira Mono", "Droid Sans Mono", "Courier New", monospace;';

        // Compact font size
        const styleTime = `${fontBase} color: #6b7280; font-size: 9px; margin-right: 4px; line-height: 1.5; white-space: nowrap;`;

        const badgeBase = `
            ${fontBase}
            font-size: 10px;
            font-weight: bold;
            padding: 2px 6px;
            border-radius: 4px;
            line-height: 1;
        `;

        const styleLevel = `${badgeBase} 
            background-color: ${config.bg}; 
            color: ${config.text}; 
            border: 1px solid ${config.border};
        `;

        const styleModule = `${badgeBase} 
            background-color: #334155; 
            color: #e2e8f0; 
            border: 1px solid #475569;
            margin: 0 2px;
            font-weight: normal; 
        `;

        const styleReset = `${fontBase} color: inherit; margin-left: 5px;`;

        // Build Format String
        // Added padEnd to timeStr to ensure alignment between relative (shorter) and absolute timestamps if mixed visually
        let formatString = `%c${timeStr} %c${config.icon} ${entry.level.toUpperCase()}`;
        const args: string[] = [styleTime, styleLevel];

        entry.modules.forEach((mod, i) => {
            formatString += `%c${i == 0 ? " " : "/"}%c${mod}`;
            args.push("color: #94a3b8;");
            args.push(styleModule);
        });

        formatString += '%c';
        args.push(styleReset);

        return { format: formatString, args };
    }

    /**
     * Converts milliseconds to a short, human-readable delta string.
     * Examples: +5ms, -12ms, +1.2s, +5m, +1h
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