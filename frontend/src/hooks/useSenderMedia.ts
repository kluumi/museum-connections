// useSenderMedia - Handles camera and microphone selection with hot-swapping
// Pattern: Extracted from SenderDashboard to reduce monolith complexity

import { useEffect, useRef, useState } from "react";
import type { SenderNodeId } from "@/constants/node-ids";
import { handleError } from "@/lib/errors";
import type { StreamSlice } from "@/stores";
import { useSettingsStore } from "@/stores";
import type { CameraCapabilities } from "@/stores/devicesSlice";
import { type UseMediaDevicesReturn, useMediaDevices } from "./useMediaDevices";
import { type UseUserMediaReturn, useUserMedia } from "./useUserMedia";

export interface UseSenderMediaOptions {
  nodeId: SenderNodeId;
  videoSettings: StreamSlice["videoSettings"];
  isStreaming: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  addLog: (
    message: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void;
  onTrackUpdate?: (track: MediaStreamTrack) => Promise<void>;
}

export interface UseSenderMediaResult {
  // Device lists
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  cameraCapabilities: CameraCapabilities | null;

  // Selected devices
  selectedCameraId: string | null;
  selectedMicrophoneId: string | null;

  // Device selection handlers
  setSelectedCamera: (id: string | null) => void;
  setSelectedMicrophone: (id: string | null) => void;

  // Stream
  localStream: MediaStream | null;
  localStreamRef: React.MutableRefObject<MediaStream | null>;

  // Media control
  startMedia: (options?: {
    cameraId?: string;
    microphoneId?: string;
  }) => Promise<MediaStream | null>;
  stopMedia: () => void;
  applyVideoConstraints: UseUserMediaReturn["applyVideoConstraints"];
  replaceVideoTrack: UseUserMediaReturn["replaceVideoTrack"];
  replaceAudioTrack: UseUserMediaReturn["replaceAudioTrack"];

  // Loading states
  isInitializing: boolean;
  isLoadingCamera: boolean;
  isVideoReady: boolean;
  setIsVideoReady: (ready: boolean) => void;

