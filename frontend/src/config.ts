// Railway production signaling URL (default for all environments)
// Override with VITE_SIGNALING_URL=ws://localhost:8080 for local server testing
const DEFAULT_SIGNALING_URL =
  "wss://museum-connections-production.up.railway.app";

export const CONFIG = {
  SIGNALING_URL: import.meta.env.VITE_SIGNALING_URL ?? DEFAULT_SIGNALING_URL,

  ICE_SERVERS: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
  ],

  RECONNECT: {
    INITIAL_DELAY: 1000, // 1 second for faster reconnection
    MAX_DELAY: 30000, // Cap at 30 seconds
    MULTIPLIER: 1.5, // Slower exponential growth
    JITTER: 0.3, // ±30% jitter to prevent synchronized reconnection storms
  },

  HEARTBEAT: {
    INTERVAL: 10000,
    TIMEOUT: 5000,
  },

  STATS: {
    INTERVAL: 2000,
  },
} as const;

export type Config = typeof CONFIG;
