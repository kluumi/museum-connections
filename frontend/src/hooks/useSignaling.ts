/**
 * useSignaling - React hook for WebSocket signaling connection.
 *
 * Bridges the SignalingService to React with automatic lifecycle management.
 * Handles connection, disconnection, message routing, and state synchronization.
 *
 * @module hooks/useSignaling
 * @example
 * ```typescript
 * function SenderDashboard() {
 *   const signaling = useSignaling('nantes', {
 *     autoConnect: true,
 *     onMessage: (msg) => {
 *       if (msg.type === 'request_offer') {
 *         // Handle offer request from receiver
 *       }
 *     },
 *   });
 *
 *   // Check connection state
 *   if (!signaling.isConnected) {
 *     return <div>Connecting...</div>;
 *   }
 *
 *   // Send stream notifications
 *   const startStream = () => {
 *     signaling.notifyStreamStarted();
 *   };
 *
 *   // Send WebRTC signaling messages
 *   signaling.sendOffer('obs_paris', offer);
 * }
 * ```
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { type NodeId, SignalingState } from "@/constants";
import { eventBus } from "@/lib/events";
import { SignalingService } from "@/services";
import { useStore } from "@/stores";
import type { ServerToClientMessage, StreamErrorType } from "@/types";

type MessageHandler = (message: ServerToClientMessage) => void;

export interface UseSignalingOptions {
  autoConnect?: boolean;
  onMessage?: MessageHandler;
}

/** Return type for useSignaling hook */
export interface UseSignalingReturn {
  // State
  state: SignalingState;
  isConnected: boolean;
  connectedPeers: NodeId[];
  blockedMessage: string | null;

  // Service access (for advanced use)
  service: SignalingService | null;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  send: (message: Parameters<SignalingService["send"]>[0]) => void;
  sendOffer: (to: NodeId, offer: RTCSessionDescriptionInit) => void;
  sendAnswer: (to: NodeId, answer: RTCSessionDescriptionInit) => void;
  sendCandidate: (to: NodeId, candidate: RTCIceCandidateInit) => void;
  requestOffer: (from: NodeId) => void;
  notifyStreamStarting: () => void;
  notifyStreamStopping: () => void;
  notifyStreamStarted: () => void;
  notifyStreamStopped: (
    reason?: "manual" | "page_closed" | "network_lost",
  ) => void;
  notifyStreamRestored: () => void;
  notifyPageOpened: () => void;
  sendStreamControl: (target: NodeId, action: "start" | "stop") => void;
  sendStreamHeartbeat: () => void;
  notifyStreamError: (error: StreamErrorType, message: string) => void;
}

/**
 * React hook for managing WebSocket signaling connection.
 *
 * Provides reactive state and methods for signaling server communication.
 * Automatically connects on mount (configurable) and cleans up on unmount.
 *
 * @param nodeId - Unique identifier for this node (e.g., 'nantes', 'paris')
 * @param options - Configuration options
 * @param options.autoConnect - Whether to connect automatically on mount (default: true)
 * @param options.onMessage - Callback for incoming signaling messages
 * @returns Signaling state and methods
 */
