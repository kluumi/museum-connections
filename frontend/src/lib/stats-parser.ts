// Stats Parser - Extracts and parses WebRTC stats
// Pattern: Pure utility functions for stats processing

import type { PeerMetrics } from "@/types";

/**
 * WebRTC stats types not included in TypeScript's lib.dom.d.ts
 * These are defined in the W3C WebRTC Statistics API but not yet in TS
 */

/** RTCMediaSourceStats - stats from the local media source track */
interface RTCMediaSourceStats {
  type: "media-source";
  id: string;
  timestamp: number;
  kind: "audio" | "video";
  trackIdentifier: string;
  // Video-specific properties
  width?: number;
  height?: number;
  framesPerSecond?: number;
  frames?: number;
}

/** RTCIceCandidateStats - stats about ICE candidates */
interface RTCIceCandidateStats {
  type: "local-candidate" | "remote-candidate";
  id: string;
  timestamp: number;
  transportId: string;
  address?: string;
  port?: number;
  protocol?: "udp" | "tcp";
  candidateType?: "host" | "srflx" | "prflx" | "relay";
  priority?: number;
  url?: string;
  relayProtocol?: "udp" | "tcp" | "tls";
}

/**
 * Configuration for quality score calculation thresholds
 */
export interface QualityThresholds {
  rtt: { warn: number; error: number };
  packetLoss: { warn: number; error: number };
  fps: { warn: number; error: number };
  jitter: { warn: number; error: number };
  bitrate: { warn: number; error: number };
  height: { warn: number; error: number };
  bandwidth: { warn: number; error: number };
  framesDropped: { warn: number; error: number };
}

/**
 * Default quality thresholds based on WebRTC best practices
 */
export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  rtt: { warn: 150, error: 300 },
  packetLoss: { warn: 2, error: 5 },
  fps: { warn: 24, error: 15 },
  jitter: { warn: 20, error: 50 },
  bitrate: { warn: 1000, error: 500 },
  height: { warn: 480, error: 360 },
  bandwidth: { warn: 2000, error: 1000 },
  framesDropped: { warn: 10, error: 50 },
};

/**
 * Previous stats for bitrate calculation
 */
export interface PreviousStats {
  videoBytesReceived: number;
  videoBytesSent: number;
  audioBytesReceived: number;
  audioBytesSent: number;
  timestamp: number;
}

/**
 * Intermediate parsed values from stats reports
 */
interface ParsedStatsValues {
  // Video values from different sources
  outboundWidth: number;
  outboundHeight: number;
  outboundFps: number;
  outboundCodec: string;
  inboundWidth: number;
  inboundHeight: number;
  inboundFps: number;
  inboundCodec: string;
  mediaSourceWidth: number;
  mediaSourceHeight: number;
  mediaSourceFps: number;

  // Byte counters for bitrate
  videoBytesReceived: number;
  videoBytesSent: number;
  audioBytesReceived: number;
  audioBytesSent: number;

  // Codec mapping
  codecIdToName: Map<string, string>;
}

/**
 * Initialize empty metrics object
 */
export function createEmptyMetrics(peerId: string): PeerMetrics {
  return {
    peerId,
    timestamp: Date.now(),
    video: {
      bitrate: 0,
      fps: 0,
      width: 0,
      height: 0,
      codec: "",
      packetLoss: 0,
      jitter: 0,
      framesDropped: 0,
      framesReceived: 0,
      framesSent: 0,
    },
    audio: {
      bitrate: 0,
      packetLoss: 0,
      jitter: 0,
      audioLevel: 0,
    },
    connection: {
      rtt: 0,
      localCandidateType: "",
      remoteCandidateType: "",
      protocol: "",
      bytesReceived: 0,
      bytesSent: 0,
      packetsReceived: 0,
      packetsSent: 0,
      packetsLost: 0,
      availableOutgoingBitrate: 0,
      availableIncomingBitrate: 0,
    },
    qualityScore: 0,
  };
}

/**
 * Calculate packet loss percentage
 */
