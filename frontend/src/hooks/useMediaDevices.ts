/**
 * useMediaDevices - React hook for media device management.
 *
 * Handles device enumeration, selection, and capability detection.
 * Device selections are persisted per node, so Nantes and Paris can have
 * different camera/microphone preferences.
 *
 * @module hooks/useMediaDevices
 * @example
 * ```typescript
 * function DeviceSelector() {
 *   const {
 *     cameras,
 *     microphones,
 *     selectedCameraId,
 *     cameraCapabilities,
 *     selectCamera,
 *     enumerateDevices,
 *   } = useMediaDevices({ nodeId: 'nantes' });
 *
 *   // Enumerate devices on mount
 *   useEffect(() => {
 *     enumerateDevices();
 *   }, []);
 *
 *   // Render camera selector
 *   return (
 *     <select
 *       value={selectedCameraId ?? ''}
 *       onChange={(e) => selectCamera(e.target.value)}
 *     >
 *       {cameras.map((cam) => (
 *         <option key={cam.deviceId} value={cam.deviceId}>
 *           {cam.label}
 *         </option>
 *       ))}
 *     </select>
 *   );
 * }
 * ```
 */

import { useCallback, useEffect, useMemo } from "react";
import { eventBus } from "@/lib/events";
import { mediaLogger } from "@/lib/logger";
import { useSettingsStore, useStore } from "@/stores";
import type { CameraCapabilities } from "@/stores/devicesSlice";

// Standard resolutions to check against camera capabilities
// Include both 16:9 and 4:3 aspect ratios for compatibility
// Sorted from highest to lowest
const STANDARD_RESOLUTIONS = [
  { width: 1920, height: 1080, label: "1080p" },
  { width: 1280, height: 720, label: "720p" },
  { width: 854, height: 480, label: "480p (16:9)" },
  { width: 640, height: 480, label: "VGA (4:3)" },
  { width: 640, height: 360, label: "360p" },
  { width: 320, height: 240, label: "QVGA" },
] as const;

export interface UseMediaDevicesOptions {
  nodeId: "nantes" | "paris";
}

/** Return type for useMediaDevices hook */
/** Result returned by enumerateDevices */
export interface EnumerateDevicesResult {
  cameraId: string | null;
  microphoneId: string | null;
  /** Initial stream that can be reused for preview (avoids extra getUserMedia) */
  initialStream: MediaStream | null;
}

export interface UseMediaDevicesReturn {
  // Devices
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];

  // Selected (runtime state)
  selectedCameraId: string | null;
  selectedMicrophoneId: string | null;
  selectedSpeakerId: string | null;

  // Persisted selections for this node
  persistedDevices: {
    cameraId: string | null;
    microphoneId: string | null;
    speakerId: string | null;
    isAudioEnabled: boolean;
  };

  // Capabilities
  cameraCapabilities: CameraCapabilities | null;

  // State
  isLoading: boolean;
  error: Error | null;

  // Actions
  enumerateDevices: () => Promise<EnumerateDevicesResult>;
  selectCamera: (deviceId: string | null) => Promise<void>;
  selectMicrophone: (deviceId: string | null) => void;
  selectSpeaker: (deviceId: string | null) => void;
}

/**
 * React hook for managing media device enumeration and selection.
 *
 * Features:
 * - Enumerates cameras, microphones, and speakers
 * - Detects camera capabilities (resolution, FPS support)
 * - Persists device selections per node (Nantes/Paris independent)
 * - Listens for device connect/disconnect events
 * - Handles permission requests and secure context validation
 *
 * @param options - Configuration options
 * @param options.nodeId - Node identifier for persisting device selections
 * @returns Device lists, selections, capabilities, and actions
 */
