// StreamManager - Manages all WebRTC connections for a sender dashboard
// Pattern: Service layer that encapsulates signaling + WebRTC connection management
//
// This service handles:
// - Signaling connection lifecycle
// - OBS WebRTC connection (static target)
// - Dynamic operator WebRTC connections (operator-{uuid})
// - Message routing between signaling and WebRTC services
// - Stream lifecycle notifications (started/stopped/heartbeat)

import { ConnectionState, type NodeId, SignalingState } from "@/constants";
import { isOperatorNode, type SenderNodeId } from "@/constants/node-ids";
import { eventBus } from "@/lib/events";
import { webrtcLogger } from "@/lib/logger";
import type { VideoSettings } from "@/types";
import type { ServerToClientMessage } from "@/types/signaling";
import { SignalingService } from "./signaling-service";
import { WebRTCService } from "./webrtc-service";

// Callback types for UI integration
export type StreamControlCallback = (action: "start" | "stop") => void;
export type LogCallback = (
  message: string,
  level?: "info" | "warning" | "error" | "success",
) => void;
export type ConnectionStateCallback = (state: ConnectionState) => void;
export type SignalingStateCallback = (state: SignalingState) => void;
export type AudioDuckingCallback = (ducking: boolean, gain: number) => void;

export interface StreamManagerOptions {
  nodeId: SenderNodeId;
  obsTarget: NodeId; // Primary OBS receiver (obs_paris or obs_nantes)
  targetCity: string; // Display name for logs (Paris or Nantes)

  // Callbacks
  onStreamControl?: StreamControlCallback;
  onLog?: LogCallback;
  onObsConnectionStateChange?: ConnectionStateCallback;
  onSignalingStateChange?: SignalingStateCallback;
  onSignalingConnectedPeersChange?: (peers: NodeId[]) => void;
  /** Called when receiving audio ducking command from remote sender */
  onAudioDucking?: AudioDuckingCallback;
}

/**
 * StreamManager encapsulates all signaling and WebRTC connection logic for a sender.
 *
 * Usage:
 * ```ts
 * const manager = new StreamManager({
 *   nodeId: NodeId.NANTES,
 *   obsTarget: NodeId.OBS_PARIS,
 *   targetCity: "Paris",
 *   onStreamControl: (action) => { ... },
 *   onLog: (msg, level) => { ... },
 * });
 *
 * manager.connect();
 * manager.setLocalStream(stream);
 * manager.setVideoSettings(settings);
 * await manager.startStreaming();
 * manager.stopStreaming();
 * manager.destroy();
 * ```
 */
export class StreamManager {
  private readonly nodeId: SenderNodeId;
  private readonly obsTarget: NodeId;
  private readonly targetCity: string;

  // Services
  private signaling: SignalingService;
  private obsWebRTC: WebRTCService | null = null;
  private operatorConnections = new Map<string, WebRTCService>();

  // State
  private localStream: MediaStream | null = null;
  private videoSettings: VideoSettings | null = null;
  private isStreaming = false;
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private _connectedPeers: NodeId[] = [];

  // Callbacks
  private onStreamControl?: StreamControlCallback;
  private onLog?: LogCallback;
  private onObsConnectionStateChange?: ConnectionStateCallback;
  private onSignalingStateChange?: SignalingStateCallback;
  private onSignalingConnectedPeersChange?: (peers: NodeId[]) => void;
  private onAudioDucking?: AudioDuckingCallback;

  constructor(options: StreamManagerOptions) {
    this.nodeId = options.nodeId;
    this.obsTarget = options.obsTarget;
    this.targetCity = options.targetCity;
    this.onStreamControl = options.onStreamControl;
    this.onLog = options.onLog;
    this.onObsConnectionStateChange = options.onObsConnectionStateChange;
    this.onSignalingStateChange = options.onSignalingStateChange;
    this.onSignalingConnectedPeersChange =
      options.onSignalingConnectedPeersChange;
    this.onAudioDucking = options.onAudioDucking;

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
    this.signaling.disconnect();
  }

  /**
   * Get the signaling service (for hooks that need direct access)
   */
  getSignalingService(): SignalingService {
    return this.signaling;
  }

