// useOperatorConnections - Manages dynamic WebRTC connections to operator nodes
// Pattern: Manages a map of operator connections with lifecycle handling

import { useCallback, useRef } from "react";
import { ConnectionState } from "@/constants/connection-states";
import type { NodeId, SenderNodeId } from "@/constants/node-ids";
import type { SignalingService } from "@/services/signaling-service";
import { WebRTCService } from "@/services/webrtc-service";
import { useSettingsStore } from "@/stores";
import type { VideoSettings } from "@/types";

export interface UseOperatorConnectionsOptions {
  nodeId: SenderNodeId;
  signalingService: SignalingService | null;
  localStreamRef: React.MutableRefObject<MediaStream | null>;
  selectedCameraIdRef: React.MutableRefObject<string | null>;
}

export interface UseOperatorConnectionsResult {
  /** Map of operator ID to WebRTC service */
  operatorConnectionsRef: React.MutableRefObject<Map<string, WebRTCService>>;
  /** Create a new operator connection */
  createOperatorConnection: (operatorId: string) => WebRTCService | null;
  /** Send offer to an operator (creates connection if needed) */
  sendOfferToOperator: (operatorId: string) => void;
  /** Update all operator connections with a new track */
  updateAllOperatorTracks: (track: MediaStreamTrack) => Promise<void>;
  /** Close all operator connections */
  closeAllOperatorConnections: () => void;
  /** Apply settings to all operator connections */
  applySettingsToOperators: (settings: VideoSettings) => void;
}

/**
 * Hook to manage WebRTC connections to operator nodes.
 * Handles creation, track updates, and cleanup of operator connections.
 */
export function useOperatorConnections({
  nodeId,
  signalingService,
  localStreamRef,
  selectedCameraIdRef,
}: UseOperatorConnectionsOptions): UseOperatorConnectionsResult {
  const operatorConnectionsRef = useRef<Map<string, WebRTCService>>(new Map());

  const createOperatorConnection = useCallback(
    (operatorId: string): WebRTCService | null => {
      if (!signalingService) {
        console.warn(
          `⚠️ Cannot create operator connection: signaling not ready`,
        );
        return null;
      }

      console.log(`📡 Creating WebRTC connection for operator: ${operatorId}`);
      const service = new WebRTCService(
        nodeId,
        operatorId as NodeId,
        signalingService,
        {
          localStream: localStreamRef.current ?? undefined,
          onConnectionStateChange: (state) => {
            console.log(`📊 Operator ${operatorId} connection state: ${state}`);
            if (
              state === ConnectionState.FAILED ||
              state === ConnectionState.DISCONNECTED
            ) {
              // Clean up failed connections
              operatorConnectionsRef.current.delete(operatorId);
            }
          },
        },
      );
      operatorConnectionsRef.current.set(operatorId, service);

      // Apply persisted video settings to the new connection
      const currentSettings = useSettingsStore
        .getState()
        .getPersistedVideoSettings(nodeId, selectedCameraIdRef.current);
      if (currentSettings.bitrate !== "auto") {
        service.setVideoBitrate(currentSettings.bitrate);
      }
      if (currentSettings.codec !== "auto") {
        service.setPreferredCodec(currentSettings.codec);
      }

      return service;
    },
    [nodeId, signalingService, localStreamRef, selectedCameraIdRef],
  );

  const sendOfferToOperator = useCallback(
    (operatorId: string) => {
      let operatorService = operatorConnectionsRef.current.get(operatorId);

      if (!operatorService) {
        operatorService = createOperatorConnection(operatorId) ?? undefined;
      }

      if (operatorService && localStreamRef.current) {
        console.log(`📡 Sending offer to operator ${operatorId}`);
        operatorService.setLocalStream(localStreamRef.current);

        const currentSettings = useSettingsStore
          .getState()
          .getPersistedVideoSettings(nodeId, selectedCameraIdRef.current);
        if (currentSettings.codec !== "auto") {
          operatorService.setPreferredCodec(currentSettings.codec);
        }
        if (currentSettings.bitrate !== "auto") {
          operatorService.setVideoBitrate(currentSettings.bitrate);
        }

        operatorService.createOffer();
      }
    },
    [nodeId, createOperatorConnection, localStreamRef, selectedCameraIdRef],
  );

  const updateAllOperatorTracks = useCallback(
    async (track: MediaStreamTrack) => {
      const connections = Array.from(operatorConnectionsRef.current.entries());
      console.log(`🔄 Updating ${connections.length} operator connections`);
      for (const [, webrtc] of connections) {
        await webrtc.replaceTrack(track);
      }
    },
    [],
  );

  const closeAllOperatorConnections = useCallback(() => {
    for (const [operatorId, service] of operatorConnectionsRef.current) {
      console.log(`🔌 Closing operator connection: ${operatorId}`);
      service.destroy();
    }
    operatorConnectionsRef.current.clear();
  }, []);

  const applySettingsToOperators = useCallback((settings: VideoSettings) => {
    for (const [, service] of operatorConnectionsRef.current) {
      if (settings.codec !== "auto") {
        service.setPreferredCodec(settings.codec);
      }
      if (settings.bitrate !== "auto") {
        service.setVideoBitrate(settings.bitrate);
      }
    }
  }, []);

  return {
    operatorConnectionsRef,
    createOperatorConnection,
    sendOfferToOperator,
    updateAllOperatorTracks,
    closeAllOperatorConnections,
    applySettingsToOperators,
  };
}
