// Type-safe connection states with exhaustive checking

export const ConnectionState = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
  FAILED: "failed",
} as const;

export type ConnectionState =
  (typeof ConnectionState)[keyof typeof ConnectionState];

export const SignalingState = {
  DISCONNECTED: "disconnected",
  CONNECTING: "connecting",
  CONNECTED: "connected",
  RECONNECTING: "reconnecting",
} as const;

export type SignalingState =
  (typeof SignalingState)[keyof typeof SignalingState];

export const StopReason = {
  MANUAL: "manual",
  PAGE_CLOSED: "page_closed",
  NETWORK_LOST: "network_lost",
  ERROR: "error",
} as const;

export type StopReason = (typeof StopReason)[keyof typeof StopReason];

// Exhaustive switch helper
export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${x}`);
}

// Color mappings for UI
export function getConnectionStateColor(state: ConnectionState): string {
  switch (state) {
    case ConnectionState.CONNECTED:
      return "green";
    case ConnectionState.CONNECTING:
      return "yellow";
    case ConnectionState.RECONNECTING:
      return "orange";
    case ConnectionState.DISCONNECTED:
      return "gray";
    case ConnectionState.FAILED:
      return "red";
    default:
      return assertNever(state);
  }
}

export function getSignalingStateColor(state: SignalingState): string {
  switch (state) {
    case SignalingState.CONNECTED:
      return "green";
    case SignalingState.CONNECTING:
      return "yellow";
    case SignalingState.RECONNECTING:
      return "orange";
    case SignalingState.DISCONNECTED:
      return "gray";
    default:
      return assertNever(state);
  }
}
