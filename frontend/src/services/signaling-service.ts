// SignalingService - WebSocket wrapper with automatic reconnection
// Pattern: Service layer (non-React business logic)

import { CONFIG } from "@/config";
import { type NodeId, SignalingState } from "@/constants";
import { eventBus } from "@/lib/events";
import { signalingLogger } from "@/lib/logger";
import { applyJitter } from "@/lib/utils";
import type {
  ClientToServerMessage,
  ServerToClientMessage,
  SignalingMessage,
  StreamErrorType,
} from "@/types";

type MessageHandler = (message: ServerToClientMessage) => void;
type StateChangeHandler = (state: SignalingState) => void;
type Unsubscribe = () => void;

/**
 * Configuration options for SignalingService
 */
export interface SignalingServiceOptions {
  /** WebSocket server URL. Defaults to CONFIG.SIGNALING_URL */
  url?: string;
  /** Reconnection behavior configuration */
  reconnect?: {
    /** Initial delay before first reconnection attempt (ms). Default: 1000 */
    initialDelay?: number;
    /** Maximum delay between reconnection attempts (ms). Default: 30000 */
    maxDelay?: number;
    /** Multiplier for exponential backoff. Default: 1.5 */
    multiplier?: number;
  };
  /** Heartbeat/keep-alive configuration */
  heartbeat?: {
    /** Interval between heartbeat pings (ms). Default: 10000 */
    interval?: number;
    /** Timeout waiting for pong response (ms). Default: 5000 */
    timeout?: number;
  };
}

/**
 * WebSocket signaling service for WebRTC peer connection negotiation.
 *
 * Handles the signaling channel between peers for exchanging SDP offers/answers
 * and ICE candidates. Includes automatic reconnection with exponential backoff
 * and heartbeat monitoring for connection health.
 *
 * @example
 * ```typescript
 * const signaling = new SignalingService('nantes');
 *
 * // Subscribe to state changes
 * signaling.onStateChange((state) => {
 *   console.log('Connection state:', state);
 * });
 *
 * // Subscribe to incoming messages
 * signaling.onMessage((message) => {
 *   if (message.type === 'offer') {
 *     // Handle WebRTC offer
 *   }
 * });
 *
 * // Connect and send messages
 * await signaling.connect();
 * signaling.sendOffer(targetNodeId, offer);
 *
 * // Clean up when done
 * signaling.destroy();
 * ```
 */
export class SignalingService {
  private ws: WebSocket | null = null;
  private nodeId: NodeId;
  private url: string;
  private state: SignalingState = SignalingState.DISCONNECTED;

  // Reconnection state
  private reconnectAttempt = 0;
  private reconnectDelay: number;
  private maxDelay: number;
  private multiplier: number;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private intentionallyClosed = false;
  private blockedDuplicate = false; // Set when server rejects due to duplicate sender
  private _blockedMessage: string | null = null; // Error message when blocked

  // Heartbeat state
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatIntervalMs: number;
  private heartbeatTimeoutMs: number;

  // Event handlers
  private messageHandlers = new Set<MessageHandler>();
  private stateChangeHandlers = new Set<StateChangeHandler>();

  constructor(nodeId: NodeId, options: SignalingServiceOptions = {}) {
    // Validate nodeId
    if (!nodeId || typeof nodeId !== "string" || nodeId.trim().length === 0) {
      throw new Error("Invalid nodeId provided to SignalingService");
    }

    this.nodeId = nodeId;
    this.url = options.url ?? CONFIG.SIGNALING_URL;

    // Reconnection config
    const reconnect = options.reconnect ?? {};
    this.reconnectDelay =
      reconnect.initialDelay ?? CONFIG.RECONNECT.INITIAL_DELAY;
    this.maxDelay = reconnect.maxDelay ?? CONFIG.RECONNECT.MAX_DELAY;
    this.multiplier = reconnect.multiplier ?? CONFIG.RECONNECT.MULTIPLIER;

    // Heartbeat config
    const heartbeat = options.heartbeat ?? {};
    this.heartbeatIntervalMs = heartbeat.interval ?? CONFIG.HEARTBEAT.INTERVAL;
    this.heartbeatTimeoutMs = heartbeat.timeout ?? CONFIG.HEARTBEAT.TIMEOUT;
  }

  /**
   * Current connection state
   */
  get connectionState(): SignalingState {
    return this.state;
  }

  /**
   * Whether the connection is currently open
   */
  get isConnected(): boolean {
    return this.state === SignalingState.CONNECTED;
  }

  /**
   * Whether the connection was blocked due to duplicate node
   */
  get isBlockedDuplicate(): boolean {
    return this.blockedDuplicate;
  }

  /**
   * Error message when connection is blocked (e.g., duplicate node)
   */
  get blockedMessage(): string | null {
    return this._blockedMessage;
  }

