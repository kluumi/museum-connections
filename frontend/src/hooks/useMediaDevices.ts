// useMediaDevices - Hook for device enumeration and selection
// Pattern: Composable hooks with single responsibility

import { useCallback, useEffect, useMemo } from "react";
import { eventBus } from "@/lib/events";
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

interface UseMediaDevicesOptions {
  nodeId: "nantes" | "paris";
}

/**
 * Hook for managing media device enumeration and selection
 * Device selections are persisted per node (nantes/paris can have different devices)
 */
export function useMediaDevices({ nodeId }: UseMediaDevicesOptions) {
  const {
    cameras,
    microphones,
    speakers,
    cameraCapabilities,
    devicesLoading,
    devicesError,
    setDevices,
    setSelectedCamera,
    setSelectedMicrophone,
    setSelectedSpeaker,
    setCameraCapabilities,
    setDevicesLoading,
    setDevicesError,
  } = useStore();

  // Get persisted device selections for this node
  const { getSelectedDevices, setSelectedDevices: persistDevices } =
    useSettingsStore();
  const persistedDevices = useMemo(
    () => getSelectedDevices(nodeId),
    [getSelectedDevices, nodeId],
  );

  // Current selections from runtime store
  const selectedCameraId = useStore((s) => s.selectedCameraId);
  const selectedMicrophoneId = useStore((s) => s.selectedMicrophoneId);
  const selectedSpeakerId = useStore((s) => s.selectedSpeakerId);

  // Detect camera capabilities by getting a stream and reading track capabilities
  const detectCameraCapabilities = useCallback(
    async (deviceId: string): Promise<CameraCapabilities | null> => {
      try {
        console.log("📹 Detecting capabilities for camera:", deviceId);

        // Get a stream from the camera to access its capabilities
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: deviceId } },
        });

        const videoTrack = stream.getVideoTracks()[0];
        if (!videoTrack) {
          console.warn("📹 No video track found");
          for (const t of stream.getTracks()) {
            t.stop();
          }
          return null;
        }

        // Get capabilities from the track
        const capabilities = videoTrack.getCapabilities?.();
        // Stop the test stream
        for (const t of stream.getTracks()) {
          t.stop();
        }

        // Wait for camera to fully release before returning
        // Increased to 500ms for mobile/5G devices where camera takes longer to settle
        await new Promise((resolve) => setTimeout(resolve, 500));

        if (!capabilities) {
          console.warn("📹 getCapabilities() not supported");
          return null;
        }

        console.log("📹 Raw camera capabilities:", capabilities);
        console.log("📹 frameRate range:", {
          min: capabilities.frameRate?.min,
          max: capabilities.frameRate?.max,
        });
        console.log("📹 resolution range:", {
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
          console.log(
            `📹 Note: Camera max FPS is ${maxFrameRate}. This may be a hardware/USB bandwidth limitation.`,
          );
          console.log(
            "📹 Tip: Try lower resolution for higher FPS (720p or lower often supports 60fps)",
          );
        }

        // Filter standard resolutions to only those supported by this camera
        // A resolution is supported if BOTH width AND height fit within the camera's max
        const supportedResolutions = STANDARD_RESOLUTIONS.filter(
          (res) => res.width <= maxWidth && res.height <= maxHeight,
        ).map((res) => ({ ...res }));

        console.log(
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

        console.log("📹 Detected camera capabilities:", result);
        return result;
      } catch (error) {
        console.error("📹 Failed to detect camera capabilities:", error);
        return null;
      }
    },
    [],
  );

  // Enumerate devices
  // Returns the selected device IDs (persisted or defaults) for immediate use
  // This avoids race conditions when starting media right after enumeration
  const enumerateDevices = useCallback(async (): Promise<{
    cameraId: string | null;
    microphoneId: string | null;
  }> => {
    setDevicesLoading(true);
    setDevicesError(null);

    let selectedCamera: string | null = null;
    let selectedMic: string | null = null;

    // Check for secure context (HTTPS or localhost)
    if (!navigator.mediaDevices) {
      const error = new Error(
        "WebRTC requires HTTPS. Please use https:// or localhost to access camera/microphone.",
      );
      console.error(
        "❌ navigator.mediaDevices not available - not a secure context (HTTPS required)",
      );
      setDevicesError(error);
      setDevicesLoading(false);
      return { cameraId: null, microphoneId: null };
    }

    try {
      // Request permission first (needed for labels)
      // IMPORTANT: Stop the tracks immediately to release the camera
      // Otherwise the camera gets "locked" at its default resolution
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      for (const track of permissionStream.getTracks()) {
        track.stop();
      }
      console.log("📹 Permission stream stopped to release camera");

      const devices = await navigator.mediaDevices.enumerateDevices();
      console.log("📹 All devices found:", devices.length);

      const videoDevices = devices.filter((d) => d.kind === "videoinput");
      const audioDevices = devices.filter((d) => d.kind === "audioinput");
      console.log(
        "📹 Cameras found:",
        videoDevices.length,
        videoDevices.map((d) => d.label || d.deviceId.slice(0, 8)),
      );
      console.log(
        "🎤 Microphones found:",
        audioDevices.length,
        audioDevices.map((d) => d.label || d.deviceId.slice(0, 8)),
      );

      setDevices(devices);

      // Get persisted selections for this node
      const persisted = useSettingsStore.getState().getSelectedDevices(nodeId);
      const cameraIds = videoDevices.map((d) => d.deviceId);
      const micIds = audioDevices.map((d) => d.deviceId);
      const speakerIds = devices
        .filter((d) => d.kind === "audiooutput")
        .map((d) => d.deviceId);

      // Restore persisted camera if available, otherwise user must select manually
      // This allows returning users to have their camera restored on refresh
      console.log("📹 Persisted selections:", persisted);
      console.log("📹 Available cameras:", cameraIds);

      if (persisted.cameraId && cameraIds.includes(persisted.cameraId)) {
        // Restore previously selected camera
        // IMPORTANT: Detect capabilities FIRST (locks camera), then set state
        // This prevents race condition where SenderDashboard tries to start preview
        // while capability detection still has the camera locked
        console.log("📹 Restoring persisted camera:", persisted.cameraId);
        selectedCamera = persisted.cameraId;

        // Detect capabilities first (this acquires and releases the camera)
        const caps = await detectCameraCapabilities(persisted.cameraId);
        setCameraCapabilities(caps);

        // NOW set camera state - SenderDashboard effect will trigger after camera is free
        console.log("📹 Capabilities detected, now setting camera state");
        setSelectedCamera(persisted.cameraId);
      } else {
        console.log(
          "📹 No persisted camera or not available - waiting for user selection",
        );
      }

      // Restore persisted microphone if available, otherwise user must select manually
      // Same behavior as camera - no auto-select on first visit
      if (persisted.microphoneId && micIds.includes(persisted.microphoneId)) {
        console.log(
          "🎤 Restoring persisted microphone:",
          persisted.microphoneId,
        );
        selectedMic = persisted.microphoneId;
        setSelectedMicrophone(persisted.microphoneId);
      } else {
        console.log(
          "🎤 No persisted microphone or not available - waiting for user selection",
        );
      }
      if (persisted.speakerId && speakerIds.includes(persisted.speakerId)) {
        setSelectedSpeaker(persisted.speakerId);
      }

      eventBus.emit("media:device-changed", { devices });
    } catch (error) {
      console.error("Failed to enumerate devices:", error);
      setDevicesError(error as Error);
    } finally {
      setDevicesLoading(false);
    }

    return { cameraId: selectedCamera, microphoneId: selectedMic };
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
  ]);

  // Select camera, persist for this node, and detect capabilities
  // IMPORTANT: Detect capabilities FIRST (which locks camera), then set state
  // This prevents race conditions where SenderDashboard tries to start preview
  // while capability detection still has the camera locked
  const selectCamera = useCallback(
    async (deviceId: string | null) => {
      // Detect capabilities BEFORE setting state (this locks and releases camera)
      if (deviceId) {
        console.log(
          "📹 selectCamera: detecting capabilities first for",
          deviceId,
        );
        const capabilities = await detectCameraCapabilities(deviceId);
        setCameraCapabilities(capabilities);
        console.log(
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
      console.error(
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
