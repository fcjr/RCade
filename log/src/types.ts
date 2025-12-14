import type { LogEntry } from "./entry";

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG';

export interface RawLogObject {
    level: LogLevel;
    modules: string[];
    content: any[];
    time: number; // Stored as a timestamp number (Date.now())
    id: string;
    cause?: RawLogObject | undefined,
}

type LogHandlerMethod = (entry: LogEntry) => void;

export type LogHandler = LogHandlerMethod | { [LOG_HANDLER]: LogHandlerMethod };

export const LOG_HANDLER = Symbol("Log Handler");