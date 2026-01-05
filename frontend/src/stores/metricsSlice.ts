// Metrics slice - manages WebRTC statistics and quality scores
// Pattern: Zustand slice for modular state management

import type { StateCreator } from "zustand";
import type { NodeId } from "@/constants";
import type { MetricsHistory, PeerMetrics } from "@/types";

export interface MetricsSlice {
  // Current metrics per peer
  peerMetrics: Map<NodeId, PeerMetrics>;

  // Metrics history for charts (last N samples)
  metricsHistory: Map<NodeId, MetricsHistory>;

  // History settings
  historyMaxSamples: number;

  // Actions
  updatePeerMetrics: (peerId: NodeId, metrics: PeerMetrics) => void;
  removePeerMetrics: (peerId: NodeId) => void;
  setHistoryMaxSamples: (max: number) => void;
  clearHistory: (peerId?: NodeId) => void;
  reset: () => void;
}

const INITIAL_HISTORY_MAX = 60; // ~2 minutes at 2s interval

const createEmptyHistory = (): MetricsHistory => ({
  timestamps: [],
  bitrates: [],
  fps: [],
  rtt: [],
  packetLoss: [],
});

const initialState = {
  peerMetrics: new Map<NodeId, PeerMetrics>(),
  metricsHistory: new Map<NodeId, MetricsHistory>(),
  historyMaxSamples: INITIAL_HISTORY_MAX,
};

export const createMetricsSlice: StateCreator<
  MetricsSlice,
  [],
  [],
  MetricsSlice
> = (set) => ({
  ...initialState,

  updatePeerMetrics: (peerId, metrics) =>
    set((state) => {
      // Update current metrics
      const newMetrics = new Map(state.peerMetrics);
      newMetrics.set(peerId, metrics);

      // Update history with immutable operations
      const newHistory = new Map(state.metricsHistory);
      const prev = newHistory.get(peerId) ?? createEmptyHistory();
      const max = state.historyMaxSamples;

      // Use slice (O(n) but single operation) instead of push+splice (multiple O(n) operations)
      // slice(-max + 1) keeps last (max-1) items, then we append the new one
      const needsTrim = prev.timestamps.length >= max;
      const sliceStart = needsTrim ? -(max - 1) : 0;

      const updatedHistory: MetricsHistory = {
        timestamps: [...prev.timestamps.slice(sliceStart), metrics.timestamp],
        bitrates: [...prev.bitrates.slice(sliceStart), metrics.video.bitrate],
        fps: [...prev.fps.slice(sliceStart), metrics.video.fps],
        rtt: [...prev.rtt.slice(sliceStart), metrics.connection.rtt],
        packetLoss: [
          ...prev.packetLoss.slice(sliceStart),
          metrics.video.packetLoss,
        ],
      };

      newHistory.set(peerId, updatedHistory);

      return { peerMetrics: newMetrics, metricsHistory: newHistory };
    }),

  removePeerMetrics: (peerId) =>
    set((state) => {
      const newMetrics = new Map(state.peerMetrics);
      const newHistory = new Map(state.metricsHistory);
      newMetrics.delete(peerId);
      newHistory.delete(peerId);
      return { peerMetrics: newMetrics, metricsHistory: newHistory };
    }),

  setHistoryMaxSamples: (historyMaxSamples) => set({ historyMaxSamples }),

  clearHistory: (peerId) =>
    set((state) => {
      const newHistory = new Map(state.metricsHistory);
      if (peerId) {
        newHistory.set(peerId, createEmptyHistory());
      } else {
        newHistory.clear();
      }
      return { metricsHistory: newHistory };
    }),

  reset: () =>
    set({
      peerMetrics: new Map(),
      metricsHistory: new Map(),
      historyMaxSamples: INITIAL_HISTORY_MAX,
    }),
});
