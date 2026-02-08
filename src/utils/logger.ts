type LogLevel = "info" | "warn" | "error" | "debug";

interface LogEntry {
    level: LogLevel;
    message: string;
    timestamp: string;
    data?: unknown;
}

const formatLog = (entry: LogEntry): string => {
    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]`;
    const dataStr = entry.data ? ` ${JSON.stringify(entry.data)}` : "";
    return `${prefix} ${entry.message}${dataStr}`;
};

const log = (level: LogLevel, message: string, data?: unknown): void => {
    const entry: LogEntry = {
        level,
        message,
        timestamp: new Date().toISOString(),
        data,
    };

    const formatted = formatLog(entry);

    switch (level) {
        case "error":
            console.error(formatted);
            break;
        case "warn":
            console.warn(formatted);
            break;
        case "debug":
            if (process.env.NODE_ENV !== "production") {
                console.debug(formatted);
            }
            break;
        default:
            console.log(formatted);
    }
};

export const logger = {
    info: (message: string, data?: unknown) => log("info", message, data),
    warn: (message: string, data?: unknown) => log("warn", message, data),
    error: (message: string, data?: unknown) => log("error", message, data),
    debug: (message: string, data?: unknown) => log("debug", message, data),
};
