// WebRTCService - RTCPeerConnection wrapper with resilience
// Pattern: Service layer (non-React business logic)

import {
  ICE_SERVERS,
  RECONNECT_CONFIG,
  STATS_CONFIG,
  WEBRTC_TIMEOUTS,
} from "@/config/webrtc";
import { ConnectionState, type NodeId } from "@/constants";
import { eventBus } from "@/lib/events";
import { logger, mediaLogger, statsLogger, webrtcLogger } from "@/lib/logger";
import { type PreviousStats, parseStats } from "@/lib/stats-parser";
import { applyJitter } from "@/lib/utils";
import type { PeerMetrics } from "@/types";
import type { SignalingService } from "./signaling-service";

/**
 * Wrap a promise with a timeout
 */
function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timer);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

type ConnectionStateHandler = (state: ConnectionState) => void;
type TrackHandler = (event: RTCTrackEvent) => void;
type MetricsHandler = (metrics: PeerMetrics) => void;
type Unsubscribe = () => void;

/**
 * Configuration options for WebRTCService
 */
export interface WebRTCServiceOptions {
  /** Custom ICE servers. Defaults to Google STUN servers */
  iceServers?: RTCIceServer[];
  /** Local media stream to send to the remote peer */
  localStream?: MediaStream;
  /** Interval for collecting connection stats (ms). Default: 2000 */
  statsInterval?: number;
  /** Callback when a remote track is received */
  onTrack?: TrackHandler;
  /** Callback when connection state changes */
  onConnectionStateChange?: ConnectionStateHandler;
  /** Callback when new metrics are collected */
  onMetrics?: MetricsHandler;
}

/**
 * WebRTC peer connection service for establishing media streams between peers.
 *
 * Manages the RTCPeerConnection lifecycle including:
 * - SDP offer/answer exchange via SignalingService
 * - ICE candidate buffering until remote description is set
 * - Automatic stats collection and metrics reporting
 * - Connection state management and reconnection
 * - Codec preference and bitrate control
 *
 * @example
 * ```typescript
 * const webrtc = new WebRTCService(
 *   'nantes',           // local node ID
 *   'obs_paris',        // remote node ID
 *   signalingService,
 *   {
 *     localStream: mediaStream,
 *     onTrack: (event) => {
 *       videoElement.srcObject = event.streams[0];
 *     },
 *     onConnectionStateChange: (state) => {
 *       console.log('Connection:', state);
 *     },
 *     onMetrics: (metrics) => {
 *       console.log('FPS:', metrics.video.fps);
 *     },
 *   }
 * );
 *
 * // As sender: create and send offer
 * webrtc.initialize();
 * await webrtc.createOffer();
 *
 * // As receiver: handle incoming offer
 * await webrtc.handleOffer(offer);
 *
 * // Clean up
 * webrtc.destroy();
 * ```
 */
