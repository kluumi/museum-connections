// useVideoSettingsSync - Synchronizes video settings changes with WebRTC connections
// Pattern: Extracted from SenderDashboard to reduce monolith complexity

import { useEffect, useRef } from "react";
import type { WebRTCService } from "@/services/webrtc";
import type { StreamSlice } from "@/stores";
import type { useWebRTC } from "./useWebRTC";

export interface UseVideoSettingsSyncOptions {
  videoSettings: StreamSlice["videoSettings"];
  localStream: MediaStream | null;
  isStreaming: boolean;
  applyVideoConstraints: (settings: StreamSlice["videoSettings"]) => Promise<{
    track: MediaStreamTrack;
    resolutionMatched: boolean;
  } | null>;
  addLog: (
    message: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void;
  setIsVideoReady: (ready: boolean) => void;
  onTrackUpdate?: (track: MediaStreamTrack) => Promise<void>;
  // WebRTC connections for applying bitrate/codec
  webrtcConnectionsRef: React.RefObject<
    Map<string, ReturnType<typeof useWebRTC>>
  >;
  operatorConnectionsRef: React.RefObject<Map<string, WebRTCService>>;
}

/**
 * Hook that synchronizes video settings changes with the media stream and WebRTC connections.
 * Handles resolution/fps changes (track replacement), bitrate changes, and codec changes.
 */
export function useVideoSettingsSync({
  videoSettings,
  localStream,
  isStreaming,
  applyVideoConstraints,
  addLog,
  setIsVideoReady,
  onTrackUpdate,
  webrtcConnectionsRef,
  operatorConnectionsRef,
}: UseVideoSettingsSyncOptions): void {
  const prevVideoSettingsRef = useRef(videoSettings);

  useEffect(() => {
    const prev = prevVideoSettingsRef.current;

    console.log("📊 Video settings effect triggered:", {
      current: videoSettings,
      prev,
      hasLocalStream: !!localStream,
    });

    // Skip if no local stream or if this is the initial mount
    if (!localStream || !prev) {
      console.log("📊 Skipping - no localStream or no prev");
      prevVideoSettingsRef.current = videoSettings;
      return;
    }

    // Check if resolution or fps changed - replace track with new constraints
    const resolutionChanged = prev.resolution !== videoSettings.resolution;
    const fpsChanged = prev.fps !== videoSettings.fps;

    console.log("📊 Change detection:", {
      resolutionChanged,
      fpsChanged,
      prevRes: prev.resolution,
      newRes: videoSettings.resolution,
    });

    // Update ref AFTER comparison
    prevVideoSettingsRef.current = videoSettings;

    if (resolutionChanged || fpsChanged) {
      console.log(
        "📊 Video settings changed, replacing track with new constraints:",
        {
          resolution: videoSettings.resolution,
          fps: videoSettings.fps,
        },
      );

      const doApplyConstraints = async () => {
        setIsVideoReady(false);
        const result = await applyVideoConstraints(videoSettings);
        if (result) {
          if (!result.resolutionMatched) {
            addLog(`${videoSettings.resolution} non supportée`, "warning");
          }

          // If streaming, update all WebRTC peer connections with the new track
          if (isStreaming && onTrackUpdate) {
            await onTrackUpdate(result.track);
          }
        }
      };

      doApplyConstraints();
    }

    // Check if bitrate changed - apply to all WebRTC connections (only when streaming)
    if (isStreaming && prev.bitrate !== videoSettings.bitrate) {
      console.log("📊 Bitrate changed:", videoSettings.bitrate);
      const obsConnections = Array.from(
        webrtcConnectionsRef.current?.entries() ?? [],
      );
      const operatorConnections = Array.from(
        operatorConnectionsRef.current?.entries() ?? [],
      );
      for (const [, webrtc] of obsConnections) {
        webrtc.setVideoBitrate(videoSettings.bitrate);
      }
      for (const [, webrtc] of operatorConnections) {
        webrtc.setVideoBitrate(videoSettings.bitrate);
      }
    }

    // Check if codec changed - apply to all WebRTC connections (only when streaming)
    // Note: Codec change requires renegotiation to take effect
    if (isStreaming && prev.codec !== videoSettings.codec) {
      console.log("📊 Codec changed:", videoSettings.codec);
      const obsConnections = Array.from(
        webrtcConnectionsRef.current?.entries() ?? [],
      );
      const operatorConnections = Array.from(
        operatorConnectionsRef.current?.entries() ?? [],
      );
      for (const [, webrtc] of obsConnections) {
        webrtc.setPreferredCodec(videoSettings.codec);
        // Trigger renegotiation to apply the new codec
        webrtc.createOffer().catch((err) => {
          console.warn("⚠️ Failed to renegotiate codec:", err);
        });
      }
      for (const [, webrtc] of operatorConnections) {
        webrtc.setPreferredCodec(videoSettings.codec);
        // Trigger renegotiation to apply the new codec
        webrtc.createOffer().catch((err) => {
          console.warn("⚠️ Failed to renegotiate codec:", err);
        });
      }
    }
  }, [
    videoSettings,
    localStream,
    isStreaming,
    applyVideoConstraints,
    addLog,
    setIsVideoReady,
    onTrackUpdate,
    webrtcConnectionsRef,
    operatorConnectionsRef,
  ]);
}
