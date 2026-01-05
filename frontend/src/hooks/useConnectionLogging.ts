// useConnectionLogging - Logs signaling and WebRTC connection state changes
// Pattern: Extracted from SenderDashboard for better modularity

import { useEffect, useRef } from "react";
import { ConnectionState } from "@/constants/connection-states";

export interface UseConnectionLoggingOptions {
  // Signaling state
  isSignalingConnected: boolean;
  notifyPageOpened: () => void;

  // WebRTC state
  webrtcConnectionState: ConnectionState;
  targetCity: string;

  // Logging
  addLog: (
    message: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void;

  /**
   * If true, skip sending page_opened notification.
   * Used when auto-restart is pending - we'll send stream_started instead.
   */
  skipPageOpened?: boolean;
}

/**
 * Hook that logs connection state changes for signaling and WebRTC.
 * - Notifies server when page opens (on signaling connection)
 * - Logs WebRTC connection state changes
 *
 * Note: Signaling connection is logged by StreamManager, not here (to avoid duplicates)
 */
export function useConnectionLogging({
  isSignalingConnected,
  notifyPageOpened,
  webrtcConnectionState,
  targetCity,
  addLog,
  skipPageOpened = false,
}: UseConnectionLoggingOptions): void {
  // Notify server when signaling connects (but don't log - StreamManager handles that)
  // Skip if auto-restart is pending - we'll send stream_started instead
  const hasNotifiedPageOpened = useRef(false);
  useEffect(() => {
    if (
      isSignalingConnected &&
      !hasNotifiedPageOpened.current &&
      !skipPageOpened
    ) {
      hasNotifiedPageOpened.current = true;
      notifyPageOpened();
    } else if (!isSignalingConnected) {
      hasNotifiedPageOpened.current = false;
    }
  }, [isSignalingConnected, notifyPageOpened, skipPageOpened]);

  // Log WebRTC connection state changes
  const prevWebRTCState = useRef<ConnectionState>(ConnectionState.DISCONNECTED);
  useEffect(() => {
    const state = webrtcConnectionState;
    if (state !== prevWebRTCState.current) {
      prevWebRTCState.current = state;
      if (state === ConnectionState.CONNECTED) {
        addLog(`Connecté à ${targetCity} via WebRTC`, "success");
      } else if (state === ConnectionState.FAILED) {
        addLog("Échec de la connexion WebRTC", "error");
      }
    }
  }, [webrtcConnectionState, targetCity, addLog]);
}
