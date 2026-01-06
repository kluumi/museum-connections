// ReceiverManager - Manages WebRTC connection for a receiver (OBS or operator)
// Pattern: Service layer that encapsulates signaling + WebRTC connection management
//
// This service handles:
// - Signaling connection lifecycle
// - WebRTC connection to receive from a source sender
// - Offer request logic with retry
// - Message routing between signaling and WebRTC services

import { ConnectionState, type NodeId, SignalingState } from "@/constants";
import { eventBus } from "@/lib/events";
import { mediaLogger, webrtcLogger } from "@/lib/logger";
import { isOfferMessage, type ServerToClientMessage } from "@/types/signaling";
import { SignalingService } from "./signaling-service";
import { WebRTCService } from "./webrtc-service";

// Retry interval for requesting offers (5 seconds)
const OFFER_RETRY_INTERVAL = 5000;

// Timeout for CONNECTING state - if stuck for this long, retry (especially for mobile)
const CONNECTING_TIMEOUT = 10000;

// Callback types for UI integration (prefixed to avoid export conflicts with stream-manager)
export type ReceiverLogCallback = (
  message: string,
  level?: "info" | "warning" | "error" | "success",
) => void;
export type ReceiverConnectionStateCallback = (state: ConnectionState) => void;
export type ReceiverSignalingStateCallback = (state: SignalingState) => void;
export type ReceiverRemoteStreamCallback = (stream: MediaStream | null) => void;

export interface ReceiverManagerOptions {
  nodeId: NodeId; // This receiver's node ID (e.g., obs_paris, obs_nantes)
  sourceId: NodeId; // The source sender to receive from (e.g., nantes, paris)

  // Callbacks
  onLog?: ReceiverLogCallback;
  onConnectionStateChange?: ReceiverConnectionStateCallback;
  onSignalingStateChange?: ReceiverSignalingStateCallback;
  onSignalingConnectedPeersChange?: (peers: NodeId[]) => void;
  onRemoteStream?: ReceiverRemoteStreamCallback;
}

/**
 * ReceiverManager encapsulates all signaling and WebRTC connection logic for a receiver.
 *
 * Usage:
 * ```ts
 * const manager = new ReceiverManager({
 *   nodeId: NodeId.OBS_PARIS,
 *   sourceId: NodeId.NANTES,
 *   onRemoteStream: (stream) => { videoRef.current.srcObject = stream; },
 *   onLog: (msg, level) => { ... },
 * });
 *
 * manager.connect(); // Connect and auto-request offers
 * manager.destroy(); // Clean up
 * ```
 */
export class ReceiverManager {
  private readonly nodeId: NodeId;
  private readonly sourceId: NodeId;

  // Services
  private signaling: SignalingService;
  private webrtc: WebRTCService | null = null;

  // State
  private hasRequestedOffer = false;
  private retryInterval: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private _connectedPeers: NodeId[] = [];
  private _remoteStream: MediaStream | null = null;
  private connectingStartedAt: number | null = null; // Track when CONNECTING started for timeout
  private isRetrying = false; // Prevents race condition during close/retry cycle

  // Callbacks
  private onLog?: ReceiverLogCallback;
  private onConnectionStateChange?: ReceiverConnectionStateCallback;
  private onSignalingStateChange?: ReceiverSignalingStateCallback;
  private onSignalingConnectedPeersChange?: (peers: NodeId[]) => void;
  private onRemoteStream?: ReceiverRemoteStreamCallback;

