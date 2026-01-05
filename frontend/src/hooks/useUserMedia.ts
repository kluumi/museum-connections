// useUserMedia - Hook for acquiring user media streams
// Pattern: Composable hooks with single responsibility

import { useCallback, useEffect, useRef, useState } from "react";
import { mediaLogger } from "@/lib/logger";
import { useStore } from "@/stores";
import {
  RESOLUTION_CONSTRAINTS,
  type VideoResolution,
  type VideoSettings,
} from "@/types";

export interface UseUserMediaOptions {
  autoStart?: boolean;
  videoSettings?: VideoSettings;
}

// Result type for applyVideoConstraints - exported for use in components
export interface ApplyConstraintsResult {
  track: MediaStreamTrack;
  actualWidth: number;
  actualHeight: number;
  actualFps: number;
  resolutionMatched: boolean;
  fpsMatched: boolean;
}

/** Return type for useUserMedia hook */
export interface UseUserMediaReturn {
  stream: MediaStream | null;
  isLoading: boolean;
  error: Error | null;
  start: (overrides?: {
    cameraId?: string;
    microphoneId?: string;
  }) => Promise<MediaStream | null>;
  stop: () => void;
  restart: () => Promise<MediaStream | null>;
  replaceVideoTrack: (deviceId: string) => Promise<MediaStreamTrack | null>;
  replaceAudioTrack: (deviceId: string) => Promise<MediaStreamTrack | null>;
  applyVideoConstraints: (
    settings: VideoSettings,
  ) => Promise<ApplyConstraintsResult | null>;
  toggleVideo: (enabled: boolean) => void;
  toggleAudio: (enabled: boolean) => void;
  /**
   * Adopt an externally-created stream (e.g., from enumerateDevices).
   * This sets it as the local stream and tracks it for future operations.
   */
  adoptStream: (stream: MediaStream) => void;
}

/**
 * Hook for acquiring and managing local media streams
 */
