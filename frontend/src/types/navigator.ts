// Type definitions for Navigator Connection API
// https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation

/**
 * Network effective type - indicates connection quality/speed category
 * Note: This is about speed, not the physical connection type
 */
export type NetworkEffectiveType = "slow-2g" | "2g" | "3g" | "4g";

/**
 * Physical network connection type
 * Note: Rarely available on desktop browsers
 */
export type NetworkConnectionType =
  | "bluetooth"
  | "cellular"
  | "ethernet"
  | "none"
  | "wifi"
  | "wimax"
  | "other"
  | "unknown";

/**
 * NetworkInformation API interface
 * Represents information about the network connection
 */
export interface NetworkInformation extends EventTarget {
  /** Physical connection type (rarely available on desktop) */
  readonly type?: NetworkConnectionType;
  /** Effective connection type based on measured performance */
  readonly effectiveType?: NetworkEffectiveType;
  /** Estimated downlink speed in Mbps */
  readonly downlink?: number;
  /** Estimated round-trip time in ms */
  readonly rtt?: number;
  /** Whether user has requested reduced data usage */
  readonly saveData?: boolean;
  /** Maximum downlink speed of underlying connection in Mbps */
  readonly downlinkMax?: number;

  /** Event handler for connection changes */
  onchange?: ((this: NetworkInformation, ev: Event) => void) | null;

  addEventListener(
    type: "change",
    listener: (this: NetworkInformation, ev: Event) => void,
    options?: boolean | AddEventListenerOptions,
  ): void;
  removeEventListener(
    type: "change",
    listener: (this: NetworkInformation, ev: Event) => void,
    options?: boolean | EventListenerOptions,
  ): void;
}

/**
 * Extended Navigator interface with connection property
 * Includes vendor-prefixed versions for broader compatibility
 */
export interface NavigatorWithConnection extends Navigator {
  /** Standard connection property (Chrome, Edge, Opera) */
  readonly connection?: NetworkInformation;
  /** Mozilla-prefixed version (legacy Firefox) */
  readonly mozConnection?: NetworkInformation;
  /** WebKit-prefixed version (legacy Safari) */
  readonly webkitConnection?: NetworkInformation;
}

/**
 * Get the NetworkInformation object from the navigator
 * Handles vendor prefixes for cross-browser compatibility
 */
export function getNavigatorConnection(): NetworkInformation | undefined {
  const nav = navigator as NavigatorWithConnection;
  return nav.connection ?? nav.mozConnection ?? nav.webkitConnection;
}
