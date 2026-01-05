// useSenderSettings - Manages persisted video and audio settings for senders
// Pattern: Bridge between useSettingsStore and sender dashboard

import { useCallback } from "react";
import type { SenderNodeId } from "@/constants/node-ids";
import { useSettingsStore } from "@/stores";
import type { VideoSettings } from "@/types";

export interface UseSenderSettingsOptions {
  nodeId: SenderNodeId;
  selectedCameraId: string | null;
}

export interface UseSenderSettingsResult {
  /** Current video settings for this camera */
  videoSettings: VideoSettings;
  /** Update video settings (partial update supported) */
  setVideoSettings: (settings: Partial<VideoSettings>) => void;
  /** Reset video settings to defaults */
  resetVideoSettings: () => void;
  /** Whether audio is enabled */
  isAudioEnabled: boolean;
  /** Set audio enabled state */
  setAudioEnabled: (enabled: boolean) => void;
}

/**
 * Hook to manage persisted sender settings.
 * Provides a clean interface over useSettingsStore for sender-specific settings.
 */
export function useSenderSettings({
  nodeId,
  selectedCameraId,
}: UseSenderSettingsOptions): UseSenderSettingsResult {
  const {
    getPersistedVideoSettings,
    setPersistedVideoSettings,
    getSelectedDevices,
    setSelectedDevices,
  } = useSettingsStore();

  const isAudioEnabled = getSelectedDevices(nodeId).isAudioEnabled;
  const videoSettings = getPersistedVideoSettings(nodeId, selectedCameraId);

  const setVideoSettings = useCallback(
    (settings: Partial<VideoSettings>) => {
      console.log("🔧 setVideoSettings called:", {
        nodeId,
        selectedCameraId,
        settings,
      });
      setPersistedVideoSettings(nodeId, selectedCameraId, settings);
    },
    [nodeId, selectedCameraId, setPersistedVideoSettings],
  );

  const resetVideoSettings = useCallback(() => {
    setVideoSettings({
      mode: "manual",
      resolution: "auto",
      fps: "auto",
      bitrate: "auto",
      codec: "auto",
    });
  }, [setVideoSettings]);

  const setAudioEnabled = useCallback(
    (enabled: boolean) => {
      setSelectedDevices(nodeId, { isAudioEnabled: enabled });
    },
    [nodeId, setSelectedDevices],
  );

  return {
    videoSettings,
    setVideoSettings,
    resetVideoSettings,
    isAudioEnabled,
    setAudioEnabled,
  };
}
