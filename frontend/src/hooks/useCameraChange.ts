// useCameraChange - Handles camera selection changes with hot-swap support
// Pattern: Extracted from SenderDashboard for better modularity

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import type { SenderNodeId } from "@/constants/node-ids";
import { handleError } from "@/lib/errors";
import { useSettingsStore } from "@/stores";
import type { VideoSettings } from "@/types";

export interface UseCameraChangeOptions {
  nodeId: SenderNodeId;
  selectedCameraId: string | null;
  selectedMicrophoneId: string | null;
  isStreaming: boolean;
  cameras: MediaDeviceInfo[];
  videoRef: RefObject<HTMLVideoElement | null>;
  localStreamRef: RefObject<MediaStream | null>;

  // Media functions
  startMedia: (options?: {
    cameraId?: string;
    microphoneId?: string;
  }) => Promise<MediaStream | null>;
  replaceVideoTrack: (deviceId: string) => Promise<MediaStreamTrack | null>;
  applyVideoConstraints: (
    settings: VideoSettings,
  ) => Promise<{ track: MediaStreamTrack; resolutionMatched: boolean } | null>;

  // Track update callback
  updateAllConnectionTracks: (track: MediaStreamTrack) => Promise<void>;

  // State setters
  setIsVideoReady: (ready: boolean) => void;
  setIsLoadingCamera: (loading: boolean) => void;

  // Logging
  addLog: (
    message: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void;

  /**
   * Optional initial stream from enumerateDevices.
   * If provided for the first camera selection, this stream is used directly
   * instead of calling startMedia(), avoiding an extra getUserMedia call.
   */
  initialStream?: MediaStream | null;

  /**
   * Callback to clear the initial stream after it's been used.
   * Called after the stream is applied to prevent re-use on subsequent camera changes.
   */
  clearInitialStream?: () => void;

  /**
   * Callback to adopt the initial stream into the useUserMedia hook's state.
   * This ensures the stream is properly tracked for future operations.
   */
  adoptStream?: (stream: MediaStream) => void;
}

/**
 * Hook to handle camera selection changes.
 * - First selection: starts preview
 * - While not streaming: restarts preview with new camera
 * - While streaming: hot-swaps video track without interruption
 * - Applies persisted video settings after camera change
 */
export function useCameraChange({
  nodeId,
  selectedCameraId,
  selectedMicrophoneId,
  isStreaming,
  cameras,
  videoRef,
  localStreamRef,
  startMedia,
  replaceVideoTrack,
  applyVideoConstraints,
  updateAllConnectionTracks,
  setIsVideoReady,
  setIsLoadingCamera,
  addLog,
  initialStream,
  clearInitialStream,
  adoptStream,
}: UseCameraChangeOptions): void {
  const prevCameraIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevCameraIdRef.current;
    const cameraChanged = selectedCameraId && selectedCameraId !== prevId;

    // Only log when camera actually changes (not on every effect run)
    if (cameraChanged) {
      console.log(
        "📷 Camera changed from",
        prevId ?? "none",
        "to",
        selectedCameraId,
      );

      const doHandleCameraChange = async () => {
        try {
          // Reset video ready state when camera changes
          setIsVideoReady(false);
          setIsLoadingCamera(true);

          // First camera selection OR changing camera while not streaming: (re)start the preview
          if (!isStreaming) {
            console.log("📷 Camera selection - starting/restarting preview");

            let stream: MediaStream | null = null;

            // OPTIMIZATION: Check if stream was already set by initDevices using adoptStream
            // This happens when enumerateDevices returns an initialStream that initDevices
            // directly applies to the video element before this effect runs
            if (localStreamRef.current && prevId === null) {
              console.log(
                "📷 Stream already adopted by initDevices, skipping getUserMedia",
              );
              stream = localStreamRef.current;
              // Already adopted, just set the loading state
              setIsLoadingCamera(false);
              if (stream && videoRef.current && !videoRef.current.srcObject) {
                videoRef.current.srcObject = stream;
              }
              // Don't log camera change - initDevices already logged it
            } else if (initialStream && prevId === null) {
              // Alternative path: initialStream was set before this effect ran
              console.log(
                "📷 Using initial stream from enumerateDevices (skipping getUserMedia)",
              );
              stream = initialStream;
              // Adopt the stream into useUserMedia's state so it's properly tracked
              adoptStream?.(stream);
              // Clear it so we don't reuse it on subsequent camera changes
              clearInitialStream?.();
              setIsLoadingCamera(false);
              if (stream && videoRef.current) {
                videoRef.current.srcObject = stream;
              }
              // Log camera change with device name
              const cameraName =
                cameras.find((c) => c.deviceId === selectedCameraId)?.label ||
                selectedCameraId;
              addLog(`Caméra changée: ${cameraName}`, "info");
            } else {
              // Normal path: get a new stream via getUserMedia
              stream = await startMedia({
                cameraId: selectedCameraId ?? undefined,
                microphoneId: selectedMicrophoneId ?? undefined,
              });
              setIsLoadingCamera(false);
              if (stream && videoRef.current) {
                videoRef.current.srcObject = stream;
              }
              // Log camera change with device name
              const cameraName =
                cameras.find((c) => c.deviceId === selectedCameraId)?.label ||
                selectedCameraId;
              addLog(`Caméra changée: ${cameraName}`, "info");
            }
          }
          // Already streaming: hot-swap the camera track
          else {
            console.log("📷 Calling replaceVideoTrack with:", selectedCameraId);
            const newTrack = await replaceVideoTrack(selectedCameraId);

            setIsLoadingCamera(false);
            if (newTrack) {
              // Update all WebRTC connections with the new video track
              await updateAllConnectionTracks(newTrack);
              // Log camera change with device name
              const cameraName =
                cameras.find((c) => c.deviceId === selectedCameraId)?.label ||
                selectedCameraId;
              addLog(`Caméra changée: ${cameraName}`, "info");
              // Set video ready since track replacement doesn't trigger onCanPlay/onPlaying
              setIsVideoReady(true);
            }
          }

          // Apply persisted video settings for this camera (if they exist and are not all auto)
          // Small delay to ensure stream is ready
          await new Promise((resolve) => setTimeout(resolve, 50));

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
              // Only warn if resolution wasn't available
              if (!result.resolutionMatched) {
                addLog(
                  `${persistedSettings.resolution} non supportée`,
                  "warning",
                );
              }

              // If streaming, also update WebRTC with the new settings track
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

    // Always update the ref to track the current selection
    prevCameraIdRef.current = selectedCameraId;
  }, [
    selectedCameraId,
    selectedMicrophoneId,
    isStreaming,
    cameras,
    videoRef,
    localStreamRef,
    startMedia,
    replaceVideoTrack,
    applyVideoConstraints,
    updateAllConnectionTracks,
    setIsVideoReady,
    setIsLoadingCamera,
    addLog,
    nodeId,
    initialStream,
    clearInitialStream,
    adoptStream,
  ]);
}