  /**
   * Connect to the signaling server
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        resolve();
        return;
      }

      // Clean up any existing WebSocket before creating a new one
      // This prevents duplicate event listeners if connect() is called multiple times
      if (this.ws) {
        this.ws.removeEventListener("message", this.handleMessage);
        this.ws.removeEventListener("close", this.handleClose);
        if (
          this.ws.readyState === WebSocket.CONNECTING ||
          this.ws.readyState === WebSocket.OPEN
        ) {
          this.ws.close();
        }
        this.ws = null;
      }

      this.intentionallyClosed = false;
      this.setState(SignalingState.CONNECTING);

      try {
        this.ws = new WebSocket(this.url);

        const onOpen = () => {
          cleanup();
          this.handleOpen();
          resolve();
        };

        const onError = (_event: Event) => {
          cleanup();
          const error = new Error("WebSocket connection failed");
          this.handleError(error);
          reject(error);
        };

        const cleanup = () => {
          this.ws?.removeEventListener("open", onOpen);
          this.ws?.removeEventListener("error", onError);
        };

        this.ws.addEventListener("open", onOpen);
        this.ws.addEventListener("error", onError);
        this.ws.addEventListener("message", this.handleMessage);
        this.ws.addEventListener("close", this.handleClose);
      } catch (error) {
        this.handleError(error as Error);
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the signaling server
   */
  disconnect(): void {
    this.intentionallyClosed = true;
    this.cleanup();
    this.setState(SignalingState.DISCONNECTED);
  }

  /**
   * Send a message to the server
   */
  send(message: ClientToServerMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      signalingLogger.warn("Cannot send message: WebSocket not connected", {
        type: message.type,
        wsExists: !!this.ws,
        wsState: this.ws?.readyState,
      });
      return;
    }

    // Add 'from' field if not present
    const messageWithFrom = {
      ...message,
      from: this.nodeId,
    };