export function calculatePacketLoss(lost: number, received: number): number {
  const total = lost + received;
  if (total === 0) return 0;
  return (lost / total) * 100;
}

/**
 * Build codec ID to name mapping from stats
 */
function parseCodecMap(stats: RTCStatsReport): Map<string, string> {
  const codecIdToName = new Map<string, string>();

  stats.forEach((report) => {
    if (report.type === "codec" && report.mimeType?.includes("video")) {
      codecIdToName.set(report.id, report.mimeType.split("/")[1] ?? "");
    }
  });

  return codecIdToName;
}

/**
 * Parse video stats from inbound-rtp reports (for receivers)
 */
function parseInboundVideoStats(
  report: RTCInboundRtpStreamStats,
  metrics: PeerMetrics,
  values: ParsedStatsValues,
): void {
  metrics.video.framesReceived = report.framesReceived ?? 0;
  metrics.video.framesDropped = report.framesDropped ?? 0;
  metrics.video.jitter = (report.jitter ?? 0) * 1000;
  metrics.video.packetLoss = calculatePacketLoss(
    report.packetsLost ?? 0,
    report.packetsReceived ?? 0,
  );
  values.videoBytesReceived = report.bytesReceived ?? 0;

  // Collect inbound values
  if (report.frameWidth) {
    values.inboundWidth = report.frameWidth;
    values.inboundHeight = report.frameHeight ?? 0;
  }
  if (report.framesPerSecond) {
    values.inboundFps = report.framesPerSecond;
  }
  // Get codec from codecId reference
  if (report.codecId && values.codecIdToName.has(report.codecId)) {
    values.inboundCodec = values.codecIdToName.get(report.codecId) ?? "";
  }
}

/**
 * Parse video stats from outbound-rtp reports (for senders)
 */
function parseOutboundVideoStats(
  report: RTCOutboundRtpStreamStats,
  metrics: PeerMetrics,
  values: ParsedStatsValues,
  isFirstCollection: boolean,
): void {
  metrics.video.framesSent = report.framesSent ?? 0;
  values.videoBytesSent = report.bytesSent ?? 0;

  // Collect outbound values
  if (report.frameWidth) {
    values.outboundWidth = report.frameWidth;
    values.outboundHeight = report.frameHeight ?? 0;
  }
  if (report.framesPerSecond) {
    values.outboundFps = report.framesPerSecond;
  }
  // Get codec from codecId reference
  if (report.codecId && values.codecIdToName.has(report.codecId)) {
    values.outboundCodec = values.codecIdToName.get(report.codecId) ?? "";
  }

  // Debug: log raw outbound-rtp values on first collection
  if (isFirstCollection) {
    console.log("📊 outbound-rtp raw values:", {
      frameWidth: report.frameWidth,
      frameHeight: report.frameHeight,
      framesPerSecond: report.framesPerSecond,
      bytesSent: report.bytesSent,
      codecId: report.codecId,
    });
  }
}

/**
 * Parse media source stats (local track stats - most reliable for senders)
 */
function parseMediaSourceStats(
  report: RTCMediaSourceStats,
  values: ParsedStatsValues,
  isFirstCollection: boolean,
): void {
  if (report.width) {
    values.mediaSourceWidth = report.width;
    values.mediaSourceHeight = report.height ?? 0;
  }
  if (report.framesPerSecond) {
    values.mediaSourceFps = report.framesPerSecond;
  }

  // Debug: log raw media-source values on first collection
  if (isFirstCollection) {
    console.log("📊 media-source raw values:", {
      width: report.width,
      height: report.height,
      framesPerSecond: report.framesPerSecond,
    });
  }
}

/**
 * Parse audio stats from RTP reports
 */
