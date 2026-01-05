// useStreamState - State machine for stream lifecycle
// Pattern: Single source of truth for all stream-related states
//
// This hook is THE authority for streaming state. It:
// 1. Manages the state machine (idle/starting/streaming/stopping/error)
// 2. Persists to localStorage for auto-restart on page refresh
// 3. Notifies StreamManager to keep its internal state in sync

import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";

/**
 * Stream state machine states
 *
 * Valid transitions:
 * - idle → starting (user clicks start)
 * - starting → streaming (WebRTC connected)
 * - starting → error (WebRTC failed)
 * - streaming → stopping (user clicks stop)
 * - streaming → error (connection lost)
 * - stopping → idle (WebRTC closed)
 * - error → starting (retry)
 * - error → idle (dismiss)
 */
export type StreamStatus =
  | "idle" // Not streaming, ready to start
  | "starting" // Start button clicked, waiting for WebRTC
  | "streaming" // Actively streaming
  | "stopping" // Stop button clicked, waiting for cleanup
  | "error"; // An error occurred

export interface StreamState {
  status: StreamStatus;
  startedAt: number | null; // Timestamp when streaming started (for timer)
  error: string | null; // Error message if status is "error"
  initiatedBy: "local" | "remote" | null; // Who initiated current action
}

// Callbacks for keeping external systems in sync
export interface StreamStateCallbacks {
  // Called when streaming state changes - used to sync StreamManager
  onStreamingStateChange?: (isStreaming: boolean) => void;
  // Called to persist state to localStorage - used for auto-restart
  persistState?: (isStreaming: boolean) => void;
}

export interface StreamStateActions {
  // Start streaming (called when start button clicked)
  startStreaming: (initiatedBy?: "local" | "remote") => void;

  // Mark streaming as active (called when WebRTC connected)
  streamingStarted: () => void;

  // Start stopping (called when stop button clicked)
  stopStreaming: (initiatedBy?: "local" | "remote") => void;

  // Mark as fully stopped (called when WebRTC closed)
  streamingStopped: () => void;

  // Set error state
  setError: (error: string) => void;

  // Clear error and go to idle
  clearError: () => void;

  // Reset to idle (force reset)
  reset: () => void;
}

export interface UseStreamStateReturn extends StreamStateActions {
  state: StreamState;

  // Derived convenience properties
  isStreaming: boolean;
  isLoading: boolean;
  loadingType: "starting" | "stopping" | null;
  canStart: boolean;
  canStop: boolean;
  hasError: boolean;

  // Ref for use in callbacks (avoids stale closure issues)
  stateRef: React.RefObject<StreamState>;
}

const initialState: StreamState = {
  status: "idle",
  startedAt: null,
  error: null,
  initiatedBy: null,
};

/**
 * Hook for managing stream lifecycle state machine
 *
 * This provides THE SINGLE SOURCE OF TRUTH for stream state,
 * replacing scattered isStreaming, streamLoading, and error states.
 *
 * All state changes flow through this hook:
 * - UI reads from this hook
 * - StreamManager is notified via callbacks
 * - localStorage is updated via callbacks (for auto-restart)
 *
 * @example
 * ```tsx
 * const stream = useStreamState({
 *   onStreamingStateChange: (isStreaming) => streamManager.setStreamingState(isStreaming),
 *   persistState: (isStreaming) => settingsStore.setStreamingState(nodeId, isStreaming),
 * });
 *
 * // In start handler
 * stream.startStreaming();
 * signaling.notifyStreamStarting();
 * await startMedia();
 * await webrtc.createOffer();
 * // streamingStarted() called when WebRTC connects
 *
 * // In component
 * <button disabled={!stream.canStart} onClick={handleStart}>
 *   {stream.loadingType === "starting" ? "Démarrage..." : "Démarrer"}
 * </button>
 * ```
 */
