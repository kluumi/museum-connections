// Devices slice - manages media device enumeration and selection
// Pattern: Zustand slice for modular state management

import type { StateCreator } from "zustand";

// Camera capabilities detected from hardware
export interface CameraCapabilities {
  maxWidth: number;
  maxHeight: number;
  maxFrameRate: number;
  supportedResolutions: Array<{ width: number; height: number; label: string }>;
  supportedFrameRates: number[];
}

export interface DevicesSlice {
  // Available devices
  cameras: MediaDeviceInfo[];
  microphones: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];

  // Selected device IDs
  selectedCameraId: string | null;
  selectedMicrophoneId: string | null;
  selectedSpeakerId: string | null;

  // Camera capabilities (detected from selected camera)
  cameraCapabilities: CameraCapabilities | null;

  // Loading/error state
  devicesLoading: boolean;
  devicesError: Error | null;

  // Actions
  setDevices: (devices: MediaDeviceInfo[]) => void;
  setSelectedCamera: (deviceId: string | null) => void;
  setSelectedMicrophone: (deviceId: string | null) => void;
  setSelectedSpeaker: (deviceId: string | null) => void;
  setCameraCapabilities: (capabilities: CameraCapabilities | null) => void;
  setDevicesLoading: (loading: boolean) => void;
  setDevicesError: (error: Error | null) => void;
  reset: () => void;
}

const initialState = {
  cameras: [] as MediaDeviceInfo[],
  microphones: [] as MediaDeviceInfo[],
  speakers: [] as MediaDeviceInfo[],
  selectedCameraId: null as string | null,
  selectedMicrophoneId: null as string | null,
  selectedSpeakerId: null as string | null,
  cameraCapabilities: null as CameraCapabilities | null,
  devicesLoading: false,
  devicesError: null as Error | null,
};

export const createDevicesSlice: StateCreator<
  DevicesSlice,
  [],
  [],
  DevicesSlice
> = (set) => ({
  ...initialState,

  setDevices: (devices) =>
    set({
      cameras: devices.filter((d) => d.kind === "videoinput"),
      microphones: devices.filter((d) => d.kind === "audioinput"),
      speakers: devices.filter((d) => d.kind === "audiooutput"),
    }),

  setSelectedCamera: (selectedCameraId) => set({ selectedCameraId }),

  setSelectedMicrophone: (selectedMicrophoneId) =>
    set({ selectedMicrophoneId }),

  setSelectedSpeaker: (selectedSpeakerId) => set({ selectedSpeakerId }),

  setCameraCapabilities: (cameraCapabilities) => set({ cameraCapabilities }),

  setDevicesLoading: (devicesLoading) => set({ devicesLoading }),

  setDevicesError: (devicesError) => set({ devicesError }),

  reset: () => set(initialState),
});
