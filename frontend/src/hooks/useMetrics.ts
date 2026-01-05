// useMetrics - Hook for accessing WebRTC metrics
// Pattern: Composable hooks with single responsibility

import { useMemo } from "react";
import { getQualityColor, getQualityLabel, type NodeId } from "@/constants";
import { useStore } from "@/stores";
import type { MetricsHistory, PeerMetrics } from "@/types";

/**
 * Hook for accessing metrics for a specific peer
 */
export function useMetrics(peerId: NodeId) {
  // Use individual selectors for stable references
  const peerMetrics = useStore((s) => s.peerMetrics);
  const metricsHistory = useStore((s) => s.metricsHistory);

  const metrics = peerMetrics.get(peerId);
  const history = metricsHistory.get(peerId);

  const quality = useMemo(() => {
    if (!metrics) return null;
    return {
      score: metrics.qualityScore,
      label: getQualityLabel(metrics.qualityScore),
      color: getQualityColor(metrics.qualityScore),
    };
  }, [metrics]);

  return {
    metrics,
    history,
    quality,
    hasMetrics: !!metrics,
  };
}

/**
 * Hook for accessing metrics for all peers
 */
export function useAllMetrics() {
  // Use individual selectors for stable references
  const peerMetrics = useStore((s) => s.peerMetrics);
  const metricsHistory = useStore((s) => s.metricsHistory);

  const allMetrics = useMemo(() => {
    const result = new Map<
      NodeId,
      { metrics: PeerMetrics; history?: MetricsHistory }
    >();
    for (const [peerId, metrics] of peerMetrics) {
      result.set(peerId, {
        metrics,
        history: metricsHistory.get(peerId),
      });
    }
    return result;
  }, [peerMetrics, metricsHistory]);

  return {
    allMetrics,
    peerIds: Array.from(peerMetrics.keys()),
  };
}

/**
 * Hook for aggregated metrics (useful for operator dashboard)
 */
export function useAggregatedMetrics() {
  // Use individual selector for stable reference
  const peerMetrics = useStore((s) => s.peerMetrics);

  const aggregated = useMemo(() => {
    let totalBitrate = 0;
    let totalRtt = 0;
    let totalPacketLoss = 0;
    let lowestQuality = 100;
    let count = 0;

    for (const metrics of peerMetrics.values()) {
      totalBitrate += metrics.video.bitrate;
      totalRtt += metrics.connection.rtt;
      totalPacketLoss += metrics.video.packetLoss;
      lowestQuality = Math.min(lowestQuality, metrics.qualityScore);
      count++;
    }

    if (count === 0) {
      return {
        averageBitrate: 0,
        averageRtt: 0,
        averagePacketLoss: 0,
        lowestQuality: 0,
        peerCount: 0,
      };
    }

    return {
      averageBitrate: totalBitrate / count,
      averageRtt: totalRtt / count,
      averagePacketLoss: totalPacketLoss / count,
      lowestQuality,
      peerCount: count,
    };
  }, [peerMetrics]);

  return aggregated;
}
