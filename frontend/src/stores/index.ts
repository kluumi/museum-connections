// Combined Zustand store with slices
// Pattern: Zustand store composition

import { create } from "zustand";
import { devtools, persist, subscribeWithSelector } from "zustand/middleware";
import { type ConnectionSlice, createConnectionSlice } from "./connectionSlice";
import { createDevicesSlice, type DevicesSlice } from "./devicesSlice";
import { createMetricsSlice, type MetricsSlice } from "./metricsSlice";
import { createStreamSlice, type StreamSlice } from "./streamSlice";
import type { Theme } from "./themeSlice";

// Combined store type
export type AppStore = ConnectionSlice &
  StreamSlice &
  MetricsSlice &
  DevicesSlice;

// Custom serializer for Redux DevTools to handle Map and Set
const serializeOptions = {
  options: {
    map: true, // Enable Map serialization
    set: true, // Enable Set serialization
  },
};

// Create the combined store
export const useStore = create<AppStore>()(
  devtools(
    subscribeWithSelector((...a) => ({
      ...createConnectionSlice(...a),
      ...createStreamSlice(...a),
      ...createMetricsSlice(...a),
      ...createDevicesSlice(...a),
    })),
    {
      name: "webrtc-store",
      serialize: serializeOptions,
    },
  ),
);

// Default video settings
const defaultVideoSettings: StreamSlice["videoSettings"] = {
  mode: "manual",
  resolution: "auto",
  fps: "auto",
  bitrate: "auto",
  codec: "auto",
};

// Video settings keyed by "nodeId:cameraDeviceId" (e.g., "nantes:abc123", "paris:def456")
// This allows each camera on each node to have its own settings
type DeviceVideoSettings = Record<string, StreamSlice["videoSettings"]>;

// Helper to create device settings key
const makeDeviceKey = (nodeId: string, cameraId: string) =>
  `${nodeId}:${cameraId}`;

// Persisted settings store (video settings per device, selected devices, theme, streaming state)
interface SettingsStore {
  // Theme
  theme: Theme;
  setTheme: (theme: Theme) => void;

  // Video settings per device (keyed by "nodeId:cameraDeviceId")
  deviceVideoSettings: DeviceVideoSettings;
  getVideoSettings: (
    nodeId: "nantes" | "paris",
    cameraId: string | null,
  ) => StreamSlice["videoSettings"];
  setVideoSettings: (
    nodeId: "nantes" | "paris",
    cameraId: string | null,
    settings: Partial<StreamSlice["videoSettings"]>,
  ) => void;

  // Device selection per node (keyed by nodeId)
  selectedDevices: Record<
    string,
    {
      cameraId: string | null;
      microphoneId: string | null;
      speakerId: string | null;
      audioEnabled: boolean;
    }
  >;
  getSelectedDevices: (nodeId: string) => {
    cameraId: string | null;
    microphoneId: string | null;
    speakerId: string | null;
    audioEnabled: boolean;
  };
  setSelectedDevices: (
    nodeId: string,
    devices: {
      cameraId?: string | null;
      microphoneId?: string | null;
      speakerId?: string | null;
      audioEnabled?: boolean;
    },
  ) => void;

  // Streaming state per node (true = was streaming before page close/refresh)
  streamingStates: Record<string, boolean>;
  getStreamingState: (nodeId: string) => boolean;
  setStreamingState: (nodeId: string, streaming: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      // Theme - default to system
      theme: "system",
      setTheme: (theme) => set({ theme }),

      // Video settings per device
      deviceVideoSettings: {},
      getVideoSettings: (nodeId, cameraId) => {
        if (!cameraId) return { ...defaultVideoSettings };
        const key = makeDeviceKey(nodeId, cameraId);
        return get().deviceVideoSettings[key] ?? { ...defaultVideoSettings };
      },
      setVideoSettings: (nodeId, cameraId, settings) => {
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
      selectedDevices: {},
      getSelectedDevices: (nodeId) => {
        const stored = get().selectedDevices[nodeId];
        return (
          stored ?? {
            cameraId: null,
            microphoneId: null,
            speakerId: null,
            audioEnabled: true,
          }
        );
      },
      setSelectedDevices: (nodeId, devices) =>
        set((state) => {
          const current = state.selectedDevices[nodeId] ?? {
            cameraId: null,
            microphoneId: null,
            speakerId: null,
            audioEnabled: true,
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
                audioEnabled:
                  devices.audioEnabled !== undefined
                    ? devices.audioEnabled
                    : current.audioEnabled,
              },
            },
          };
        }),

      // Streaming state per node
      streamingStates: {},
      getStreamingState: (nodeId) => get().streamingStates[nodeId] ?? false,
      setStreamingState: (nodeId, streaming) =>
        set((state) => ({
          streamingStates: {
            ...state.streamingStates,
            [nodeId]: streaming,
          },
        })),
    }),
    {
      name: "webrtc-settings",
      partialize: (state) => ({
        theme: state.theme,
        deviceVideoSettings: state.deviceVideoSettings,
        selectedDevices: state.selectedDevices,
        streamingStates: state.streamingStates,
      }),
    },
  ),
);

// Re-export slice types
export type { ConnectionSlice } from "./connectionSlice";
export type { DevicesSlice } from "./devicesSlice";
export type { MetricsSlice } from "./metricsSlice";
export type { StreamSlice } from "./streamSlice";
export type { Theme } from "./themeSlice";
