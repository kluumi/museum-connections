// Settings slice - manages persisted user preferences
// Pattern: Zustand slice for modular state management
// This slice is persisted to localStorage

import type { StateCreator } from "zustand";
import { VOX_DUCKING_CONFIG } from "@/config/webrtc";
import type { VideoSettings } from "@/types";

export type Theme = "light" | "dark" | "system";

// VOX Ducking settings
export interface VoxSettings {
  /** Audio level threshold to trigger ducking (0-1). Lower = more sensitive */
  activationThreshold: number;
  /** Audio level threshold to release ducking (0-1). Lower than activation for hysteresis */
  deactivationThreshold: number;
  /** Time to wait before releasing ducking after audio drops below threshold (ms) */
  holdTime: number;
  /** Gain level when ducked (0-1). 0.15 = 15% volume */
  duckedGain: number;
}

// Default VOX settings from config
const defaultVoxSettings: VoxSettings = {
  activationThreshold: VOX_DUCKING_CONFIG.activationThreshold,
  deactivationThreshold: VOX_DUCKING_CONFIG.deactivationThreshold,
  holdTime: VOX_DUCKING_CONFIG.holdTime,
  duckedGain: VOX_DUCKING_CONFIG.duckedGain,
};

// Default video settings
const defaultVideoSettings: VideoSettings = {
  mode: "manual",
  resolution: "auto",
  fps: "auto",
  bitrate: "auto",
  codec: "auto",
};

// Device selection per node
interface DeviceSelection {
  cameraId: string | null;
  microphoneId: string | null;
  speakerId: string | null;
  isAudioEnabled: boolean;
}

const defaultDeviceSelection: DeviceSelection = {
  cameraId: null,
  microphoneId: null,
  speakerId: null,
  isAudioEnabled: true,
};

// Helper to create device settings key
const makeDeviceKey = (nodeId: string, cameraId: string) =>
  `${nodeId}:${cameraId}`;

export interface SettingsSlice {
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;

  // Video settings per device (keyed by "nodeId:cameraDeviceId")
  // These are PERSISTED settings, different from runtime videoSettings in StreamSlice
  deviceVideoSettings: Record<string, VideoSettings>;
  getPersistedVideoSettings: (
    nodeId: "nantes" | "paris",
    cameraId: string | null,
  ) => VideoSettings;
  setPersistedVideoSettings: (
    nodeId: "nantes" | "paris",
    cameraId: string | null,
    settings: Partial<VideoSettings>,
  ) => void;

  // Device selection per node (keyed by nodeId)
  selectedDevices: Record<string, DeviceSelection>;
  getSelectedDevices: (nodeId: string) => DeviceSelection;
  setSelectedDevices: (
    nodeId: string,
    devices: Partial<DeviceSelection>,
  ) => void;

  // Streaming state per node (true = was streaming before page close/refresh)
  streamingStates: Record<string, boolean>;
  getStreamingState: (nodeId: string) => boolean;
  setStreamingState: (nodeId: string, streaming: boolean) => void;

  // VOX Ducking settings (global, not per-node)
  voxSettings: VoxSettings;
  setVoxSettings: (settings: Partial<VoxSettings>) => void;
  resetVoxSettings: () => void;
}

const initialSettingsState = {
  theme: "system" as Theme,
  deviceVideoSettings: {} as Record<string, VideoSettings>,
  selectedDevices: {} as Record<string, DeviceSelection>,
  streamingStates: {} as Record<string, boolean>,
  voxSettings: { ...defaultVoxSettings },
};

export const createSettingsSlice: StateCreator<
  SettingsSlice,
  [],
  [],
  SettingsSlice
> = (set, get) => ({
  ...initialSettingsState,

  // Theme
  setTheme: (theme) => set({ theme }),

  // Persisted video settings per device
  getPersistedVideoSettings: (nodeId, cameraId) => {
    if (!cameraId) return { ...defaultVideoSettings };
    const key = makeDeviceKey(nodeId, cameraId);
    return get().deviceVideoSettings[key] ?? { ...defaultVideoSettings };
  },

  setPersistedVideoSettings: (nodeId, cameraId, settings) => {
    if (!cameraId) return; // Don't save if no camera selected
    const key = makeDeviceKey(nodeId, cameraId);
    set((state) => ({
      deviceVideoSettings: {
        ...state.deviceVideoSettings,
        [key]: {
          ...(state.deviceVideoSettings[key] ?? defaultVideoSettings),
          ...settings,
        },
      },
    }));
  },

  // Device selection per node
  getSelectedDevices: (nodeId) => {
    const stored = get().selectedDevices[nodeId];
    return stored ?? { ...defaultDeviceSelection };
  },

  setSelectedDevices: (nodeId, devices) =>
    set((state) => {
      const current = state.selectedDevices[nodeId] ?? {
        ...defaultDeviceSelection,
      };
      return {
        selectedDevices: {
          ...state.selectedDevices,
          [nodeId]: {
            cameraId:
              devices.cameraId !== undefined
                ? devices.cameraId
                : current.cameraId,
            microphoneId:
              devices.microphoneId !== undefined
                ? devices.microphoneId
                : current.microphoneId,
            speakerId:
              devices.speakerId !== undefined
                ? devices.speakerId
                : current.speakerId,
            isAudioEnabled:
              devices.isAudioEnabled !== undefined
                ? devices.isAudioEnabled
                : current.isAudioEnabled,
          },
        },
      };
    }),

  // Streaming state per node
  getStreamingState: (nodeId) => get().streamingStates[nodeId] ?? false,

  setStreamingState: (nodeId, streaming) =>
    set((state) => ({
      streamingStates: {
        ...state.streamingStates,
        [nodeId]: streaming,
      },
    })),

  // VOX Ducking settings
  setVoxSettings: (settings) =>
    set((state) => ({
      voxSettings: {
        ...state.voxSettings,
        ...settings,
      },
    })),

  resetVoxSettings: () => set({ voxSettings: { ...defaultVoxSettings } }),
});

// Export the partialize function for persist middleware
// Uses Pick to accept any state that contains SettingsSlice properties
export const settingsPartialize = <T extends SettingsSlice>(state: T) => ({
  theme: state.theme,
  deviceVideoSettings: state.deviceVideoSettings,
  selectedDevices: state.selectedDevices,
  streamingStates: state.streamingStates,
  voxSettings: state.voxSettings,
});
