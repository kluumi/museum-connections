// useReceiverManager - React hook that bridges ReceiverManager to React components
// Pattern: Service-to-React bridge hook

import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionState, type NodeId, SignalingState } from "@/constants";
import { ReceiverManager } from "@/services";
import { useStore } from "@/stores";

export interface UseReceiverManagerOptions {
  nodeId: NodeId;
  sourceId: NodeId;
  autoConnect?: boolean;
  addLog?: (
    message: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void;
}

export interface UseReceiverManagerReturn {
  // Manager instance (for advanced use)
  manager: ReceiverManager | null;

  // Signaling state
  isSignalingConnected: boolean;
  isSignalingBlocked: boolean;
  blockedMessage: string | null;
  connectedPeers: NodeId[];

  // WebRTC state
  connectionState: ConnectionState;
  remoteStream: MediaStream | null;

  // Source state
  isSourceConnected: boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  requestOffer: () => void;
}

/**
 * Hook that manages receiver connections (for OBS receivers and operator).
 *
 * Usage:
 * ```tsx
 * const receiver = useReceiverManager({
 *   nodeId: NodeId.OBS_PARIS,
 *   sourceId: NodeId.NANTES,
 *   addLog: (msg, level) => { ... },
 * });
 *
 * // Auto-connects on mount by default
 *
 * // Access remote stream for video element
 * <video ref={(el) => { if (el) el.srcObject = receiver.remoteStream; }} />
 *
 * // Check connection status
 * if (receiver.isSignalingBlocked) {
 *   // Show blocked overlay
 * }
 * ```
 */
export function useReceiverManager(
  options: UseReceiverManagerOptions,
): UseReceiverManagerReturn {
  const { nodeId, sourceId, autoConnect = true, addLog } = options;

  // Store integration - use individual selectors for stable references
  const setSignalingState = useStore((s) => s.setSignalingState);
  const setConnectedPeers = useStore((s) => s.setConnectedPeers);

  // State
  const [isSignalingConnected, setIsSignalingConnected] = useState(false);
  const [isSignalingBlocked, setIsSignalingBlocked] = useState(false);
  const [blockedMessage, setBlockedMessage] = useState<string | null>(null);
  const [connectedPeers, setLocalConnectedPeers] = useState<NodeId[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    ConnectionState.DISCONNECTED,
  );
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  // Refs
  const managerRef = useRef<ReceiverManager | null>(null);
  const addLogRef = useRef(addLog);

  // Keep refs updated
  useEffect(() => {
    addLogRef.current = addLog;
  }, [addLog]);

  // Initialize manager
  useEffect(() => {
    const manager = new ReceiverManager({
      nodeId,
      sourceId,
      onLog: (message, level) => {
        addLogRef.current?.(message, level);
      },
      onSignalingStateChange: (state) => {
        setSignalingState(state);
        setIsSignalingConnected(state === SignalingState.CONNECTED);
      },
      onConnectionStateChange: (state) => {
        setConnectionState(state);
      },
      onSignalingConnectedPeersChange: (peers) => {
        setLocalConnectedPeers(peers);
        setConnectedPeers(peers);
      },
      onRemoteStream: (stream) => {
        setRemoteStream(stream);
      },
    });

    managerRef.current = manager;

    // Auto-connect if enabled
    if (autoConnect) {
      manager.connect();
    }

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [nodeId, sourceId, autoConnect, setSignalingState, setConnectedPeers]);

  // Update blocked state
  useEffect(() => {
    const checkBlocked = () => {
      const manager = managerRef.current;
      if (manager) {
        setIsSignalingBlocked(manager.isSignalingBlocked);
        setBlockedMessage(manager.blockedMessage);
      }
    };
    // Check periodically (signaling service updates this asynchronously)
    const interval = setInterval(checkBlocked, 500);
    checkBlocked();
    return () => clearInterval(interval);
  }, []);

  // Actions
  const connect = useCallback(() => {
    managerRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    managerRef.current?.disconnect();
  }, []);

  const requestOffer = useCallback(() => {
    managerRef.current?.requestOffer();
  }, []);

  // Derived state
  const isSourceConnected = connectedPeers.includes(sourceId);

  return {
    manager: managerRef.current,
    isSignalingConnected,
    isSignalingBlocked,
    blockedMessage,
    connectedPeers,
    connectionState,
    remoteStream,
    isSourceConnected,
    connect,
    disconnect,
    requestOffer,
  };
}
