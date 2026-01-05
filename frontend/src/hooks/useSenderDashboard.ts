// useSenderDashboard - Facade hook for sender dashboard business logic
// Pattern: Facade that composes lower-level hooks and provides unified interface
// Reduces SenderDashboard complexity by extracting state management and side effects

import { useCallback, useEffect, useRef, useState } from "react";
import {
  isOperatorNode,
  NODE_PRIMARY_TARGET,
  NODE_TARGETS,
  NodeId,
  type SenderNodeId,
} from "@/constants/node-ids";
import { handleError } from "@/lib/errors";
import { eventBus } from "@/lib/events";
import { useSettingsStore } from "@/stores";
import type { CameraCapabilities } from "@/stores/devicesSlice";
import type { VideoSettings } from "@/types";
import { type LogEntry, useLogs } from "./useLogs";
import { type UseMediaDevicesReturn, useMediaDevices } from "./useMediaDevices";
import { useOperatorConnections } from "./useOperatorConnections";
import { useSenderSettings } from "./useSenderSettings";
import { type UseSignalingReturn, useSignaling } from "./useSignaling";
import { useStreamControl } from "./useStreamControl";
import { useStreamState } from "./useStreamState";
import { type UseUserMediaReturn, useUserMedia } from "./useUserMedia";
import { type UseWebRTCReturn, useWebRTC } from "./useWebRTC";

// Re-export for backwards compatibility
export type { LogEntry } from "./useLogs";
export { createLogEntry } from "./useLogs";

export interface UseSenderDashboardOptions {
  nodeId: SenderNodeId;
  videoRef: React.RefObject<HTMLVideoElement | null>;
}

export interface UseSenderDashboardResult {
  // Device management
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  cameraCapabilities: CameraCapabilities | null;
  selectedCameraId: string | null;
  selectedMicrophoneId: string | null;
  setSelectedCamera: (id: string | null) => void;
  setSelectedMicrophone: (id: string | null) => void;
  enumerateDevices: UseMediaDevicesReturn["enumerateDevices"];

  // Video settings (persisted)
  videoSettings: VideoSettings;
  setVideoSettings: (settings: Partial<VideoSettings>) => void;

  // Audio
  isAudioEnabled: boolean;
  setAudioEnabled: (enabled: boolean) => void;

  // Stream state
  isStreaming: boolean;
  streamLoading: boolean;
  streamLoadingType: "starting" | "stopping" | null;
  streamStartTime: number | null;
  canStart: boolean;
  canStop: boolean;

  // Local media
  localStream: MediaStream | null;
  localStreamRef: React.MutableRefObject<MediaStream | null>;

  // WebRTC connections
  webrtc: UseWebRTCReturn;
  webrtcConnectionsRef: React.MutableRefObject<Map<NodeId, UseWebRTCReturn>>;
  operatorConnectionsRef: ReturnType<
    typeof useOperatorConnections
  >["operatorConnectionsRef"];

  // Signaling
  signaling: UseSignalingReturn;

  // Loading states
  isInitializing: boolean;
  isLoadingCamera: boolean;
  isVideoReady: boolean;
  setIsVideoReady: (ready: boolean) => void;

  // Logs
  logs: LogEntry[];
  addLog: (message: string, level?: LogEntry["level"]) => void;

  // Blocked state (duplicate sender)
  blockedMessage: string | null;

  // Actions
  handleStartStream: () => void;
  handleStopStream: () => void;
  handleResetVideoSettings: () => void;
  updateAllConnectionTracks: (track: MediaStreamTrack) => Promise<void>;
  applyVideoConstraints: UseUserMediaReturn["applyVideoConstraints"];

  // Refs for remote control
  startStreamRef: React.MutableRefObject<(() => void) | null>;
  stopStreamRef: React.MutableRefObject<(() => void) | null>;

  // Computed values
  targets: readonly NodeId[];
  primaryTarget: NodeId;
  targetCity: string;
}

/**
 * Facade hook that composes all state management for SenderDashboard.
 * Provides a unified interface for device, stream, WebRTC, and signaling management.
 */
