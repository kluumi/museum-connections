/**
 * Main application configuration.
 *
 * This module provides centralized configuration for the application.
 * WebRTC-specific configuration is available in `./config/webrtc.ts`.
 *
 * @module config
 * @example
 * ```typescript
 * import { CONFIG } from '@/config';
 *
 * // Access signaling server URL
 * const ws = new WebSocket(CONFIG.SIGNALING_URL);
 *
 * // Use ICE servers for WebRTC
 * const pc = new RTCPeerConnection({ iceServers: CONFIG.ICE_SERVERS });
 *
 * // Configure reconnection timing
 * const delay = CONFIG.RECONNECT.INITIAL_DELAY;
 * ```
 */

import {
  HEARTBEAT_CONFIG,
  ICE_SERVERS,
  RECONNECT_CONFIG,
  STATS_CONFIG,
} from "./config/webrtc";

// Railway production signaling URL (default for all environments)
// Override with VITE_SIGNALING_URL=ws://localhost:8080 for local server testing
const DEFAULT_SIGNALING_URL =
  "wss://museum-connections-production.up.railway.app";

/**
 * Application configuration object.
 *
 * Contains all runtime configuration values including:
 * - `SIGNALING_URL` - WebSocket URL for signaling server
 * - `ICE_SERVERS` - STUN/TURN servers for WebRTC NAT traversal
 * - `RECONNECT` - Exponential backoff settings for reconnection
 * - `HEARTBEAT` - WebSocket keep-alive timing
 * - `STATS` - Statistics collection interval
 */
export const CONFIG = {
  /** WebSocket signaling server URL. Can be overridden via VITE_SIGNALING_URL env var. */
  SIGNALING_URL: import.meta.env.VITE_SIGNALING_URL ?? DEFAULT_SIGNALING_URL,

  // Re-export from webrtc config for backwards compatibility
  ICE_SERVERS,

  RECONNECT: {
    INITIAL_DELAY: RECONNECT_CONFIG.initialDelay,
    MAX_DELAY: RECONNECT_CONFIG.maxDelay,
    MULTIPLIER: RECONNECT_CONFIG.multiplier,
    JITTER: RECONNECT_CONFIG.jitter,
  },

  HEARTBEAT: {
    INTERVAL: HEARTBEAT_CONFIG.interval,
    TIMEOUT: HEARTBEAT_CONFIG.timeout,
  },

  STATS: {
    INTERVAL: STATS_CONFIG.interval,
  },
} as const;

export type Config = typeof CONFIG;
