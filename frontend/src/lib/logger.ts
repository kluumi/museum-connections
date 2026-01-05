// Centralized debug logging with consistent formatting
// Pattern: Category-based logging with emoji prefixes and optional filtering

/** Log categories with their emoji prefixes */
export const LOG_PREFIXES = {
  // Connection & state
  success: "✅",
  error: "❌",
  warning: "⚠️",
  info: "ℹ️",

  // WebRTC & media
  webrtc: "📡",
  media: "🎬",
  stats: "📊",
  track: "🎥",
  audio: "🔊",

  // Signaling
  signaling: "🔌",
  message: "📩",

  // Actions
  start: "▶️",
  stop: "⏹️",
  retry: "🔄",
  reconnect: "🔄",
  stream: "📺",

  // Device
  camera: "📷",
  microphone: "🎤",
  speaker: "🔈",

  // Network
  network: "📶",
  page: "🌐",
  heartbeat: "💓",

  // Debug
  debug: "🐛",
} as const;

export type LogCategory = keyof typeof LOG_PREFIXES;

/** Log levels for filtering */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Logger configuration */
interface LoggerConfig {
  /** Minimum log level to output (default: "debug" in dev, "warn" in prod) */
  minLevel?: LogLevel;
  /** Categories to enable (default: all) */
  enabledCategories?: LogCategory[];
  /** Whether to include timestamps (default: false) */
  showTimestamp?: boolean;
  /** Whether to show category in output (default: true) */
  showCategory?: boolean;
}

const LOG_LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Create a logger instance with consistent formatting.
 *
 * @example
 * const logger = createLogger({ minLevel: "info" });
 *
 * logger.info("webrtc", "Connection established");
 * // Output: 📡 [webrtc] Connection established
 *
 * logger.error("signaling", "Failed to connect", error);
 * // Output: ❌ [signaling] Failed to connect Error: ...
 *
 * // Category-specific loggers
 * const webrtcLogger = logger.category("webrtc");
 * webrtcLogger.info("Sending offer");
 * // Output: 📡 [webrtc] Sending offer
 */
export function createLogger(config: LoggerConfig = {}) {
  const isDev = import.meta.env?.DEV ?? true;
  const minLevel = config.minLevel ?? (isDev ? "debug" : "warn");
  const enabledCategories = config.enabledCategories;
  const showTimestamp = config.showTimestamp ?? false;
  const showCategory = config.showCategory ?? true;

  function shouldLog(level: LogLevel, category?: LogCategory): boolean {
    if (LOG_LEVEL_ORDER[level] < LOG_LEVEL_ORDER[minLevel]) {
      return false;
    }
    if (
      enabledCategories &&
      category &&
      !enabledCategories.includes(category)
    ) {
      return false;
    }
    return true;
  }

  function formatMessage(
    category: LogCategory | undefined,
    message: string,
  ): string {
    const parts: string[] = [];

    if (showTimestamp) {
      parts.push(`[${new Date().toISOString()}]`);
    }

    if (category) {
      const prefix = LOG_PREFIXES[category] || "";
      if (showCategory) {
        parts.push(`${prefix} [${category}]`);
      } else {
        parts.push(prefix);
      }
    }

    parts.push(message);
    return parts.join(" ");
  }

  function log(
    level: LogLevel,
    category: LogCategory | undefined,
    message: string,
    ...args: unknown[]
  ): void {
    if (!shouldLog(level, category)) return;

    const formatted = formatMessage(category, message);
    const consoleFn =
      level === "error"
        ? console.error
        : level === "warn"
          ? console.warn
          : console.log;

    if (args.length > 0) {
      consoleFn(formatted, ...args);
    } else {
      consoleFn(formatted);
    }
  }

  return {
    debug: (category: LogCategory, message: string, ...args: unknown[]) =>
      log("debug", category, message, ...args),

    info: (category: LogCategory, message: string, ...args: unknown[]) =>
      log("info", category, message, ...args),

    warn: (category: LogCategory, message: string, ...args: unknown[]) =>
      log("warn", category, message, ...args),

    error: (category: LogCategory, message: string, ...args: unknown[]) =>
      log("error", category, message, ...args),

    /** Create a category-specific logger */
    category: (category: LogCategory) => ({
      debug: (message: string, ...args: unknown[]) =>
        log("debug", category, message, ...args),
      info: (message: string, ...args: unknown[]) =>
        log("info", category, message, ...args),
      warn: (message: string, ...args: unknown[]) =>
        log("warn", category, message, ...args),
      error: (message: string, ...args: unknown[]) =>
        log("error", category, message, ...args),
    }),

    /** Raw log with custom prefix (for backwards compatibility) */
    raw: (prefix: string, message: string, ...args: unknown[]) => {
      if (args.length > 0) {
        console.log(`${prefix} ${message}`, ...args);
      } else {
        console.log(`${prefix} ${message}`);
      }
    },
  };
}

/** Default logger instance */
export const logger = createLogger();

/** Category-specific loggers for common use cases */
export const webrtcLogger = logger.category("webrtc");
export const signalingLogger = logger.category("signaling");
export const mediaLogger = logger.category("media");
export const statsLogger = logger.category("stats");