export function useSenderDashboard({
  nodeId,
  videoRef,
}: UseSenderDashboardOptions): UseSenderDashboardResult {
  // ============================================
  // Logging
  // ============================================
  const { logs, addLog } = useLogs();

  // ============================================
  // Device Management
  // ============================================
  const {
    cameras,
    microphones,
    cameraCapabilities,
    selectedCameraId,
    selectedMicrophoneId,
    enumerateDevices,
    selectCamera: setSelectedCamera,
    selectMicrophone: setSelectedMicrophone,
  } = useMediaDevices({ nodeId });

  // ============================================
  // Persisted Settings
  // ============================================
  const {
    videoSettings,
    setVideoSettings,
    resetVideoSettings,
    isAudioEnabled,
    setAudioEnabled,
  } = useSenderSettings({ nodeId, selectedCameraId });

  // ============================================
  // Stream State Machine
  // ============================================
  const streamState = useStreamState();
  const {
    isStreaming,
    isLoading: streamLoading,
    loadingType: streamLoadingType,
    state: { startedAt: streamStartTime },
    stateRef: streamStateRef,
    canStart,
    canStop,
  } = streamState;

  // ============================================
  // Local State
  // ============================================
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  // ============================================
  // User Media
  // ============================================
  const {
    stream: localStream,
    start: startMedia,
    stop: stopMedia,
    replaceVideoTrack,
    replaceAudioTrack,
    applyVideoConstraints,
  } = useUserMedia({ videoSettings });

  // ============================================
  // Computed Values
  // ============================================
  const targets = NODE_TARGETS[nodeId];
  const primaryTarget = NODE_PRIMARY_TARGET[nodeId];
  const targetCity = nodeId === NodeId.NANTES ? "Paris" : "Nantes";

  // ============================================
  // Refs
  // ============================================
  const webrtcConnectionsRef = useRef<Map<NodeId, UseWebRTCReturn>>(new Map());
  const localStreamRef = useRef(localStream);
  const selectedCameraIdRef = useRef(selectedCameraId);
  const startStreamRef = useRef<(() => void) | null>(null);
  const stopStreamRef = useRef<(() => void) | null>(null);

  // Keep refs in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  useEffect(() => {
    selectedCameraIdRef.current = selectedCameraId;
  }, [selectedCameraId]);

  // ============================================
  // Listen for duplicate sender block event
  // ============================================
  useEffect(() => {
    const unsubscribe = eventBus.on("signaling:blocked", (data) => {
      if (data.nodeId === nodeId && data.reason === "already_connected") {
        setBlockedMessage(data.message);
      }
    });
    return unsubscribe;
  }, [nodeId]);

  // ============================================
  // Signaling Setup
  // ============================================
  const signaling = useSignaling(nodeId, {
    onMessage: (message) => {
      // Operator request handling is done via operatorConnections below
      if (
        message.type === "request_offer" &&
        message.from &&
        isOperatorNode(message.from)
      ) {
        const currentlyStreaming =
          streamStateRef.current.status === "streaming";
        if (currentlyStreaming && localStreamRef.current) {
          operatorConnections.sendOfferToOperator(message.from);
        }
      }
    },
  });

  // ============================================
  // Operator Connections
  // ============================================
  const operatorConnections = useOperatorConnections({
    nodeId,
    signalingService: signaling.service,
    localStreamRef,
    selectedCameraIdRef,
  });

  // ============================================
  // Primary WebRTC Connection (OBS)
  // ============================================
  const webrtc = useWebRTC(nodeId, primaryTarget, signaling.service, {
    localStream,
  });

  // Register primary WebRTC in connections map
  useEffect(() => {
    webrtcConnectionsRef.current.set(primaryTarget, webrtc);
    return () => {
      webrtcConnectionsRef.current.delete(primaryTarget);
    };
  }, [primaryTarget, webrtc]);

  // ============================================
  // Track Update Helper
  // ============================================
  const updateAllConnectionTracks = useCallback(
    async (track: MediaStreamTrack) => {
      const obsConnections = Array.from(webrtcConnectionsRef.current.entries());
      console.log(`🔄 Updating ${obsConnections.length} OBS connections`);
      for (const [, webrtcService] of obsConnections) {
        await webrtcService.replaceTrack(track);
      }
      await operatorConnections.updateAllOperatorTracks(track);
    },
    [operatorConnections],
  );

  // ============================================
  // Stream Control
  // ============================================
  const { handleStartStream, handleStopStream } = useStreamControl({
    nodeId,
    selectedCameraId,
    localStream,
    signalingService: signaling.service,
    isSignalingConnected: signaling.isConnected,
    streamState,
    webrtcConnectionsRef,
    primaryWebrtc: webrtc,
    closeAllOperatorConnections:
      operatorConnections.closeAllOperatorConnections,
    closePrimaryWebrtc: webrtc.close,
    addLog,
  });

  // Set refs for remote control
  useEffect(() => {
    startStreamRef.current = handleStartStream;
    stopStreamRef.current = handleStopStream;
  }, [handleStartStream, handleStopStream]);

  // ============================================
  // Device Initialization
  // ============================================
  useEffect(() => {
    let mounted = true;

    const initDevices = async () => {
      try {
        const { cameraId } = await enumerateDevices();
        console.log("📹 initDevices - devices enumerated");

        if (!mounted) return;

        if (cameraId) {
          setIsLoadingCamera(true);
        } else {
          addLog("Sélectionnez une caméra", "warning");
        }
        setIsInitializing(false);
      } catch (err) {
        if (!mounted) return;
        handleError(err, "Initialisation des périphériques", addLog, {
          category: "media",
        });
        setIsInitializing(false);
      }
    };

    initDevices();

    return () => {
      mounted = false;
    };
  }, [enumerateDevices, addLog]);

  // ============================================
  // Camera Selection Change Handler
  // ============================================
  const prevCameraIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevCameraIdRef.current;
    const cameraChanged = selectedCameraId && selectedCameraId !== prevId;

    if (cameraChanged) {
      console.log(
        "📷 Camera changed from",
        prevId ?? "none",
        "to",
        selectedCameraId,
      );

      const doHandleCameraChange = async () => {
        try {
          setIsVideoReady(false);
          setIsLoadingCamera(true);

          if (!isStreaming) {
            console.log("📷 Camera selection - starting/restarting preview");
            const stream = await startMedia({
              cameraId: selectedCameraId ?? undefined,
              microphoneId: selectedMicrophoneId ?? undefined,
            });

            setIsLoadingCamera(false);
            if (stream && videoRef.current) {
              videoRef.current.srcObject = stream;
            }
            const cameraName =
              cameras.find((c) => c.deviceId === selectedCameraId)?.label ||
              selectedCameraId;
            addLog(`Caméra changée: ${cameraName}`, "info");
          } else {
            console.log("📷 Calling replaceVideoTrack with:", selectedCameraId);
            const newTrack = await replaceVideoTrack(selectedCameraId);

            setIsLoadingCamera(false);
            if (newTrack) {
              await updateAllConnectionTracks(newTrack);
              const cameraName =
                cameras.find((c) => c.deviceId === selectedCameraId)?.label ||
                selectedCameraId;
              addLog(`Caméra changée: ${cameraName}`, "info");
            }
          }

          // Apply persisted video settings for this camera
          await new Promise((resolve) => setTimeout(resolve, 100));

          const currentStream = localStreamRef.current;
          const persistedSettings = useSettingsStore
            .getState()
            .getPersistedVideoSettings(nodeId, selectedCameraId);

          if (
            currentStream &&
            (persistedSettings.resolution !== "auto" ||
              persistedSettings.fps !== "auto")
          ) {
            const result = await applyVideoConstraints(persistedSettings);
            if (result) {
              if (!result.resolutionMatched) {
                addLog(
                  `${persistedSettings.resolution} non supportée`,
                  "warning",
                );
              }
              if (isStreaming) {
                await updateAllConnectionTracks(result.track);
              }
            }
          }
        } catch (err) {
          setIsLoadingCamera(false);
          handleError(err, "Changement de caméra", addLog, {
            category: "media",
          });
        }
      };

      doHandleCameraChange();
    }

    prevCameraIdRef.current = selectedCameraId;
  }, [
    selectedCameraId,
    selectedMicrophoneId,
    isStreaming,
    nodeId,
    cameras,
    startMedia,
    replaceVideoTrack,
    applyVideoConstraints,
    updateAllConnectionTracks,
    addLog,
    videoRef,
  ]);

  // ============================================
  // Microphone Selection Change Handler
  // ============================================
  const prevMicIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevMicIdRef.current;
    const micChanged = selectedMicrophoneId && selectedMicrophoneId !== prevId;

    if (micChanged) {
      const doHandleMicChange = async () => {
        try {
          if (!isStreaming) {
            console.log("🎤 Mic selection - restarting preview with new mic");
            if (selectedCameraId) {
              const stream = await startMedia({
                cameraId: selectedCameraId,
                microphoneId: selectedMicrophoneId ?? undefined,
              });

              if (stream && videoRef.current) {
                videoRef.current.srcObject = stream;
              }
              const micName =
                microphones.find((m) => m.deviceId === selectedMicrophoneId)
                  ?.label || selectedMicrophoneId;
              addLog(`Microphone changé: ${micName}`, "info");
            }
          } else {
            console.log("🎤 Hot-swapping mic to", selectedMicrophoneId);
            const newTrack = await replaceAudioTrack(selectedMicrophoneId);

            if (newTrack) {
              await updateAllConnectionTracks(newTrack);
              const micName =
                microphones.find((m) => m.deviceId === selectedMicrophoneId)
                  ?.label || selectedMicrophoneId;
              addLog(`Microphone changé: ${micName}`, "info");
            }
          }
        } catch (err) {
          handleError(err, "Changement de microphone", addLog, {
            category: "media",
          });
        }
      };

      doHandleMicChange();
    }

    prevMicIdRef.current = selectedMicrophoneId;
  }, [
    selectedMicrophoneId,
    selectedCameraId,
    isStreaming,
    microphones,
    startMedia,
    replaceAudioTrack,
    updateAllConnectionTracks,
    addLog,
    videoRef,
  ]);

  // ============================================
  // Update video element when stream changes
  // ============================================
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream, videoRef]);

  // ============================================
  // Cleanup on unmount
  // ============================================
  useEffect(() => {
    return () => {
      // Clean up operator connections
      operatorConnections.closeAllOperatorConnections();

      // Stop media
      stopMedia();
    };
  }, [operatorConnections, stopMedia]);

  return {
    // Device management
    cameras,
    microphones,
    cameraCapabilities,
    selectedCameraId,
    selectedMicrophoneId,
    setSelectedCamera,
    setSelectedMicrophone,
    enumerateDevices,

    // Video settings
    videoSettings,
    setVideoSettings,

    // Audio
    isAudioEnabled,
    setAudioEnabled,

    // Stream state
    isStreaming,
    streamLoading,
    streamLoadingType,
    streamStartTime,
    canStart,
    canStop,

    // Local media
    localStream,
    localStreamRef,

    // WebRTC
    webrtc,
    webrtcConnectionsRef,
    operatorConnectionsRef: operatorConnections.operatorConnectionsRef,

    // Signaling
    signaling,

    // Loading states
    isInitializing,
    isLoadingCamera,
    isVideoReady,
    setIsVideoReady,

    // Logs
    logs,
    addLog,

    // Blocked state
    blockedMessage,

    // Actions
    handleStartStream,
    handleStopStream,
    handleResetVideoSettings: resetVideoSettings,
    updateAllConnectionTracks,
    applyVideoConstraints,

    // Refs
    startStreamRef,
    stopStreamRef,

    // Computed
    targets,
    primaryTarget,
    targetCity,
  };
}