  /**
   * Get OBS WebRTC service (for metrics, state tracking)
   */
  getObsWebRTC(): WebRTCService | null {
    return this.obsWebRTC;
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
   * Get list of connected peers from signaling
   */
  get connectedPeers(): NodeId[] {
    return this._connectedPeers;
  }

  /**
   * Get OBS connection state
   */
  get obsConnectionState(): ConnectionState {
    return this.obsWebRTC?.connectionState ?? ConnectionState.DISCONNECTED;
  }

  /**
   * Set the local media stream (from useUserMedia)
   */
  setLocalStream(stream: MediaStream | null): void {
    this.localStream = stream;

    // Update existing OBS connection
    if (this.obsWebRTC && stream) {
      this.obsWebRTC.setLocalStream(stream);
    }

    // Update all operator connections
    if (stream) {
      for (const service of this.operatorConnections.values()) {
        service.setLocalStream(stream);
      }
    }
  }

  /**
   * Set video settings (bitrate, codec) to apply to new connections
   */
  setVideoSettings(settings: VideoSettings): void {
    this.videoSettings = settings;
  }

  /**
   * Replace video track on all active connections
   */
  async replaceVideoTrack(track: MediaStreamTrack): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.obsWebRTC) {
      promises.push(this.obsWebRTC.replaceTrack(track));
    }

    for (const service of this.operatorConnections.values()) {
      promises.push(service.replaceTrack(track));
    }

