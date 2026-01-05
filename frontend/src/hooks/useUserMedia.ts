// useUserMedia - Hook for acquiring user media streams
// Pattern: Composable hooks with single responsibility

import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "@/stores";
import {
  RESOLUTION_CONSTRAINTS,
  type VideoResolution,
  type VideoSettings,
} from "@/types";

interface UseUserMediaOptions {
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

/**
 * Hook for acquiring and managing local media streams
 */
export function useUserMedia(options: UseUserMediaOptions = {}) {
  const { autoStart = false, videoSettings } = options;

  const { localStream, setLocalStream } = useStore();

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
        console.log(
          "📹 buildConstraints - Resolution lookup:",
          videoSettings.resolution,
          "->",
          res,
        );
        if (res) {
          video.width = { exact: res.width };
          video.height = { exact: res.height };
        } else {
          console.warn(
            "📹 ⚠️ Unknown resolution in buildConstraints:",
            videoSettings.resolution,
          );
        }
      } else {
        // Auto mode - use ideal 1080p so browser picks best available
        // Without this, browser defaults to 640x480 VGA
        video.width = { ideal: 1920 };
        video.height = { ideal: 1080 };
        console.log("📹 buildConstraints - Auto resolution: ideal 1920x1080");
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
        console.log(
          "📹 Requesting media with constraints:",
          JSON.stringify(constraints, null, 2),
        );
        console.log("📹 Video settings:", videoSettings);
        console.log("📹 Selected camera ID (effective):", effectiveCameraId);
        console.log("📹 Selected mic ID (effective):", effectiveMicId);

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        streamRef.current = stream;
        setLocalStream(stream);

        // Log actual track settings
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack) {
          const settings = videoTrack.getSettings();
          console.log("✅ Media stream acquired - actual video settings:", {
            width: settings.width,
            height: settings.height,
            frameRate: settings.frameRate,
            deviceId: settings.deviceId,
          });
        }

        return stream;
      } catch (err) {
        console.error("❌ Failed to acquire media:", err);
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
      console.log("⏹️ Media stream stopped");
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
      console.log("📹 replaceVideoTrack called with deviceId:", deviceId);
      console.log("📹 Current stream exists:", !!streamRef.current);

      if (!streamRef.current) {
        console.warn("📹 No stream ref - cannot replace track");
        return null;
      }

      try {
        console.log("📹 Requesting new video stream...");
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });
        console.log("📹 New stream acquired");

        const newTrack = newStream.getVideoTracks()[0];
        const oldTrack = streamRef.current.getVideoTracks()[0];

        console.log(
          "📹 Old track:",
          oldTrack?.label ?? "none",
          "readyState:",
          oldTrack?.readyState,
        );
        console.log(
          "📹 New track:",
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
          console.log(
            "✅ Video track replaced in MediaStream:",
            newTrack.label,
          );
          return newTrack;
        }

        console.warn("📹 Could not replace track - missing old or new track");
        return null;
      } catch (err) {
        console.error("❌ Failed to replace video track:", err);
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
          console.log("🔄 Audio track replaced:", newTrack.label);
          return newTrack;
        }
        return null;
      } catch (err) {
        console.error("❌ Failed to replace audio track:", err);
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

  // Apply video constraints by replacing the video track with a new one
  // This is more reliable than applyConstraints() which often doesn't work on active tracks
  const applyVideoConstraints = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Complex track replacement logic for applying constraints
    async (settings: VideoSettings): Promise<ApplyConstraintsResult | null> => {
      console.log("📹 applyVideoConstraints called with:", settings);
      console.log(
        "📹 streamRef.current:",
        streamRef.current ? "exists" : "null",
      );

      if (!streamRef.current) {
        console.warn("📹 No stream - cannot apply constraints");
        return null;
      }

      const oldTrack = streamRef.current.getVideoTracks()[0];
      console.log("📹 oldTrack:", oldTrack ? oldTrack.label : "null");

      if (!oldTrack) {
        console.warn("📹 No video track - cannot apply constraints");
        return null;
      }

      // Log current settings including the track label (which shows camera name)
      const currentSettings = oldTrack.getSettings();
      console.log("📹 Current track settings:", {
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
        console.log("📹 Resolution lookup:", settings.resolution, "->", res);
        if (res) {
          videoConstraints.width = { exact: res.width };
          videoConstraints.height = { exact: res.height };
        } else {
          console.warn(
            "📹 ⚠️ Unknown resolution:",
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

      console.log(
        "📹 Requesting new stream with constraints:",
        videoConstraints,
      );

      // IMPORTANT: Stop the old track BEFORE requesting new stream
      // Some cameras (like Logitech MX Brio) can't provide multiple resolutions simultaneously
      // and will fail with OverconstrainedError if the old stream is still active
      console.log("📹 Stopping old track before requesting new resolution...");
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

            console.log(
              "📹 Trying exact resolution + ideal fps:",
              exactResConstraints,
            );

            try {
              newStream = await navigator.mediaDevices.getUserMedia({
                video: exactResConstraints,
              });
            } catch (exactErr) {
              console.warn(
                "📹 Exact resolution failed:",
                (exactErr as Error).message,
              );

              // Wait longer - USB cameras like MX Brio need significant time to release
              console.log(
                "📹 Waiting additional 500ms for camera to fully release...",
              );
              await new Promise((resolve) => setTimeout(resolve, 500));

              // Second attempt: try exact again after longer wait
              console.log("📹 Retrying exact resolution after delay...");
              try {
                newStream = await navigator.mediaDevices.getUserMedia({
                  video: exactResConstraints,
                });
              } catch (retryErr) {
                console.warn(
                  "📹 Retry also failed:",
                  (retryErr as Error).message,
                );
                console.warn(
                  `⚠️ Camera doesn't support ${settings.resolution} - will use closest available`,
                );

                // Third attempt: get device with NO resolution constraint, then check what we got
                // This helps diagnose if the camera is being held by something else
                console.log(
                  "📹 Trying device-only (no resolution) to diagnose...",
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
                  console.log("📹 Camera default (no constraints):", {
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
          console.error("📹 No video track in new stream");
          return null;
        }

        // Log new track settings and compare with requested
        const newSettings = newTrack.getSettings();
        console.log("📹 New track label:", newTrack.label); // Shows which camera we got
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

        console.log("✅ New track acquired:", {
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
          console.warn(
            `⚠️ Resolution mismatch! Requested ${requestedRes?.width}x${requestedRes?.height}, got ${newSettings.width}x${newSettings.height}`,
          );
        }
        if (!fpsMatched) {
          console.warn(
            `⚠️ FPS mismatch! Requested ${requestedFps}, got ${newSettings.frameRate}`,
          );
          console.warn("📹 This is often due to USB bandwidth limitations:");
          console.warn(
            `   - High-end webcams like Logitech MX Brio are limited to 30fps at 1080p`,
          );
          console.warn(
            `   - Try 720p or lower resolution to achieve higher FPS (up to 60fps)`,
          );
          console.warn(`   - USB 2.0 ports limit bandwidth more than USB 3.0`);
        }

        // Replace the track in our stream
        // Note: oldTrack was already stopped above before requesting new stream
        streamRef.current.removeTrack(oldTrack);
        streamRef.current.addTrack(newTrack);

        console.log("✅ Video track replaced in MediaStream");

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
        console.error("❌ Failed to apply video constraints:", err);
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
  };
}