export function useMediaDevices({
  nodeId,
}: UseMediaDevicesOptions): UseMediaDevicesReturn {
  // Use individual selectors for stable references
  // This prevents unnecessary re-renders when unrelated store state changes
  const cameras = useStore((s) => s.cameras);
  const microphones = useStore((s) => s.microphones);
  const speakers = useStore((s) => s.speakers);
  const cameraCapabilities = useStore((s) => s.cameraCapabilities);
  const devicesLoading = useStore((s) => s.devicesLoading);
  const devicesError = useStore((s) => s.devicesError);
  const setDevices = useStore((s) => s.setDevices);
  const setSelectedCamera = useStore((s) => s.setSelectedCamera);
  const setSelectedMicrophone = useStore((s) => s.setSelectedMicrophone);
  const setSelectedSpeaker = useStore((s) => s.setSelectedSpeaker);
  const setCameraCapabilities = useStore((s) => s.setCameraCapabilities);
  const setDevicesLoading = useStore((s) => s.setDevicesLoading);
  const setDevicesError = useStore((s) => s.setDevicesError);

  // Get persisted device selections for this node - use individual selectors
  const getSelectedDevices = useSettingsStore((s) => s.getSelectedDevices);
  const persistDevices = useSettingsStore((s) => s.setSelectedDevices);
  const persistedDevices = useMemo(
    () => getSelectedDevices(nodeId),
    [getSelectedDevices, nodeId],
  );

  // Current selections from runtime store
  const selectedCameraId = useStore((s) => s.selectedCameraId);
  const selectedMicrophoneId = useStore((s) => s.selectedMicrophoneId);
  const selectedSpeakerId = useStore((s) => s.selectedSpeakerId);

  // Detect camera capabilities from a video track
  // Can optionally accept an existing stream to avoid extra getUserMedia call
  // If keepStream is true and we create a new stream, return it for reuse
  const detectCameraCapabilities = useCallback(
    // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Camera capabilities detection with fallbacks
    async (
      deviceId: string,
      existingStream?: MediaStream,
      keepStream?: boolean,
      microphoneId?: string | null,
    ): Promise<{ capabilities: CameraCapabilities | null; stream?: MediaStream }> => {
      try {
        mediaLogger.debug("Detecting capabilities for camera:", deviceId);

        let stream: MediaStream;
        let createdNewStream = false;

        if (existingStream) {
          // Reuse existing stream - no extra getUserMedia needed
          stream = existingStream;
          mediaLogger.debug("Reusing existing stream for capability detection");
        } else {
          // Get a stream from the camera to access its capabilities
          // Request ideal 1080p so the stream can be reused for preview at high resolution
          // Without this, browser defaults to 640x480 VGA
          // If keepStream is true and microphoneId is provided, also include audio
          // so the stream can be used directly for streaming (not just preview)
          // IMPORTANT: Use { ideal } instead of { exact } for microphoneId because:
          // - Android device IDs are not stable between sessions
          // - Using "exact" would fail the entire getUserMedia if the mic is unavailable
          // - Using "ideal" allows graceful fallback to any available microphone
          const audioConstraint = keepStream && microphoneId
            ? { deviceId: { ideal: microphoneId } }
            : keepStream
              ? true
              : false;

          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: deviceId },
              width: { ideal: 1920 },
              height: { ideal: 1080 },
            },
            audio: audioConstraint,
          });
          createdNewStream = true;

          // Log audio track status (helpful for debugging Android issues)
          const audioTracks = stream.getAudioTracks();
          if (audioConstraint && audioTracks.length === 0) {
            mediaLogger.warn("⚠️ Audio requested but no audio track received - this may cause issues on Android");
          } else if (audioTracks.length > 0) {
            const audioSettings = audioTracks[0].getSettings();
            mediaLogger.debug("🎤 Audio track obtained:", audioSettings.deviceId);
          }
        }

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
          mediaLogger.warn("No video track found");
          if (createdNewStream) {
            for (const t of stream.getTracks()) {
              t.stop();
            }
          }
          return { capabilities: null };
        }

        // Get capabilities from the track
        const capabilities = videoTrack.getCapabilities?.();

        // If we created a new stream and caller wants to keep it, return it
        if (createdNewStream && keepStream) {
          mediaLogger.debug("Keeping stream for reuse");
          // Don't stop the stream - return it for reuse
        } else if (createdNewStream) {
          // Stop the stream we created
          for (const t of stream.getTracks()) {
            t.stop();
          }
          // Wait for camera to fully release before returning
          // 50ms is usually enough for modern USB cameras
          await new Promise((resolve) => setTimeout(resolve, 50));
        }

        if (!capabilities) {
          mediaLogger.warn("getCapabilities() not supported");
          return { capabilities: null, stream: keepStream ? stream : undefined };
        }

        mediaLogger.debug("Raw camera capabilities:", capabilities);
        mediaLogger.debug("frameRate range:", {
          min: capabilities.frameRate?.min,
          max: capabilities.frameRate?.max,
        });
        mediaLogger.debug("resolution range:", {
          widthMin: capabilities.width?.min,
          widthMax: capabilities.width?.max,
          heightMin: capabilities.height?.min,
          heightMax: capabilities.height?.max,
        });

        const maxWidth = capabilities.width?.max ?? 1920;
        const maxHeight = capabilities.height?.max ?? 1080;
        const maxFrameRate = capabilities.frameRate?.max ?? 30;
        const minFrameRate = capabilities.frameRate?.min ?? 1;

        // Important: maxFrameRate from capabilities is often the camera's GLOBAL max at LOW resolution
        // USB cameras typically can't do high FPS at high resolution due to bandwidth
        // For example, MX Brio: 60fps at 720p but only 30fps at 1080p
        if (maxFrameRate < 60) {
          mediaLogger.debug(
            `📹 Note: Camera max FPS is ${maxFrameRate}. This may be a hardware/USB bandwidth limitation.`,
          );
          mediaLogger.debug(
            "📹 Tip: Try lower resolution for higher FPS (720p or lower often supports 60fps)",
          );
        }

        // Filter standard resolutions to only those supported by this camera
        // A resolution is supported if BOTH width AND height fit within the camera's max
        const supportedResolutions = STANDARD_RESOLUTIONS.filter(
          (res) => res.width <= maxWidth && res.height <= maxHeight,
        ).map((res) => ({ ...res }));

        mediaLogger.debug(
          "📹 Filtered resolutions:",
          supportedResolutions,
          "from maxWidth:",
          maxWidth,
          "maxHeight:",
          maxHeight,
        );

        // Generate meaningful FPS options based on camera's range
        // We create options at common intervals within the camera's supported range
        const commonFpsValues = [120, 60, 50, 30, 25, 24, 20, 15, 10];
        const supportedFrameRates = commonFpsValues.filter(
          (fps) => fps >= minFrameRate && fps <= maxFrameRate,
        );

        // If maxFrameRate is not in the common list, add it as the top option
        if (
          maxFrameRate > 0 &&
          !supportedFrameRates.includes(Math.floor(maxFrameRate))
        ) {
          supportedFrameRates.unshift(Math.floor(maxFrameRate));
        }

        const result: CameraCapabilities = {
          maxWidth,
          maxHeight,
          maxFrameRate,
          supportedResolutions,
          supportedFrameRates,
        };

        mediaLogger.debug("Detected camera capabilities:", result);
        return {
          capabilities: result,
          stream: (createdNewStream && keepStream) ? stream : undefined
        };
      } catch (error) {
        mediaLogger.error("Failed to detect camera capabilities:", error);
        return { capabilities: null };
      }
    },
    [],
  );

  // Enumerate devices
  // Returns the selected device IDs and an initial stream that can be reused for preview
  // This avoids race conditions and extra getUserMedia calls
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: Device enumeration with permission handling and default selection
  const enumerateDevices =
    useCallback(async (): Promise<EnumerateDevicesResult> => {
      setDevicesLoading(true);
      setDevicesError(null);

      let selectedCamera: string | null = null;
      let selectedMic: string | null = null;
      let initialStreamToReturn: MediaStream | null = null;

      // Check for secure context (HTTPS or localhost)
      if (!navigator.mediaDevices) {
        const error = new Error(
          "WebRTC requires HTTPS. Please use https:// or localhost to access camera/microphone.",
        );
        mediaLogger.error(
          "❌ navigator.mediaDevices not available - not a secure context (HTTPS required)",
        );
        setDevicesError(error);
        setDevicesLoading(false);
        return { cameraId: null, microphoneId: null, initialStream: null };
      }

      try {
        // Request permission first (needed for labels)
        // IMPORTANT: Capture the default device IDs BEFORE stopping the tracks
        // This allows us to pre-select the browser's chosen devices on first visit
        // Request ideal 1080p so the stream can be reused for preview at high resolution
        // Without this, browser defaults to 640x480 VGA
        mediaLogger.info("📹 Requesting camera/mic permission...");
        const permissionStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: true,
        });
        mediaLogger.info("✅ Permission granted");

        // Extract default device IDs from the permission stream
        // These are the devices the browser selected (often the system defaults)
        const defaultVideoTrack = permissionStream.getVideoTracks()[0];
        const defaultAudioTrack = permissionStream.getAudioTracks()[0];
        const defaultCameraId =
          defaultVideoTrack?.getSettings().deviceId ?? null;
        const defaultMicrophoneId =
          defaultAudioTrack?.getSettings().deviceId ?? null;

        mediaLogger.debug("Browser default camera:", defaultCameraId);
        mediaLogger.debug("Browser default microphone:", defaultMicrophoneId);

        // DON'T stop the permission stream yet - we'll reuse it for capability detection
        // This saves one getUserMedia call and ~150ms of camera release wait time

        const devices = await navigator.mediaDevices.enumerateDevices();
        mediaLogger.info("📦 All devices found:", devices.length);

        const videoDevices = devices.filter((d) => d.kind === "videoinput");
        const audioDevices = devices.filter((d) => d.kind === "audioinput");
        mediaLogger.info(
          "📹 Cameras found:",
          videoDevices.length,
          videoDevices.map((d) => d.label || d.deviceId.slice(0, 8)),
        );
        mediaLogger.info(
          "🎤 Microphones found:",
          audioDevices.length,
          audioDevices.map((d) => d.label || d.deviceId.slice(0, 8)),
        );

        // Update store with devices
        mediaLogger.info("📦 Calling setDevices to update store...");
        setDevices(devices);
        mediaLogger.info("📦 Store updated with devices");

        // Get persisted selections for this node
        const persisted = useSettingsStore
          .getState()
          .getSelectedDevices(nodeId);
        const cameraIds = videoDevices.map((d) => d.deviceId);
        const micIds = audioDevices.map((d) => d.deviceId);
        const speakerIds = devices
          .filter((d) => d.kind === "audiooutput")
          .map((d) => d.deviceId);

        // Determine which microphone to use FIRST (needed for capability detection stream)
        // Same priority logic as camera:
        // 1. Persisted selection (returning user)
        // 2. Browser default from permission prompt (first-time user)
        let micToSelect: string | null = null;

        if (persisted.microphoneId && micIds.includes(persisted.microphoneId)) {
          // Priority 1: Restore previously selected microphone (returning user)
          mediaLogger.debug(
            "Using persisted microphone:",
            persisted.microphoneId,
          );
          micToSelect = persisted.microphoneId;
        } else if (
          defaultMicrophoneId &&
          micIds.includes(defaultMicrophoneId)
        ) {
          // Priority 2: Use browser's default microphone (first-time user)
          mediaLogger.debug(
            "🎤 Using browser default microphone:",
            defaultMicrophoneId,
          );
          micToSelect = defaultMicrophoneId;
          // Persist this selection so it's remembered next time
          persistDevices(nodeId, { microphoneId: defaultMicrophoneId });
        } else {
          mediaLogger.debug("No microphone available to select");
        }

        if (micToSelect) {
          selectedMic = micToSelect;
          setSelectedMicrophone(micToSelect);
        }

        // Determine which camera to use:
        // 1. Persisted selection (returning user)
        // 2. Browser default from permission prompt (first-time user)
        // 3. None (fallback, shouldn't happen)
        mediaLogger.debug("Persisted selections:", persisted);
        mediaLogger.debug("Available cameras:", cameraIds);
        mediaLogger.debug("Browser default camera:", defaultCameraId);

        let cameraToSelect: string | null = null;

        if (persisted.cameraId && cameraIds.includes(persisted.cameraId)) {
          // Priority 1: Restore previously selected camera (returning user)
          mediaLogger.debug("Using persisted camera:", persisted.cameraId);
          cameraToSelect = persisted.cameraId;
        } else if (defaultCameraId && cameraIds.includes(defaultCameraId)) {
          // Priority 2: Use browser's default camera (first-time user)
          // This is the camera the user just allowed in the browser permission prompt
          mediaLogger.debug("Using browser default camera:", defaultCameraId);
          cameraToSelect = defaultCameraId;
          // Persist this selection so it's remembered next time
          persistDevices(nodeId, { cameraId: defaultCameraId });
        } else {
          mediaLogger.debug("No camera available to select");
        }

        if (cameraToSelect) {
          selectedCamera = cameraToSelect;

          // Check if we can reuse the permission stream for BOTH capability detection AND preview
          // This is possible when using the default camera (same device as permission stream)
          const canReusePermissionStream = cameraToSelect === defaultCameraId;

          if (canReusePermissionStream) {
            // OPTIMIZATION: Reuse permission stream for capability detection
            // AND return it for preview use (avoids 2 extra getUserMedia calls!)
            // Permission stream already has audio from the default mic
            const { capabilities } = await detectCameraCapabilities(
              cameraToSelect,
              permissionStream,
            );
            setCameraCapabilities(capabilities);

            // Return the stream for preview use
            // IMPORTANT: Don't set camera state here - let the caller handle it
            // so they can adopt the stream BEFORE the useCameraChange effect runs
            initialStreamToReturn = permissionStream;
            mediaLogger.debug(
              "Returning permission stream - caller should set camera state after adopting",
            );
            // NOTE: We do NOT call setSelectedCamera here - caller must do it
          } else {
            // Different camera than permission stream - detect capabilities AND keep stream for preview
            for (const track of permissionStream.getTracks()) {
              track.stop();
            }
            mediaLogger.debug(
              "Permission stream stopped (using different camera)",
            );

            // IMPORTANT: Wait for audio device to be fully released before requesting new stream
            // Android browsers often have issues if we request audio immediately after stopping
            // a previous stream. 100ms delay helps prevent "microphone lost" issues.
            await new Promise((resolve) => setTimeout(resolve, 100));

            // OPTIMIZATION: Keep the capability detection stream for preview
            // This avoids an extra getUserMedia call
            // Pass microphoneId so the stream includes audio for streaming
            const { capabilities, stream: capStream } = await detectCameraCapabilities(
              cameraToSelect,
              undefined,
              true, // keepStream - don't close it, we'll use it for preview
              micToSelect, // Include audio track with selected microphone
            );
            setCameraCapabilities(capabilities);

            if (capStream) {
              // Return the stream for preview use
              initialStreamToReturn = capStream;
              mediaLogger.debug(
                "Returning capability stream for preview reuse (with audio)",
              );
            }
            // NOTE: We do NOT call setSelectedCamera here - caller must do it after adopting stream
          }
        } else {
          // No camera to select - stop the permission stream now
          for (const track of permissionStream.getTracks()) {
            track.stop();
          }
          mediaLogger.debug("Permission stream stopped (no camera to select)");
        }

        // Restore persisted speaker if available
        if (persisted.speakerId && speakerIds.includes(persisted.speakerId)) {
          setSelectedSpeaker(persisted.speakerId);
        }

        eventBus.emit("media:device-changed", { devices });
      } catch (error) {
        const err = error as Error;
        mediaLogger.error("❌ Failed to enumerate devices:", err);

        // Provide user-friendly error messages
        let userMessage = err.message;
        if (
          err.name === "NotAllowedError" ||
          err.name === "PermissionDeniedError"
        ) {
          userMessage =
            "Permission caméra/micro refusée. Autorisez l'accès dans les paramètres du navigateur.";
        } else if (
          err.name === "NotFoundError" ||
          err.name === "DevicesNotFoundError"
        ) {
          userMessage = "Aucune caméra ou microphone détecté.";
        } else if (
          err.name === "NotReadableError" ||
          err.name === "TrackStartError"
        ) {
          userMessage = "La caméra est utilisée par une autre application.";
        } else if (err.name === "OverconstrainedError") {
          userMessage = "La caméra ne supporte pas les paramètres demandés.";
        }

        setDevicesError(new Error(userMessage));
      } finally {
        setDevicesLoading(false);
      }

      return {
        cameraId: selectedCamera,
        microphoneId: selectedMic,
        initialStream: initialStreamToReturn,
      };
    }, [
      nodeId,
      setDevices,
      setDevicesLoading,
      setDevicesError,
      setSelectedCamera,
      setSelectedMicrophone,
      setSelectedSpeaker,
      detectCameraCapabilities,
      setCameraCapabilities,
      persistDevices,
    ]);

  // Select camera, persist for this node, and detect capabilities
  // IMPORTANT: Detect capabilities FIRST (which locks camera), then set state
  // This prevents race conditions where SenderDashboard tries to start preview
  // while capability detection still has the camera locked
  const selectCamera = useCallback(
    async (deviceId: string | null) => {
      // Detect capabilities BEFORE setting state (this locks and releases camera)
      if (deviceId) {
        mediaLogger.debug(
          "📹 selectCamera: detecting capabilities first for",
          deviceId,
        );
        const { capabilities } = await detectCameraCapabilities(deviceId);
        setCameraCapabilities(capabilities);
        mediaLogger.debug(
          "📹 selectCamera: capabilities detected, now setting camera state",
        );
      } else {
        setCameraCapabilities(null);
      }

      // NOW set the camera state - this triggers effects in SenderDashboard
      // Camera should be free at this point
      setSelectedCamera(deviceId);
      persistDevices(nodeId, { cameraId: deviceId });
    },
    [
      nodeId,
      setSelectedCamera,
      persistDevices,
      detectCameraCapabilities,
      setCameraCapabilities,
    ],
  );

  // Select microphone and persist for this node
  const selectMicrophone = useCallback(
    (deviceId: string | null) => {
      setSelectedMicrophone(deviceId);
      persistDevices(nodeId, { microphoneId: deviceId });
    },
    [nodeId, setSelectedMicrophone, persistDevices],
  );

  // Select speaker and persist for this node
  const selectSpeaker = useCallback(
    (deviceId: string | null) => {
      setSelectedSpeaker(deviceId);
      persistDevices(nodeId, { speakerId: deviceId });
    },
    [nodeId, setSelectedSpeaker, persistDevices],
  );

  // Listen for device changes
  // Note: navigator.mediaDevices is only available in secure contexts (HTTPS or localhost)
  useEffect(() => {
    // Guard against missing mediaDevices (happens on HTTP non-localhost)
    if (!navigator.mediaDevices) {
      mediaLogger.error(
        "❌ navigator.mediaDevices is not available. This usually means you're not using HTTPS. WebRTC requires a secure context (HTTPS or localhost).",
      );
      setDevicesError(
        new Error(
          "WebRTC requires HTTPS. Please access via https:// or localhost.",
        ),
      );
      return;
    }

    const handleDeviceChange = () => {
      enumerateDevices();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    return () => {
      navigator.mediaDevices.removeEventListener(
        "devicechange",
        handleDeviceChange,
      );
    };
  }, [enumerateDevices, setDevicesError]);

  return {
    // Devices
    cameras,
    microphones,
    speakers,

    // Selected (runtime state)
    selectedCameraId,
    selectedMicrophoneId,
    selectedSpeakerId,

    // Persisted selections for this node
    persistedDevices,

    // Capabilities
    cameraCapabilities,

    // State
    isLoading: devicesLoading,
    error: devicesError,

    // Actions
    enumerateDevices,
    selectCamera,
    selectMicrophone,
    selectSpeaker,
  };
}
