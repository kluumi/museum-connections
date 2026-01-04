// WebRTCProvider - Context provider for WebRTC functionality
// Pattern: Provider pattern for dependency injection

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ConnectionState, type NodeId, SignalingState } from "@/constants";
import { SignalingService, WebRTCService } from "@/services";
import { useStore } from "@/stores";
import type { ServerToClientMessage } from "@/types";

interface PeerConnection {
  service: WebRTCService;
  state: ConnectionState;
  remoteStream: MediaStream | null;
}

interface WebRTCContextValue {
  // Node identity
  nodeId: NodeId;

  // Signaling
  signaling: SignalingService | null;
  signalingState: SignalingState;
  connectedPeers: NodeId[];

  // Peer connections
  connections: Map<NodeId, PeerConnection>;

  // Local stream
  localStream: MediaStream | null;
  setLocalStream: (stream: MediaStream | null) => void;

  // Actions
  connect: () => Promise<void>;
  disconnect: () => void;
  createPeerConnection: (peerId: NodeId) => WebRTCService;
  removePeerConnection: (peerId: NodeId) => void;
  sendOffer: (peerId: NodeId) => Promise<void>;
  requestOffer: (peerId: NodeId) => void;
  notifyStreamStarted: () => void;
  notifyStreamStopped: (
    reason?: "manual" | "page_closed" | "network_lost",
  ) => void;
}

const WebRTCContext = createContext<WebRTCContextValue | null>(null);

interface WebRTCProviderProps {
  nodeId: NodeId;
  autoConnect?: boolean;
  children: ReactNode;
}

/**
 * Provider component that manages signaling and WebRTC connections
 */
