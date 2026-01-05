// HeartbeatMonitor - Tracks heartbeat signals for multiple sources
// Pattern: Reusable utility for monitoring liveness via periodic heartbeats

/** Heartbeat status for a source */
export type HeartbeatStatus = "ok" | "warning" | "dead" | null;

/** Configuration for HeartbeatMonitor */
export interface HeartbeatMonitorConfig {
  /** Time in ms after which status becomes "warning" (default: 15000) */
  warningThresholdMs?: number;
  /** Time in ms after which status becomes "dead" (default: 30000) */
  deadThresholdMs?: number;
  /** Interval in ms for checking heartbeat status (default: 5000) */
  checkIntervalMs?: number;
}

/** Callback when a source's heartbeat status changes */
export type HeartbeatStatusChangeCallback = (
  sourceId: string,
  status: HeartbeatStatus,
  previousStatus: HeartbeatStatus,
) => void;

/** Internal state for each monitored source */
interface SourceHeartbeatState {
  lastHeartbeat: number | null;
  status: HeartbeatStatus;
}

/**
 * HeartbeatMonitor tracks liveness of multiple sources via heartbeat signals.
 *
 * @example
 * const monitor = new HeartbeatMonitor({
 *   onStatusChange: (sourceId, status, prev) => {
 *     console.log(`Source ${sourceId}: ${prev} -> ${status}`);
 *   },
 * });
 *
 * monitor.start();
 *
 * // When receiving a heartbeat from a source:
 * monitor.recordHeartbeat("nantes");
 *
 * // Check status:
 * const status = monitor.getStatus("nantes"); // "ok" | "warning" | "dead" | null
 *
 * // When source disconnects:
 * monitor.resetSource("nantes");
 *
 * // Cleanup:
 * monitor.stop();
 */
export class HeartbeatMonitor {
  private readonly sources = new Map<string, SourceHeartbeatState>();
  private checkInterval: ReturnType<typeof setInterval> | null = null;
  private readonly warningThresholdMs: number;
  private readonly deadThresholdMs: number;
  private readonly checkIntervalMs: number;
  private readonly onStatusChange?: HeartbeatStatusChangeCallback;

  constructor(
    config: HeartbeatMonitorConfig & {
      onStatusChange?: HeartbeatStatusChangeCallback;
    } = {},
  ) {
    this.warningThresholdMs = config.warningThresholdMs ?? 15000;
    this.deadThresholdMs = config.deadThresholdMs ?? 30000;
    this.checkIntervalMs = config.checkIntervalMs ?? 5000;
    this.onStatusChange = config.onStatusChange;
  }

  /**
   * Start monitoring heartbeats. Must be called to enable status checking.
   */
  start(): void {
    this.stop(); // Clear any existing interval

    this.checkInterval = setInterval(() => {
      this.checkAllSources();
    }, this.checkIntervalMs);
  }

  /**
   * Stop monitoring heartbeats and clear the check interval.
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
  }

  /**
   * Record a heartbeat from a source. Sets status to "ok" if not already.
   */
  recordHeartbeat(sourceId: string): void {
    let state = this.sources.get(sourceId);

    if (!state) {
      state = { lastHeartbeat: null, status: null };
      this.sources.set(sourceId, state);
    }

    state.lastHeartbeat = Date.now();

    if (state.status !== "ok") {
      const previousStatus = state.status;
      state.status = "ok";
      this.onStatusChange?.(sourceId, "ok", previousStatus);
    }
  }

  /**
   * Reset heartbeat tracking for a source (e.g., when it disconnects).
   */
  resetSource(sourceId: string): void {
    const state = this.sources.get(sourceId);
    if (state) {
      const previousStatus = state.status;
      state.lastHeartbeat = null;
      state.status = null;
      if (previousStatus !== null) {
        this.onStatusChange?.(sourceId, null, previousStatus);
      }
    }
  }

  /**
   * Get the current heartbeat status for a source.
   */
  getStatus(sourceId: string): HeartbeatStatus {
    return this.sources.get(sourceId)?.status ?? null;
  }

  /**
   * Get the last heartbeat timestamp for a source.
   */
  getLastHeartbeat(sourceId: string): number | null {
    return this.sources.get(sourceId)?.lastHeartbeat ?? null;
  }

  /**
   * Check all sources and update their status based on elapsed time.
   */
  private checkAllSources(): void {
    const now = Date.now();

    for (const [sourceId, state] of this.sources) {
      if (state.lastHeartbeat === null) continue;

      const elapsed = now - state.lastHeartbeat;
      let newStatus: HeartbeatStatus;

      if (elapsed > this.deadThresholdMs) {
        newStatus = "dead";
      } else if (elapsed > this.warningThresholdMs) {
        newStatus = "warning";
      } else {
        newStatus = "ok";
      }

      if (state.status !== newStatus) {
        const previousStatus = state.status;
        state.status = newStatus;
        this.onStatusChange?.(sourceId, newStatus, previousStatus);
      }
    }
  }

  /**
   * Remove a source from monitoring entirely.
   */
  removeSource(sourceId: string): void {
    this.sources.delete(sourceId);
  }

  /**
   * Destroy the monitor and clear all state.
   */
  destroy(): void {
    this.stop();
    this.sources.clear();
  }
}
