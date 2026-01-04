// WebRTCService - RTCPeerConnection wrapper with resilience
// Pattern: Service layer (non-React business logic)

import { CONFIG } from "@/config";
import { ConnectionState, type NodeId } from "@/constants";
import { eventBus } from "@/lib/events";
import { applyJitter } from "@/lib/utils";
import type { PeerMetrics } from "@/types";
import type { SignalingService } from "./signaling";

// Timeout for WebRTC operations (createOffer, handleOffer, etc.)
const WEBRTC_OPERATION_TIMEOUT_MS = 10_000; // 10 seconds

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

export interface WebRTCServiceOptions {
  iceServers?: RTCIceServer[];
  localStream?: MediaStream;
  statsInterval?: number;
  onTrack?: TrackHandler;
  onConnectionStateChange?: ConnectionStateHandler;
  onMetrics?: MetricsHandler;
}

/**
 * WebRTC peer connection service with ICE candidate buffering and stats collection
 */
export class WebRTCService {
  private pc: RTCPeerConnection | null = null;
  private signaling: SignalingService;
  private localNodeId: NodeId;
  private remoteNodeId: NodeId;
  private effectiveRemoteNodeId: NodeId; // Actual target for messages (may differ for dynamic operator IDs)
  private localStream: MediaStream | null;
  private iceServers: RTCIceServer[];

  // ICE candidate buffering
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private remoteDescriptionSet = false;

  // Session tracking - prevents stale ICE candidates from old sessions
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
  private reconnectDelay: number = CONFIG.RECONNECT.INITIAL_DELAY;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;