function parseAudioStats(
  report: RTCInboundRtpStreamStats | RTCOutboundRtpStreamStats,
  metrics: PeerMetrics,
  values: ParsedStatsValues,
  isInbound: boolean,
): void {
  if (isInbound) {
    const inboundReport = report as RTCInboundRtpStreamStats;
    metrics.audio.jitter = (inboundReport.jitter ?? 0) * 1000;
    metrics.audio.packetLoss = calculatePacketLoss(
      inboundReport.packetsLost ?? 0,
      inboundReport.packetsReceived ?? 0,
    );
    values.audioBytesReceived = inboundReport.bytesReceived ?? 0;
  } else {
    const outboundReport = report as RTCOutboundRtpStreamStats;
    values.audioBytesSent = outboundReport.bytesSent ?? 0;
  }
}

/**
 * Parse connection stats from candidate-pair
 */
function parseConnectionStats(
  report: RTCIceCandidatePairStats,
  metrics: PeerMetrics,
): void {
  metrics.connection.rtt = report.currentRoundTripTime
    ? report.currentRoundTripTime * 1000
    : 0;
  metrics.connection.bytesReceived = report.bytesReceived ?? 0;
  metrics.connection.bytesSent = report.bytesSent ?? 0;

  // Bandwidth estimation (in bits/s from WebRTC, convert to kbps)
  if (report.availableOutgoingBitrate) {
    metrics.connection.availableOutgoingBitrate =
      report.availableOutgoingBitrate / 1000;
  }
  if (report.availableIncomingBitrate) {
    metrics.connection.availableIncomingBitrate =
      report.availableIncomingBitrate / 1000;
  }
}

/**
 * Calculate bitrates from byte deltas
 */
function calculateBitrates(
  metrics: PeerMetrics,
  values: ParsedStatsValues,
  previousStats: PreviousStats | null,
  now: number,
): void {
  if (!previousStats) return;

  const timeDiff = (now - previousStats.timestamp) / 1000;
  if (timeDiff <= 0) return;

  // Video bitrate: use outbound for sender, inbound for receiver
  const videoBytesSentDiff =
    values.videoBytesSent - previousStats.videoBytesSent;
  const videoBytesReceivedDiff =
    values.videoBytesReceived - previousStats.videoBytesReceived;
  // Use whichever is active (sender sends, receiver receives)
  const videoByteDiff =
    videoBytesSentDiff > 0 ? videoBytesSentDiff : videoBytesReceivedDiff;
  metrics.video.bitrate = (videoByteDiff * 8) / timeDiff / 1000; // kbps

  // Audio bitrate: same logic
  const audioBytesSentDiff =
    values.audioBytesSent - previousStats.audioBytesSent;
  const audioBytesReceivedDiff =
    values.audioBytesReceived - previousStats.audioBytesReceived;
  const audioByteDiff =
    audioBytesSentDiff > 0 ? audioBytesSentDiff : audioBytesReceivedDiff;
  metrics.audio.bitrate = (audioByteDiff * 8) / timeDiff / 1000; // kbps
}

/**
 * Apply fallback values from local stream track settings
 */
function applyLocalStreamFallback(
  metrics: PeerMetrics,
  localStream: MediaStream | null,
  isFirstCollection: boolean,
): void {
  if (!localStream || (metrics.video.width && metrics.video.fps)) return;

  const videoTrack = localStream.getVideoTracks()[0];
  if (!videoTrack) return;

  const settings = videoTrack.getSettings();
  if (!metrics.video.width && settings.width) {
    metrics.video.width = settings.width;
    metrics.video.height = settings.height ?? 0;
    if (isFirstCollection) {
      console.log(
        "📊 Using track.getSettings() for resolution:",
        settings.width,
        "x",
        settings.height,
      );
    }
  }
  if (!metrics.video.fps && settings.frameRate) {
    metrics.video.fps = settings.frameRate;
    if (isFirstCollection) {
      console.log("📊 Using track.getSettings() for FPS:", settings.frameRate);
    }
  }
}

/**
 * Calculate quality score from metrics
 * @param metrics - The peer metrics
 * @param thresholds - Optional custom thresholds
 * @returns Quality score 0-100
 */
