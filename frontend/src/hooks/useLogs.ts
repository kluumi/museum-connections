// useLogs - Manages log entries for console display
// Pattern: Simple state management for log entries with auto-cleanup

import { useCallback, useState } from "react";

/** Log entry for console display */
export interface LogEntry {
  id: string;
  timestamp: Date;
  message: string;
  level: "info" | "warning" | "error" | "success";
}

/** Create a new log entry with unique ID */
export function createLogEntry(
  message: string,
  level: LogEntry["level"] = "info",
): LogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    timestamp: new Date(),
    message,
    level,
  };
}

export interface UseLogsOptions {
  /** Maximum number of logs to keep (default: 100) */
  maxLogs?: number;
}

export interface UseLogsResult {
  /** Current log entries */
  logs: LogEntry[];
  /** Add a new log entry */
  addLog: (message: string, level?: LogEntry["level"]) => void;
  /** Clear all logs */
  clearLogs: () => void;
}

/**
 * Hook to manage log entries for console display.
 * Automatically maintains a maximum number of entries.
 */
export function useLogs({ maxLogs = 100 }: UseLogsOptions = {}): UseLogsResult {
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = useCallback(
    (message: string, level: LogEntry["level"] = "info") => {
      setLogs((prev) => [
        ...prev.slice(-(maxLogs - 1)),
        createLogEntry(message, level),
      ]);
    },
    [maxLogs],
  );

  const clearLogs = useCallback(() => {
    setLogs([]);
  }, []);

  return { logs, addLog, clearLogs };
}