  // Stats collection
  private statsInterval: ReturnType<typeof setInterval> | null = null;
  private statsIntervalMs: number;
  private previousStats: {
    videoBytesReceived: number;
    videoBytesSent: number;
    audioBytesReceived: number;
    audioBytesSent: number;
    timestamp: number;
  } | null = null;

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
    this.iceServers =
      options.iceServers ?? CONFIG.ICE_SERVERS.map((s) => ({ ...s }));
    this.statsIntervalMs = options.statsInterval ?? CONFIG.STATS.INTERVAL;

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
    console.log(`📡 Effective remote node ID set to: ${nodeId}`);
  }

  /**
   * Initialize the peer connection
   */
  initialize(): void {
    if (this.pc) {
      this.cleanup();
    }

    // Reset intentionallyClosed since we're creating a fresh connection
    // This is important when reinitializing after close() was called (e.g., sender refresh)
    this.intentionallyClosed = false;

    // Increment session ID to invalidate any pending ICE candidates from previous session
    this.sessionId++;
    console.log(`🔄 New WebRTC session ${this.sessionId} for ${this.remoteNodeId}`);

    this.pc = new RTCPeerConnection({ iceServers: this.iceServers });
    this.remoteDescriptionSet = false;
    this.pendingCandidates = [];

    // Add local tracks if available
    if (this.localStream) {
      for (const track of this.localStream.getTracks()) {
        const sender = this.pc.addTrack(track, this.localStream);

        // Apply codec preference for video tracks
        if (track.kind === "video" && this.preferredVideoCodec) {
          this.applyCodecPreference(sender);
        }
      }
    }

    // Set up event handlers
    this.pc.onicecandidate = this.handleIceCandidate;
    this.pc.ontrack = this.handleTrack;
    this.pc.onconnectionstatechange = this.handleConnectionStateChange;
    this.pc.oniceconnectionstatechange = this.handleIceConnectionStateChange;

    this.setState(ConnectionState.CONNECTING);
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
        console.warn("⚠️ Cannot get video codec capabilities");
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
      console.log(`📊 Codec preference set to ${this.preferredVideoCodec}`);
    } catch (err) {
      console.warn("⚠️ Failed to set codec preference:", err);
    }
  }

  /**
   * Create and send an offer
   */
  async createOffer(): Promise<RTCSessionDescriptionInit | null> {
    // Prevent duplicate offers while one is pending
    if (this.offerPending) {
      console.log(
        `⏳ Offer already pending for ${this.remoteNodeId}, skipping`,
      );
      return null;
    }

    if (!this.pc) {
      this.initialize();
    }

    this.offerPending = true;

    try {
      const offer = await withTimeout(
        this.pc!.createOffer(),
        WEBRTC_OPERATION_TIMEOUT_MS,
        "createOffer",
      );
      await withTimeout(
        this.pc!.setLocalDescription(offer),
        WEBRTC_OPERATION_TIMEOUT_MS,
        "setLocalDescription",
      );

      this.signaling.sendOffer(this.effectiveRemoteNodeId, offer);
      console.log(`📡 Offer sent to ${this.effectiveRemoteNodeId}`);

      return offer;
    } catch (error) {
      this.offerPending = false;
      throw error;
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
    console.log(
      `📩 Received offer from ${this.remoteNodeId}, reinitializing connection`,
    );

    // Save any pending candidates from before initialize (they belong to old connection, discard them)
    this.initialize();

    // IMPORTANT: remoteDescriptionSet stays false until setRemoteDescription completes
    // Any candidates arriving during this async operation will be buffered

    try {
      await withTimeout(
        this.pc!.setRemoteDescription(new RTCSessionDescription(offer)),
        WEBRTC_OPERATION_TIMEOUT_MS,
        "setRemoteDescription",
      );
      this.remoteDescriptionSet = true;

      // Now process any candidates that arrived during the async operation above
      await this.processPendingCandidates();

      const answer = await withTimeout(
        this.pc!.createAnswer(),
        WEBRTC_OPERATION_TIMEOUT_MS,
        "createAnswer",
      );
      await withTimeout(
        this.pc!.setLocalDescription(answer),
        WEBRTC_OPERATION_TIMEOUT_MS,
        "setLocalDescription",
      );

      this.signaling.sendAnswer(this.effectiveRemoteNodeId, answer);
      console.log(`📡 Answer sent to ${this.effectiveRemoteNodeId}`);

      return answer;
    } catch (error) {
      console.error(
        `❌ Failed to handle offer from ${this.remoteNodeId}:`,
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
      console.warn("⚠️ Cannot handle answer: no peer connection");
      return;
    }

    // Check if we're in the right state to receive an answer
    // This can happen normally when duplicate answers arrive (e.g., from retried offers)
    if (this.pc.signalingState !== "have-local-offer") {
      console.log(
        `📩 Ignoring answer: already in ${this.pc.signalingState} state`,
      );
      return;
    }

    try {
      await withTimeout(
        this.pc.setRemoteDescription(new RTCSessionDescription(answer)),
        WEBRTC_OPERATION_TIMEOUT_MS,
        "setRemoteDescription (answer)",
      );
      this.remoteDescriptionSet = true;
      this.offerPending = false; // Answer received, offer cycle complete

      // Process buffered ICE candidates
      await this.processPendingCandidates();
      console.log(`📩 Answer processed from ${this.remoteNodeId}`);
    } catch (error) {
      console.error(
        `❌ Failed to handle answer from ${this.remoteNodeId}:`,
        error,
      );
      this.offerPending = false;
    }
  }

  /**
   * Add an ICE candidate (buffered if remote description not set)
   */
  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.pc) {
      // Buffer even if no PC yet - will be processed after setRemoteDescription
      this.pendingCandidates.push(candidate);
      console.log(
        `🧊 Buffering ICE candidate (no PC yet), total: ${this.pendingCandidates.length}`,
      );
      return;
    }

    if (!this.remoteDescriptionSet) {
      // Buffer the candidate until remote description is set
      this.pendingCandidates.push(candidate);
      console.log(
        `🧊 Buffering ICE candidate (no remote desc), total: ${this.pendingCandidates.length}`,
      );
      return;
    }

    try {
      await this.pc.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
      console.warn("⚠️ Failed to add ICE candidate:", error);
    }
  }

  /**
   * Replace a track in the active stream (hot-swap)
   */
  async replaceTrack(newTrack: MediaStreamTrack): Promise<void> {
    if (!this.pc) {
      console.warn("⚠️ Cannot replace track: no peer connection");
      return;
    }

    const senders = this.pc.getSenders();
    console.log(
      `🔍 Looking for ${newTrack.kind} sender among ${senders.length} senders:`,
      senders.map((s) => ({
        kind: s.track?.kind,
        label: s.track?.label,
        readyState: s.track?.readyState,
      })),
    );

    // Find sender by track kind
    const sender = senders.find((s) => s.track?.kind === newTrack.kind);

    if (sender) {
      try {
        await sender.replaceTrack(newTrack);
        console.log(`✅ Replaced ${newTrack.kind} track: ${newTrack.label}`);
      } catch (error) {
        console.error(`❌ Failed to replace ${newTrack.kind} track:`, error);
      }
    } else {
      console.warn(`⚠️ No sender found for ${newTrack.kind} track`);
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
      console.warn("⚠️ Cannot set bitrate: no peer connection");
      return false;
    }

    const sender = this.pc.getSenders().find((s) => s.track?.kind === "video");
    if (!sender) {
      console.warn("⚠️ Cannot set bitrate: no video sender");
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
        console.log("📊 Removed bitrate limit (auto mode)");
      } else {
        // Set max bitrate in bits per second
        params.encodings[0].maxBitrate = maxBitrate * 1000;
        console.log(`📊 Set max bitrate to ${maxBitrate} kbps`);
      }

      await sender.setParameters(params);
      return true;
    } catch (error) {
      console.error("❌ Failed to set bitrate:", error);
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
    console.log(`📊 Preferred codec set to: ${codec}`);

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

    console.log("🔄 Restarting ICE");
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
    console.log(`🎬 Track received: ${event.track.kind}`);

    for (const handler of this.trackHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error("Error in track handler:", error);
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
    console.log(`📡 Connection state: ${pcState}`);

    switch (pcState) {
      case "connected":
        this.reconnectAttempt = 0;
        this.reconnectDelay = CONFIG.RECONNECT.INITIAL_DELAY;
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
    console.log(`🧊 ICE state: ${iceState}`);

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
        console.error("Error in connection state handler:", error);
      }
    }
  }

  private async processPendingCandidates(): Promise<void> {
    if (this.pendingCandidates.length > 0) {
      console.log(
        `🧊 Processing ${this.pendingCandidates.length} buffered ICE candidates`,
      );
    }
    for (const candidate of this.pendingCandidates) {
      try {
        await this.pc!.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (error) {
        console.warn("⚠️ Failed to add buffered ICE candidate:", error);
      }
    }
    this.pendingCandidates = [];
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed || this.reconnectTimeout) return;

    this.reconnectAttempt++;
    const baseDelay = Math.min(this.reconnectDelay, CONFIG.RECONNECT.MAX_DELAY);
    // Apply jitter to prevent synchronized reconnection storms
    const delay = applyJitter(baseDelay, CONFIG.RECONNECT.JITTER);

    console.log(
      `🔄 Reconnecting peer in ${delay}ms (attempt ${this.reconnectAttempt})`,
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
        this.reconnectDelay * CONFIG.RECONNECT.MULTIPLIER,
        CONFIG.RECONNECT.MAX_DELAY,
      );

      try {
        await this.restartIce();
      } catch (error) {
        console.error("❌ Reconnect failed:", error);
        this.scheduleReconnect();
      }
    }, delay);
  }

  private async collectStats(): Promise<void> {
    if (!this.pc || this.pc.connectionState !== "connected") return;

    try {
      const stats = await this.pc.getStats();
      const metrics = this.parseStats(stats);

      // Debug: log metrics periodically (only in dev mode, first collection and every 10th)
      if (
        import.meta.env.DEV &&
        (!this.previousStats || Math.random() < 0.1)
      ) {
        console.log("📊 Collected metrics:", {
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
          console.error("Error in metrics handler:", error);
        }
      }

      eventBus.emit("metrics:update", {
        nodeId: this.localNodeId,
        peerId: this.remoteNodeId,
        metrics,
      });
    } catch (error) {
      console.error("Failed to collect stats:", error);
    }
  }

  private parseStats(stats: RTCStatsReport): PeerMetrics {
    const metrics: PeerMetrics = {
      peerId: this.remoteNodeId,
      timestamp: Date.now(),
      video: {
        bitrate: 0,
        fps: 0,
        width: 0,
        height: 0,
        codec: "",
        packetLoss: 0,
        jitter: 0,
        framesDropped: 0,
        framesReceived: 0,
        framesSent: 0,
      },
      audio: {
        bitrate: 0,
        packetLoss: 0,
        jitter: 0,
        audioLevel: 0,
      },
      connection: {
        rtt: 0,
        localCandidateType: "",
        remoteCandidateType: "",
        protocol: "",
        bytesReceived: 0,
        bytesSent: 0,
        packetsReceived: 0,
        packetsSent: 0,
        packetsLost: 0,
        availableOutgoingBitrate: 0,
        availableIncomingBitrate: 0,
      },
      qualityScore: 0,
    };

    let videoBytesReceived = 0;
    let videoBytesSent = 0;
    let audioBytesReceived = 0;
    let audioBytesSent = 0;

    // Collect values from all sources, then pick the best
    let outboundWidth = 0;
    let outboundHeight = 0;
    let outboundFps = 0;
    let outboundCodec = "";
    let inboundWidth = 0;
    let inboundHeight = 0;
    let inboundFps = 0;
    let inboundCodec = "";
    let mediaSourceWidth = 0;
    let mediaSourceHeight = 0;
    let mediaSourceFps = 0;

    // First pass: collect codec IDs for later lookup
    const codecIdToName = new Map<string, string>();
    let foundOutboundRtp = false;
    let foundInboundRtp = false;
    let foundMediaSource = false;

    stats.forEach((report) => {
      if (report.type === "codec" && report.mimeType?.includes("video")) {
        codecIdToName.set(report.id, report.mimeType.split("/")[1] ?? "");
      }
      if (report.type === "outbound-rtp" && report.kind === "video") {
        foundOutboundRtp = true;
      }
      if (report.type === "inbound-rtp" && report.kind === "video") {
        foundInboundRtp = true;
      }
      if (report.type === "media-source" && report.kind === "video") {
        foundMediaSource = true;
      }
    });

    // Debug: log which report types we found (first collection only)
    if (!this.previousStats) {
      console.log("📊 Stats report types found:", {
        outboundRtp: foundOutboundRtp,
        inboundRtp: foundInboundRtp,
        mediaSource: foundMediaSource,
        codecCount: codecIdToName.size,
      });
    }

    stats.forEach((report) => {
      // Video stats - inbound (for receivers)
      if (report.type === "inbound-rtp" && report.kind === "video") {
        metrics.video.framesReceived = report.framesReceived ?? 0;
        metrics.video.framesDropped = report.framesDropped ?? 0;
        metrics.video.jitter = (report.jitter ?? 0) * 1000;
        metrics.video.packetLoss = this.calculatePacketLoss(
          report.packetsLost ?? 0,
          report.packetsReceived ?? 0,
        );
        videoBytesReceived = report.bytesReceived ?? 0;

        // Collect inbound values
        if (report.frameWidth) {
          inboundWidth = report.frameWidth;
          inboundHeight = report.frameHeight ?? 0;
        }
        if (report.framesPerSecond) {
          inboundFps = report.framesPerSecond;
        }
        // Get codec from codecId reference
        if (report.codecId && codecIdToName.has(report.codecId)) {
          inboundCodec = codecIdToName.get(report.codecId) ?? "";
        }
      }

      // Video stats - outbound (for senders)
      if (report.type === "outbound-rtp" && report.kind === "video") {
        metrics.video.framesSent = report.framesSent ?? 0;
        videoBytesSent = report.bytesSent ?? 0;

        // Collect outbound values
        if (report.frameWidth) {
          outboundWidth = report.frameWidth;
          outboundHeight = report.frameHeight ?? 0;
        }
        if (report.framesPerSecond) {
          outboundFps = report.framesPerSecond;
        }
        // Get codec from codecId reference
        if (report.codecId && codecIdToName.has(report.codecId)) {
          outboundCodec = codecIdToName.get(report.codecId) ?? "";
        }

        // Debug: log raw outbound-rtp values on first collection
        if (!this.previousStats) {
          console.log("📊 outbound-rtp raw values:", {
            frameWidth: report.frameWidth,
            frameHeight: report.frameHeight,
            framesPerSecond: report.framesPerSecond,
            bytesSent: report.bytesSent,
            codecId: report.codecId,
          });
        }
      }

      // Media source stats (local track stats - most reliable for senders)
      if (report.type === "media-source" && report.kind === "video") {
        if (report.width) {
          mediaSourceWidth = report.width;
          mediaSourceHeight = report.height ?? 0;
        }
        if (report.framesPerSecond) {
          mediaSourceFps = report.framesPerSecond;
        }

        // Debug: log raw media-source values on first collection
        if (!this.previousStats) {
          console.log("📊 media-source raw values:", {
            width: report.width,
            height: report.height,
            framesPerSecond: report.framesPerSecond,
          });
        }
      }

      // Audio stats
      if (report.type === "inbound-rtp" && report.kind === "audio") {
        metrics.audio.jitter = (report.jitter ?? 0) * 1000;
        metrics.audio.packetLoss = this.calculatePacketLoss(
          report.packetsLost ?? 0,
          report.packetsReceived ?? 0,
        );
        audioBytesReceived = report.bytesReceived ?? 0;
      }

      if (report.type === "outbound-rtp" && report.kind === "audio") {
        audioBytesSent = report.bytesSent ?? 0;
      }

      // Connection stats
      if (report.type === "candidate-pair" && report.state === "succeeded") {
        metrics.connection.rtt = report.currentRoundTripTime
          ? report.currentRoundTripTime * 1000
          : 0;
        metrics.connection.bytesReceived = report.bytesReceived ?? 0;
        metrics.connection.bytesSent = report.bytesSent ?? 0;

        // Bandwidth estimation (in bits/s from WebRTC, convert to kbps)
        if (report.availableOutgoingBitrate) {
          metrics.connection.availableOutgoingBitrate =
            report.availableOutgoingBitrate / 1000;
        }
        if (report.availableIncomingBitrate) {
          metrics.connection.availableIncomingBitrate =
            report.availableIncomingBitrate / 1000;
        }
      }

      // Candidate info
      if (report.type === "local-candidate") {
        metrics.connection.localCandidateType = report.candidateType ?? "";
        metrics.connection.protocol = report.protocol ?? "";
      }

      if (report.type === "remote-candidate") {
        metrics.connection.remoteCandidateType = report.candidateType ?? "";
      }
    });

    // Priority: outbound-rtp > inbound-rtp > media-source > local track settings
    // This ensures we get the actual encoded/decoded values when available
    metrics.video.width = outboundWidth || inboundWidth || mediaSourceWidth;
    metrics.video.height = outboundHeight || inboundHeight || mediaSourceHeight;
    metrics.video.fps = outboundFps || inboundFps || mediaSourceFps;
    metrics.video.codec = outboundCodec || inboundCodec;

    // Fallback to local stream track settings if still missing (for senders)
    if (this.localStream && (!metrics.video.width || !metrics.video.fps)) {
      const videoTrack = this.localStream.getVideoTracks()[0];
      if (videoTrack) {
        const settings = videoTrack.getSettings();
        if (!metrics.video.width && settings.width) {
          metrics.video.width = settings.width;
          metrics.video.height = settings.height ?? 0;
          if (!this.previousStats) {
            console.log(
              "📊 Using track.getSettings() for resolution:",
              settings.width,
              "x",
              settings.height,
            );
          }
        }
        if (!metrics.video.fps && settings.frameRate) {
          metrics.video.fps = settings.frameRate;
          if (!this.previousStats) {
            console.log(
              "📊 Using track.getSettings() for FPS:",
              settings.frameRate,
            );
          }
        }
      }
    }

    // Debug: log if metrics are still missing after all fallbacks
    if (!this.previousStats) {
      if (!metrics.video.width || !metrics.video.fps) {
        console.warn("⚠️ Metrics still incomplete after fallbacks:", {
          width: metrics.video.width,
          height: metrics.video.height,
          fps: metrics.video.fps,
          sources: {
            outbound: { w: outboundWidth, h: outboundHeight, fps: outboundFps },
            inbound: { w: inboundWidth, h: inboundHeight, fps: inboundFps },
            mediaSource: {
              w: mediaSourceWidth,
              h: mediaSourceHeight,
              fps: mediaSourceFps,
            },
          },
        });
      }
    }

    // Calculate bitrates
    const now = Date.now();
    if (this.previousStats) {
      const timeDiff = (now - this.previousStats.timestamp) / 1000;
      if (timeDiff > 0) {
        // Video bitrate: use outbound for sender, inbound for receiver
        const videoBytesSentDiff =
          videoBytesSent - this.previousStats.videoBytesSent;
        const videoBytesReceivedDiff =
          videoBytesReceived - this.previousStats.videoBytesReceived;
        // Use whichever is active (sender sends, receiver receives)
        const videoByteDiff =
          videoBytesSentDiff > 0 ? videoBytesSentDiff : videoBytesReceivedDiff;
        metrics.video.bitrate = (videoByteDiff * 8) / timeDiff / 1000; // kbps

        // Audio bitrate: same logic
        const audioBytesSentDiff =
          audioBytesSent - this.previousStats.audioBytesSent;
        const audioBytesReceivedDiff =
          audioBytesReceived - this.previousStats.audioBytesReceived;
        const audioByteDiff =
          audioBytesSentDiff > 0 ? audioBytesSentDiff : audioBytesReceivedDiff;
        metrics.audio.bitrate = (audioByteDiff * 8) / timeDiff / 1000; // kbps
      }
    }
    this.previousStats = {
      videoBytesReceived,
      videoBytesSent,
      audioBytesReceived,
      audioBytesSent,
      timestamp: now,
    };

    // Calculate quality score
    metrics.qualityScore = this.calculateQualityScore(metrics);

    return metrics;
  }

  private calculatePacketLoss(lost: number, received: number): number {
    const total = lost + received;
    if (total === 0) return 0;
    return (lost / total) * 100;
  }

  private calculateQualityScore(metrics: PeerMetrics): number {
    let score = 100;

    // Deduct for high RTT
    if (metrics.connection.rtt > 300) score -= 20;
    else if (metrics.connection.rtt > 150) score -= 10;
    else if (metrics.connection.rtt > 50) score -= 5;

    // Deduct for packet loss
    if (metrics.video.packetLoss > 5) score -= 25;
    else if (metrics.video.packetLoss > 2) score -= 15;
    else if (metrics.video.packetLoss > 0.5) score -= 5;

    // Deduct for low FPS
    if (metrics.video.fps > 0) {
      if (metrics.video.fps < 15) score -= 15;
      else if (metrics.video.fps < 24) score -= 8;
    }

    // Deduct for jitter
    if (metrics.video.jitter > 50) score -= 10;
    else if (metrics.video.jitter > 20) score -= 5;

    // Deduct for low bitrate (kbps)
    if (metrics.video.bitrate > 0) {
      if (metrics.video.bitrate < 500) score -= 20;
      else if (metrics.video.bitrate < 1000) score -= 12;
      else if (metrics.video.bitrate < 2000) score -= 5;
    }

    // Deduct for low resolution
    const height = metrics.video.height;
    if (height > 0) {
      if (height < 360) score -= 15;
      else if (height < 480) score -= 10;
      else if (height < 720) score -= 5;
    }

    // Deduct for low available bandwidth (indicates potential future degradation)
    const bandwidth =
      metrics.connection.availableOutgoingBitrate ||
      metrics.connection.availableIncomingBitrate;
    if (bandwidth > 0) {
      if (bandwidth < 1000)
        score -= 15; // < 1 Mbps
      else if (bandwidth < 2000)
        score -= 8; // < 2 Mbps
      else if (bandwidth < 3000) score -= 3; // < 3 Mbps
    }

    // Deduct for dropped frames (indicates local performance issues)
    if (metrics.video.framesDropped > 0) {
      if (metrics.video.framesDropped > 50) score -= 10;
      else if (metrics.video.framesDropped > 10) score -= 5;
    }

    return Math.max(0, Math.min(100, score));
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