  constructor(options: ReceiverManagerOptions) {
    this.nodeId = options.nodeId;
    this.sourceId = options.sourceId;
    this.onLog = options.onLog;
    this.onConnectionStateChange = options.onConnectionStateChange;
    this.onSignalingStateChange = options.onSignalingStateChange;
    this.onSignalingConnectedPeersChange =
      options.onSignalingConnectedPeersChange;
    this.onRemoteStream = options.onRemoteStream;

    // Create signaling service
    this.signaling = new SignalingService(this.nodeId);
    this.signaling.onStateChange((state) => {
      this.handleSignalingStateChange(state);
    });
    this.signaling.onMessage((message) => {
      this.handleSignalingMessage(message);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Connect to signaling server
   */
  connect(): void {
    if (this.destroyed) return;
    this.signaling.connect();
  }

  /**
   * Disconnect from signaling server
   */
  disconnect(): void {
    this.stopRetryInterval();
    this.signaling.disconnect();
  }

  /**
   * Get the signaling service (for advanced use)
   */
  getSignalingService(): SignalingService {
    return this.signaling;
  }

  /**
   * Get WebRTC service (for metrics, state tracking)
   */
  getWebRTC(): WebRTCService | null {
    return this.webrtc;
  }

  /**
   * Check if signaling is connected
   */
  get isSignalingConnected(): boolean {
    return this.signaling.isConnected;
  }

  /**
   * Check if signaling is blocked (duplicate node)
   */
  get isSignalingBlocked(): boolean {
    return this.signaling.isBlockedDuplicate;
  }

  /**
   * Get blocked message if any
   */
  get blockedMessage(): string | null {
    return this.signaling.blockedMessage;
  }

  /**
   * Get list of connected peers from signaling
   */
  get connectedPeers(): NodeId[] {
    return this._connectedPeers;
  }

  /**
   * Get WebRTC connection state
   */
  get connectionState(): ConnectionState {
    return this.webrtc?.connectionState ?? ConnectionState.DISCONNECTED;
  }

  /**
   * Get the remote stream (if connected)
   */
  get remoteStream(): MediaStream | null {
    return this._remoteStream;
  }

  /**
   * Check if source is currently connected to signaling
   */
  get isSourceConnected(): boolean {
    return this._connectedPeers.includes(this.sourceId);
  }

  /**
   * Request an offer from the source sender
   */
  requestOffer(): void {
    if (!this.signaling.isConnected) return;
    if (this.connectionState === ConnectionState.CONNECTED) return;
    if (this.connectionState === ConnectionState.CONNECTING) return;

    webrtcLogger.info(`Requesting offer from ${this.sourceId}`);
    this.signaling.requestOffer(this.sourceId);
    this.hasRequestedOffer = true;
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.stopRetryInterval();

    // Close WebRTC connection
    if (this.webrtc) {
      this.webrtc.close();
      this.webrtc = null;
    }

    // Disconnect signaling
    this.signaling.disconnect();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Signaling Message Handling
  // ─────────────────────────────────────────────────────────────────────────

  private handleSignalingStateChange(state: SignalingState): void {
    this.onSignalingStateChange?.(state);

    if (state === SignalingState.CONNECTED) {
      this.onLog?.("Connecté au serveur de signalisation", "success");
      // Start retry interval when connected
      this.startRetryInterval();
    } else {
      this.stopRetryInterval();
    }
  }

  private handleSignalingMessage(message: ServerToClientMessage): void {
    // Update connected peers list
    if (message.type === "login_success" && "clients" in message) {
      this._connectedPeers = message.clients;
      this.onSignalingConnectedPeersChange?.(this._connectedPeers);

      // If source is already connected, request offer
      if (this._connectedPeers.includes(this.sourceId)) {
        this.requestOfferIfNeeded();
      }
    } else if (message.type === "peer_connected" && "peer" in message) {
      if (!this._connectedPeers.includes(message.peer)) {
        this._connectedPeers = [...this._connectedPeers, message.peer];
      }
      this.onSignalingConnectedPeersChange?.(this._connectedPeers);

      // If our source just connected, request offer
      if (message.peer === this.sourceId) {
        this.requestOfferIfNeeded();
      }
    } else if (message.type === "peer_disconnected" && "peer" in message) {
      this._connectedPeers = this._connectedPeers.filter(
        (p) => p !== message.peer,
      );
      this.onSignalingConnectedPeersChange?.(this._connectedPeers);

      // If our source disconnected, clean up WebRTC
      if (message.peer === this.sourceId) {
        this.handleSourceDisconnected();
      }
    }

    // Only handle messages from our source
    if (message.from !== this.sourceId) return;

    switch (message.type) {
      case "offer":
        this.handleOffer(message);
        break;

      case "candidate":
        if ("candidate" in message && this.webrtc) {
          this.webrtc.addIceCandidate(message.candidate).catch((error) => {
            webrtcLogger.warn("Failed to add ICE candidate:", error);
          });
        }
        break;

      case "stream_started":
      case "page_opened":
        // Source is ready, request offer if not connected
        webrtcLogger.info(`Source ${this.sourceId} is ready`);
        this.requestOfferIfNeeded();
        break;
    }
  }

  private handleOffer(message: ServerToClientMessage): void {
    // NOTE: We should NOT ignore offers even if "connected" because:
    // 1. The sender may have restarted and is sending a new offer
    // 2. The sender may have refreshed the page
    // 3. Our "connected" state may be stale
    // The WebRTCService.handleOffer() already handles reinitializing the connection
    webrtcLogger.info(
      `handleOffer: received offer from ${this.sourceId}, current state: ${this.connectionState}`,
    );

    // Skip if we're in the middle of a retry cycle (prevents race condition)
    if (this.isRetrying) {
      webrtcLogger.debug(
        "Ignoring offer - retry in progress, will request new offer shortly",
      );
      return;
    }

    if (!isOfferMessage(message)) {
      webrtcLogger.warn("handleOffer called without offer in message");
      return;
    }

    // Always create/recreate WebRTC connection when receiving a new offer
    // This ensures we handle sender restart/refresh properly
    if (this.webrtc) {
      webrtcLogger.debug("Closing existing WebRTC connection for new offer");
      this.webrtc.close();
      this.webrtc = null;
    }

    // Create fresh WebRTC connection
    this.webrtc = new WebRTCService(
      this.nodeId,
      this.sourceId,
      this.signaling,
      {
        onTrack: (event) => {
          mediaLogger.info(`Received remote track from ${this.sourceId}`);
          if (event.streams?.[0]) {
            this._remoteStream = event.streams[0];
            this.onRemoteStream?.(this._remoteStream);
          }
        },
        onConnectionStateChange: (state) => {
          webrtcLogger.info(`WebRTC connection state: ${state}`);
          this.onConnectionStateChange?.(state);

          // Track when CONNECTING state starts for timeout detection
          if (state === ConnectionState.CONNECTING) {
            this.connectingStartedAt = Date.now();
          } else {
            this.connectingStartedAt = null;
          }

          if (state === ConnectionState.CONNECTED) {
            eventBus.emit("peer:connected", {
              localNodeId: this.nodeId,
              remoteNodeId: this.sourceId,
            });
            this.hasRequestedOffer = false;
          } else if (
            state === ConnectionState.DISCONNECTED ||
            state === ConnectionState.FAILED
          ) {
            eventBus.emit("peer:disconnected", {
              localNodeId: this.nodeId,
              remoteNodeId: this.sourceId,
            });
            this._remoteStream = null;
            this.onRemoteStream?.(null);
          }
        },
      },
    );

    webrtcLogger.info(`Processing offer from ${this.sourceId}`);
    this.webrtc.handleOffer(message.offer).catch((err: unknown) => {
      webrtcLogger.error("Failed to handle offer:", err);
      // Reset state so we can try again
      this.hasRequestedOffer = false;
    });
  }

  private handleSourceDisconnected(): void {
    webrtcLogger.info(`Source ${this.sourceId} disconnected`);
    this._remoteStream = null;
    this.onRemoteStream?.(null);

    // Close existing WebRTC connection
    if (this.webrtc) {
      this.webrtc.close();
      this.webrtc = null;
    }

    // Reset offer state for next connection
    this.hasRequestedOffer = false;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Offer Request Logic
  // ─────────────────────────────────────────────────────────────────────────

  private requestOfferIfNeeded(): void {
    if (!this.signaling.isConnected) return;

    const isConnected = this.connectionState === ConnectionState.CONNECTED;
    const isConnecting = this.connectionState === ConnectionState.CONNECTING;

    // Don't request if already connected or connecting
    if (isConnected || isConnecting) {
      this.hasRequestedOffer = false; // Reset for next disconnect
      return;
    }

    // Request offer if source is available and we haven't requested yet
    if (this.isSourceConnected && !this.hasRequestedOffer) {
      this.requestOffer();
    }
  }

  private startRetryInterval(): void {
    this.stopRetryInterval();

    this.retryInterval = setInterval(() => {
      if (!this.signaling.isConnected) return;

      const isConnected = this.connectionState === ConnectionState.CONNECTED;
      const isConnecting = this.connectionState === ConnectionState.CONNECTING;

      // Check if CONNECTING state has timed out (stuck connection, common on mobile)
      const isConnectingStuck =
        isConnecting &&
        this.connectingStartedAt !== null &&
        Date.now() - this.connectingStartedAt > CONNECTING_TIMEOUT;

      if (isConnectingStuck) {
        webrtcLogger.warn(
          `CONNECTING state timed out after ${CONNECTING_TIMEOUT}ms - closing and retrying`,
        );
        // Set retrying flag to prevent race condition with incoming offers
        this.isRetrying = true;
        // Close the stuck connection
        if (this.webrtc) {
          this.webrtc.close();
          this.webrtc = null;
        }
        this.connectingStartedAt = null;
        this.hasRequestedOffer = false;
        // Clear retrying flag after a short delay to allow close to complete
        setTimeout(() => {
          this.isRetrying = false;
        }, 100);
      }

      // Retry if source is available and we're not connected
      // (also retry if we were stuck in CONNECTING and just closed)
      if (
        this.isSourceConnected &&
        !isConnected &&
        (!isConnecting || isConnectingStuck)
      ) {
        webrtcLogger.debug(`Retrying offer request to ${this.sourceId}`);
        this.signaling.requestOffer(this.sourceId);
      }
    }, OFFER_RETRY_INTERVAL);
  }

  private stopRetryInterval(): void {
    if (this.retryInterval) {
      clearInterval(this.retryInterval);
      this.retryInterval = null;
    }
  }
}
