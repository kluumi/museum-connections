// useMicrophoneChange - Handles microphone selection changes with hot-swap support
// Pattern: Extracted from SenderDashboard for better modularity

import type { RefObject } from "react";
import { useEffect, useRef } from "react";
import { handleError } from "@/lib/errors";

export interface UseMicrophoneChangeOptions {
  selectedMicrophoneId: string | null;
  selectedCameraId: string | null;
  isStreaming: boolean;
  microphones: MediaDeviceInfo[];
  videoRef: RefObject<HTMLVideoElement | null>;
  localStreamRef: RefObject<MediaStream | null>;

  // Media functions
  startMedia: (options?: {
    cameraId?: string;
    microphoneId?: string;
  }) => Promise<MediaStream | null>;
  replaceAudioTrack: (deviceId: string) => Promise<MediaStreamTrack | null>;

  // Track update callback
  updateAllConnectionTracks: (track: MediaStreamTrack) => Promise<void>;

  // State setters
  setIsVideoReady?: (ready: boolean) => void;
  setIsLoadingCamera?: (loading: boolean) => void;

  // Logging
  addLog: (
    message: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void;
}

/**
 * Hook to handle microphone selection changes.
 * - While not streaming: restarts preview with new microphone
 * - While streaming: hot-swaps audio track without interruption
 */
export function useMicrophoneChange({
  selectedMicrophoneId,
  selectedCameraId,
  isStreaming,
  microphones,
  videoRef,
  localStreamRef,
  startMedia,
  replaceAudioTrack,
  updateAllConnectionTracks,
  setIsVideoReady,
  setIsLoadingCamera,
  addLog,
}: UseMicrophoneChangeOptions): void {
  const prevMicIdRef = useRef<string | null>(null);

  useEffect(() => {
    const prevId = prevMicIdRef.current;
    // Handle mic change (including first selection)
    const micChanged = selectedMicrophoneId && selectedMicrophoneId !== prevId;

    // Only process when mic actually changes (not on every effect run)
    if (micChanged) {
      const doHandleMicChange = async () => {
        try {
          // Not streaming: restart preview with new mic (need camera too for video preview)
          if (!isStreaming) {
            // Only restart if we have a camera selected (otherwise no preview to update)
            if (selectedCameraId) {
              // OPTIMIZATION: On first mic selection (prevId === null), skip if:
              // 1. Stream already exists (adopted by initDevices), OR
              // 2. Stream doesn't exist yet but camera is also first selection
              //    (camera effect will handle creating the stream with both devices)
              // This prevents duplicate startMedia calls when both camera and mic
              // are selected simultaneously on page load.
              if (prevId === null) {
                if (localStreamRef.current) {
                  console.log(
                    "🎤 First mic selection: stream already exists, skipping startMedia",
                  );
                } else {
                  console.log(
                    "🎤 First mic selection: camera effect will create stream, skipping",
                  );
                }
                // Just log the mic selection
                const micName =
                  microphones.find((m) => m.deviceId === selectedMicrophoneId)
                    ?.label || selectedMicrophoneId;
                addLog(`Microphone: ${micName}`, "info");
              } else {
                // Subsequent mic change: get a new stream with new mic
                console.log("🎤 Mic changed - restarting preview with new mic");
                // Set loading state
                setIsVideoReady?.(false);
                setIsLoadingCamera?.(true);

                const stream = await startMedia({
                  cameraId: selectedCameraId,
                  microphoneId: selectedMicrophoneId ?? undefined,
                });

                setIsLoadingCamera?.(false);

                if (stream && videoRef.current) {
                  videoRef.current.srcObject = stream;
                }
                // Log mic change with device name
                const micName =
                  microphones.find((m) => m.deviceId === selectedMicrophoneId)
                    ?.label || selectedMicrophoneId;
                addLog(`Microphone changé: ${micName}`, "info");
              }
            }
          }
          // Already streaming: hot-swap the audio track
          else {
            console.log("🎤 Hot-swapping mic to", selectedMicrophoneId);
            const newTrack = await replaceAudioTrack(selectedMicrophoneId);

            if (newTrack) {
              // Update all WebRTC connections with the new audio track
              await updateAllConnectionTracks(newTrack);
              // Log mic change with device name
              const micName =
                microphones.find((m) => m.deviceId === selectedMicrophoneId)
                  ?.label || selectedMicrophoneId;
              addLog(`Microphone changé: ${micName}`, "info");
            }
          }
        } catch (err) {
          setIsLoadingCamera?.(false);
          handleError(err, "Changement de microphone", addLog, {
            category: "media",
          });
        }
      };

      doHandleMicChange();
    }

    // Always update the ref to track the current selection
    prevMicIdRef.current = selectedMicrophoneId;
  }, [
    selectedMicrophoneId,
    selectedCameraId,
    isStreaming,
    microphones,
    videoRef,
    localStreamRef,
    startMedia,
    replaceAudioTrack,
    updateAllConnectionTracks,
    setIsVideoReady,
    setIsLoadingCamera,
    addLog,
  ]);
}