    // Only log non-candidate messages at debug level (candidates are too frequent)
    if (message.type !== "candidate") {
      signalingLogger.debug(`Sending message: ${message.type}`, {
        target: "target" in message ? message.target : undefined,
      });
    }
    this.ws.send(JSON.stringify(messageWithFrom));
  }

  /**
   * Subscribe to incoming messages
   */
  onMessage(handler: MessageHandler): Unsubscribe {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  /**
   * Subscribe to state changes
   */
  onStateChange(handler: StateChangeHandler): Unsubscribe {
    this.stateChangeHandlers.add(handler);
    // Immediately call with current state
    handler(this.state);
    return () => this.stateChangeHandlers.delete(handler);
  }

  /**
   * Send an offer to a specific peer
   */
  sendOffer(to: NodeId, offer: RTCSessionDescriptionInit): void {
    this.send({ type: "offer", target: to, offer });
  }

  /**
   * Send an answer to a specific peer
   */
  sendAnswer(to: NodeId, answer: RTCSessionDescriptionInit): void {
    this.send({ type: "answer", target: to, answer });
  }

  /**
   * Send an ICE candidate to a specific peer
   */
  sendCandidate(to: NodeId, candidate: RTCIceCandidateInit): void {
    this.send({ type: "candidate", target: to, candidate });
  }

  /**
   * Request an offer from a sender
   */
  requestOffer(from: NodeId): void {
    this.send({ type: "request_offer", target: from });
  }

  /**
   * Notify that streaming is starting (button clicked, loading started)
   * Sent immediately when start is initiated, before WebRTC connects
   */
  notifyStreamStarting(): void {
    this.send({ type: "stream_starting" });
  }

  /**
   * Notify that streaming is stopping (button clicked, loading started)
   * Sent immediately when stop is initiated, before WebRTC disconnects
   */
  notifyStreamStopping(): void {
    this.send({ type: "stream_stopping" });
  }

  /**
   * Notify that streaming has started (WebRTC connected)
   */
  notifyStreamStarted(): void {
    this.send({ type: "stream_started" });
  }

  /**
   * Notify that streaming has stopped (WebRTC disconnected)
   */
  notifyStreamStopped(
    reason: "manual" | "page_closed" | "network_lost" = "manual",
  ): void {
    this.send({ type: "stream_stopped", reason });
  }

  /**
   * Notify that stream has been restored after network loss
   */
  notifyStreamRestored(): void {
    this.send({ type: "stream_restored" });
  }

  /**
   * Notify that the page has been opened
   */
  notifyPageOpened(): void {
    this.send({ type: "page_opened" });
  }

  /**
   * Send remote stream control command to a sender
   */
  sendStreamControl(target: NodeId, action: "start" | "stop"): void {
    this.send({ type: "stream_control", target, action });
  }

  /**
   * Send stream heartbeat (while streaming, every 5 seconds)
   * Allows receivers to detect sender crash/disconnect faster than WebRTC timeout
   */
  sendStreamHeartbeat(): void {
    this.send({ type: "stream_heartbeat" });
  }

  /**
   * Notify that a stream error occurred
   * Sent when WebRTC or media acquisition fails during start
   */
  notifyStreamError(error: StreamErrorType, message: string): void {
    this.send({ type: "stream_error", error, message });
  }

  // Private methods

  private handleOpen = (): void => {
    // Guard against stale callback after cleanup (React StrictMode)
    if (!this.ws || this.intentionallyClosed) {
      signalingLogger.debug(
        "handleOpen called but ws is null or intentionally closed, ignoring",
      );
      return;
    }

    signalingLogger.info("Connected");
    this.reconnectAttempt = 0;
    this.reconnectDelay = CONFIG.RECONNECT.INITIAL_DELAY;

    // Send login message
    this.send({ type: "login", id: this.nodeId });

    // Start heartbeat
    this.startHeartbeat();

    this.setState(SignalingState.CONNECTED);
    eventBus.emit("signaling:connected", { nodeId: this.nodeId });
  };

  private handleMessage = (event: MessageEvent): void => {
    try {
      const message = JSON.parse(event.data) as SignalingMessage;

      // Handle pong for heartbeat
      if (message.type === "pong") {
        this.clearHeartbeatTimeout();
        return;
      }

      // Handle login_error - duplicate sender blocked
      if (message.type === "login_error") {
        signalingLogger.error("Login rejected:", message.message);
        if (message.error === "already_connected") {
          this.blockedDuplicate = true;
          this._blockedMessage = message.message;
          eventBus.emit("signaling:blocked", {
            nodeId: this.nodeId,
            reason: "already_connected",
            message: message.message,
          });
        }
        // Don't notify other handlers for login errors
        return;
      }

      // Notify all handlers
      for (const handler of this.messageHandlers) {
        try {
          handler(message as ServerToClientMessage);
        } catch (error) {
          signalingLogger.error("Error in message handler:", error);
        }
      }
    } catch (error) {
      signalingLogger.error("Failed to parse signaling message:", error);
    }
  };

  private handleClose = (event: CloseEvent): void => {
    signalingLogger.info(
      `Disconnected (${event.code}: ${event.reason || "no reason"})`,
    );
    this.cleanup();

    if (this.intentionallyClosed || this.blockedDuplicate) {
      this.setState(SignalingState.DISCONNECTED);
      return;
    }

    // Schedule reconnection
    this.scheduleReconnect();
  };

  private handleError = (error: Error): void => {
    signalingLogger.error("Error:", error);
    eventBus.emit("signaling:error", { nodeId: this.nodeId, error });
  };

  private setState(state: SignalingState): void {
    if (this.state === state) return;
    this.state = state;

    for (const handler of this.stateChangeHandlers) {
      try {
        handler(state);
      } catch (error) {
        signalingLogger.error("Error in state change handler:", error);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.intentionallyClosed) return;

    this.reconnectAttempt++;
    const baseDelay = Math.min(this.reconnectDelay, this.maxDelay);
    // Apply jitter to prevent synchronized reconnection storms
    const delay = applyJitter(baseDelay, CONFIG.RECONNECT.JITTER);

    signalingLogger.info(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempt})`,
    );
    this.setState(SignalingState.RECONNECTING);

    eventBus.emit("signaling:reconnecting", {
      nodeId: this.nodeId,
      attempt: this.reconnectAttempt,
      delay,
    });

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectDelay = Math.min(
        this.reconnectDelay * this.multiplier,
        this.maxDelay,
      );
      this.connect().catch(() => {
        // Will retry via handleClose
      });
    }, delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();

    this.heartbeatInterval = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: "ping" }));
        this.startHeartbeatTimeout();
      }
    }, this.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.clearHeartbeatTimeout();
  }

  private startHeartbeatTimeout(): void {
    this.clearHeartbeatTimeout();
    this.heartbeatTimeout = setTimeout(() => {
      signalingLogger.warn("Heartbeat timeout - closing connection");
      this.ws?.close();
    }, this.heartbeatTimeoutMs);
  }

  private clearHeartbeatTimeout(): void {
    if (this.heartbeatTimeout) {
      clearTimeout(this.heartbeatTimeout);
      this.heartbeatTimeout = null;
    }
  }

  private cleanup(): void {
    this.stopHeartbeat();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.removeEventListener("message", this.handleMessage);
      this.ws.removeEventListener("close", this.handleClose);
      if (this.ws.readyState === WebSocket.OPEN) {
        this.ws.close();
      }
      this.ws = null;
    }

    eventBus.emit("signaling:disconnected", { nodeId: this.nodeId });
  }

  /**
   * Destroy the service and clean up all resources
   * Call this when the component using this service unmounts
   */
  destroy(): void {
    this.intentionallyClosed = true;
    this.cleanup();
    // Clear all handlers to prevent memory leaks
    this.messageHandlers.clear();
    this.stateChangeHandlers.clear();
  }
}
