// useSignaling - Hook bridging SignalingService to React
// Pattern: Composable hooks - bridges service layer to React

import { useCallback, useEffect, useRef, useState } from "react";
import { type NodeId, SignalingState } from "@/constants";
import { eventBus } from "@/lib/events";
import { SignalingService } from "@/services";
import { useStore } from "@/stores";
import type { ServerToClientMessage, StreamErrorType } from "@/types";

type MessageHandler = (message: ServerToClientMessage) => void;

interface UseSignalingOptions {
  autoConnect?: boolean;
  onMessage?: MessageHandler;
}

/**
 * Hook for managing signaling connection
 */
export function useSignaling(
  nodeId: NodeId,
  options: UseSignalingOptions = {},
) {
  const { autoConnect = true, onMessage } = options;

  const {
    signalingState,
    connectedPeers,
    setNodeId,
    setSignalingState,
    setConnectedPeers,
    addConnectedPeer,
    removeConnectedPeer,
  } = useStore();

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
