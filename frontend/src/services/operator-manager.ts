// OperatorManager - Manages multiple WebRTC receiver connections for the operator dashboard
// Pattern: Service layer that encapsulates signaling + multi-source WebRTC connection management
//
// This service handles:
// - Signaling connection lifecycle
// - Multiple WebRTC connections (one per source sender)
// - Message routing between signaling and WebRTC services
// - Offer request logic with retry (via OfferRequester)
// - Heartbeat monitoring for sender liveness (via HeartbeatMonitor)

import { ConnectionState, type NodeId, SignalingState } from "@/constants";
import { eventBus } from "@/lib/events";
import {
  HeartbeatMonitor,
  type HeartbeatStatus,
} from "@/lib/heartbeat-monitor";
import { OfferRequester } from "@/lib/offer-requester";
import type { ServerToClientMessage } from "@/types/signaling";
import { SignalingService } from "./signaling-service";
import { WebRTCService } from "./webrtc-service";

// Re-export HeartbeatStatus for consumers
export type { HeartbeatStatus } from "@/lib/heartbeat-monitor";
export type LoadingState = "starting" | "stopping" | false;

// Callback types
export type OperatorLogCallback = (
  sourceId: NodeId,
  message: string,
  level?: "info" | "warning" | "error" | "success",
) => void;

export type SourceStateChangeCallback = (
  sourceId: NodeId,
  state: {
    connectionState: ConnectionState;
    remoteStream: MediaStream | null;
    heartbeatStatus: HeartbeatStatus;
    loading: LoadingState;
    manuallyStopped: boolean;
  },
) => void;

export interface OperatorManagerOptions {
  nodeId: NodeId; // Unique operator node ID (operator-{uuid})
  sources: NodeId[]; // Source senders to receive from [NANTES, PARIS]

  // Callbacks
  onLog?: OperatorLogCallback;
  onSourceStateChange?: SourceStateChangeCallback;
  onSignalingStateChange?: (state: SignalingState) => void;
  onSignalingConnectedPeersChange?: (peers: NodeId[]) => void;
}

interface SourceState {
  webrtc: WebRTCService | null;
  connectionState: ConnectionState;
  remoteStream: MediaStream | null;
  heartbeatStatus: HeartbeatStatus;
  lastHeartbeat: number | null;
  loading: LoadingState;
  manuallyStopped: boolean;
  hasRequestedOffer: boolean;
  stopByOperator: boolean;
  pendingOffer: RTCSessionDescriptionInit | null;
  pendingCandidates: RTCIceCandidateInit[];
}

/**
 * OperatorManager encapsulates all signaling and WebRTC connection logic for the operator.
 *
 * Usage:
 * ```ts
 * const manager = new OperatorManager({
 *   nodeId: generateOperatorNodeId(),
 *   sources: [NodeId.NANTES, NodeId.PARIS],
 *   onLog: (sourceId, msg, level) => { ... },
 *   onSourceStateChange: (sourceId, state) => { ... },
 * });
 *
 * manager.connect();
 * manager.sendStreamControl(NodeId.NANTES, "start");
 * manager.destroy();
 * ```
 */
export class OperatorManager {
  private readonly nodeId: NodeId;
  private readonly sources: NodeId[];

  // Services
  private signaling: SignalingService;
  private sourceStates = new Map<NodeId, SourceState>();

  // Utilities
  private heartbeatMonitor: HeartbeatMonitor;
  private offerRequester: OfferRequester;

  // State
  private destroyed = false;
  private _connectedPeers: NodeId[] = [];

  // Callbacks
  private onLog?: OperatorLogCallback;
  private onSourceStateChange?: SourceStateChangeCallback;
  private onSignalingStateChange?: (state: SignalingState) => void;
  private onSignalingConnectedPeersChange?: (peers: NodeId[]) => void;