  // Device enumeration
  enumerateDevices: UseMediaDevicesReturn["enumerateDevices"];
}

/**
 * Hook that manages camera and microphone selection with hot-swapping.
 * Handles device enumeration, selection persistence, and track replacement during streaming.
 */
export function useSenderMedia({
  nodeId,
  videoSettings,
  isStreaming,
  videoRef,
  addLog,
  onTrackUpdate,
}: UseSenderMediaOptions): UseSenderMediaResult {
  // Device management
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

  // User media
  const {
    stream: localStream,
    start: startMedia,
    stop: stopMedia,
    replaceVideoTrack,
    replaceAudioTrack,
    applyVideoConstraints,
  } = useUserMedia({ videoSettings });

  // Local state
  const [isInitializing, setIsInitializing] = useState(true);
  const [isLoadingCamera, setIsLoadingCamera] = useState(false);
  const [isVideoReady, setIsVideoReady] = useState(false);

  // Refs
  const localStreamRef = useRef(localStream);
  const prevCameraIdRef = useRef<string | null>(null);
  const prevMicIdRef = useRef<string | null>(null);
  const hasAppliedInitialSettings = useRef(false);
  const hasEnumeratedDevices = useRef(false);

  // Keep stream ref in sync
  useEffect(() => {
    localStreamRef.current = localStream;
  }, [localStream]);

  // Initialize devices on mount
  useEffect(() => {
    if (hasEnumeratedDevices.current) return;
    hasEnumeratedDevices.current = true;

    const initDevices = async () => {
      const { cameraId } = await enumerateDevices();
      console.log("📹 initDevices - devices enumerated");

      if (cameraId) {
        setIsLoadingCamera(true);
      } else {
        addLog("Sélectionnez une caméra", "warning");
      }
      setIsInitializing(false);
    };

    initDevices();
  }, [enumerateDevices, addLog]);

  // Handle camera selection changes
  useEffect(() => {
    const prevId = prevCameraIdRef.current;
    const cameraChanged = selectedCameraId && selectedCameraId !== prevId;

    console.log("📷 Camera effect:", {
      selectedCameraId,
      prevId,
      isStreaming,
      cameraChanged,
      hasLocalStream: !!localStream,
    });

    if (cameraChanged) {
      console.log(
        "📷 Camera changed from",
        prevId ?? "none",
        "to",
        selectedCameraId,
      );

      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Camera change handling with hot-swap and state management
      const doHandleCameraChange = async () => {
        try {
          setIsVideoReady(false);
          setIsLoadingCamera(true);

          // Not streaming: start/restart the preview
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
          }
          // Already streaming: hot-swap the camera track
          else {
            console.log("📷 Calling replaceVideoTrack with:", selectedCameraId);
            const newTrack = await replaceVideoTrack(selectedCameraId);

            setIsLoadingCamera(false);
            if (newTrack) {
              // Update all WebRTC connections
              if (onTrackUpdate) {
                await onTrackUpdate(newTrack);
              }
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
              if (isStreaming && onTrackUpdate) {
                await onTrackUpdate(result.track);
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
    localStream,
    nodeId,
    replaceVideoTrack,
    applyVideoConstraints,
    addLog,
    startMedia,
    cameras,
    videoRef,
    onTrackUpdate,
  ]);

  // Handle microphone selection changes
  useEffect(() => {
    const prevId = prevMicIdRef.current;
    const micChanged = selectedMicrophoneId && selectedMicrophoneId !== prevId;

    console.log("🎤 Mic effect:", {
      selectedMicrophoneId,
      prevId,
      isStreaming,
      hasStream: !!localStream,
      micChanged,
    });

    if (micChanged) {
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Mic change handling with hot-swap during stream
      const doHandleMicChange = async () => {
        try {
          // Not streaming: restart preview with new mic
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
          }
          // Already streaming: hot-swap the audio track
          else {
            console.log("🎤 Hot-swapping mic to", selectedMicrophoneId);
            const newTrack = await replaceAudioTrack(selectedMicrophoneId);

            if (newTrack && onTrackUpdate) {
              await onTrackUpdate(newTrack);
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
    localStream,
    replaceAudioTrack,
    startMedia,
    addLog,
    microphones,
    videoRef,
    onTrackUpdate,
  ]);

  // Apply persisted video settings when stream first becomes available
  useEffect(() => {
    if (
      !localStream ||
      !selectedCameraId ||
      hasAppliedInitialSettings.current
    ) {
      return;
    }

    const persistedSettings = useSettingsStore
      .getState()
      .getPersistedVideoSettings(nodeId, selectedCameraId);
    console.log("📹 Initial settings check:", {
      hasStream: !!localStream,
      cameraId: selectedCameraId,
      persistedSettings,
    });

    if (
      persistedSettings.resolution !== "auto" ||
      persistedSettings.fps !== "auto"
    ) {
      console.log("📹 Applying initial persisted settings:", persistedSettings);
      hasAppliedInitialSettings.current = true;

      const doApply = async () => {
        setIsVideoReady(false);
        const result = await applyVideoConstraints(persistedSettings);
        if (result && !result.resolutionMatched) {
          addLog(`${persistedSettings.resolution} non supportée`, "warning");
        }
      };
      doApply();
    } else {
      hasAppliedInitialSettings.current = true;
    }
  }, [localStream, selectedCameraId, nodeId, applyVideoConstraints, addLog]);

  // Update video element when stream changes
  useEffect(() => {
    if (videoRef.current && localStream) {
      videoRef.current.srcObject = localStream;
    }
  }, [localStream, videoRef]);

  return {
    // Device lists
    cameras,
    microphones,
    cameraCapabilities,

    // Selected devices
    selectedCameraId,
    selectedMicrophoneId,

    // Device selection handlers
    setSelectedCamera,
    setSelectedMicrophone,

    // Stream
    localStream,
    localStreamRef,

    // Media control
    startMedia,
    stopMedia,
    applyVideoConstraints,
    replaceVideoTrack,
    replaceAudioTrack,

    // Loading states
    isInitializing,
    isLoadingCamera,
    isVideoReady,
    setIsVideoReady,

    // Device enumeration
    enumerateDevices,
  };
}
