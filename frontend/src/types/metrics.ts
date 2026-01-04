// WebRTC metrics types matching legacy metrics.js

// Video metrics from RTCStatsReport
export interface VideoMetrics {
  bitrate: number; // kbps
  fps: number;
  width: number;
  height: number;
  codec: string;
  packetLoss: number; // percentage
  jitter: number; // ms
  framesDropped: number;
  framesReceived: number;
  framesSent: number;
}

// Audio metrics from RTCStatsReport
export interface AudioMetrics {
  bitrate: number; // kbps
  packetLoss: number; // percentage
  jitter: number; // ms
  audioLevel: number; // 0-1
}

// Connection metrics
export interface ConnectionMetrics {
  rtt: number; // ms (round-trip time)
  localCandidateType: string;
  remoteCandidateType: string;
  protocol: string; // "udp" | "tcp"
  bytesReceived: number;
  bytesSent: number;
  packetsReceived: number;
  packetsSent: number;
  packetsLost: number;
  availableOutgoingBitrate: number; // kbps - estimated available bandwidth for sending
  availableIncomingBitrate: number; // kbps - estimated available bandwidth for receiving
}

// Combined metrics for a peer connection
export interface PeerMetrics {
  peerId: string;
  timestamp: number;
  video: VideoMetrics;
  audio: AudioMetrics;
  connection: ConnectionMetrics;
  qualityScore: number; // 0-100
}

// Metrics history for charting
export interface MetricsHistory {
  timestamps: number[];
  bitrates: number[];
  fps: number[];
  rtt: number[];
  packetLoss: number[];
}

// Default/empty metrics
export const EMPTY_VIDEO_METRICS: VideoMetrics = {
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
};

export const EMPTY_AUDIO_METRICS: AudioMetrics = {
  bitrate: 0,
  packetLoss: 0,
  jitter: 0,
  audioLevel: 0,
};

export const EMPTY_CONNECTION_METRICS: ConnectionMetrics = {
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
};

export const EMPTY_PEER_METRICS: PeerMetrics = {
  peerId: "",
  timestamp: 0,
  video: EMPTY_VIDEO_METRICS,
  audio: EMPTY_AUDIO_METRICS,
  connection: EMPTY_CONNECTION_METRICS,
  qualityScore: 0,
};

// Metrics formatting helpers
export function formatBitrate(kbps: number): string {
  if (kbps >= 1000) {
    return `${(kbps / 1000).toFixed(1)} Mbps`;
  }
  return `${Math.round(kbps)} kbps`;
}

export function formatLatency(ms: number): string {
  return `${Math.round(ms)} ms`;
}

export function formatPacketLoss(percent: number): string {
  return `${percent.toFixed(1)}%`;
}

export function formatResolution(width: number, height: number): string {
  if (width === 0 || height === 0) return "-";
  return `${width}x${height}`;
}

export function formatFps(fps: number): string {
  return `${Math.round(fps)} fps`;
}
