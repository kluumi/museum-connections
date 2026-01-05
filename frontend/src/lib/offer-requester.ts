// OfferRequester - Manages offer request retry logic for WebRTC receivers
// Pattern: Reusable utility for requesting offers from senders with automatic retry

/** Configuration for OfferRequester */
export interface OfferRequesterConfig {
  /** Interval in ms between retry attempts (default: 3000) */
  retryIntervalMs?: number;
}

/** State of a source for offer requesting purposes */
export interface SourceOfferState {
  /** Whether the source is available (connected to signaling) */
  isAvailable: boolean;
  /** Whether the WebRTC connection is established */
  isConnected: boolean;
  /** Whether an offer has been requested for this source */
  hasRequestedOffer: boolean;
  /** Whether the source was manually stopped (skip requesting) */
  manuallyStopped: boolean;
}

/** Callback to send an offer request to a source */
export type RequestOfferCallback = (sourceId: string) => void;

/** Callback when a source's hasRequestedOffer state changes */
export type OfferRequestStateChangeCallback = (
  sourceId: string,
  hasRequestedOffer: boolean,
) => void;

/**
 * OfferRequester manages the logic for requesting WebRTC offers from senders.
 *
 * Features:
 * - Automatic retry at configurable intervals
 * - Tracks which sources have pending requests
 * - Respects availability and connection state
 * - Supports manual stop state (won't request from stopped sources)
 *
 * @example
 * const requester = new OfferRequester({
 *   retryIntervalMs: 3000,
 *   onRequestOffer: (sourceId) => {
 *     signaling.requestOffer(sourceId);
 *   },
 *   onStateChange: (sourceId, hasRequested) => {
 *     console.log(`Source ${sourceId}: hasRequestedOffer = ${hasRequested}`);
 *   },
 * });
 *
 * // Start retry loop
 * requester.start();
 *
 * // Update source states as they change
 * requester.updateSourceState("nantes", {
 *   isAvailable: true,
 *   isConnected: false,
 *   hasRequestedOffer: false,
 *   manuallyStopped: false,
 * });
 *
 * // Request offers from all available sources
 * requester.requestFromAvailableSources();
 *
 * // When source connects successfully
 * requester.markSourceConnected("nantes");
 *
 * // Cleanup
 * requester.stop();
 * requester.destroy();
 */
export class OfferRequester {
  private readonly sources = new Map<string, SourceOfferState>();
  private retryInterval: ReturnType<typeof setInterval> | null = null;
  private readonly retryIntervalMs: number;
  private readonly onRequestOffer: RequestOfferCallback;
  private readonly onStateChange?: OfferRequestStateChangeCallback;
  private isSignalingConnected = false;

  constructor(
    config: OfferRequesterConfig & {
      onRequestOffer: RequestOfferCallback;
      onStateChange?: OfferRequestStateChangeCallback;
    },
  ) {
    this.retryIntervalMs = config.retryIntervalMs ?? 3000;
    this.onRequestOffer = config.onRequestOffer;
    this.onStateChange = config.onStateChange;
  }

  /**
   * Set signaling connection state. Retry loop only runs when connected.
   */
  setSignalingConnected(connected: boolean): void {
    this.isSignalingConnected = connected;

    if (connected) {
      // Reset hasRequestedOffer for all sources when reconnecting
      for (const [sourceId, state] of this.sources) {
        if (state.hasRequestedOffer) {
          state.hasRequestedOffer = false;
          this.onStateChange?.(sourceId, false);
        }
      }
    }
  }

  /**
   * Initialize or update state for a source.
   */
  updateSourceState(sourceId: string, state: Partial<SourceOfferState>): void {
    const existing = this.sources.get(sourceId) ?? {
      isAvailable: false,
      isConnected: false,
      hasRequestedOffer: false,
      manuallyStopped: false,
    };

    const updated = { ...existing, ...state };
    this.sources.set(sourceId, updated);

    // Notify if hasRequestedOffer changed
    if (
      state.hasRequestedOffer !== undefined &&
      state.hasRequestedOffer !== existing.hasRequestedOffer
    ) {
      this.onStateChange?.(sourceId, updated.hasRequestedOffer);
    }
  }

  /**
   * Get the current state for a source.
   */
  getSourceState(sourceId: string): SourceOfferState | undefined {
    return this.sources.get(sourceId);
  }

  /**
   * Mark that an offer has been requested for a source.
   */
  markOfferRequested(sourceId: string): void {
    const state = this.sources.get(sourceId);
    if (state && !state.hasRequestedOffer) {
      state.hasRequestedOffer = true;
      this.onStateChange?.(sourceId, true);
    }
  }

  /**
   * Mark that a source has successfully connected (reset hasRequestedOffer).
   */
  markSourceConnected(sourceId: string): void {
    const state = this.sources.get(sourceId);
    if (state) {
      state.isConnected = true;
      if (state.hasRequestedOffer) {
        state.hasRequestedOffer = false;
        this.onStateChange?.(sourceId, false);
      }
    }
  }

  /**
   * Mark that a source has disconnected.
   */
  markSourceDisconnected(sourceId: string): void {
    const state = this.sources.get(sourceId);
    if (state) {
      state.isConnected = false;
    }
  }

  /**
   * Request an offer from a specific source if it's available and not connected.
   */
  requestFromSource(sourceId: string): boolean {
    const state = this.sources.get(sourceId);
    if (!state) return false;

    if (state.isAvailable && !state.isConnected && !state.manuallyStopped) {
      this.onRequestOffer(sourceId);
      return true;
    }
    return false;
  }

  /**
   * Request offers from all available sources that haven't been requested yet.
   */
  requestFromAvailableSources(): void {
    for (const [sourceId, state] of this.sources) {
      if (
        state.isAvailable &&
        !state.hasRequestedOffer &&
        !state.manuallyStopped
      ) {
        state.hasRequestedOffer = true;
        this.onStateChange?.(sourceId, true);
        this.onRequestOffer(sourceId);
      }
    }
  }

  /**
   * Start the retry interval. Will periodically request offers from
   * available but not connected sources.
   */
  start(): void {
    this.stop(); // Clear any existing interval

    this.retryInterval = setInterval(() => {
      if (!this.isSignalingConnected) return;

      for (const [sourceId, state] of this.sources) {
        if (state.isAvailable && !state.isConnected && !state.manuallyStopped) {
          this.onRequestOffer(sourceId);
        }
      }
    }, this.retryIntervalMs);
  }

  /**
   * Stop the retry interval.
   */
  stop(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
  }

  /**
   * Reset the hasRequestedOffer flag for a source (e.g., when stream starts).
   */
  resetOfferRequest(sourceId: string): void {
    const state = this.sources.get(sourceId);
    if (state && state.hasRequestedOffer) {
      state.hasRequestedOffer = false;
      this.onStateChange?.(sourceId, false);
    }
  }

  /**
   * Remove a source from tracking.
   */
  removeSource(sourceId: string): void {
    this.sources.delete(sourceId);
  }

  /**
   * Destroy the requester and clear all state.
   */
  destroy(): void {
    this.stop();
    this.sources.clear();
  }
}