    await Promise.all(promises);
  }

  /**
   * Replace audio track on all active connections
   */
  async replaceAudioTrack(track: MediaStreamTrack): Promise<void> {
    const promises: Promise<void>[] = [];

    if (this.obsWebRTC) {
      promises.push(this.obsWebRTC.replaceTrack(track));
    }

    for (const service of this.operatorConnections.values()) {
      promises.push(service.replaceTrack(track));
    }

    await Promise.all(promises);
  }

  /**
   * Start streaming - creates OBS connection and sends offer
   */
  async startStreaming(): Promise<void> {
    if (!this.localStream) {
      webrtcLogger.warn("Cannot start streaming: no local stream");
      return;
    }

    this.isStreaming = true;

    // Create OBS WebRTC connection if not exists
    if (!this.obsWebRTC) {
      this.createObsConnection();
    }

    // Apply settings and create offer
    if (this.obsWebRTC) {
      this.applySettingsToConnection(this.obsWebRTC);
      await this.obsWebRTC.createOffer();
    }

    // Notify server
    this.signaling.notifyStreamStarted();

    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Stop streaming - closes connections and notifies server
   */
  stopStreaming(
    reason: "manual" | "page_closed" | "network_lost" = "manual",
  ): void {
    this.isStreaming = false;

    // Stop heartbeat
    this.stopHeartbeat();

    // Close OBS connection
    if (this.obsWebRTC) {
      this.obsWebRTC.close();
      this.obsWebRTC = null;
    }

    // Close all operator connections
    for (const [id, service] of this.operatorConnections) {
      webrtcLogger.debug(`Closing operator connection: ${id}`);
      service.close();
    }
    this.operatorConnections.clear();

    // Notify server
    this.signaling.notifyStreamStopped(reason);
  }

  /**
   * Notify server that page was opened
   */
  notifyPageOpened(): void {
    this.signaling.notifyPageOpened();
  }

  /**
   * Notify server that streaming is starting (before WebRTC connects)
   */
  notifyStreamStarting(): void {
    this.signaling.notifyStreamStarting();
  }

  /**
   * Notify server that streaming is stopping (before WebRTC disconnects)
   */
  notifyStreamStopping(): void {
    this.signaling.notifyStreamStopping();
  }

  /**
   * Notify server that stream has started (WebRTC connected)
   */
  notifyStreamStarted(): void {
    this.signaling.notifyStreamStarted();
  }

  /**
   * Notify server of a stream error
   */
  notifyStreamError(
    error:
      | "media_permission_denied"
      | "webrtc_offer_failed"
      | "webrtc_connection_failed"
      | "timeout",
    message: string,
  ): void {
    this.signaling.notifyStreamError(error, message);
  }

  /**
   * Create OBS WebRTC offer (used for manual start)
   */
  async createObsOffer(): Promise<void> {
    webrtcLogger.info(
      `createObsOffer called - hasLocalStream=${!!this.localStream}, hasExistingConnection=${!!this.obsWebRTC}`,
    );

    // Ensure we have a local stream before creating connection
    if (!this.localStream) {
      webrtcLogger.warn(
        "createObsOffer called without local stream - offer may fail",
      );
    }

    // Close existing connection if any, but notify CONNECTING state first
    // to avoid briefly showing "Arrêté" in the UI
    if (this.obsWebRTC) {
      webrtcLogger.debug(
        "Closing existing OBS connection before creating new one",
      );
      // Notify connecting state BEFORE closing to avoid showing "Arrêté"
      this.onObsConnectionStateChange?.(ConnectionState.CONNECTING);
      this.obsWebRTC.close();
    }

    webrtcLogger.debug("Creating new OBS connection...");
    this.createObsConnection();

    // obsWebRTC is now set by createObsConnection
    const webrtc = this.obsWebRTC;
    if (webrtc) {
      webrtcLogger.debug("Applying settings and creating offer...");
      this.applySettingsToConnection(webrtc);
      await webrtc.createOffer();
      webrtcLogger.info("createObsOffer completed successfully");
    } else {
      webrtcLogger.error(
        "createObsOffer: obsWebRTC is null after createObsConnection!",
      );
    }
  }

  /**
   * Close OBS WebRTC connection (used for manual stop)
   */
  closeObsConnection(): void {
    if (this.obsWebRTC) {
      this.obsWebRTC.close();
      this.obsWebRTC = null;
    }
  }

  /**
   * Close all operator connections
   */
  closeOperatorConnections(): void {
    for (const [id, service] of this.operatorConnections) {
      webrtcLogger.debug(`Closing operator connection: ${id}`);
      service.close();
    }
    this.operatorConnections.clear();
  }

  /**
   * Apply codec and bitrate settings to OBS connection
   */
  applySettingsToObs(settings: VideoSettings): void {
    if (!this.obsWebRTC) return;
    if (settings.bitrate !== "auto") {
      this.obsWebRTC.setVideoBitrate(settings.bitrate);
    }
    if (settings.codec !== "auto") {
      this.obsWebRTC.setPreferredCodec(settings.codec);
    }
  }

  /**
   * Apply bitrate to all active connections (OBS + operators)
   */
  applyBitrateToAll(bitrate: number | "auto"): void {
    if (bitrate === "auto") return;

    if (this.obsWebRTC) {
      this.obsWebRTC.setVideoBitrate(bitrate);
    }
    for (const service of this.operatorConnections.values()) {
      service.setVideoBitrate(bitrate);
    }
  }

  /**
   * Apply codec to all active connections and renegotiate (OBS + operators)
   */
  applyCodecToAll(codec: string | "auto"): void {
    if (codec === "auto") return;

    if (this.obsWebRTC) {
      this.obsWebRTC.setPreferredCodec(codec);
      this.obsWebRTC.createOffer().catch((err) => {
        webrtcLogger.warn("Failed to renegotiate codec for OBS:", err);
      });
    }
    for (const service of this.operatorConnections.values()) {
      service.setPreferredCodec(codec);
      service.createOffer().catch((err) => {
        webrtcLogger.warn("Failed to renegotiate codec for operator:", err);
      });
    }
  }

  /**
   * Set the streaming state (used by SenderDashboard which manages state externally)
   */
  setStreamingState(streaming: boolean): void {
    this.isStreaming = streaming;
    webrtcLogger.debug(`StreamManager: isStreaming=${streaming}`);
  }

  /**
   * Get current streaming state
   */
  get streamingState(): boolean {
    return this.isStreaming;
  }

  /**
   * Clean up all resources
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;

    this.stopHeartbeat();

    // Close all connections
    if (this.obsWebRTC) {
      this.obsWebRTC.close();
      this.obsWebRTC = null;
    }

    for (const service of this.operatorConnections.values()) {
      service.close();
    }
    this.operatorConnections.clear();

    // Disconnect signaling
    this.signaling.disconnect();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Connection Management
  // ─────────────────────────────────────────────────────────────────────────

  private createObsConnection(): void {
    webrtcLogger.info(
      `createObsConnection: creating new WebRTCService for ${this.obsTarget}, localStream=${!!this.localStream}`,
    );
    this.obsWebRTC = new WebRTCService(
      this.nodeId,
      this.obsTarget,
      this.signaling,
      {
        localStream: this.localStream ?? undefined,
        onConnectionStateChange: (state) => {
          webrtcLogger.info(`OBS connection state: ${state}`);
          this.onObsConnectionStateChange?.(state);

          // Emit event for store updates
          if (state === ConnectionState.CONNECTED) {
            eventBus.emit("peer:connected", {
              localNodeId: this.nodeId,
              remoteNodeId: this.obsTarget,
            });
          } else if (
            state === ConnectionState.DISCONNECTED ||
            state === ConnectionState.FAILED
          ) {
            eventBus.emit("peer:disconnected", {
              localNodeId: this.nodeId,
              remoteNodeId: this.obsTarget,
            });
          }
        },
      },
    );
    webrtcLogger.info(
      `createObsConnection: WebRTCService created, obsWebRTC=${!!this.obsWebRTC}`,
    );
  }

  private getOrCreateOperatorConnection(operatorId: string): WebRTCService {
    let service = this.operatorConnections.get(operatorId);
    if (service) return service;

    webrtcLogger.info(
      `Creating new WebRTC connection for operator: ${operatorId}`,
    );
    service = new WebRTCService(
      this.nodeId,
      operatorId as NodeId,
      this.signaling,
      {
        localStream: this.localStream ?? undefined,
      },
    );

    this.operatorConnections.set(operatorId, service);
    this.applySettingsToConnection(service);

    return service;
  }

  private applySettingsToConnection(service: WebRTCService): void {
    if (!this.videoSettings) return;

    if (this.videoSettings.bitrate !== "auto") {
      service.setVideoBitrate(this.videoSettings.bitrate);
    }
    if (this.videoSettings.codec !== "auto") {
      service.setPreferredCodec(this.videoSettings.codec);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Signaling Message Handling
  // ─────────────────────────────────────────────────────────────────────────

  private handleSignalingStateChange(state: SignalingState): void {
    this.onSignalingStateChange?.(state);

    if (state === SignalingState.CONNECTED) {
      this.onLog?.("Connecté au serveur de signalisation", "success");
    }
  }

  private handleSignalingMessage(message: ServerToClientMessage): void {
    // Update connected peers list
    if (message.type === "login_success" && "clients" in message) {
      this._connectedPeers = message.clients;
      this.onSignalingConnectedPeersChange?.(this._connectedPeers);
    } else if (message.type === "peer_connected" && "peer" in message) {
      if (!this._connectedPeers.includes(message.peer)) {
        this._connectedPeers = [...this._connectedPeers, message.peer];
      }
      this.onSignalingConnectedPeersChange?.(this._connectedPeers);
    } else if (message.type === "peer_disconnected" && "peer" in message) {
      this._connectedPeers = this._connectedPeers.filter(
        (p) => p !== message.peer,
      );
      this.onSignalingConnectedPeersChange?.(this._connectedPeers);
    }

    // Handle our own echoed messages
    if (message.type === "stream_started" && message.from === this.nodeId) {
      webrtcLogger.debug("Received stream_started echo from server");
      return;
    }

    if (message.type === "stream_stopped" && message.from === this.nodeId) {
      webrtcLogger.debug("Received stream_stopped echo from server");
      return;
    }

    // Handle stream control from operator
    if (message.type === "stream_control") {
      this.onStreamControl?.(message.action);
      return;
    }

    // Handle audio ducking from remote sender
    if (message.type === "audio_ducking") {
      webrtcLogger.debug(
        `Received audio ducking: ${message.ducking ? "DUCK" : "UNDUCK"} (gain: ${message.gain})`,
      );
      this.onAudioDucking?.(message.ducking, message.gain);
      return;
    }

    // Skip messages without sender
    if (!message.from) return;

    // Route to operator connections
    if (isOperatorNode(message.from)) {
      this.handleOperatorMessage(message.from, message);
      return;
    }

    // Handle peer disconnection
    if (message.type === "peer_disconnected") {
      this.handlePeerDisconnected(message.peer);
      return;
    }

    // Route to OBS connection
    if (message.from === this.obsTarget || message.type === "request_offer") {
      this.handleObsMessage(message);
    }
  }

  private handleOperatorMessage(
    operatorId: string,
    message: ServerToClientMessage,
  ): void {
    const service = this.getOrCreateOperatorConnection(operatorId);

    switch (message.type) {
      case "answer":
        if ("answer" in message) {
          service.handleAnswer(message.answer);
        }
        break;

      case "candidate":
        if ("candidate" in message) {
          service.addIceCandidate(message.candidate);
        }
        break;

      case "request_offer":
        if (service.connectionState === ConnectionState.CONNECTED) {
          webrtcLogger.debug(
            `Ignoring request_offer from operator ${operatorId} - already connected`,
          );
          return;
        }
        if (this.isStreaming && this.localStream) {
          webrtcLogger.info(
            `Sending offer to operator ${operatorId} upon request`,
          );
          service.setLocalStream(this.localStream);
          this.applySettingsToConnection(service);
          service.createOffer();
        }
        break;
    }
  }

  private handleObsMessage(message: ServerToClientMessage): void {
    switch (message.type) {
      case "answer":
        if ("answer" in message && this.obsWebRTC) {
          this.obsWebRTC.handleAnswer(message.answer);
        }
        break;

      case "candidate":
        if ("candidate" in message && this.obsWebRTC) {
          this.obsWebRTC.addIceCandidate(message.candidate);
        }
        break;

      case "request_offer":
        // Only respond to request_offer if we're actively streaming
        if (!this.isStreaming || !this.localStream) {
          webrtcLogger.debug(
            `Ignoring request_offer from ${this.obsTarget}: isStreaming=${this.isStreaming}, hasStream=${!!this.localStream}`,
          );
          return;
        }
        // Create OBS connection if it doesn't exist yet
        if (!this.obsWebRTC) {
          this.createObsConnection();
        }
        // Only ignore if already fully connected
        // Note: Don't ignore CONNECTING state - if a previous offer failed or is stuck,
        // we should close and retry with a fresh connection
        if (this.obsWebRTC?.connectionState === ConnectionState.CONNECTED) {
          webrtcLogger.debug(
            `Ignoring request_offer from ${this.obsTarget} - already connected`,
          );
          return;
        }
        // If CONNECTING (stuck), close and recreate for a fresh attempt
        if (this.obsWebRTC?.connectionState === ConnectionState.CONNECTING) {
          webrtcLogger.info(
            `request_offer while CONNECTING - recreating connection for fresh attempt`,
          );
          this.obsWebRTC.close();
          this.createObsConnection();
        }
        if (this.obsWebRTC) {
          webrtcLogger.info(`Sending offer to ${this.obsTarget} upon request`);
          this.applySettingsToConnection(this.obsWebRTC);
          this.obsWebRTC.createOffer();
        }
        break;
    }
  }

  private handlePeerDisconnected(peerId: NodeId): void {
    // Check if it's OBS receiver
    if (peerId === this.obsTarget) {
      webrtcLogger.info(`OBS receiver ${peerId} disconnected, closing WebRTC`);
      this.obsWebRTC?.close();
      this.obsWebRTC = null;
      this.onLog?.(`${this.targetCity} OBS déconnecté`, "warning");
    }

    // Check if it's an operator
    if (isOperatorNode(peerId)) {
      const service = this.operatorConnections.get(peerId);
      if (service) {
        webrtcLogger.info(`Operator ${peerId} disconnected, closing WebRTC`);
        service.close();
        this.operatorConnections.delete(peerId);
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Private: Heartbeat
  // ─────────────────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatInterval = setInterval(() => {
      if (this.isStreaming && this.signaling.isConnected) {
        this.signaling.sendStreamHeartbeat();
      }
    }, 5000); // Stream heartbeat every 5 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}