export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private signaling: SignalingService;
  private localNodeId: NodeId;
  private remoteNodeId: NodeId;
  private effectiveRemoteNodeId: NodeId; // Actual target for messages (may differ for dynamic operator IDs)
  private localStream: MediaStream | null;
  private iceServers: RTCIceServer[];

  // ICE candidate buffering - includes sessionId to prevent stale candidates
  private pendingCandidates: { candidate: RTCIceCandidateInit; sessionId: number }[] = [];
  private remoteDescriptionSet = false;

  // Session tracking - prevents stale ICE candidates from old sessions
  // Incremented on each new connection to invalidate old buffered candidates
  private sessionId = 0;

  // Offer state - prevent duplicate offers
  private offerPending = false;

  // Preferred codec for video
  private preferredVideoCodec: string | null = null;

  // Connection state
  private state: ConnectionState = ConnectionState.DISCONNECTED;
  private intentionallyClosed = false;

  // Reconnection
  private reconnectAttempt = 0;
  private reconnectDelay: number = RECONNECT_CONFIG.initialDelay;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  // Stats collection
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private statsIntervalMs: number;
  private previousStats: PreviousStats | null = null;

  // Event handlers
  private connectionStateHandlers = new Set<ConnectionStateHandler>();
  private trackHandlers = new Set<TrackHandler>();
  private metricsHandlers = new Set<MetricsHandler>();

  constructor(
    localNodeId: NodeId,
    remoteNodeId: NodeId,
    signaling: SignalingService,
    options: WebRTCServiceOptions = {},
  ) {
    this.localNodeId = localNodeId;
    this.remoteNodeId = remoteNodeId;
    this.effectiveRemoteNodeId = remoteNodeId; // Default to same as remoteNodeId
    this.signaling = signaling;
    this.localStream = options.localStream ?? null;
    this.iceServers = options.iceServers ?? ICE_SERVERS.map((s) => ({ ...s }));
    this.statsIntervalMs = options.statsInterval ?? STATS_CONFIG.interval;

    if (options.onTrack) this.trackHandlers.add(options.onTrack);
    if (options.onConnectionStateChange)
      this.connectionStateHandlers.add(options.onConnectionStateChange);
    if (options.onMetrics) this.metricsHandlers.add(options.onMetrics);
  }

  /**
   * Current connection state
   */
  get connectionState(): ConnectionState {
    return this.state;
  }

  /**
   * Whether the connection is established
   */
  get isConnected(): boolean {
    return this.state === ConnectionState.CONNECTED;
  }

  /**
   * The underlying RTCPeerConnection (for advanced use)
   */
  get peerConnection(): RTCPeerConnection | null {
    return this.pc;
  }

  /**
   * Set the effective remote node ID for sending messages.
   * Used when the actual peer has a dynamic ID (e.g., operator-xxx)
   * but the connection was created with a static ID (e.g., operator).
   */
  setEffectiveRemoteNodeId(nodeId: NodeId): void {
    this.effectiveRemoteNodeId = nodeId;
    webrtcLogger.debug(`Effective remote node ID set to: ${nodeId}`);
  }

  /**
   * Initialize the peer connection
   */
  initialize(): void {
    webrtcLogger.info(
      `initialize() called for ${this.remoteNodeId}, hasLocalStream=${!!this.localStream}, trackCount=${this.localStream?.getTracks().length ?? 0}`,
    );
    if (this.pc) {
      webrtcLogger.debug(`Cleaning up existing PC`);
      this.cleanup();
    }

    // Reset intentionallyClosed since we're creating a fresh connection
    // This is important when reinitializing after close() was called (e.g., sender refresh)
    this.intentionallyClosed = false;

    // Increment session ID to invalidate any pending ICE candidates from previous session
    this.sessionId++;
    webrtcLogger.info(`New session ${this.sessionId} for ${this.remoteNodeId}`);

    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];

    // Add local tracks if available
    if (this.localStream) {
      webrtcLogger.debug(
        `Adding ${this.localStream.getTracks().length} tracks to PC`,
      );
      for (const track of this.localStream.getTracks()) {
        const sender = this.pc.addTrack(track, this.localStream);

        // Apply codec preference for video tracks
        if (track.kind === "video" && this.preferredVideoCodec) {
          this.applyCodecPreference(sender);
        }
      }
    } else {
      webrtcLogger.warn(`No local stream to add tracks from!`);
    }

    // Set up event handlers
    this.pc.onicecandidate = this.handleIceCandidate;
    this.pc.ontrack = this.handleTrack;
    this.pc.onconnectionstatechange = this.handleConnectionStateChange;
    this.pc.oniceconnectionstatechange = this.handleIceConnectionStateChange;

    this.setState(ConnectionState.CONNECTING);
    webrtcLogger.info(`initialize() completed for ${this.remoteNodeId}`);
  }

  /**
   * Apply codec preference to a video sender's transceiver
   */
  private applyCodecPreference(sender: RTCRtpSender): void {
    if (!this.preferredVideoCodec || this.preferredVideoCodec === "auto")
      return;

    const transceiver = this.pc
      ?.getTransceivers()
      .find((t) => t.sender === sender);
    if (!transceiver) return;

    try {
      // Get available codecs
      const codecs = RTCRtpSender.getCapabilities?.("video")?.codecs;
      if (!codecs) {
        webrtcLogger.warn("Cannot get video codec capabilities");
        return;
      }

      // Map codec names to MIME types
      const codecMimeMap: Record<string, string> = {
        VP8: "video/VP8",
        VP9: "video/VP9",
        H264: "video/H264",
        AV1: "video/AV1",
      };

      const preferredMime = codecMimeMap[this.preferredVideoCodec];
      if (!preferredMime) return;

      // Sort codecs to put preferred one first
      const sortedCodecs = [...codecs].sort((a, b) => {
        const aMatch = a.mimeType === preferredMime ? -1 : 0;
        const bMatch = b.mimeType === preferredMime ? -1 : 0;
        return aMatch - bMatch;
      });

      transceiver.setCodecPreferences(sortedCodecs);
      statsLogger.debug(`Codec preference set to ${this.preferredVideoCodec}`);
    } catch (err) {
      webrtcLogger.warn("Failed to set codec preference:", err);
    }
  }

  /**
   * Create and send an offer
   */
  async createOffer(): Promise<RTCSessionDescriptionInit | null> {
    webrtcLogger.info(
      `createOffer called for ${this.remoteNodeId} - offerPending=${this.offerPending}, hasPC=${!!this.pc}`,
    );

    // Prevent duplicate offers while one is pending
    if (this.offerPending) {
      webrtcLogger.debug(
        `Offer already pending for ${this.remoteNodeId}, skipping`,
      );
      return null;
    }

    if (!this.pc) {
      webrtcLogger.debug(`No PC, calling initialize()`);
      this.initialize();
    }

    this.offerPending = true;

    try {
      webrtcLogger.debug(`Creating offer...`);
      const offer = await withTimeout(
        this.pc!.createOffer(),
        WEBRTC_TIMEOUTS.operation,
        "createOffer",
      );
      webrtcLogger.debug(`Setting local description...`);
      await withTimeout(
        this.pc!.setLocalDescription(offer),
        WEBRTC_TIMEOUTS.operation,
        "setLocalDescription",
      );

      webrtcLogger.debug(`Sending offer via signaling...`);
      this.signaling.sendOffer(this.effectiveRemoteNodeId, offer);
      webrtcLogger.info(`Offer sent to ${this.effectiveRemoteNodeId}`);

      return offer;
    } catch (error) {
      webrtcLogger.error(`createOffer failed:`, error);
      throw error;
    } finally {
      // Always reset offerPending flag - on success AND error
      this.offerPending = false;
    }
  }

  /**
   * Handle an incoming offer and create an answer
   * Always reinitializes the connection to handle sender refresh/reconnect
   */
  async handleOffer(
    offer: RTCSessionDescriptionInit,
  ): Promise<RTCSessionDescriptionInit> {
    // Always reinitialize when receiving a new offer
    // This handles the case where the sender refreshed and is sending a new offer
    // while we still have an old/stale peer connection
    webrtcLogger.info(
      `Received offer from ${this.remoteNodeId}, reinitializing`,
    );

    // Save any pending candidates from before initialize (they belong to old connection, discard them)
    this.initialize();

    // IMPORTANT: remoteDescriptionSet stays false until setRemoteDescription completes
    // Any candidates arriving during this async operation will be buffered

    try {
      await withTimeout(
        this.pc!.setRemoteDescription(new RTCSessionDescription(offer)),
        WEBRTC_TIMEOUTS.operation,
        "setRemoteDescription",
      );
      this.remoteDescriptionSet = true;

      // Now process any candidates that arrived during the async operation above
      await this.processPendingCandidates();

      const answer = await withTimeout(
        this.pc!.createAnswer(),
        WEBRTC_TIMEOUTS.operation,
        "createAnswer",
      );
      await withTimeout(
        this.pc!.setLocalDescription(answer),
        WEBRTC_TIMEOUTS.operation,
        "setLocalDescription",
      );

      this.signaling.sendAnswer(this.effectiveRemoteNodeId, answer);
      webrtcLogger.info(`Answer sent to ${this.effectiveRemoteNodeId}`);

      return answer;
    } catch (error) {
      webrtcLogger.error(
        `Failed to handle offer from ${this.remoteNodeId}:`,
        error,
      );
      throw error;
    }
  }

  /**
   * Handle an incoming answer
   */
  async handleAnswer(answer: RTCSessionDescriptionInit): Promise<void> {
    if (!this.pc) {
      webrtcLogger.warn("Cannot handle answer: no peer connection");
      return;
    }

    // Check if we're in the right state to receive an answer
    // This can happen normally when duplicate answers arrive (e.g., from retried offers)
    if (this.pc.signalingState !== "have-local-offer") {
      webrtcLogger.debug(
        `Ignoring answer: already in ${this.pc.signalingState} state`,
      );
      return;
    }

    try {
      await withTimeout(
        this.pc.setRemoteDescription(new RTCSessionDescription(answer)),
        WEBRTC_TIMEOUTS.operation,
        "setRemoteDescription (answer)",
      );
      this.remoteDescriptionSet = true;
      this.offerPending = false; // Answer received, offer cycle complete

      // Process buffered ICE candidates
      await this.processPendingCandidates();
      webrtcLogger.info(`Answer processed from ${this.remoteNodeId}`);
    } catch (error) {
      webrtcLogger.error(
        `Failed to handle answer from ${this.remoteNodeId}:`,
        error,
      );
      this.offerPending = false;
    }
  }

  /**
   * Add an ICE candidate (buffered if remote description not set)
   * Candidates are tagged with sessionId to prevent stale candidates from old sessions
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    const currentSessionId = this.sessionId;

    if (!this.pc) {
      // Buffer even if no PC yet - will be processed after setRemoteDescription
      this.pendingCandidates.push({ candidate, sessionId: currentSessionId });
      webrtcLogger.debug(
        `Buffering ICE candidate (no PC yet), session=${currentSessionId}, total: ${this.pendingCandidates.length}`,
      );
      return;
    }

    if (!this.remoteDescriptionSet) {
      // Buffer the candidate until remote description is set
      this.pendingCandidates.push({ candidate, sessionId: currentSessionId });
      webrtcLogger.debug(
        `Buffering ICE candidate (no remote desc), session=${currentSessionId}, total: ${this.pendingCandidates.length}`,
      );
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      webrtcLogger.warn("Failed to add ICE candidate:", error);
    }
  }

  /**
   * Replace a track in the active stream (hot-swap)
   */
  async replaceTrack(newTrack: MediaStreamTrack): Promise<void> {
    if (!this.pc) {
      webrtcLogger.warn("Cannot replace track: no peer connection");
      return;
    }

    const senders = this.pc.getSenders();
    logger.debug(
      "track",
      `Looking for ${newTrack.kind} sender among ${senders.length} senders`,
    );

    // Find sender by track kind
    const sender = senders.find((s) => s.track?.kind === newTrack.kind);

    if (sender) {
      try {
        await sender.replaceTrack(newTrack);
        logger.info(
          "track",
          `Replaced ${newTrack.kind} track: ${newTrack.label}`,
        );
      } catch (error) {
        logger.error(
          "track",
          `Failed to replace ${newTrack.kind} track:`,
          error,
        );
      }
    } else {
      webrtcLogger.warn(`No sender found for ${newTrack.kind} track`);
    }
  }

  /**
   * Set the local stream (can be called before or after initialize)
   */
  setLocalStream(stream: MediaStream | null): void {
    this.localStream = stream;

    if (this.pc && stream) {
      // Remove existing senders
      for (const sender of this.pc.getSenders()) {
        this.pc.removeTrack(sender);
      }

      // Add new tracks
      for (const track of stream.getTracks()) {
        this.pc.addTrack(track, stream);
      }
    }
  }

  /**
   * Apply bitrate constraints to the video sender
   * @param maxBitrate Maximum bitrate in kbps (e.g., 8000 for 8Mbps)
   */
  async setVideoBitrate(maxBitrate: number | "auto"): Promise<boolean> {
    if (!this.pc) {
      webrtcLogger.warn("Cannot set bitrate: no peer connection");
      return false;
    }

    const sender = this.pc.getSenders().find((s) => s.track?.kind === "video");
    if (!sender) {
      webrtcLogger.warn("Cannot set bitrate: no video sender");
      return false;
    }

    try {
      const params = sender.getParameters();
      if (!params.encodings || params.encodings.length === 0) {
        params.encodings = [{}];
      }

      if (maxBitrate === "auto") {
        // Remove bitrate limit
        delete params.encodings[0].maxBitrate;
        statsLogger.debug("Removed bitrate limit (auto mode)");
      } else {
        // Set max bitrate in bits per second
        params.encodings[0].maxBitrate = maxBitrate * 1000;
        statsLogger.debug(`Set max bitrate to ${maxBitrate} kbps`);
      }

      await sender.setParameters(params);
      return true;
    } catch (error) {
      webrtcLogger.error("Failed to set bitrate:", error);
      return false;
    }
  }

  /**
   * Set preferred video codec
   * Note: Takes effect on next connection initialization
   * @param codec Codec name (VP8, VP9, H264) or "auto"
   */
  setPreferredCodec(codec: string | "auto"): void {
    this.preferredVideoCodec = codec === "auto" ? null : codec;
    statsLogger.debug(`Preferred codec set to: ${codec}`);

    // If already connected, try to apply to existing transceivers
    // (won't take full effect until renegotiation)
    if (this.pc && this.preferredVideoCodec) {
      const videoSender = this.pc
        .getSenders()
        .find((s) => s.track?.kind === "video");
      if (videoSender) {
        this.applyCodecPreference(videoSender);
      }
    }
  }

  /**
   * Subscribe to connection state changes
   */
  onConnectionStateChange(handler: ConnectionStateHandler): Unsubscribe {
    this.connectionStateHandlers.add(handler);
    handler(this.state);
    return () => this.connectionStateHandlers.delete(handler);
  }

  /**
   * Subscribe to track events
   */
  onTrack(handler: TrackHandler): Unsubscribe {
    this.trackHandlers.add(handler);
    return () => this.trackHandlers.delete(handler);
  }

  /**
   * Subscribe to metrics updates
   */
  onMetrics(handler: MetricsHandler): Unsubscribe {
    this.metricsHandlers.add(handler);
    return () => this.metricsHandlers.delete(handler);
  }

  /**
   * Start collecting stats
   */
  startStats(): void {
    this.stopStats();
    this.previousStats = null;

    this.statsInterval = setInterval(() => {
      this.collectStats();
    }, this.statsIntervalMs);
  }

  /**
   * Stop collecting stats
   */
  stopStats(): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  /**
   * Close the connection
   */
  close(): void {
    this.intentionallyClosed = true;
    this.cleanup();
    this.setState(ConnectionState.DISCONNECTED);
  }

  /**
   * Restart ICE (for recovery)
   */
  async restartIce(): Promise<void> {
    if (!this.pc) return;

    webrtcLogger.info("Restarting ICE");
    const offer = await this.pc.createOffer({ iceRestart: true });
    await this.pc.setLocalDescription(offer);
    this.signaling.sendOffer(this.effectiveRemoteNodeId, offer);
  }

  // Private methods

  private handleIceCandidate = (event: RTCPeerConnectionIceEvent): void => {
    if (event.candidate) {
      this.signaling.sendCandidate(
        this.effectiveRemoteNodeId,
        event.candidate.toJSON(),
      );
    }
  };

  private handleTrack = (event: RTCTrackEvent): void => {
    mediaLogger.info(`Track received: ${event.track.kind}`);

    for (const handler of this.trackHandlers) {
      try {
        handler(event);
      } catch (error) {
        logger.error("media", "Error in track handler:", error);
      }
    }

    eventBus.emit("media:track-added", {
      nodeId: this.localNodeId,
      track: event.track,
    });
  };

  private handleConnectionStateChange = (): void => {
    if (!this.pc) return;

    const pcState = this.pc.connectionState;
    webrtcLogger.info(`Connection state: ${pcState}`);

    switch (pcState) {
      case "connected":
        this.reconnectAttempt = 0;
        this.reconnectDelay = RECONNECT_CONFIG.initialDelay;
        this.setState(ConnectionState.CONNECTED);
        this.startStats();
        eventBus.emit("peer:connected", {
          localNodeId: this.localNodeId,
          remoteNodeId: this.remoteNodeId,
        });
        break;

      case "disconnected":
      case "failed":
        this.stopStats();
        if (!this.intentionallyClosed) {
          this.scheduleReconnect();
        } else {
          this.setState(ConnectionState.FAILED);
        }
        eventBus.emit("peer:disconnected", {
          localNodeId: this.localNodeId,
          remoteNodeId: this.remoteNodeId,
        });
        break;

      case "connecting":
        this.setState(ConnectionState.CONNECTING);
        break;

      case "closed":
        this.stopStats();
        this.setState(ConnectionState.DISCONNECTED);
        break;
    }
  };

  private handleIceConnectionStateChange = (): void => {
    if (!this.pc) return;

    const iceState = this.pc.iceConnectionState;
    webrtcLogger.debug(`ICE state: ${iceState}`);

    if (iceState === "failed" && !this.intentionallyClosed) {
      this.restartIce();
    }
  };

  private setState(state: ConnectionState): void {
    if (this.state === state) return;
    this.state = state;

    for (const handler of this.connectionStateHandlers) {
      try {
        handler(state);
      } catch (error) {
        webrtcLogger.error("Error in connection state handler:", error);
      }
    }
  }

  private async processPendingCandidates(): Promise<void> {
    if (this.pendingCandidates.length === 0) return;

    // Filter to only candidates from the current session
    const currentSessionCandidates = this.pendingCandidates.filter(
      (c) => c.sessionId === this.sessionId,
    );
    const staleCandidates = this.pendingCandidates.length - currentSessionCandidates.length;

    if (staleCandidates > 0) {
      webrtcLogger.debug(
        `Discarding ${staleCandidates} stale ICE candidates from old sessions`,
      );
    }

    webrtcLogger.debug(
      `Processing ${currentSessionCandidates.length} buffered ICE candidates for session ${this.sessionId}`,
    );

    for (const { candidate } of currentSessionCandidates) {
      try {
        await this.pc!.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        webrtcLogger.warn("Failed to add buffered ICE candidate:", error);
      }
    }
    this.pendingCandidates = [];
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed || this.reconnectTimeout) return;

    this.reconnectAttempt++;
    const baseDelay = Math.min(this.reconnectDelay, RECONNECT_CONFIG.maxDelay);
    // Apply jitter to prevent synchronized reconnection storms
    const delay = applyJitter(baseDelay, RECONNECT_CONFIG.jitter);

    webrtcLogger.info(
      `Reconnecting peer in ${delay}ms (attempt ${this.reconnectAttempt})`,
    );
    this.setState(ConnectionState.RECONNECTING);

    eventBus.emit("peer:reconnecting", {
      localNodeId: this.localNodeId,
      remoteNodeId: this.remoteNodeId,
      attempt: this.reconnectAttempt,
    });

    this.reconnectTimeout = setTimeout(async () => {
      this.reconnectTimeout = null;
      this.reconnectDelay = Math.min(
        this.reconnectDelay * RECONNECT_CONFIG.multiplier,
        RECONNECT_CONFIG.maxDelay,
      );

      try {
        await this.restartIce();
      } catch (error) {
        webrtcLogger.error("Reconnect failed:", error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  private async collectStats(): Promise<void> {
    if (!this.pc || this.pc.connectionState !== "connected") return;

    try {
      const stats = await this.pc.getStats();
      const { metrics, newPreviousStats } = parseStats(
        stats,
        this.remoteNodeId,
        this.previousStats,
        this.localStream,
      );
      this.previousStats = newPreviousStats;

      // Debug: log metrics periodically (only in dev mode, every 10th)
      if (import.meta.env.DEV && Math.random() < 0.1) {
        statsLogger.debug("Collected metrics:", {
          fps: metrics.video.fps,
          width: metrics.video.width,
          height: metrics.video.height,
          bitrate: metrics.video.bitrate,
          codec: metrics.video.codec,
          rtt: metrics.connection.rtt,
        });
      }

      for (const handler of this.metricsHandlers) {
        try {
          handler(metrics);
        } catch (error) {
          statsLogger.error("Error in metrics handler:", error);
        }
      }

      eventBus.emit("metrics:update", {
        nodeId: this.localNodeId,
        peerId: this.remoteNodeId,
        metrics,
      });
    } catch (error) {
      statsLogger.error("Failed to collect stats:", error);
    }
  }

  private cleanup(): void {
    this.stopStats();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.pc) {
      this.pc.onicecandidate = null;
      this.pc.ontrack = null;
      this.pc.onconnectionstatechange = null;
      this.pc.oniceconnectionstatechange = null;
      this.pc.close();
      this.pc = null;
    }

    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];
    this.offerPending = false;
  }

  /**
   * Destroy the service and clean up all resources
   * Call this when the component using this service unmounts
   */
  destroy(): void {
    this.intentionallyClosed = true;
    this.cleanup();
    // Clear all handlers to prevent memory leaks
    this.connectionStateHandlers.clear();
    this.trackHandlers.clear();
    this.metricsHandlers.clear();
  }
}