  constructor(options: OperatorManagerOptions) {
    this.nodeId = options.nodeId;
    this.sources = options.sources;
    this.onLog = options.onLog;
    this.onSourceStateChange = options.onSourceStateChange;
    this.onSignalingStateChange = options.onSignalingStateChange;
    this.onSignalingConnectedPeersChange =
      options.onSignalingConnectedPeersChange;

    // Initialize source states
    for (const sourceId of this.sources) {
      this.sourceStates.set(sourceId, this.createInitialSourceState());
    }

    // Initialize HeartbeatMonitor
    this.heartbeatMonitor = new HeartbeatMonitor({
      onStatusChange: (sourceId, status, previousStatus) => {
        this.handleHeartbeatStatusChange(
          sourceId as NodeId,
          status,
          previousStatus,
        );
      },
    });

    // Initialize OfferRequester
    this.offerRequester = new OfferRequester({
      onRequestOffer: (sourceId) => {
        this.signaling.requestOffer(sourceId as NodeId);
      },
    });

    // Initialize offer requester source states
    for (const sourceId of this.sources) {
      this.offerRequester.updateSourceState(sourceId, {
        isAvailable: false,
        isConnected: false,
        hasRequestedOffer: false,
        manuallyStopped: false,
      });
    }

    // Create signaling service
    this.signaling = new SignalingService(this.nodeId);
    this.signaling.onStateChange((state) => {
      this.handleSignalingStateChange(state);
    });
    this.signaling.onMessage((message) => {
      this.handleSignalingMessage(message);
    });
  }

