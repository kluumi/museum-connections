// Stream slice - manages local and remote media streams
// Pattern: Zustand slice for modular state management

import type { StateCreator } from "zustand";
import type { NodeId } from "@/constants";
import type { VideoSettings } from "@/types";

export interface StreamSlice {
  // Local stream
  localStream: MediaStream | null;

  // Remote streams (keyed by peer ID)
  remoteStreams: Map<NodeId, MediaStream>;

  // Video settings
  videoSettings: VideoSettings;

  // Actions
  setLocalStream: (stream: MediaStream | null) => void;
  addRemoteStream: (peerId: NodeId, stream: MediaStream) => void;
  removeRemoteStream: (peerId: NodeId) => void;
  setVideoSettings: (settings: Partial<VideoSettings>) => void;
  reset: () => void;
}

const defaultVideoSettings: VideoSettings = {
  mode: "manual",
  resolution: "auto",
  fps: "auto",
  bitrate: "auto",
  codec: "auto",
};

const initialState = {
  localStream: null as MediaStream | null,
  remoteStreams: new Map<NodeId, MediaStream>(),
  videoSettings: defaultVideoSettings,
};

export const createStreamSlice: StateCreator<
  StreamSlice,
  [],
  [],
  StreamSlice
> = (set) => ({
  ...initialState,

  setLocalStream: (stream) => set({ localStream: stream }),

  addRemoteStream: (peerId, stream) =>
    set((state) => {
      const newMap = new Map(state.remoteStreams);
      newMap.set(peerId, stream);
      return { remoteStreams: newMap };
    }),

  removeRemoteStream: (peerId) =>
    set((state) => {
      const newMap = new Map(state.remoteStreams);
      newMap.delete(peerId);
      return { remoteStreams: newMap };
    }),

  setVideoSettings: (settings) =>
    set((state) => ({
      videoSettings: { ...state.videoSettings, ...settings },
    })),

  reset: () =>
    set({
      ...initialState,
      remoteStreams: new Map(),
    }),
});
