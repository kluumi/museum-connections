// Unified error handling utilities
// Pattern: Consistent error logging and user-facing messages

/**
 * Error categories for consistent handling
 */
export type ErrorCategory =
  | "media" // Camera/microphone errors
  | "webrtc" // WebRTC connection errors
  | "signaling" // WebSocket/signaling errors
  | "network" // Network connectivity errors
  | "permission" // Permission denied errors
  | "unknown"; // Fallback category

/**
 * Log level for error handling
 */
export type LogLevel = "info" | "warning" | "error";

/**
 * Extract a user-friendly error message from an unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    // Handle specific error types
    if (error.name === "NotAllowedError") {
      return "Permission refusée";
    }
    if (error.name === "NotFoundError") {
      return "Périphérique non trouvé";
    }
    if (error.name === "NotReadableError") {
      return "Périphérique occupé";
    }
    if (error.name === "OverconstrainedError") {
      return "Paramètres non supportés";
    }
    if (error.name === "AbortError") {
      return "Opération annulée";
    }
    if (error.name === "SecurityError") {
      return "Erreur de sécurité (HTTPS requis)";
    }
    if (error.name === "TypeError" && error.message.includes("fetch")) {
      return "Erreur réseau";
    }
    // Return the error message, truncated if too long
    const msg = error.message;
    return msg.length > 100 ? `${msg.slice(0, 100)}...` : msg;
  }
  if (typeof error === "string") {
    return error.length > 100 ? `${error.slice(0, 100)}...` : error;
  }
  return "Erreur inconnue";
}

/**
 * Categorize an error for appropriate handling
 */
export function categorizeError(error: unknown): ErrorCategory {
  if (error instanceof Error) {
    const name = error.name.toLowerCase();
    const msg = error.message.toLowerCase();

    // Media errors
    if (
      name.includes("notallowed") ||
      name.includes("notfound") ||
      name.includes("notreadable") ||
      name.includes("overconstrained") ||
      msg.includes("camera") ||
      msg.includes("microphone") ||
      msg.includes("getusermedia")
    ) {
      return "media";
    }

    // Permission errors
    if (name.includes("notallowed") || name.includes("security")) {
      return "permission";
    }

    // WebRTC errors
    if (
      msg.includes("rtc") ||
      msg.includes("ice") ||
      msg.includes("sdp") ||
      msg.includes("peer")
    ) {
      return "webrtc";
    }

    // Network/signaling errors
    if (
      msg.includes("websocket") ||
      msg.includes("network") ||
      msg.includes("fetch") ||
      msg.includes("connection")
    ) {
      return "network";
    }
  }
  return "unknown";
}

/**
 * Get emoji prefix for console logging based on category
 */
function getLogEmoji(category: ErrorCategory): string {
  switch (category) {
    case "media":
      return "📷";
    case "webrtc":
      return "🔌";
    case "signaling":
      return "📡";
    case "network":
      return "🌐";
    case "permission":
      return "🔒";
    default:
      return "❌";
  }
}

/**
 * Handle an error with consistent logging to both console and UI
 *
 * @param error - The error to handle
 * @param context - A brief description of what was being attempted (e.g., "Changement de caméra")
 * @param addLog - Optional callback to add log to UI console
 * @param options - Additional options for error handling
 */
export function handleError(
  error: unknown,
  context: string,
  addLog?: (message: string, level: LogLevel) => void,
  options?: {
    /** Override the error category */
    category?: ErrorCategory;
    /** Suppress console logging */
    silent?: boolean;
    /** Custom user-facing message */
    userMessage?: string;
  },
): void {
  const category = options?.category ?? categorizeError(error);
  const emoji = getLogEmoji(category);
  const errorMessage = options?.userMessage ?? getErrorMessage(error);

  // Always log to console with full details (unless silent)
  if (!options?.silent) {
    console.error(`${emoji} ${context}:`, error);
  }

  // Log to UI if callback provided
  if (addLog) {
    addLog(`${context}: ${errorMessage}`, "error");
  }
}

/**
 * Handle a warning with consistent logging
 */
export function handleWarning(
  message: string,
  context: string,
  addLog?: (message: string, level: LogLevel) => void,
  options?: {
    /** Suppress console logging */
    silent?: boolean;
  },
): void {
  if (!options?.silent) {
    console.warn(`⚠️ ${context}:`, message);
  }

  if (addLog) {
    addLog(`${context}: ${message}`, "warning");
  }
}

/**
 * Create a scoped error handler for a specific component/context
 * Useful when you have multiple error sources in the same component
 *
 * @example
 * const handleCameraError = createErrorHandler("Caméra", addLog);
 * handleCameraError(error); // Logs: "📷 Caméra: Permission refusée"
 */
export function createErrorHandler(
  context: string,
  addLog?: (message: string, level: LogLevel) => void,
  defaultCategory?: ErrorCategory,
) {
  return (error: unknown, subContext?: string) => {
    const fullContext = subContext ? `${context} - ${subContext}` : context;
    handleError(error, fullContext, addLog, { category: defaultCategory });
  };
}

/**
 * Wrap an async function with error handling
 * Returns the result or undefined if an error occurred
 *
 * @example
 * const result = await withErrorHandling(
 *   () => navigator.mediaDevices.getUserMedia({ video: true }),
 *   "Accès caméra",
 *   addLog
 * );
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  context: string,
  addLog?: (message: string, level: LogLevel) => void,
  options?: {
    category?: ErrorCategory;
    silent?: boolean;
    userMessage?: string;
    /** Rethrow the error after handling */
    rethrow?: boolean;
  },
): Promise<T | undefined> {
  try {
    return await fn();
  } catch (error) {
    handleError(error, context, addLog, options);
    if (options?.rethrow) {
      throw error;
    }
    return undefined;
  }
}