export function useStreamState(
  callbacks?: StreamStateCallbacks,
): UseStreamStateReturn {
  const [state, setState] = useState<StreamState>(initialState);
  const stateRef = useRef<StreamState>(state);
  const callbacksRef = useRef(callbacks);

  // Keep refs in sync
  stateRef.current = state;
  callbacksRef.current = callbacks;

  // Notify external systems when streaming state changes
  const prevIsStreaming = useRef(false);
  useEffect(() => {
    const isStreaming = state.status === "streaming";
    if (isStreaming !== prevIsStreaming.current) {
      prevIsStreaming.current = isStreaming;
      logger.debug(
        "stream",
        `Syncing streaming state: ${isStreaming} (status: ${state.status})`,
      );
      callbacksRef.current?.onStreamingStateChange?.(isStreaming);
      callbacksRef.current?.persistState?.(isStreaming);
    }
  }, [state.status]);

  const startStreaming = useCallback(
    (initiatedBy: "local" | "remote" = "local") => {
      setState((prev) => {
        // Can only start from idle or error
        if (prev.status !== "idle" && prev.status !== "error") {
          logger.warn(
            "stream",
            `Cannot start streaming from state: ${prev.status}`,
          );
          return prev;
        }
        logger.info(
          "stream",
          `Stream state: ${prev.status} → starting (by ${initiatedBy})`,
        );
        return {
          status: "starting",
          startedAt: null,
          error: null,
          initiatedBy,
        };
      });
    },
    [],
  );

  const streamingStarted = useCallback(() => {
    setState((prev) => {
      // Should only transition from starting
      if (prev.status !== "starting") {
        logger.warn(
          "stream",
          `streamingStarted called in unexpected state: ${prev.status}`,
        );
        // Allow it anyway if we're not already streaming (handles race conditions)
        if (prev.status === "streaming") {
          return prev;
        }
      }
      logger.info("stream", `Stream state: ${prev.status} → streaming`);
      return {
        ...prev,
        status: "streaming",
        startedAt: Date.now(),
        error: null,
      };
    });
  }, []);

  const stopStreaming = useCallback(
    (initiatedBy: "local" | "remote" = "local") => {
      setState((prev) => {
        // Can only stop from streaming
        if (prev.status !== "streaming") {
          logger.warn(
            "stream",
            `Cannot stop streaming from state: ${prev.status}`,
          );
          return prev;
        }
        logger.info(
          "stream",
          `Stream state: ${prev.status} → stopping (by ${initiatedBy})`,
        );
        return {
          ...prev,
          status: "stopping",
          initiatedBy,
        };
      });
    },
    [],
  );

  const streamingStopped = useCallback(() => {
    setState((prev) => {
      // Should transition from stopping, but also handle edge cases
      if (
        prev.status !== "stopping" &&
        prev.status !== "streaming" &&
        prev.status !== "starting"
      ) {
        logger.warn(
          "stream",
          `streamingStopped called in unexpected state: ${prev.status}`,
        );
        if (prev.status === "idle") {
          return prev;
        }
      }
      logger.info("stream", `Stream state: ${prev.status} → idle`);
      return {
        status: "idle",
        startedAt: null,
        error: null,
        initiatedBy: null,
      };
    });
  }, []);

  const setError = useCallback((error: string) => {
    setState((prev) => {
      logger.error("stream", `Stream state: ${prev.status} → error: ${error}`);
      return {
        ...prev,
        status: "error",
        error,
      };
    });
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => {
      if (prev.status !== "error") {
        return prev;
      }
      logger.info("stream", "Stream state: error → idle");
      return {
        status: "idle",
        startedAt: null,
        error: null,
        initiatedBy: null,
      };
    });
  }, []);

  const reset = useCallback(() => {
    logger.info(
      "stream",
      `Stream state: ${stateRef.current.status} → idle (reset)`,
    );
    setState(initialState);
  }, []);

  // Derived properties
  const isStreaming = state.status === "streaming";
  const isLoading = state.status === "starting" || state.status === "stopping";
  const loadingType =
    state.status === "starting"
      ? "starting"
      : state.status === "stopping"
        ? "stopping"
        : null;
  const canStart = state.status === "idle" || state.status === "error";
  const canStop = state.status === "streaming";
  const hasError = state.status === "error";

  return {
    state,
    stateRef,

    // Derived
    isStreaming,
    isLoading,
    loadingType,
    canStart,
    canStop,
    hasError,

    // Actions
    startStreaming,
    streamingStarted,
    stopStreaming,
    streamingStopped,
    setError,
    clearError,
    reset,
  };
}
