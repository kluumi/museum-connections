/**
 * WebRTC configuration - centralized settings for peer connections.
 *
 * This module contains all WebRTC-related constants and configuration:
 * - ICE server configuration (STUN/TURN)
 * - Codec preferences and bitrate limits
 * - Timeout and reconnection settings
 * - Media constraints defaults
 * - Quality thresholds for monitoring
 *
 * @module config/webrtc
 * @example
 * ```typescript
 * import {
 *   DEFAULT_RTC_CONFIG,
 *   BITRATE_LIMITS,
 *   getRecommendedBitrate,
 * } from '@/config/webrtc';
 *
 * // Create peer connection with default config
 * const pc = new RTCPeerConnection(DEFAULT_RTC_CONFIG);
 *
 * // Get recommended bitrate for resolution
 * const bitrate = getRecommendedBitrate(1080); // 5000 kbps
 * ```
 */

/**
 * ICE Server Configuration
 * STUN servers are sufficient for most NAT traversal scenarios.
 * TURN servers can be added if STUN fails consistently.
 */
export const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  // Add TURN server if needed for restrictive networks:
  // { urls: "turn:your-turn-server:3478", username: "user", credential: "pass" }
];

/**
 * Default RTCConfiguration for peer connections
 */
export const DEFAULT_RTC_CONFIG: RTCConfiguration = {
  iceServers: ICE_SERVERS,
  iceTransportPolicy: "all", // "relay" to force TURN
  bundlePolicy: "max-bundle",
  rtcpMuxPolicy: "require",
};

/**
 * Video codec preferences in order of priority
 * VP9 offers better compression, VP8 is more compatible, H.264 has hardware acceleration
 */
export const VIDEO_CODEC_PRIORITY = ["VP9", "VP8", "H264"] as const;

/**
 * Audio codec preferences in order of priority
 */
export const AUDIO_CODEC_PRIORITY = ["opus", "PCMU", "PCMA"] as const;

/**
 * Bitrate configuration for different quality levels (in kbps)
 */
export const BITRATE_LIMITS = {
  /** Maximum bitrate options available in UI */
  options: [8000, 5000, 3000, 2000, 1000, 500] as const,

  /** Default maximum bitrate when not in auto mode */
  default: 3000,

  /** Minimum acceptable bitrate before quality degrades significantly */
  minimum: 500,

  /** Recommended bitrate for 1080p streaming */
  recommended1080p: 5000,

  /** Recommended bitrate for 720p streaming */
  recommended720p: 2500,

  /** Recommended bitrate for 480p streaming */
  recommended480p: 1000,
} as const;

/**
 * Timeout values for WebRTC operations (in milliseconds)
 */
export const WEBRTC_TIMEOUTS = {
  /** Timeout for createOffer/createAnswer operations */
  operation: 10_000,

  /** Timeout for ICE gathering to complete */
  iceGathering: 15_000,

  /** Timeout for connection to establish after offer/answer exchange */
  connection: 30_000,

  /** Delay before considering ICE restart after failure */
  iceRestartDelay: 2_000,
} as const;

/**
 * Reconnection configuration
 */
export const RECONNECT_CONFIG = {
  /** Initial delay before first reconnection attempt */
  initialDelay: 1_000,

  /** Maximum delay between reconnection attempts */
  maxDelay: 30_000,

  /** Multiplier for exponential backoff */
  multiplier: 1.5,

  /** Jitter factor to prevent synchronized reconnection storms (±30%) */
  jitter: 0.3,

  /** Maximum number of reconnection attempts before giving up */
  maxAttempts: 10,
} as const;

/**
 * Heartbeat configuration for WebSocket keep-alive
 */
export const HEARTBEAT_CONFIG = {
  /** Interval between heartbeat pings (ms) */
  interval: 10_000,

  /** Timeout waiting for pong response (ms) */
  timeout: 5_000,
} as const;

/**
 * Stats collection configuration
 */
export const STATS_CONFIG = {
  /** Interval between stats collection (ms) */
  interval: 2_000,

  /** Number of samples to keep in history */
  historyMaxSamples: 60, // ~2 minutes at 2s interval

  /** Thresholds for quality scoring */
  thresholds: {
    rtt: { warning: 150, error: 300 }, // ms
    packetLoss: { warning: 2, error: 5 }, // %
    fps: { warning: 24, error: 15 }, // fps (lower is worse)
    jitter: { warning: 20, error: 50 }, // ms
    bitrate: { warning: 1000, error: 500 }, // kbps (lower is worse)
  },
} as const;

/**
 * SDP manipulation options
 */
export const SDP_CONFIG = {
  /** Whether to prefer hardware-accelerated codecs */
  preferHardwareCodecs: true,

  /** Whether to enable stereo audio */
  stereoAudio: false,

  /** Maximum audio bitrate (kbps) */
  maxAudioBitrate: 128,
} as const;

/**
 * Media constraints defaults
 */
export const MEDIA_CONSTRAINTS = {
  /** Default video constraints when "auto" is selected */
  video: {
    ideal: { width: 1920, height: 1080, frameRate: 30 },
    min: { width: 320, height: 240, frameRate: 15 },
  },

  /** Default audio constraints */
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
} as const;

/**
 * Get RTCConfiguration with optional overrides
 */
export function createRTCConfig(
  overrides?: Partial<RTCConfiguration>,
): RTCConfiguration {
  return {
    ...DEFAULT_RTC_CONFIG,
    ...overrides,
    iceServers: overrides?.iceServers ?? ICE_SERVERS,
  };
}

/**
 * Get recommended bitrate for a given resolution height
 */
export function getRecommendedBitrate(height: number): number {
  if (height >= 1080) return BITRATE_LIMITS.recommended1080p;
  if (height >= 720) return BITRATE_LIMITS.recommended720p;
  return BITRATE_LIMITS.recommended480p;
}

/**
 * Check if a codec is in our preferred list
 */
export function isPreferredCodec(codec: string): boolean {
  const upperCodec = codec.toUpperCase();
  return VIDEO_CODEC_PRIORITY.some((preferred) =>
    upperCodec.includes(preferred),
  );
}