export function calculateQualityScore(
  metrics: PeerMetrics,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): number {
  let score = 100;

  // Deduct for high RTT
  if (metrics.connection.rtt > thresholds.rtt.error) score -= 20;
  else if (metrics.connection.rtt > thresholds.rtt.warn) score -= 10;
  else if (metrics.connection.rtt > 50) score -= 5;

  // Deduct for packet loss
  if (metrics.video.packetLoss > thresholds.packetLoss.error) score -= 25;
  else if (metrics.video.packetLoss > thresholds.packetLoss.warn) score -= 15;
  else if (metrics.video.packetLoss > 0.5) score -= 5;

  // Deduct for low FPS
  if (metrics.video.fps > 0) {
    if (metrics.video.fps < thresholds.fps.error) score -= 15;
    else if (metrics.video.fps < thresholds.fps.warn) score -= 8;
  }

  // Deduct for jitter
  if (metrics.video.jitter > thresholds.jitter.error) score -= 10;
  else if (metrics.video.jitter > thresholds.jitter.warn) score -= 5;

  // Deduct for low bitrate (kbps)
  if (metrics.video.bitrate > 0) {
    if (metrics.video.bitrate < thresholds.bitrate.error) score -= 20;
    else if (metrics.video.bitrate < thresholds.bitrate.warn) score -= 12;
    else if (metrics.video.bitrate < 2000) score -= 5;
  }

  // Deduct for low resolution
  const height = metrics.video.height;
  if (height > 0) {
    if (height < thresholds.height.error) score -= 15;
    else if (height < thresholds.height.warn) score -= 10;
    else if (height < 720) score -= 5;
  }

  // Deduct for low available bandwidth (indicates potential future degradation)
  const bandwidth =
    metrics.connection.availableOutgoingBitrate ||
    metrics.connection.availableIncomingBitrate;
  if (bandwidth > 0) {
    if (bandwidth < thresholds.bandwidth.error) score -= 15;
    else if (bandwidth < thresholds.bandwidth.warn) score -= 8;
    else if (bandwidth < 3000) score -= 3;
  }

  // Deduct for dropped frames (indicates local performance issues)
  if (metrics.video.framesDropped > 0) {
    if (metrics.video.framesDropped > thresholds.framesDropped.error)
      score -= 10;
    else if (metrics.video.framesDropped > thresholds.framesDropped.warn)
      score -= 5;
  }

  return Math.max(0, Math.min(100, score));
}

/**
 * Parse RTCStatsReport into PeerMetrics
 * @param stats - The RTCStatsReport from getStats()
 * @param peerId - The remote peer ID
 * @param previousStats - Previous stats for bitrate calculation
 * @param localStream - Local MediaStream for fallback values
 * @returns Parsed metrics and updated previous stats
 */
