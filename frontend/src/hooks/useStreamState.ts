// useStreamState - State machine for stream lifecycle
// Pattern: Single source of truth for all stream-related states

import { useCallback, useRef, useState } from "react";

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
 * This provides a single source of truth for stream state,
 * replacing scattered isStreaming, streamLoading, and error states.
 *
 * @example
 * ```tsx
 * const stream = useStreamState();
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
export function useStreamState(): UseStreamStateReturn {
  const [state, setState] = useState<StreamState>(initialState);
  const stateRef = useRef<StreamState>(state);

  // Keep ref in sync
  stateRef.current = state;

  const startStreaming = useCallback(
    (initiatedBy: "local" | "remote" = "local") => {
      setState((prev) => {
        // Can only start from idle or error
        if (prev.status !== "idle" && prev.status !== "error") {
          console.warn(`⚠️ Cannot start streaming from state: ${prev.status}`);
          return prev;
        }
        console.log(
          `▶️ Stream state: ${prev.status} → starting (by ${initiatedBy})`,
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
        console.warn(
          `⚠️ streamingStarted called in unexpected state: ${prev.status}`,
        );
        // Allow it anyway if we're not already streaming (handles race conditions)
        if (prev.status === "streaming") {
          return prev;
        }
      }
      console.log(`✅ Stream state: ${prev.status} → streaming`);
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
          console.warn(`⚠️ Cannot stop streaming from state: ${prev.status}`);
          return prev;
        }
        console.log(
          `⏹️ Stream state: ${prev.status} → stopping (by ${initiatedBy})`,
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
        console.warn(
          `⚠️ streamingStopped called in unexpected state: ${prev.status}`,
        );
        if (prev.status === "idle") {
          return prev;
        }
      }
      console.log(`⏹️ Stream state: ${prev.status} → idle`);
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
      console.log(`❌ Stream state: ${prev.status} → error: ${error}`);
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
      console.log("🔄 Stream state: error → idle");
      return {
        status: "idle",
        startedAt: null,
        error: null,
        initiatedBy: null,
      };
    });
  }, []);

  const reset = useCallback(() => {
    console.log(`🔄 Stream state: ${stateRef.current.status} → idle (reset)`);
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