export function WebRTCProvider({
  nodeId,
  autoConnect = true,
  children,
}: WebRTCProviderProps) {
  const {
    setNodeId,
    setSignalingState,
    setConnectedPeers,
    addConnectedPeer,
    removeConnectedPeer,
    setPeerConnectionState,
    removePeerConnectionState,
    addRemoteStream,
    removeRemoteStream,
    updatePeerMetrics,
  } = useStore();

  const [signalingState, setLocalSignalingState] = useState<SignalingState>(
    SignalingState.DISCONNECTED,
  );
  const [connectedPeers, setLocalConnectedPeers] = useState<NodeId[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [connections, setConnections] = useState<Map<NodeId, PeerConnection>>(
    new Map(),
  );

  const signalingRef = useRef<SignalingService | null>(null);
  const connectionsRef = useRef<Map<NodeId, WebRTCService>>(new Map());

  // Initialize signaling service
  useEffect(() => {
    const signaling = new SignalingService(nodeId);
    signalingRef.current = signaling;
    setNodeId(nodeId);

    // Subscribe to state changes
    const unsubState = signaling.onStateChange((state) => {
      setLocalSignalingState(state);
      setSignalingState(state);
    });

    // Subscribe to messages
    const unsubMessage = signaling.onMessage(handleSignalingMessage);

    // Auto-connect if enabled
    if (autoConnect) {
      signaling.connect().catch(console.error);
    }

    return () => {
      unsubState();
      unsubMessage();
      signaling.disconnect();
      signalingRef.current = null;

      // Clean up all peer connections
      for (const [peerId, service] of connectionsRef.current) {
        service.close();
        removePeerConnectionState(peerId);
        removeRemoteStream(peerId);
      }
      connectionsRef.current.clear();
    };
    // handleSignalingMessage is defined below but stable due to useCallback
    // biome-ignore lint/correctness/useExhaustiveDependencies: handleSignalingMessage is stable
  }, [nodeId, autoConnect, setNodeId, setSignalingState]);

  // Handle signaling messages
  const handleSignalingMessage = useCallback(
    async (message: ServerToClientMessage) => {
      switch (message.type) {
        case "login_success":
          setLocalConnectedPeers(message.clients);
          setConnectedPeers(message.clients);
          break;

        case "peer_connected":
          setLocalConnectedPeers((prev) =>
            prev.includes(message.peer) ? prev : [...prev, message.peer],
          );
          addConnectedPeer(message.peer);
          break;

        case "peer_disconnected":
          setLocalConnectedPeers((prev) =>
            prev.filter((id) => id !== message.peer),
          );
          removeConnectedPeer(message.peer);
          break;

        case "offer":
          if (message.from) {
            await handleIncomingOffer(message.from, message.offer);
          }
          break;

        case "answer":
          if (message.from) {
            const service = connectionsRef.current.get(message.from);
            await service?.handleAnswer(message.answer);
          }
          break;

        case "candidate":
          if (message.from) {
            const service = connectionsRef.current.get(message.from);
            await service?.addIceCandidate(message.candidate);
          }
          break;

        case "request_offer":
          if (message.from) {
            await sendOffer(message.from);
          }
          break;
      }
    },
    [],
  );

  // Handle incoming offer
  const handleIncomingOffer = useCallback(
    async (peerId: NodeId, offer: RTCSessionDescriptionInit) => {
      let service = connectionsRef.current.get(peerId);

      if (!service && signalingRef.current) {
        service = createPeerConnectionInternal(peerId);
      }

      if (service) {
        service.initialize();
        await service.handleOffer(offer);
      }
    },
    [],
  );

  // Create peer connection (internal)
  const createPeerConnectionInternal = useCallback(
    (peerId: NodeId): WebRTCService => {
      if (!signalingRef.current) {
        throw new Error("Signaling not initialized");
      }

      // Clean up existing connection
      const existing = connectionsRef.current.get(peerId);
      if (existing) {
        existing.close();
      }

      const service = new WebRTCService(nodeId, peerId, signalingRef.current, {
        localStream: localStream ?? undefined,
        onTrack: (event) => {
          if (event.streams[0]) {
            addRemoteStream(peerId, event.streams[0]);
            updateConnectionState(peerId, { remoteStream: event.streams[0] });
          }
        },
        onConnectionStateChange: (state) => {
          setPeerConnectionState(peerId, state);
          updateConnectionState(peerId, { state });
        },
        onMetrics: (metrics) => {
          updatePeerMetrics(peerId, metrics);
        },
      });

      connectionsRef.current.set(peerId, service);
      updateConnectionState(peerId, {
        service,
        state: ConnectionState.DISCONNECTED,
        remoteStream: null,
      });

      return service;
    },
    [
      nodeId,
      localStream,
      setPeerConnectionState,
      addRemoteStream,
      updatePeerMetrics,
    ],
  );

  // Update connection state map
  const updateConnectionState = useCallback(
    (peerId: NodeId, updates: Partial<PeerConnection>) => {
      setConnections((prev) => {
        const newMap = new Map(prev);
        const existing = newMap.get(peerId);
        if (existing) {
          newMap.set(peerId, { ...existing, ...updates });
        } else if (updates.service) {
          newMap.set(peerId, {
            service: updates.service,
            state: updates.state ?? ConnectionState.DISCONNECTED,
            remoteStream: updates.remoteStream ?? null,
          });
        }
        return newMap;
      });
    },
    [],
  );

  // Public API

  const connect = useCallback(async () => {
    await signalingRef.current?.connect();
  }, []);

  const disconnect = useCallback(() => {
    signalingRef.current?.disconnect();
  }, []);

  const createPeerConnection = useCallback(
    (peerId: NodeId) => {
      return createPeerConnectionInternal(peerId);
    },
    [createPeerConnectionInternal],
  );

  const removePeerConnection = useCallback(
    (peerId: NodeId) => {
      const service = connectionsRef.current.get(peerId);
      if (service) {
        service.close();
        connectionsRef.current.delete(peerId);
        removePeerConnectionState(peerId);
        removeRemoteStream(peerId);
        setConnections((prev) => {
          const newMap = new Map(prev);
          newMap.delete(peerId);
          return newMap;
        });
      }
    },
    [removePeerConnectionState, removeRemoteStream],
  );

  const sendOffer = useCallback(
    async (peerId: NodeId) => {
      let service = connectionsRef.current.get(peerId);

      if (!service) {
        service = createPeerConnectionInternal(peerId);
      }

      service.initialize();
      await service.createOffer();
    },
    [createPeerConnectionInternal],
  );

  const requestOffer = useCallback((peerId: NodeId) => {
    signalingRef.current?.requestOffer(peerId);
  }, []);

  const notifyStreamStarted = useCallback(() => {
    signalingRef.current?.notifyStreamStarted();
  }, []);

  const notifyStreamStopped = useCallback(
    (reason: "manual" | "page_closed" | "network_lost" = "manual") => {
      signalingRef.current?.notifyStreamStopped(reason);
    },
    [],
  );

  // Update local stream in existing connections
  useEffect(() => {
    for (const service of connectionsRef.current.values()) {
      service.setLocalStream(localStream);
    }
  }, [localStream]);

  const value = useMemo<WebRTCContextValue>(
    () => ({
      nodeId,
      signaling: signalingRef.current,
      signalingState,
      connectedPeers,
      connections,
      localStream,
      setLocalStream,
      connect,
      disconnect,
      createPeerConnection,
      removePeerConnection,
      sendOffer,
      requestOffer,
      notifyStreamStarted,
      notifyStreamStopped,
    }),
    [
      nodeId,
      signalingState,
      connectedPeers,
      connections,
      localStream,
      connect,
      disconnect,
      createPeerConnection,
      removePeerConnection,
      sendOffer,
      requestOffer,
      notifyStreamStarted,
      notifyStreamStopped,
    ],
  );

  return (
    <WebRTCContext.Provider value={value}>{children}</WebRTCContext.Provider>
  );
}

/**
 * Hook to access WebRTC context
 */
export function useWebRTCContext(): WebRTCContextValue {
  const context = useContext(WebRTCContext);
  if (!context) {
    throw new Error("useWebRTCContext must be used within WebRTCProvider");
  }
  return context;
}
