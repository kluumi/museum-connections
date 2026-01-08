// useOperatorManager - React hook that bridges OperatorManager to React components
// Pattern: Service-to-React bridge hook

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConnectionState, type NodeId, SignalingState } from "@/constants";
import {
  type HeartbeatStatus,
  type LoadingState,
  OperatorManager,
  type VoxState,
} from "@/services";
import { useStore } from "@/stores";

export interface SourceStateInfo {
  connectionState: ConnectionState;
  remoteStream: MediaStream | null;
  heartbeatStatus: HeartbeatStatus;
  loading: LoadingState;
  manuallyStopped: boolean;
  voxState: VoxState;
}

export interface UseOperatorManagerOptions {
  nodeId: NodeId;
  sources: NodeId[];
  onLog?: (
    sourceId: NodeId,
    message: string,
    level?: "info" | "warning" | "error" | "success",
  ) => void;
}

export interface UseOperatorManagerReturn {
  // Manager instance (for advanced use)
  manager: OperatorManager | null;

  // Signaling state
  isSignalingConnected: boolean;
  connectedPeers: NodeId[];

  // Per-source state
  sourceStates: Map<NodeId, SourceStateInfo>;

  // Helper functions for source state
  getSourceState: (sourceId: NodeId) => SourceStateInfo;
  isSourceAvailable: (sourceId: NodeId) => boolean;
  isSourceConnected: (sourceId: NodeId) => boolean;

  // Actions
  connect: () => void;
  disconnect: () => void;
  sendStreamControl: (sourceId: NodeId, action: "start" | "stop") => void;
  requestOffer: (sourceId: NodeId) => void;
}

const DEFAULT_SOURCE_STATE: SourceStateInfo = {
  connectionState: ConnectionState.DISCONNECTED,
  remoteStream: null,
  heartbeatStatus: null,
  loading: false,
  manuallyStopped: false,
  voxState: { isVoxTriggered: false, isDucked: false },
};

/**
 * Hook that manages operator connections to multiple source senders.
 *
 * Usage:
 * ```tsx
 * const operator = useOperatorManager({
 *   nodeId: generateOperatorNodeId(),
 *   sources: [NodeId.NANTES, NodeId.PARIS],
 *   onLog: (sourceId, msg, level) => { ... },
 * });
 *
 * // Connect on mount
 * useEffect(() => { operator.connect(); }, []);
 *
 * // Get source state
 * const nantesState = operator.getSourceState(NodeId.NANTES);
 *
 * // Send control commands
 * operator.sendStreamControl(NodeId.NANTES, "start");
 * ```
 */
export function useOperatorManager(
  options: UseOperatorManagerOptions,
): UseOperatorManagerReturn {
  const { nodeId, sources, onLog } = options;

  // Store integration - use individual selectors for stable references
  const setSignalingState = useStore((s) => s.setSignalingState);
  const setConnectedPeers = useStore((s) => s.setConnectedPeers);

  // State
  const [isSignalingConnected, setIsSignalingConnected] = useState(false);
  const [connectedPeers, setLocalConnectedPeers] = useState<NodeId[]>([]);
  const [sourceStates, setSourceStates] = useState<
    Map<NodeId, SourceStateInfo>
  >(() => {
    const map = new Map<NodeId, SourceStateInfo>();
    for (const sourceId of sources) {
      map.set(sourceId, { ...DEFAULT_SOURCE_STATE });
    }
    return map;
  });

  // Refs
  const managerRef = useRef<OperatorManager | null>(null);
  const onLogRef = useRef(onLog);

  // Keep refs updated
  useEffect(() => {
    onLogRef.current = onLog;
  }, [onLog]);

  // Initialize manager
  useEffect(() => {
    const manager = new OperatorManager({
      nodeId,
      sources,
      onLog: (sourceId, message, level) => {
        onLogRef.current?.(sourceId, message, level);
      },
      onSourceStateChange: (sourceId, state) => {
        // Debug: always log VOX state changes (including unduck)
        console.log(
          `🎚️ Hook: onSourceStateChange for ${sourceId}:`,
          state.voxState,
        );
        setSourceStates((prev) => {
          const next = new Map(prev);
          next.set(sourceId, {
            connectionState: state.connectionState,
            remoteStream: state.remoteStream,
            heartbeatStatus: state.heartbeatStatus,
            loading: state.loading,
            manuallyStopped: state.manuallyStopped,
            voxState: state.voxState,
          });
          return next;
        });
      },
      onSignalingStateChange: (state) => {
        setSignalingState(state);
        setIsSignalingConnected(state === SignalingState.CONNECTED);
      },
      onSignalingConnectedPeersChange: (peers) => {
        setLocalConnectedPeers(peers);
        setConnectedPeers(peers);
      },
    });

    managerRef.current = manager;

    return () => {
      manager.destroy();
      managerRef.current = null;
    };
  }, [nodeId, setSignalingState, setConnectedPeers]);

  // Actions
  const connect = useCallback(() => {
    managerRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    managerRef.current?.disconnect();
  }, []);

  const sendStreamControl = useCallback(
    (sourceId: NodeId, action: "start" | "stop") => {
      managerRef.current?.sendStreamControl(sourceId, action);
    },
    [],
  );

  const requestOffer = useCallback((sourceId: NodeId) => {
    managerRef.current?.requestOffer(sourceId);
  }, []);

  // Helpers
  const getSourceState = useCallback(
    (sourceId: NodeId): SourceStateInfo => {
      return sourceStates.get(sourceId) ?? { ...DEFAULT_SOURCE_STATE };
    },
    [sourceStates],
  );

  const isSourceAvailable = useCallback(
    (sourceId: NodeId): boolean => {
      return connectedPeers.includes(sourceId);
    },
    [connectedPeers],
  );

  const isSourceConnected = useCallback(
    (sourceId: NodeId): boolean => {
      return (
        sourceStates.get(sourceId)?.connectionState ===
        ConnectionState.CONNECTED
      );
    },
    [sourceStates],
  );

  return useMemo(
    () => ({
      manager: managerRef.current,
      isSignalingConnected,
      connectedPeers,
      sourceStates,
      getSourceState,
      isSourceAvailable,
      isSourceConnected,
      connect,
      disconnect,
      sendStreamControl,
      requestOffer,
    }),
    [
      isSignalingConnected,
      connectedPeers,
      sourceStates,
      getSourceState,
      isSourceAvailable,
      isSourceConnected,
      connect,
      disconnect,
      sendStreamControl,
      requestOffer,
    ],
  );
}