export function useUserMedia(
  options: UseUserMediaOptions = {},
): UseUserMediaReturn {
  const { autoStart = false, videoSettings } = options;

  // Use individual selectors for stable references
  const localStream = useStore((s) => s.localStream);
  const setLocalStream = useStore((s) => s.setLocalStream);

  // Read device IDs from runtime store (set by useMediaDevices)
  const selectedCameraId = useStore((s) => s.selectedCameraId);
  const selectedMicrophoneId = useStore((s) => s.selectedMicrophoneId);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Build constraints from settings
  // Optional overrides allow passing device IDs directly (bypassing state)
  const buildConstraints = useCallback(
    (overrides?: {
      cameraId?: string;
      microphoneId?: string;
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Builds constraints from video settings and device selections
    }): MediaStreamConstraints => {
      const video: MediaTrackConstraints = {};
      const audio: MediaTrackConstraints = {};

      // Camera selection - use override if provided, otherwise use state
      const cameraId = overrides?.cameraId ?? selectedCameraId;
      if (cameraId) {
        video.deviceId = { exact: cameraId };
      }

      // Microphone selection - use override if provided, otherwise use state
      const microphoneId = overrides?.microphoneId ?? selectedMicrophoneId;
      if (microphoneId) {
        audio.deviceId = { exact: microphoneId };
      }

      // Resolution constraints
      if (videoSettings?.resolution && videoSettings.resolution !== "auto") {
        // Specific resolution requested - use exact to force it
        const res = RESOLUTION_CONSTRAINTS[videoSettings.resolution];
        mediaLogger.debug(
          "buildConstraints - Resolution lookup:",
          videoSettings.resolution,
          "->",
          res,
        );
        if (res) {
          video.width = { exact: res.width };
          video.height = { exact: res.height };
        } else {
          mediaLogger.warn(
            "Unknown resolution in buildConstraints:",
            videoSettings.resolution,
          );
        }
      } else {
        // Auto mode - use ideal 1080p so browser picks best available
        // Without this, browser defaults to 640x480 VGA
        video.width = { ideal: 1920 };
        video.height = { ideal: 1080 };
        mediaLogger.debug(
          "buildConstraints - Auto resolution: ideal 1920x1080",
        );
      }

      // FPS constraints
      if (videoSettings?.fps && videoSettings.fps !== "auto") {
        // Specific FPS requested - use ideal with min tolerance (exact often fails)
        video.frameRate = {
          ideal: videoSettings.fps,
          min: videoSettings.fps * 0.9,
        };
      } else {
        // Auto mode - prefer 30fps as a reasonable default
        video.frameRate = { ideal: 30 };
      }

      return {
        video: Object.keys(video).length > 0 ? video : true,
        audio: Object.keys(audio).length > 0 ? audio : true,
      };
    },
    [selectedCameraId, selectedMicrophoneId, videoSettings],
  );

  // Start stream acquisition
  // Optional overrides allow passing device IDs directly (bypassing state race conditions)
  const start = useCallback(
    async (overrides?: { cameraId?: string; microphoneId?: string }) => {
      setIsLoading(true);
      setError(null);

      try {
        const constraints = buildConstraints(overrides);
        const effectiveCameraId = overrides?.cameraId ?? selectedCameraId;
        const effectiveMicId = overrides?.microphoneId ?? selectedMicrophoneId;
        mediaLogger.debug(
          "Requesting media with constraints:",
          JSON.stringify(constraints, null, 2),
        );
        mediaLogger.debug("Video settings:", videoSettings);
        mediaLogger.debug("Selected camera ID (effective):", effectiveCameraId);
        mediaLogger.debug("Selected mic ID (effective):", effectiveMicId);

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        setLocalStream(stream);

        // Log actual track settings
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          mediaLogger.info("Media stream acquired - actual video settings:", {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate,
            deviceId: settings.deviceId,
          });
        }

        return stream;
      } catch (err) {
        mediaLogger.error("Failed to acquire media:", err);
        setError(err as Error);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [
      buildConstraints,
      setLocalStream,
      videoSettings,
      selectedCameraId,
      selectedMicrophoneId,
    ],
  );

  // Stop stream
  const stop = useCallback(() => {
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
      setLocalStream(null);
      mediaLogger.info("Media stream stopped");
    }
  }, [setLocalStream]);

  // Restart stream with new settings
  const restart = useCallback(async () => {
    stop();
    return start();
  }, [stop, start]);

  // Replace video track (hot-swap camera)
  // Returns the new track for WebRTC sender replacement
  // NOTE: Does NOT update the store to avoid triggering WebRTC service recreation
  const replaceVideoTrack = useCallback(
    async (deviceId: string): Promise<MediaStreamTrack | null> => {
      mediaLogger.debug("replaceVideoTrack called with deviceId:", deviceId);
      mediaLogger.debug("Current stream exists:", !!streamRef.current);

      if (!streamRef.current) {
        mediaLogger.warn("No stream ref - cannot replace track");
        return null;
      }

      try {
        // Request ideal 1080p so we don't default to 640x480 VGA
        mediaLogger.debug("Requesting new video stream...");
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: deviceId },
            width: { ideal: 1920 },
            height: { ideal: 1080 },
          },
        });
        mediaLogger.debug("New stream acquired");

        const newTrack = newStream.getVideoTracks()[0];
        const oldTrack = streamRef.current.getVideoTracks()[0];

        mediaLogger.debug(
          "Old track:",
          oldTrack?.label ?? "none",
          "readyState:",
          oldTrack?.readyState,
        );
        mediaLogger.debug(
          "New track:",
          newTrack?.label ?? "none",
          "readyState:",
          newTrack?.readyState,
        );

        if (oldTrack && newTrack) {
          streamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
          streamRef.current.addTrack(newTrack);
          // Don't call setLocalStream - we're modifying the same MediaStream in place
          // The video element will automatically show the new track
          // Caller must use WebRTC.replaceTrack() to update peer connections
          mediaLogger.info(
            "Video track replaced in MediaStream:",
            newTrack.label,
          );
          return newTrack;
        }

        mediaLogger.warn("Could not replace track - missing old or new track");
        return null;
      } catch (err) {
        mediaLogger.error("Failed to replace video track:", err);
        setError(err as Error);
        throw err;
      }
    },
    [],
  );

  // Replace audio track (hot-swap microphone)
  // Returns the new track for WebRTC sender replacement
  // NOTE: Does NOT update the store to avoid triggering WebRTC service recreation
  const replaceAudioTrack = useCallback(
    async (deviceId: string): Promise<MediaStreamTrack | null> => {
      if (!streamRef.current) return null;

      try {
        const newStream = await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: deviceId } },
        });

        const newTrack = newStream.getAudioTracks()[0];
        const oldTrack = streamRef.current.getAudioTracks()[0];

        if (oldTrack && newTrack) {
          streamRef.current.removeTrack(oldTrack);
          oldTrack.stop();
          streamRef.current.addTrack(newTrack);
          // Don't call setLocalStream - we're modifying the same MediaStream in place
          // Caller must use WebRTC.replaceTrack() to update peer connections
          mediaLogger.info("Audio track replaced:", newTrack.label);
          return newTrack;
        }
        return null;
      } catch (err) {
        mediaLogger.error("Failed to replace audio track:", err);
        setError(err as Error);
        throw err;
      }
    },
    [],
  );

  // Toggle video track
  const toggleVideo = useCallback((enabled?: boolean) => {
    if (!streamRef.current) return;

    const videoTrack = streamRef.current.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = enabled ?? !videoTrack.enabled;
    }
  }, []);

  // Toggle audio track
  const toggleAudio = useCallback((enabled?: boolean) => {
    if (!streamRef.current) return;

    const audioTrack = streamRef.current.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = enabled ?? !audioTrack.enabled;
    }
  }, []);

  // Adopt an externally-created stream (e.g., from enumerateDevices)
  // This sets it as the local stream so future operations (replaceTrack, etc.) work correctly
  const adoptStream = useCallback(
    (stream: MediaStream) => {
      mediaLogger.info("Adopting external stream:", stream.id);
      streamRef.current = stream;
      setLocalStream(stream);

      // Log track info
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        mediaLogger.debug("Adopted stream video track:", {
          label: videoTrack.label,
          width: settings.width,
          height: settings.height,
          frameRate: settings.frameRate,
        });
      }
    },
    [setLocalStream],
  );

  // Apply video constraints by replacing the video track with a new one
  // This is more reliable than applyConstraints() which often doesn't work on active tracks
  const applyVideoConstraints = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex track replacement logic for applying constraints
    async (settings: VideoSettings): Promise<ApplyConstraintsResult | null> => {
      mediaLogger.debug("applyVideoConstraints called with:", settings);
      mediaLogger.debug(
        "streamRef.current:",
        streamRef.current ? "exists" : "null",
      );

      if (!streamRef.current) {
        mediaLogger.warn("No stream - cannot apply constraints");
        return null;
      }

      const oldTrack = streamRef.current.getVideoTracks()[0];
      mediaLogger.debug("oldTrack:", oldTrack ? oldTrack.label : "null");

      if (!oldTrack) {
        mediaLogger.warn("No video track - cannot apply constraints");
        return null;
      }

      // Log current settings including the track label (which shows camera name)
      const currentSettings = oldTrack.getSettings();
      mediaLogger.debug("Current track settings:", {
        label: oldTrack.label, // This shows the camera name like "Logitech MX Brio"
        width: currentSettings.width,
        height: currentSettings.height,
        frameRate: currentSettings.frameRate,
        deviceId: currentSettings.deviceId,
      });

      // Build new constraints
      const videoConstraints: MediaTrackConstraints = {};

      // Keep the same device
      if (currentSettings.deviceId) {
        videoConstraints.deviceId = { exact: currentSettings.deviceId };
      }

      // Resolution - try exact first, then min+ideal as fallback
      // exact is the strictest and should work if the camera supports it
      if (settings.resolution !== "auto") {
        const res = RESOLUTION_CONSTRAINTS[settings.resolution];
        mediaLogger.debug("Resolution lookup:", settings.resolution, "->", res);
        if (res) {
          videoConstraints.width = { exact: res.width };
          videoConstraints.height = { exact: res.height };
        } else {
          mediaLogger.warn(
            "Unknown resolution:",
            settings.resolution,
            "Available:",
            Object.keys(RESOLUTION_CONSTRAINTS),
          );
        }
      }

      // FPS - use ideal (exact often fails for frameRate)
      // Cameras report frameRate as a range, not discrete values
      if (settings.fps !== "auto") {
        videoConstraints.frameRate = {
          ideal: settings.fps,
          min: settings.fps * 0.9,
        };
      }

      mediaLogger.debug(
        "Requesting new stream with constraints:",
        videoConstraints,
      );

      // IMPORTANT: Stop the old track BEFORE requesting new stream
      // Some cameras (like Logitech MX Brio) can't provide multiple resolutions simultaneously
      // and will fail with OverconstrainedError if the old stream is still active
      mediaLogger.debug(
        "Stopping old track before requesting new resolution...",
      );
      oldTrack.stop();

      // Wait for the camera to fully release
      // USB cameras (especially high-end ones like MX Brio) need time to reset after stopping a stream
      // 500ms seems to be the sweet spot for USB 3.0 cameras
      await new Promise((resolve) => setTimeout(resolve, 500));

      try {
        let newStream: MediaStream;

        // Strategy: Try exact resolution with device locked first
        // We stopped the old track, so the camera should be free to provide any resolution
        if (settings.resolution !== "auto") {
          const res = RESOLUTION_CONSTRAINTS[settings.resolution];
          if (res) {
            // First attempt: device locked + exact resolution + ideal fps
            // (exact fps often fails, so we use ideal from the start)
            const exactResConstraints: MediaTrackConstraints = {
              deviceId: { exact: currentSettings.deviceId },
              width: { exact: res.width },
              height: { exact: res.height },
            };
            if (settings.fps !== "auto") {
              exactResConstraints.frameRate = { ideal: settings.fps };
            }

            mediaLogger.debug(
              "Trying exact resolution + ideal fps:",
              exactResConstraints,
            );

            try {
              newStream = await navigator.mediaDevices.getUserMedia({
                video: exactResConstraints,
              });
            } catch (exactErr) {
              mediaLogger.warn(
                "Exact resolution failed:",
                (exactErr as Error).message,
              );

              // Wait longer - USB cameras like MX Brio need significant time to release
              mediaLogger.debug(
                "Waiting additional 500ms for camera to fully release...",
              );
              await new Promise((resolve) => setTimeout(resolve, 500));

              // Second attempt: try exact again after longer wait
              mediaLogger.debug("Retrying exact resolution after delay...");
              try {
                newStream = await navigator.mediaDevices.getUserMedia({
                  video: exactResConstraints,
                });
              } catch (retryErr) {
                mediaLogger.warn(
                  "Retry also failed:",
                  (retryErr as Error).message,
                );
                mediaLogger.warn(
                  `Camera doesn't support ${settings.resolution} - will use closest available`,
                );

                // Third attempt: get device with NO resolution constraint, then check what we got
                // This helps diagnose if the camera is being held by something else
                mediaLogger.debug(
                  "Trying device-only (no resolution) to diagnose...",
                );
                const deviceOnlyConstraints: MediaTrackConstraints = {
                  deviceId: { exact: currentSettings.deviceId },
                };
                newStream = await navigator.mediaDevices.getUserMedia({
                  video: deviceOnlyConstraints,
                });

                // Log what the camera gave us without constraints
                const diagTrack = newStream.getVideoTracks()[0];
                if (diagTrack) {
                  const diagSettings = diagTrack.getSettings();
                  mediaLogger.debug("Camera default (no constraints):", {
                    width: diagSettings.width,
                    height: diagSettings.height,
                    frameRate: diagSettings.frameRate,
                  });
                }
              }
            }
          } else {
            // No resolution constraint, just use deviceId
            newStream = await navigator.mediaDevices.getUserMedia({
              video: videoConstraints,
            });
          }
        } else {
          // Auto resolution - just apply device and fps
          newStream = await navigator.mediaDevices.getUserMedia({
            video: videoConstraints,
          });
        }

        const newTrack = newStream.getVideoTracks()[0];
        if (!newTrack) {
          mediaLogger.error("No video track in new stream");
          return null;
        }

        // Log new track settings and compare with requested
        const newSettings = newTrack.getSettings();
        mediaLogger.debug("New track label:", newTrack.label); // Shows which camera we got
        const requestedRes =
          settings.resolution !== "auto"
            ? RESOLUTION_CONSTRAINTS[
                settings.resolution as Exclude<VideoResolution, "auto">
              ]
            : null;
        const requestedFps = settings.fps !== "auto" ? settings.fps : null;

        const resolutionMatched = requestedRes
          ? newSettings.width === requestedRes.width &&
            newSettings.height === requestedRes.height
          : true;
        const fpsMatched = requestedFps
          ? Math.abs((newSettings.frameRate ?? 0) - requestedFps) < 1
          : true;

        mediaLogger.info("New track acquired:", {
          actual: {
            width: newSettings.width,
            height: newSettings.height,
            frameRate: newSettings.frameRate,
          },
          requested: {
            width: requestedRes?.width ?? "auto",
            height: requestedRes?.height ?? "auto",
            fps: requestedFps ?? "auto",
          },
          matched: { resolution: resolutionMatched, fps: fpsMatched },
        });

        if (!resolutionMatched) {
          mediaLogger.warn(
            `Resolution mismatch! Requested ${requestedRes?.width}x${requestedRes?.height}, got ${newSettings.width}x${newSettings.height}`,
          );
        }
        if (!fpsMatched) {
          mediaLogger.warn(
            `FPS mismatch! Requested ${requestedFps}, got ${newSettings.frameRate}`,
          );
          mediaLogger.warn("This is often due to USB bandwidth limitations:");
          mediaLogger.warn(
            "- High-end webcams like Logitech MX Brio are limited to 30fps at 1080p",
          );
          mediaLogger.warn(
            "- Try 720p or lower resolution to achieve higher FPS (up to 60fps)",
          );
          mediaLogger.warn("- USB 2.0 ports limit bandwidth more than USB 3.0");
        }

        // Replace the track in our stream
        // Note: oldTrack was already stopped above before requesting new stream
        streamRef.current.removeTrack(oldTrack);
        streamRef.current.addTrack(newTrack);

        mediaLogger.info("Video track replaced in MediaStream");

        // Return the result with track and match info so caller can show warnings
        return {
          track: newTrack,
          actualWidth: newSettings.width ?? 0,
          actualHeight: newSettings.height ?? 0,
          actualFps: newSettings.frameRate ?? 0,
          resolutionMatched,
          fpsMatched,
        };
      } catch (err) {
        mediaLogger.error("Failed to apply video constraints:", err);

        // RECOVERY: If we failed to get a new stream, try to recover by getting
        // ANY stream from the same camera. This prevents leaving the user with black video.
        mediaLogger.warn("Attempting recovery - getting default stream from camera...");
        try {
          const recoveryStream = await navigator.mediaDevices.getUserMedia({
            video: { deviceId: { exact: currentSettings.deviceId } },
          });
          const recoveryTrack = recoveryStream.getVideoTracks()[0];
          if (recoveryTrack && streamRef.current) {
            // Remove the stopped old track if still in stream
            const existingTracks = streamRef.current.getVideoTracks();
            for (const t of existingTracks) {
              streamRef.current.removeTrack(t);
            }
            streamRef.current.addTrack(recoveryTrack);
            mediaLogger.info("Recovery successful - video restored with default settings");
            return {
              track: recoveryTrack,
              actualWidth: recoveryTrack.getSettings().width ?? 0,
              actualHeight: recoveryTrack.getSettings().height ?? 0,
              actualFps: recoveryTrack.getSettings().frameRate ?? 0,
              resolutionMatched: false,
              fpsMatched: false,
            };
          }
        } catch (recoveryErr) {
          mediaLogger.error("Recovery also failed:", recoveryErr);
        }

        return null;
      }
    },
    [],
  );

  // Store callbacks in refs to avoid effect re-running when they change
  const startRef = useRef(start);
  const stopRef = useRef(stop);
  startRef.current = start;
  stopRef.current = stop;

  // Auto-start if enabled - only runs on mount/unmount
  useEffect(() => {
    if (autoStart) {
      startRef.current();
    }

    return () => {
      stopRef.current();
    };
  }, [autoStart]);

  return {
    stream: localStream,
    isLoading,
    error,
    start,
    stop,
    restart,
    replaceVideoTrack,
    replaceAudioTrack,
    applyVideoConstraints,
    toggleVideo,
    toggleAudio,
    adoptStream,
  };
}