export function useSignaling(
  nodeId: NodeId,
  options: UseSignalingOptions = {},
): UseSignalingReturn {
  const { autoConnect = true, onMessage } = options;

  // Use individual selectors for stable references
  const signalingState = useStore((s) => s.signalingState);
  const connectedPeers = useStore((s) => s.connectedPeers);
  const setNodeId = useStore((s) => s.setNodeId);
  const setSignalingState = useStore((s) => s.setSignalingState);
  const setConnectedPeers = useStore((s) => s.setConnectedPeers);
  const addConnectedPeer = useStore((s) => s.addConnectedPeer);
  const removeConnectedPeer = useStore((s) => s.removeConnectedPeer);

  const serviceRef = useRef<SignalingService | null>(null);
  const messageHandlerRef = useRef<MessageHandler | undefined>(onMessage);

  // Track blocked state for duplicate detection
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);

  // Keep message handler ref updated
  useEffect(() => {
    messageHandlerRef.current = onMessage;
  }, [onMessage]);

  // Handle signaling messages - defined before the effect that uses it
  const handleMessage = useCallback(
    (message: ServerToClientMessage) => {
      switch (message.type) {
        case "login_success":
          setConnectedPeers(message.clients);
          break;

        case "peer_connected":
          addConnectedPeer(message.peer);
          break;

        case "peer_disconnected":
          removeConnectedPeer(message.peer);
          break;
      }
    },
    [setConnectedPeers, addConnectedPeer, removeConnectedPeer],
  );

  // Initialize service
  useEffect(() => {
    serviceRef.current = new SignalingService(nodeId);
    setNodeId(nodeId);

    // Subscribe to state changes
    const unsubState = serviceRef.current.onStateChange((state) => {
      setSignalingState(state);
    });

    // Subscribe to messages
    const unsubMessage = serviceRef.current.onMessage((message) => {
      handleMessage(message);
      messageHandlerRef.current?.(message);
    });

    // Subscribe to blocked event (for duplicate detection)
    // This subscription happens BEFORE connect() is called, so we won't miss the event
    const unsubBlocked = eventBus.on("signaling:blocked", (data) => {
      if (data.nodeId === nodeId && data.reason === "already_connected") {
        setBlockedMessage(data.message);
      }
    });

    // Auto-connect
    if (autoConnect) {
      serviceRef.current.connect().catch((error) => {
        console.error("Failed to connect:", error);
      });
    }

    return () => {
      unsubState();
      unsubMessage();
      unsubBlocked();
      // Use destroy() instead of disconnect() to clear all handlers
      serviceRef.current?.destroy();
      serviceRef.current = null;
    };
  }, [nodeId, autoConnect, setNodeId, setSignalingState, handleMessage]);

  // Connect manually
  const connect = useCallback(async () => {
    if (!serviceRef.current) return;
    await serviceRef.current.connect();
  }, []);

  // Disconnect manually
  const disconnect = useCallback(() => {
    serviceRef.current?.disconnect();
  }, []);

  // Send arbitrary message
  const send = useCallback(
    (message: Parameters<SignalingService["send"]>[0]) => {
      serviceRef.current?.send(message);
    },
    [],
  );

  // Send offer
  const sendOffer = useCallback(
    (to: NodeId, offer: RTCSessionDescriptionInit) => {
      serviceRef.current?.sendOffer(to, offer);
    },
    [],
  );

  // Send answer
  const sendAnswer = useCallback(
    (to: NodeId, answer: RTCSessionDescriptionInit) => {
      serviceRef.current?.sendAnswer(to, answer);
    },
    [],
  );

  // Send ICE candidate
  const sendCandidate = useCallback(
    (to: NodeId, candidate: RTCIceCandidateInit) => {
      serviceRef.current?.sendCandidate(to, candidate);
    },
    [],
  );

  // Request offer from sender
  const requestOffer = useCallback((from: NodeId) => {
    serviceRef.current?.requestOffer(from);
  }, []);

  // Stream notifications
  const notifyStreamStarting = useCallback(() => {
    serviceRef.current?.notifyStreamStarting();
  }, []);

  const notifyStreamStopping = useCallback(() => {
    serviceRef.current?.notifyStreamStopping();
  }, []);

  const notifyStreamStarted = useCallback(() => {
    serviceRef.current?.notifyStreamStarted();
  }, []);

  const notifyStreamStopped = useCallback(
    (reason: "manual" | "page_closed" | "network_lost" = "manual") => {
      serviceRef.current?.notifyStreamStopped(reason);
    },
    [],
  );

  const notifyStreamRestored = useCallback(() => {
    serviceRef.current?.notifyStreamRestored();
  }, []);

  const notifyPageOpened = useCallback(() => {
    serviceRef.current?.notifyPageOpened();
  }, []);

  // Send remote stream control command
  const sendStreamControl = useCallback(
    (target: NodeId, action: "start" | "stop") => {
      serviceRef.current?.sendStreamControl(target, action);
    },
    [],
  );

  // Send stream heartbeat (while streaming)
  const sendStreamHeartbeat = useCallback(() => {
    serviceRef.current?.sendStreamHeartbeat();
  }, []);

  // Notify stream error (on failure during start)
  const notifyStreamError = useCallback(
    (error: StreamErrorType, message: string) => {
      serviceRef.current?.notifyStreamError(error, message);
    },
    [],
  );

  return {
    // State
    state: signalingState,
    isConnected: signalingState === SignalingState.CONNECTED,
    connectedPeers,
    blockedMessage, // Non-null if connection was blocked due to duplicate

    // Service access (for advanced use)
    service: serviceRef.current,

    // Actions
    connect,
    disconnect,
    send,
    sendOffer,
    sendAnswer,
    sendCandidate,
    requestOffer,
    notifyStreamStarting,
    notifyStreamStopping,
    notifyStreamStarted,
    notifyStreamStopped,
    notifyStreamRestored,
    notifyPageOpened,
    sendStreamControl,
    sendStreamHeartbeat,
    notifyStreamError,
  };
}
