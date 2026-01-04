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

      // Update history
      const newHistory = new Map(state.metricsHistory);
      const history = newHistory.get(peerId) ?? createEmptyHistory();

      // Add new sample
      history.timestamps.push(metrics.timestamp);
      history.bitrates.push(metrics.video.bitrate);
      history.fps.push(metrics.video.fps);
      history.rtt.push(metrics.connection.rtt);
      history.packetLoss.push(metrics.video.packetLoss);

      // Trim to max samples
      if (history.timestamps.length > state.historyMaxSamples) {
        const excess = history.timestamps.length - state.historyMaxSamples;
        history.timestamps.splice(0, excess);
        history.bitrates.splice(0, excess);
        history.fps.splice(0, excess);
        history.rtt.splice(0, excess);
        history.packetLoss.splice(0, excess);
      }

      newHistory.set(peerId, history);

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