  private createInitialSourceState(): SourceState {
    return {
      webrtc: null,
      connectionState: ConnectionState.DISCONNECTED,
      remoteStream: null,
      heartbeatStatus: null,
      lastHeartbeat: null,
      loading: false,
      manuallyStopped: false,
      hasRequestedOffer: false,
      stopByOperator: false,
      pendingOffer: null,
      pendingCandidates: [],
    };
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────────────

  connect(): void {
    if (this.destroyed) return;
    this.signaling.connect();
  }

  disconnect(): void {
    this.stopRetryInterval();
    this.stopHeartbeatCheck();
    this.signaling.disconnect();
  }

  get isSignalingConnected(): boolean {
    return this.signaling.isConnected;
  }

  get connectedPeers(): NodeId[] {
    return this._connectedPeers;
  }

  getSourceState(sourceId: NodeId): SourceState | undefined {
    return this.sourceStates.get(sourceId);
  }

  getSourceConnectionState(sourceId: NodeId): ConnectionState {
    return (
      this.sourceStates.get(sourceId)?.connectionState ??
      ConnectionState.DISCONNECTED
    );
  }

  getSourceRemoteStream(sourceId: NodeId): MediaStream | null {
    return this.sourceStates.get(sourceId)?.remoteStream ?? null;
  }

  getSourceHeartbeatStatus(sourceId: NodeId): HeartbeatStatus {
    return this.sourceStates.get(sourceId)?.heartbeatStatus ?? null;
  }

  getSourceLoading(sourceId: NodeId): LoadingState {
    return this.sourceStates.get(sourceId)?.loading ?? false;
  }

  getSourceManuallyStopped(sourceId: NodeId): boolean {
    return this.sourceStates.get(sourceId)?.manuallyStopped ?? false;
  }

  isSourceAvailable(sourceId: NodeId): boolean {
    return this._connectedPeers.includes(sourceId);
  }

  isSourceConnected(sourceId: NodeId): boolean {
    return (
      this.getSourceConnectionState(sourceId) === ConnectionState.CONNECTED
    );
  }

  /**
   * Send stream control command to a source sender
   */
  sendStreamControl(sourceId: NodeId, action: "start" | "stop"): void {
    this.signaling.sendStreamControl(sourceId, action);

    const state = this.sourceStates.get(sourceId);
    if (!state) return;

    if (action === "stop") {
      state.stopByOperator = true;
      this.updateSourceLoading(sourceId, "stopping");
    } else {
      this.updateSourceLoading(sourceId, "starting");
      this.onLog?.(sourceId, "Démarrage demandé par l'opérateur", "info");
    }
  }

  /**
   * Request offer from a source sender
   */
  requestOffer(sourceId: NodeId): void {
    this.signaling.requestOffer(sourceId);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    // Destroy utilities
    this.heartbeatMonitor.destroy();
    this.offerRequester.destroy();

    // Close all WebRTC connections
    for (const [, state] of this.sourceStates) {
      if (state.webrtc) {
        state.webrtc.close();
        state.webrtc = null;
      }
    }

    this.signaling.disconnect();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Source State Management
  // ─────────────────────────────────────────────────────────────────────────

  private updateSourceState(
    sourceId: NodeId,
    updates: Partial<SourceState>,
  ): void {
    const state = this.sourceStates.get(sourceId);
    if (!state) return;

    Object.assign(state, updates);

    this.onSourceStateChange?.(sourceId, {
      connectionState: state.connectionState,
      remoteStream: state.remoteStream,
      heartbeatStatus: state.heartbeatStatus,
      loading: state.loading,
      manuallyStopped: state.manuallyStopped,
    });
  }

  private updateSourceLoading(sourceId: NodeId, loading: LoadingState): void {
    this.updateSourceState(sourceId, { loading });
  }

  private updateSourceConnectionState(
    sourceId: NodeId,
    connectionState: ConnectionState,
  ): void {
    const state = this.sourceStates.get(sourceId);
    if (!state) return;

    const wasConnected = state.connectionState === ConnectionState.CONNECTED;
    const isConnected = connectionState === ConnectionState.CONNECTED;

    state.connectionState = connectionState;

    // Clear loading when connection state changes appropriately
    if (isConnected && state.loading === "starting") {
      state.loading = false;
      this.onLog?.(sourceId, "Flux connecté", "success");
    } else if (!isConnected && state.loading === "stopping") {
      state.loading = false;
    }

    // Reset offer request flag on successful connection
    if (isConnected) {
      state.hasRequestedOffer = false;
      this.offerRequester.markSourceConnected(sourceId);
    } else if (wasConnected) {
      this.offerRequester.markSourceDisconnected(sourceId);
    }

    // Sync offer requester state
    this.syncOfferRequesterState(sourceId);

    this.onSourceStateChange?.(sourceId, {
      connectionState: state.connectionState,
      remoteStream: state.remoteStream,
      heartbeatStatus: state.heartbeatStatus,
      loading: state.loading,
      manuallyStopped: state.manuallyStopped,
    });

    // Emit events
    if (isConnected && !wasConnected) {
      eventBus.emit("peer:connected", {
        localNodeId: this.nodeId,
        remoteNodeId: sourceId,
      });
    } else if (!isConnected && wasConnected) {
      eventBus.emit("peer:disconnected", {
        localNodeId: this.nodeId,
        remoteNodeId: sourceId,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: WebRTC Connection Management
  // ─────────────────────────────────────────────────────────────────────────

  private getOrCreateWebRTC(sourceId: NodeId): WebRTCService {
    const state = this.sourceStates.get(sourceId);
    if (!state) {
      throw new Error(`Unknown source: ${sourceId}`);
    }

    if (state.webrtc) return state.webrtc;

    const webrtc = new WebRTCService(this.nodeId, sourceId, this.signaling, {
      onTrack: (event) => {
        if (event.streams && event.streams[0]) {
          state.remoteStream = event.streams[0];
          this.onSourceStateChange?.(sourceId, {
            connectionState: state.connectionState,
            remoteStream: state.remoteStream,
            heartbeatStatus: state.heartbeatStatus,
            loading: state.loading,
            manuallyStopped: state.manuallyStopped,
          });
        }
      },
      onConnectionStateChange: (newState) => {
        this.updateSourceConnectionState(sourceId, newState);
      },
    });

    state.webrtc = webrtc;
    return webrtc;
  }

  private closeWebRTC(sourceId: NodeId): void {
    const state = this.sourceStates.get(sourceId);
    if (!state?.webrtc) return;

    state.webrtc.close();
    state.webrtc = null;
    state.remoteStream = null;
    state.connectionState = ConnectionState.DISCONNECTED;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Signaling Message Handling
  // ─────────────────────────────────────────────────────────────────────────

  private handleSignalingStateChange(signalingState: SignalingState): void {
    this.onSignalingStateChange?.(signalingState);

    if (signalingState === SignalingState.CONNECTED) {
      this.onLog?.(
        this.sources[0],
        "Connecté au serveur de signalisation",
        "success",
      );
      this.startRetryInterval();
      this.startHeartbeatCheck();

      // Reset offer request flags
      for (const [, state] of this.sourceStates) {
        state.hasRequestedOffer = false;
      }
    } else {
      this.stopRetryInterval();
    }
  }

  private handleSignalingMessage(message: ServerToClientMessage): void {
    // Update connected peers list
    if (message.type === "login_success" && "clients" in message) {
      this._connectedPeers = message.clients;
      this.onSignalingConnectedPeersChange?.(this._connectedPeers);

      // Sync all source availability to offer requester
      for (const sourceId of this.sources) {
        this.offerRequester.updateSourceState(sourceId, {
          isAvailable: this._connectedPeers.includes(sourceId),
        });
      }

      // Request offers from available sources
      this.requestOffersFromAvailableSources();
    } else if (message.type === "peer_connected" && "peer" in message) {
      if (!this._connectedPeers.includes(message.peer)) {
        this._connectedPeers = [...this._connectedPeers, message.peer];
      }
      this.onSignalingConnectedPeersChange?.(this._connectedPeers);

      // If a source just connected, update offer requester and request offer
      if (this.sources.includes(message.peer)) {
        this.offerRequester.updateSourceState(message.peer, {
          isAvailable: true,
        });

        const state = this.sourceStates.get(message.peer);
        if (state && !state.hasRequestedOffer) {
          state.hasRequestedOffer = true;
          this.offerRequester.markOfferRequested(message.peer);
          this.signaling.requestOffer(message.peer);
        }
      }
    } else if (message.type === "peer_disconnected" && "peer" in message) {
      this._connectedPeers = this._connectedPeers.filter(
        (p) => p !== message.peer,
      );
      this.onSignalingConnectedPeersChange?.(this._connectedPeers);

      // If a source disconnected, update offer requester and clean up
      if (this.sources.includes(message.peer)) {
        this.offerRequester.updateSourceState(message.peer, {
          isAvailable: false,
        });
        this.handleSourceDisconnected(message.peer);
      }
    }

    // Route source-specific messages
    if (message.from && this.sources.includes(message.from as NodeId)) {
      this.handleSourceMessage(message.from as NodeId, message);
    }
  }

  private handleSourceMessage(
    sourceId: NodeId,
    message: ServerToClientMessage,
  ): void {
    const state = this.sourceStates.get(sourceId);
    if (!state) return;

    switch (message.type) {
      case "offer":
        this.handleOffer(sourceId, message);
        break;

      case "candidate":
        if ("candidate" in message) {
          if (state.webrtc) {
            state.webrtc.addIceCandidate(message.candidate);
          } else {
            state.pendingCandidates.push(message.candidate);
          }
        }
        break;

      case "stream_starting":
        this.updateSourceLoading(sourceId, "starting");
        this.onLog?.(sourceId, "Démarrage en cours...", "info");
        break;

      case "stream_stopping":
        this.updateSourceLoading(sourceId, "stopping");
        this.onLog?.(sourceId, "Arrêt en cours...", "info");
        break;

      case "stream_started":
      case "page_opened":
        state.hasRequestedOffer = false;
        state.manuallyStopped = false;

        // Reset offer requester state for this source
        this.offerRequester.resetOfferRequest(sourceId);
        this.offerRequester.updateSourceState(sourceId, {
          manuallyStopped: false,
        });

        // Only request offer if not already connected or connecting
        // The sender may have already sent an offer before this message arrived
        if (
          state.connectionState !== ConnectionState.CONNECTED &&
          state.connectionState !== ConnectionState.CONNECTING
        ) {
          this.signaling.requestOffer(sourceId);
          if (message.type === "stream_started") {
            this.onLog?.(sourceId, "Flux émetteur prêt, connexion...", "info");
          }
        }
        this.onSourceStateChange?.(sourceId, {
          connectionState: state.connectionState,
          remoteStream: state.remoteStream,
          heartbeatStatus: state.heartbeatStatus,
          loading: state.loading,
          manuallyStopped: state.manuallyStopped,
        });
        break;

      case "stream_stopped":
        this.handleStreamStopped(sourceId, message);
        break;

      case "stream_heartbeat":
        // Delegate to HeartbeatMonitor - it will call handleHeartbeatStatusChange if status changes
        this.heartbeatMonitor.recordHeartbeat(sourceId);
        break;

      case "stream_error":
        this.updateSourceLoading(sourceId, false);
        if ("message" in message) {
          this.onLog?.(
            sourceId,
            `Erreur émetteur: ${message.message}`,
            "error",
          );
        }
        break;
    }
  }

  private handleOffer(sourceId: NodeId, message: ServerToClientMessage): void {
    const state = this.sourceStates.get(sourceId);
    if (!state || !("offer" in message)) return;

    const webrtc = this.getOrCreateWebRTC(sourceId);

    webrtc
      .handleOffer(message.offer)
      .then(() => {
        // Process any pending candidates
        for (const candidate of state.pendingCandidates) {
          webrtc.addIceCandidate(candidate);
        }
        state.pendingCandidates = [];
      })
      .catch(() => {
        // Store for later if failed
        state.pendingOffer = message.offer;
      });
  }

  private handleStreamStopped(
    sourceId: NodeId,
    message: ServerToClientMessage,
  ): void {
    const state = this.sourceStates.get(sourceId);
    if (!state) return;

    const wasManualStop =
      "reason" in message && message.reason !== "network_lost";

    // Reset heartbeat tracking via HeartbeatMonitor
    this.heartbeatMonitor.resetSource(sourceId);
    state.manuallyStopped = wasManualStop;

    // Update offer requester state
    this.offerRequester.updateSourceState(sourceId, {
      manuallyStopped: wasManualStop,
    });

    // Close WebRTC to stop reconnection attempts when manually stopped
    if (wasManualStop) {
      this.closeWebRTC(sourceId);
    }

    if (state.stopByOperator) {
      this.onLog?.(sourceId, "Flux arrêté par l'opérateur", "warning");
      state.stopByOperator = false;
    } else {
      this.onLog?.(sourceId, "Flux arrêté par l'émetteur", "warning");
    }

    this.onSourceStateChange?.(sourceId, {
      connectionState: state.connectionState,
      remoteStream: state.remoteStream,
      heartbeatStatus: state.heartbeatStatus,
      loading: state.loading,
      manuallyStopped: state.manuallyStopped,
    });
  }

  private handleSourceDisconnected(sourceId: NodeId): void {
    const state = this.sourceStates.get(sourceId);
    if (!state) return;

    this.closeWebRTC(sourceId);

    // Reset heartbeat tracking via HeartbeatMonitor
    this.heartbeatMonitor.resetSource(sourceId);

    // Sync offer requester state
    this.syncOfferRequesterState(sourceId);

    this.onLog?.(sourceId, "Émetteur déconnecté", "warning");

    this.onSourceStateChange?.(sourceId, {
      connectionState: state.connectionState,
      remoteStream: state.remoteStream,
      heartbeatStatus: state.heartbeatStatus,
      loading: state.loading,
      manuallyStopped: state.manuallyStopped,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Offer Request Logic (delegated to OfferRequester)
  // ─────────────────────────────────────────────────────────────────────────

  private requestOffersFromAvailableSources(): void {
    this.offerRequester.requestFromAvailableSources();
  }

  private startRetryInterval(): void {
    this.offerRequester.setSignalingConnected(true);
    this.offerRequester.start();
  }

  private stopRetryInterval(): void {
    this.offerRequester.setSignalingConnected(false);
    this.offerRequester.stop();
  }

  private syncOfferRequesterState(sourceId: NodeId): void {
    const state = this.sourceStates.get(sourceId);
    if (!state) return;

    this.offerRequester.updateSourceState(sourceId, {
      isAvailable: this._connectedPeers.includes(sourceId),
      isConnected: state.connectionState === ConnectionState.CONNECTED,
      hasRequestedOffer: state.hasRequestedOffer,
      manuallyStopped: state.manuallyStopped,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Heartbeat Monitoring (delegated to HeartbeatMonitor)
  // ─────────────────────────────────────────────────────────────────────────

  private startHeartbeatCheck(): void {
    this.heartbeatMonitor.start();
  }

  private stopHeartbeatCheck(): void {
    this.heartbeatMonitor.stop();
  }

  private handleHeartbeatStatusChange(
    sourceId: NodeId,
    status: HeartbeatStatus,
    previousStatus: HeartbeatStatus,
  ): void {
    const state = this.sourceStates.get(sourceId);
    if (!state) return;

    // Log status changes
    if (status === "dead" && previousStatus !== "dead") {
      this.onLog?.(sourceId, "⚠️ Connexion perdue (pas de heartbeat)", "error");
    } else if (status === "warning" && previousStatus !== "warning") {
      this.onLog?.(sourceId, "⚠️ Heartbeat lent, connexion instable", "warning");
    }

    // Update state and notify
    state.heartbeatStatus = status;
    this.onSourceStateChange?.(sourceId, {
      connectionState: state.connectionState,
      remoteStream: state.remoteStream,
      heartbeatStatus: state.heartbeatStatus,
      loading: state.loading,
      manuallyStopped: state.manuallyStopped,
    });
  }
}