export function parseStats(
  stats: RTCStatsReport,
  peerId: string,
  previousStats: PreviousStats | null,
  localStream: MediaStream | null = null,
): { metrics: PeerMetrics; newPreviousStats: PreviousStats } {
  const metrics = createEmptyMetrics(peerId);
  const isFirstCollection = !previousStats;

  // Initialize parsed values
  const values: ParsedStatsValues = {
    outboundWidth: 0,
    outboundHeight: 0,
    outboundFps: 0,
    outboundCodec: "",
    inboundWidth: 0,
    inboundHeight: 0,
    inboundFps: 0,
    inboundCodec: "",
    mediaSourceWidth: 0,
    mediaSourceHeight: 0,
    mediaSourceFps: 0,
    videoBytesReceived: 0,
    videoBytesSent: 0,
    audioBytesReceived: 0,
    audioBytesSent: 0,
    codecIdToName: parseCodecMap(stats),
  };

  // Debug: log which report types we found (first collection only)
  if (isFirstCollection) {
    let foundOutboundRtp = false;
    let foundInboundRtp = false;
    let foundMediaSource = false;

    stats.forEach((report) => {
      if (report.type === "outbound-rtp" && report.kind === "video")
        foundOutboundRtp = true;
      if (report.type === "inbound-rtp" && report.kind === "video")
        foundInboundRtp = true;
      if (report.type === "media-source" && report.kind === "video")
        foundMediaSource = true;
    });

    console.log("📊 Stats report types found:", {
      outboundRtp: foundOutboundRtp,
      inboundRtp: foundInboundRtp,
      mediaSource: foundMediaSource,
      codecCount: values.codecIdToName.size,
    });
  }

  // Parse all stats reports
  stats.forEach((report) => {
    // Video stats - inbound (for receivers)
    if (report.type === "inbound-rtp" && report.kind === "video") {
      parseInboundVideoStats(
        report as RTCInboundRtpStreamStats,
        metrics,
        values,
      );
    }

    // Video stats - outbound (for senders)
    if (report.type === "outbound-rtp" && report.kind === "video") {
      parseOutboundVideoStats(
        report as RTCOutboundRtpStreamStats,
        metrics,
        values,
        isFirstCollection,
      );
    }

    // Media source stats (local track stats - most reliable for senders)
    if (report.type === "media-source" && report.kind === "video") {
      parseMediaSourceStats(
        report as RTCMediaSourceStats,
        values,
        isFirstCollection,
      );
    }

    // Audio stats
    if (report.type === "inbound-rtp" && report.kind === "audio") {
      parseAudioStats(
        report as RTCInboundRtpStreamStats,
        metrics,
        values,
        true,
      );
    }

    if (report.type === "outbound-rtp" && report.kind === "audio") {
      parseAudioStats(
        report as RTCOutboundRtpStreamStats,
        metrics,
        values,
        false,
      );
    }

    // Connection stats
    if (report.type === "candidate-pair" && report.state === "succeeded") {
      parseConnectionStats(report as RTCIceCandidatePairStats, metrics);
    }

    // Candidate info
    if (report.type === "local-candidate") {
      const candidateReport = report as RTCIceCandidateStats;
      metrics.connection.localCandidateType =
        candidateReport.candidateType ?? "";
      metrics.connection.protocol = candidateReport.protocol ?? "";
    }

    if (report.type === "remote-candidate") {
      const candidateReport = report as RTCIceCandidateStats;
      metrics.connection.remoteCandidateType =
        candidateReport.candidateType ?? "";
    }
  });

  // Priority: outbound-rtp > inbound-rtp > media-source > local track settings
  // This ensures we get the actual encoded/decoded values when available
  metrics.video.width =
    values.outboundWidth || values.inboundWidth || values.mediaSourceWidth;
  metrics.video.height =
    values.outboundHeight || values.inboundHeight || values.mediaSourceHeight;
  metrics.video.fps =
    values.outboundFps || values.inboundFps || values.mediaSourceFps;
  metrics.video.codec = values.outboundCodec || values.inboundCodec;

  // Apply fallback from local stream
  applyLocalStreamFallback(metrics, localStream, isFirstCollection);

  // Debug: log if metrics are still missing after all fallbacks
  if (isFirstCollection && (!metrics.video.width || !metrics.video.fps)) {
    console.warn("⚠️ Metrics still incomplete after fallbacks:", {
      width: metrics.video.width,
      height: metrics.video.height,
      fps: metrics.video.fps,
      sources: {
        outbound: {
          w: values.outboundWidth,
          h: values.outboundHeight,
          fps: values.outboundFps,
        },
        inbound: {
          w: values.inboundWidth,
          h: values.inboundHeight,
          fps: values.inboundFps,
        },
        mediaSource: {
          w: values.mediaSourceWidth,
          h: values.mediaSourceHeight,
          fps: values.mediaSourceFps,
        },
      },
    });
  }

  // Calculate bitrates
  const now = Date.now();
  calculateBitrates(metrics, values, previousStats, now);

  // Create new previous stats
  const newPreviousStats: PreviousStats = {
    videoBytesReceived: values.videoBytesReceived,
    videoBytesSent: values.videoBytesSent,
    audioBytesReceived: values.audioBytesReceived,
    audioBytesSent: values.audioBytesSent,
    timestamp: now,
  };

  // Calculate quality score
  metrics.qualityScore = calculateQualityScore(metrics);

  return { metrics, newPreviousStats };
}
