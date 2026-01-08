// Combined Zustand store with slices
// Pattern: Zustand store composition with partial persistence

import { create } from "zustand";
import { devtools, persist, subscribeWithSelector } from "zustand/middleware";
import { type ConnectionSlice, createConnectionSlice } from "./connectionSlice";
import { createDevicesSlice, type DevicesSlice } from "./devicesSlice";
import { createMetricsSlice, type MetricsSlice } from "./metricsSlice";
import {
  createSettingsSlice,
  type SettingsSlice,
  settingsPartialize,
} from "./settingsSlice";
import { createStreamSlice, type StreamSlice } from "./streamSlice";

// Combined store type - all slices in one store
export type AppStore = ConnectionSlice &
  StreamSlice &
  MetricsSlice &
  DevicesSlice &
  SettingsSlice;

// Custom serializer for Redux DevTools to handle Map and Set
const serializeOptions = {
  options: {
    map: true,
    set: true,
  },
};

// Create the combined store with partial persistence
// Only settings (theme, video settings, device selections, streaming states) are persisted
export const useStore = create<AppStore>()(
  devtools(
    persist(
      subscribeWithSelector((...a) => ({
        ...createConnectionSlice(...a),
        ...createStreamSlice(...a),
        ...createMetricsSlice(...a),
        ...createDevicesSlice(...a),
        ...createSettingsSlice(...a),
      })),
      {
        name: "webrtc-settings",
        // Only persist settings slice data
        partialize: (state) => settingsPartialize(state),
      },
    ),
    {
      name: "webrtc-store",
      serialize: serializeOptions,
    },
  ),
);

// Backward compatibility alias for useSettingsStore
// This allows gradual migration - existing code using useSettingsStore will still work
export const useSettingsStore = useStore;

// Re-export slice types
export type { ConnectionSlice } from "./connectionSlice";
export type { CameraCapabilities, DevicesSlice } from "./devicesSlice";
export type { MetricsSlice } from "./metricsSlice";
export type { SettingsSlice, Theme, VoxSettings } from "./settingsSlice";
export type { StreamSlice } from "./streamSlice";
