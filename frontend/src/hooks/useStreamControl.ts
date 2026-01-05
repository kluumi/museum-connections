// useStreamControl - Manages stream start/stop actions
// Pattern: Encapsulates the complexity of starting and stopping WebRTC streams

import { useCallback } from "react";
import type { SenderNodeId } from "@/constants/node-ids";
import { getErrorMessage } from "@/lib/errors";
import type { SignalingService } from "@/services/signaling-service";
import { useSettingsStore } from "@/stores";
import type { VideoSettings } from "@/types";
import type { UseStreamStateReturn } from "./useStreamState";

export interface UseStreamControlOptions {
  nodeId: SenderNodeId;
  selectedCameraId: string | null;
  localStream: MediaStream | null;
  signalingService: SignalingService | null;
  isSignalingConnected: boolean;
  streamState: UseStreamStateReturn;
  webrtcConnectionsRef: React.MutableRefObject<
    Map<
      unknown,
      {
        setPreferredCodec: (codec: string) => void;
        setVideoBitrate: (bitrate: number) => void;
      }
    >
  >;
  primaryWebrtc: { createOffer: () => Promise<unknown> };
  closeAllOperatorConnections: () => void;
  closePrimaryWebrtc: () => void;
  addLog: (
    message: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void;
}

export interface UseStreamControlResult {
  /** Start streaming to all targets */
  handleStartStream: () => void;
  /** Stop streaming and close all connections */
  handleStopStream: () => void;
}

/**
 * Hook to manage stream start/stop lifecycle.
 * Coordinates WebRTC, signaling, and state management.
 */
export function useStreamControl({
  nodeId,
  selectedCameraId,
  localStream,
  signalingService,
  isSignalingConnected,
  streamState,
  webrtcConnectionsRef,
  primaryWebrtc,
  closeAllOperatorConnections,
  closePrimaryWebrtc,
  addLog,
}: UseStreamControlOptions): UseStreamControlResult {
  const { setStreamingState } = useSettingsStore();

  const handleStartStream = useCallback(() => {
    if (!localStream) {
      addLog("Aucun flux local disponible", "error");
      return;
    }
    if (!isSignalingConnected) {
      addLog("Non connecté au serveur de signalisation", "error");
      return;
    }

    streamState.startStreaming();
    addLog("Démarrage du flux...", "info");
    setStreamingState(nodeId, true);

    // Apply settings and create offer
    const startWebRTC = async () => {
      try {
        const currentSettings = useSettingsStore
          .getState()
          .getPersistedVideoSettings(nodeId, selectedCameraId);

        // Apply settings to all OBS connections
        applySettingsToConnections(
          webrtcConnectionsRef.current,
          currentSettings,
        );

        // Create offer for primary target
        await primaryWebrtc.createOffer();
        signalingService?.notifyStreamStarted();
        streamState.streamingStarted();
        addLog("Flux démarré", "success");
      } catch (err) {
        streamState.setError(getErrorMessage(err));
        addLog(`Erreur démarrage: ${getErrorMessage(err)}`, "error");
      }
    };

    startWebRTC();
  }, [
    localStream,
    isSignalingConnected,
    signalingService,
    streamState,
    nodeId,
    selectedCameraId,
    setStreamingState,
    webrtcConnectionsRef,
    primaryWebrtc,
    addLog,
  ]);

  const handleStopStream = useCallback(() => {
    streamState.stopStreaming();
    addLog("Arrêt du flux...", "info");

    // Close all operator connections
    closeAllOperatorConnections();

    // Close primary WebRTC
    closePrimaryWebrtc();

    // Notify signaling
    signalingService?.notifyStreamStopped("manual");
    setStreamingState(nodeId, false);
    streamState.streamingStopped();
    addLog("Flux arrêté", "info");
  }, [
    streamState,
    closeAllOperatorConnections,
    closePrimaryWebrtc,
    signalingService,
    nodeId,
    setStreamingState,
    addLog,
  ]);

  return {
    handleStartStream,
    handleStopStream,
  };
}

/** Helper to apply video settings to all connections */
function applySettingsToConnections(
  connections: Map<
    unknown,
    {
      setPreferredCodec: (codec: string) => void;
      setVideoBitrate: (bitrate: number) => void;
    }
  >,
  settings: VideoSettings,
): void {
  for (const [, webrtcService] of connections.entries()) {
    if (settings.codec !== "auto") {
      webrtcService.setPreferredCodec(settings.codec);
    }
    if (settings.bitrate !== "auto") {
      webrtcService.setVideoBitrate(settings.bitrate);
    }
  }
}
